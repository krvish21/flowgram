import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FlowNode from './FlowNode.jsx';
import Container from './Container.jsx';
import Edges from './Edges.jsx';
import {
  anchor,
  screenToWorld,
  rectOf,
  contains,
  CONTAINER_HEADER,
} from '../lib/geometry.js';
import { TYPE_HOTKEYS } from '../lib/nodeTypes.js';

const CLICK_SLOP = 4;

export default function Canvas({
  doc,
  store,
  mode,
  selection,
  setSelection,
  view,
  setView,
  activeType,
  setActiveType,
}) {
  const surfaceRef = useRef(null);
  const drag = useRef(null);
  const [linking, setLinking] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [freshId, setFreshId] = useState(null);

  /** Select a node and put its title straight into edit mode. */
  const focusNew = useCallback(
    (node) => {
      if (!node) return;
      setSelection({ type: 'node', id: node.id });
      setFreshId(node.id);
    },
    [setSelection]
  );

  const rect = () => surfaceRef.current.getBoundingClientRect();
  const toWorld = useCallback(
    (e) => screenToWorld(e.clientX, e.clientY, rect(), view),
    [view]
  );

  /* ---------------- background: pan, or ctrl/cmd-click to create ---------------- */
  const onBackgroundPointerDown = (e) => {
    if (e.button === 2) return;
    drag.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...view },
      // remember the modifier at press time, not release time
      create: (e.ctrlKey || e.metaKey) && mode === 'create',
      shift: e.shiftKey,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  /* ---------------- container header drag: moves the group ---------------- */
  const onContainerHeaderDown = (e, c) => {
    if (e.button !== 0 || mode !== 'create') return;
    e.stopPropagation();
    setSelection({ type: 'container', id: c.id });
    store.checkpoint();
    const w = toWorld(e);
    // capture who's inside *now*, so nodes don't join mid-drag
    const childIds = doc.nodes.filter((n) => contains(c, n)).map((n) => n.id);
    const offsets = {};
    for (const n of doc.nodes) {
      if (childIds.includes(n.id)) offsets[n.id] = { dx: n.x - c.x, dy: n.y - c.y };
    }
    drag.current = {
      kind: 'container',
      id: c.id,
      dx: w.x - c.x,
      dy: w.y - c.y,
      childIds,
      offsets,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    surfaceRef.current.setPointerCapture(e.pointerId);
  };

  /* ---------------- resize ---------------- */
  const startResize = useCallback(
    (target) => (handle, e, item) => {
      if (e.button !== 0 || mode !== 'create') return;
      e.stopPropagation();
      store.checkpoint();
      drag.current = {
        kind: 'resize',
        target,
        id: item.id,
        handle,
        startRect: rectOf(item),
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      surfaceRef.current.setPointerCapture(e.pointerId);
    },
    [mode, store]
  );
  const resizeNode = useMemo(() => startResize('node'), [startResize]);
  const resizeContainer = useMemo(() => startResize('container'), [startResize]);

  /* ---------------- node drag ---------------- */
  const onPointerDownNode = (e, node) => {
    if (e.button !== 0) return;
    // typing inside the card must not turn into a drag
    if (e.target.closest('.inline-text, .chip-select, .drawer, .node-toolbar')) {
      e.stopPropagation();
      setSelection({ type: 'node', id: node.id });
      return;
    }
    setSelection({ type: 'node', id: node.id });
    if (node.id !== freshId) setFreshId(null);
    if (mode !== 'create') return;
    e.stopPropagation();
    store.checkpoint();
    const w = toWorld(e);
    drag.current = {
      kind: 'node',
      id: node.id,
      dx: w.x - node.x,
      dy: w.y - node.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    surfaceRef.current.setPointerCapture(e.pointerId);
  };

  /* ---------------- "+" handle: click = spawn, drag = link ---------------- */
  const onPlusPointerDown = (e, node, side) => {
    if (e.button !== 0 || mode !== 'create') return;
    const a = anchor(node, side);
    drag.current = {
      kind: 'link',
      id: node.id,
      side,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setLinking({ from: { x: a.x, y: a.y }, to: { x: a.x, y: a.y } });
    surfaceRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (dist > CLICK_SLOP) d.moved = true;

    if (d.kind === 'pan') {
      if (d.create) return; // ctrl-press is a create gesture, not a pan
      setView((v) => ({
        ...v,
        x: d.origin.x + (e.clientX - d.startX),
        y: d.origin.y + (e.clientY - d.startY),
      }));
    } else if (d.kind === 'node') {
      const w = toWorld(e);
      store.moveNode(d.id, w.x - d.dx, w.y - d.dy, false);
    } else if (d.kind === 'container') {
      const w = toWorld(e);
      store.moveContainer(
        d.id,
        w.x - d.dx,
        w.y - d.dy,
        d.childIds,
        d.offsets,
        false
      );
    } else if (d.kind === 'resize') {
      const z = view.zoom;
      store.resize(
        d.target,
        d.id,
        d.handle,
        d.startRect,
        (e.clientX - d.startX) / z,
        (e.clientY - d.startY) / z,
        false
      );
    } else if (d.kind === 'link') {
      const w = toWorld(e);
      setLinking((l) => (l ? { ...l, to: w } : l));
      setHoverTarget(nodeIdAtPoint(e, d.id));
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    setHoverTarget(null);
    if (!d) return;

    if (d.kind === 'pan') {
      if (!d.moved) {
        if (d.create) {
          const w = toWorld(e);
          if (d.shift) {
            // Ctrl+Shift+click drops a container instead of a node
            const c = store.addContainer(w.x - 210, w.y - 150);
            setSelection({ type: 'container', id: c.id });
          } else {
            focusNew(store.addNode(w.x, w.y, { type: activeType }));
          }
        } else {
          setSelection(null);
          setFreshId(null);
        }
      }
      return;
    }

    if (d.kind === 'node' || d.kind === 'container' || d.kind === 'resize') {
      // the undo checkpoint was taken on pointer down, so the whole
      // gesture collapses into a single history entry
      return;
    }

    if (d.kind === 'link') {
      setLinking(null);
      if (!d.moved) {
        focusNew(store.addConnected(d.id, d.side));
        return;
      }
      const targetId = nodeIdAtPoint(e, d.id);
      if (targetId) {
        store.connect(d.id, targetId, d.side, null);
      } else {
        const w = toWorld(e);
        const created = store.addNode(w.x, w.y, { type: activeType });
        store.connect(d.id, created.id, d.side, null);
        focusNew(created);
      }
    }
  };

  function nodeIdAtPoint(e, excludeId) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const host = el && el.closest('[data-node-id]');
    const id = host?.getAttribute('data-node-id');
    return id && id !== excludeId ? id : null;
  }

  /* ---------------- create-modifier cursor hint ---------------- */
  const [spawnReady, setSpawnReady] = useState(false);
  useEffect(() => {
    if (mode !== 'create') return setSpawnReady(false);
    const sync = (e) => setSpawnReady(e.ctrlKey || e.metaKey);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', () => setSpawnReady(false));
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
    };
  }, [mode]);

  /* ---------------- zoom ---------------- */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const zoom = Math.min(2.5, Math.max(0.2, v.zoom * factor));
        const k = zoom / v.zoom;
        return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      const mod = e.ctrlKey || e.metaKey;

      // shortcuts that work even while typing
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? store.redo() : store.undo();
        return;
      }
      if (e.key === 'Escape' && typing) {
        el.blur();
        return;
      }
      if (typing) return;

      const node =
        selection?.type === 'node'
          ? doc.nodes.find((n) => n.id === selection.id)
          : null;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selection) return;
        e.preventDefault();
        if (selection.type === 'node') store.removeNode(selection.id);
        else if (selection.type === 'container') store.removeContainer(selection.id);
        else store.removeEdge(selection.id);
        setSelection(null);
        return;
      }

      // Ctrl+G wraps everything, or just the selected node, in a group
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const ids = node ? [node.id] : doc.nodes.map((n) => n.id);
        const c = store.groupNodes(ids);
        if (c) setSelection({ type: 'container', id: c.id });
        return;
      }

      // Enter edits the selected node's title
      if (e.key === 'Enter' && node) {
        e.preventDefault();
        setFreshId(null);
        requestAnimationFrame(() => setFreshId(node.id));
        return;
      }

      // Ctrl+D duplicates
      if (mod && e.key.toLowerCase() === 'd' && node) {
        e.preventDefault();
        focusNew(store.duplicateNode(node.id));
        return;
      }

      // Tab / arrow+Ctrl branch a new node from the selected one
      if (e.key === 'Tab' && node) {
        e.preventDefault();
        focusNew(store.addConnected(node.id, e.shiftKey ? 'left' : 'right'));
        return;
      }
      const arrowSide = {
        ArrowUp: 'top',
        ArrowDown: 'bottom',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }[e.key];
      if (arrowSide && node && mod) {
        e.preventDefault();
        focusNew(store.addConnected(node.id, arrowSide));
        return;
      }
      // plain arrows nudge the node
      if (arrowSide && node) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 8;
        const dx = arrowSide === 'left' ? -step : arrowSide === 'right' ? step : 0;
        const dy = arrowSide === 'top' ? -step : arrowSide === 'bottom' ? step : 0;
        store.moveNode(node.id, node.x + dx, node.y + dy, true);
        return;
      }

      // number keys pick the type: retypes the selection, else arms the palette
      const n = Number(e.key);
      if (n >= 1 && n <= TYPE_HOTKEYS.length) {
        const t = TYPE_HOTKEYS[n - 1];
        if (node) store.setNodeType(node.id, t);
        else setActiveType?.(t);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, store, setSelection, doc.nodes, focusNew, setActiveType]);

  const selectedNodeId = selection?.type === 'node' ? selection.id : null;
  const selectedEdgeId = selection?.type === 'edge' ? selection.id : null;

  const outCounts = React.useMemo(() => {
    const m = {};
    for (const e of doc.edges) m[e.from] = (m[e.from] || 0) + 1;
    return m;
  }, [doc.edges]);

  /**
   * Per-node callbacks, cached by id. Without this every node gets a
   * fresh set of props on each pointer move, defeating React.memo and
   * re-rendering the whole board while one node is being dragged.
   */
  const handlerCache = useRef(new Map());
  const handlersFor = useCallback(
    (id) => {
      let h = handlerCache.current.get(id);
      if (!h) {
        h = {
          onUpdate: (patch) => store.updateNode(id, patch, false),
          onSetType: (t) => store.setNodeType(id, t),
          onDuplicate: () => focusNew(store.duplicateNode(id)),
          onDelete: () => {
            store.removeNode(id);
            setSelection(null);
          },
          onAutoSize: () => store.autoSize(id),
          onMeasure: (px) => store.measureNode(id, px),
        };
        handlerCache.current.set(id, h);
      }
      return h;
    },
    [store, focusNew, setSelection]
  );

  return (
    <div
      ref={surfaceRef}
      className={`canvas ${mode === 'create' ? 'mode-create' : 'mode-view'} ${
        spawnReady ? 'is-spawning' : ''
      }`}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        className="world"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        }}
      >
        {(doc.containers || []).map((c) => (
          <Container
            key={c.id}
            container={c}
            mode={mode}
            selected={selection?.type === 'container' && selection.id === c.id}
            childCount={doc.nodes.filter((n) => contains(c, n)).length}
            onPointerDownHeader={onContainerHeaderDown}
            onSelect={setSelection}
            onUpdate={(patch, history) => store.updateContainer(c.id, patch, history)}
            onCheckpoint={store.checkpoint}
            onResizeStart={resizeContainer}
            onFit={() => store.fitContainer(c.id)}
            onDelete={() => {
              store.removeContainer(c.id);
              setSelection(null);
            }}
          />
        ))}

        <Edges
          nodes={doc.nodes}
          edges={doc.edges}
          selectedId={selectedEdgeId}
          onSelect={setSelection}
          linking={linking}
        />
        {doc.nodes.map((n) => (
          <FlowNode
            key={n.id}
            node={n}
            mode={mode}
            selected={selectedNodeId === n.id}
            isLinkTarget={hoverTarget === n.id}
            outCount={outCounts[n.id] || 0}
            autoEdit={freshId === n.id}
            onPointerDownNode={onPointerDownNode}
            onSelect={setSelection}
            onPlusPointerDown={onPlusPointerDown}
            onCheckpoint={store.checkpoint}
            onResizeStart={resizeNode}
            {...handlersFor(n.id)}
          />
        ))}
      </div>

      {doc.nodes.length === 0 && (
        <div className="empty-hint">
          {mode === 'create' ? (
            <>
              <strong>Ctrl / ⌘ + click to drop a node.</strong>
              <span>
                Drag the board to pan · Ctrl+Shift+click for a group · Tab to branch
              </span>
            </>
          ) : (
            'Nothing to show yet — switch to Create mode.'
          )}
        </div>
      )}
    </div>
  );
}
