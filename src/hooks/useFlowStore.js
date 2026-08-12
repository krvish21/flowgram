import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NODE_W,
  NODE_H,
  GAP,
  uid,
  OPPOSITE,
  spawnOffset,
  findFreeSpot,
  contains,
  bounds,
  rectOf,
  resizeRect,
  MIN_W,
  MIN_H,
  CONTAINER_MIN_W,
  CONTAINER_MIN_H,
  CONTAINER_HEADER,
  CONTAINER_PAD,
} from '../lib/geometry.js';
import { getType, DEFAULT_TYPE } from '../lib/nodeTypes.js';

const STORAGE_KEY = 'flowgram.doc.v2';

const emptyDoc = { nodes: [], edges: [], containers: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDoc;
    const doc = JSON.parse(raw);
    if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return emptyDoc;
    return migrate(doc);
  } catch {
    return emptyDoc;
  }
}

/**
 * Legacy type ids collapse onto their closest REST-layer equivalents so
 * documents saved before the layer model exist safely on load.
 */
const RETIRED = {
  endpoint: 'controller',
  simple: 'service',
  client: 'service',
  queue: 'service',
  datastore: 'data',
};

export function migrate(doc) {
  return {
    nodes: (doc.nodes || []).map((n) => {
      const type = RETIRED[n.type] || n.type || DEFAULT_TYPE;
      const merged = {
        ...getType(type).defaults,
        ...n,
        type,
        w: n.w ?? NODE_W,
        h: n.h ?? NODE_H,
      };
      // payloads written before kinds existed were always JSON
      for (const f of getType(type).fields) {
        if (f.slot !== 'drawer') continue;
        const kindKey = `${f.key}Kind`;
        if (!merged[kindKey]) merged[kindKey] = 'json';
      }
      return merged;
    }),
    edges: (doc.edges || []).map((e) => ({ label: '', pinned: false, ...e })),
    containers: (doc.containers || []).map((c) => ({
      color: '#4f8cff',
      title: 'Group',
      collapsed: false,
      ...c,
    })),
  };
}

export function makeContainer(x, y, patch = {}) {
  return {
    id: uid('c'),
    x: Math.round(x),
    y: Math.round(y),
    w: 420,
    h: 300,
    title: 'Group',
    notes: '',
    color: '#4f8cff',
    collapsed: false,
    ...patch,
  };
}

export function makeNode(x, y, patch = {}) {
  const type = patch.type || DEFAULT_TYPE;
  return {
    id: uid(),
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: NODE_W,
    h: NODE_H,
    ...getType(type).defaults,
    ...patch,
  };
}

export function useFlowStore() {
  const [doc, setDoc] = useState(load);
  const past = useRef([]);
  const future = useRef([]);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  }, [doc]);

  const commit = useCallback((updater, { history = true } = {}) => {
    setDoc((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      if (history) {
        past.current = [...past.current.slice(-49), prev];
        future.current = [];
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setDoc((prev) => {
      const p = past.current.pop();
      if (!p) return prev;
      future.current = [prev, ...future.current];
      return p;
    });
  }, []);

  const redo = useCallback(() => {
    setDoc((prev) => {
      const [f, ...rest] = future.current;
      if (!f) return prev;
      future.current = rest;
      past.current = [...past.current, prev];
      return f;
    });
  }, []);

  /** Push the current state onto the undo stack without changing it. */
  const checkpoint = useCallback(() => {
    setDoc((prev) => {
      past.current = [...past.current.slice(-49), prev];
      future.current = [];
      return prev;
    });
  }, []);

  const api = useMemo(
    () => ({
      addNode(x, y, patch) {
        const node = makeNode(x - NODE_W / 2, y - NODE_H / 2, patch);
        commit((d) => ({ ...d, nodes: [...d.nodes, node] }));
        return node;
      },

      /**
       * Spawn a child node off a side of `fromId` and connect it.
       * Multiple children may leave the same side: each new sibling is
       * offset perpendicular to the side so the fan stays readable.
       */
      addConnected(fromId, side, patch = {}) {
        const d = docRef.current;
        const from = d.nodes.find((n) => n.id === fromId);
        if (!from) return null;

        const siblings = d.edges.filter(
          (e) => e.from === fromId && e.fromSide === side
        ).length;
        const { dx, dy } = spawnOffset(side);
        // alternate above/below (or left/right) of the straight-ahead slot
        const rank = Math.ceil(siblings / 2) * (siblings % 2 === 1 ? -1 : 1);
        const horizontal = side === 'left' || side === 'right';
        const step = horizontal ? NODE_H + GAP / 2 : NODE_W + GAP / 2;

        const spot = findFreeSpot(
          d.nodes,
          from.x + dx + (horizontal ? 0 : rank * step),
          from.y + dy + (horizontal ? rank * step : 0),
          side
        );

        const created = makeNode(spot.x, spot.y, {
          type: patch.type || from.type || DEFAULT_TYPE,
          ...patch,
        });
        const edge = {
          id: uid('e'),
          from: fromId,
          to: created.id,
          fromSide: side,
          toSide: OPPOSITE[side],
          pinned: false,
          label: '',
        };
        commit((prev) => ({
          nodes: [...prev.nodes, created],
          edges: [...prev.edges, edge],
        }));
        return created;
      },

      updateEdge(id, patch) {
        commit((d) => ({
          ...d,
          edges: d.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }));
      },

      /** Change a node's type, filling in any fields the new type needs. */
      setNodeType(id, type) {
        commit((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === id
              ? {
                  ...getType(type).defaults,
                  ...n,
                  // keep the user's own text, but re-seed missing fields
                  ...Object.fromEntries(
                    Object.entries(getType(type).defaults).filter(
                      ([k]) => n[k] === undefined
                    )
                  ),
                  type,
                  h: type === 'decision' ? 140 : n.h,
                }
              : n
          ),
        }));
      },

      /* -------------------- containers -------------------- */

      addContainer(x, y, patch) {
        const c = makeContainer(x, y, patch);
        commit((d) => ({ ...d, containers: [...(d.containers || []), c] }));
        return c;
      },

      updateContainer(id, patch, history = true) {
        commit(
          (d) => ({
            ...d,
            containers: d.containers.map((c) =>
              c.id === id ? { ...c, ...patch } : c
            ),
          }),
          { history }
        );
      },

      /** Delete a container. Its nodes stay on the board. */
      removeContainer(id) {
        commit((d) => ({
          ...d,
          containers: d.containers.filter((c) => c.id !== id),
        }));
      },

      /** Wrap a set of nodes in a new container sized to fit them. */
      groupNodes(ids, title = 'Group') {
        const d = docRef.current;
        const members = d.nodes.filter((n) => ids.includes(n.id));
        if (!members.length) return null;
        const b = bounds(members, CONTAINER_PAD);
        const c = makeContainer(b.x, b.y - CONTAINER_HEADER, {
          w: Math.max(CONTAINER_MIN_W, b.w),
          h: Math.max(CONTAINER_MIN_H, b.h + CONTAINER_HEADER),
          title,
        });
        commit((prev) => ({ ...prev, containers: [...prev.containers, c] }));
        return c;
      },

      /** Shrink-wrap a container around whatever it currently holds. */
      fitContainer(id) {
        const d = docRef.current;
        const c = d.containers.find((x) => x.id === id);
        if (!c) return;
        const members = d.nodes.filter((n) => contains(c, n));
        if (!members.length) return;
        const b = bounds(members, CONTAINER_PAD);
        const next = {
          x: b.x,
          y: b.y - CONTAINER_HEADER,
          w: Math.max(CONTAINER_MIN_W, b.w),
          h: Math.max(CONTAINER_MIN_H, b.h + CONTAINER_HEADER),
        };
        commit((prev) => ({
          ...prev,
          containers: prev.containers.map((x) =>
            x.id === id ? { ...x, ...next } : x
          ),
        }));
      },

      /** Ids of the nodes geometrically inside a container. */
      childrenOf(containerId) {
        const d = docRef.current;
        const c = d.containers.find((x) => x.id === containerId);
        if (!c) return [];
        return d.nodes.filter((n) => contains(c, n)).map((n) => n.id);
      },

      /** Move a container and everything inside it. */
      moveContainer(id, x, y, childIds, offsets, history = false) {
        commit(
          (d) => ({
            ...d,
            containers: d.containers.map((c) =>
              c.id === id ? { ...c, x: Math.round(x), y: Math.round(y) } : c
            ),
            nodes: d.nodes.map((n) => {
              const off = offsets?.[n.id];
              if (!off || !childIds.includes(n.id)) return n;
              return {
                ...n,
                x: Math.round(x + off.dx),
                y: Math.round(y + off.dy),
              };
            }),
          }),
          { history }
        );
      },

      /* -------------------- resizing -------------------- */

      resize(kind, id, handle, startRect, dx, dy, history = false) {
        const isContainer = kind === 'container';
        const next = resizeRect(
          startRect,
          handle,
          dx,
          dy,
          isContainer ? CONTAINER_MIN_W : MIN_W,
          isContainer ? CONTAINER_MIN_H : MIN_H
        );
        commit(
          (d) =>
            isContainer
              ? {
                  ...d,
                  containers: d.containers.map((c) =>
                    c.id === id ? { ...c, ...next } : c
                  ),
                }
              : {
                  ...d,
                  // nodes grow to fit their content, so only x/w change
                  nodes: d.nodes.map((n) =>
                    n.id === id ? { ...n, x: next.x, w: next.w } : n
                  ),
                },
          { history }
        );
      },

      /** Report the rendered height so edges anchor to the real card. */
      measureNode(id, h) {
        const n = docRef.current.nodes.find((x) => x.id === id);
        if (!n || Math.abs((n.h ?? 0) - h) < 1) return;
        commit(
          (d) => ({
            ...d,
            nodes: d.nodes.map((x) => (x.id === id ? { ...x, h } : x)),
          }),
          { history: false }
        );
      },

      /** Back to the default width. */
      autoSize(id) {
        commit((d) => ({
          ...d,
          nodes: d.nodes.map((n) => (n.id === id ? { ...n, w: NODE_W } : n)),
        }));
      },

      connect(fromId, toId, fromSide, toSide) {
        if (fromId === toId) return;
        commit((d) => {
          if (d.edges.some((e) => e.from === fromId && e.to === toId)) return d;
          return {
            ...d,
            edges: [
              ...d.edges,
              {
                id: uid('e'),
                from: fromId,
                to: toId,
                fromSide,
                toSide,
                pinned: false,
                label: '',
              },
            ],
          };
        });
      },

      moveNode(id, x, y, history) {
        commit(
          (d) => ({
            ...d,
            nodes: d.nodes.map((n) =>
              n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n
            ),
          }),
          { history: !!history }
        );
      },

      updateNode(id, patch, history = true) {
        commit(
          (d) => ({
            ...d,
            nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
          }),
          { history }
        );
      },

      /** Copy a node (not its connections) slightly offset from the original. */
      duplicateNode(id) {
        const src = docRef.current.nodes.find((n) => n.id === id);
        if (!src) return null;
        const copy = { ...src, id: uid(), x: src.x + 32, y: src.y + 32 };
        commit((d) => ({ ...d, nodes: [...d.nodes, copy] }));
        return copy;
      },

      removeNode(id) {
        commit((d) => ({
          nodes: d.nodes.filter((n) => n.id !== id),
          edges: d.edges.filter((e) => e.from !== id && e.to !== id),
        }));
      },

      removeEdge(id) {
        commit((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));
      },

      clear() {
        commit(emptyDoc);
      },

      replace(next) {
        commit(migrate(next));
      },
    }),
    [commit]
  );

  return { doc, ...api, checkpoint, undo, redo };
}
