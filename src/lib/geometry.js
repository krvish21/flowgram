export const NODE_W = 220;
export const NODE_H = 120;
export const GAP = 90;

/** Smallest a card / container may be dragged to. */
export const MIN_W = 140;
export const MIN_H = 80;
export const CONTAINER_MIN_W = 260;
export const CONTAINER_MIN_H = 180;
export const CONTAINER_HEADER = 34;
export const CONTAINER_PAD = 18;

export const uid = (p = 'n') =>
  `${p}_${Math.random().toString(36).slice(2, 9)}`;

export const SIDES = ['top', 'right', 'bottom', 'left'];

/** Handles offered when resizing. */
export const RESIZE_HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

/** Nodes grow to fit their content, so only their width is draggable. */
export const WIDTH_HANDLES = ['e', 'w'];

export function rectOf(item) {
  return {
    x: item.x,
    y: item.y,
    w: item.w ?? NODE_W,
    h: item.h ?? NODE_H,
  };
}

/** True when `inner` sits (mostly) inside `outer`. */
export function contains(outer, inner) {
  const a = rectOf(outer);
  const b = rectOf(inner);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx > a.x && cx < a.x + a.w && cy > a.y && cy < a.y + a.h;
}

/** Bounding box of a set of items, plus padding. */
export function bounds(items, pad = 0) {
  if (!items.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const r = rectOf(it);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

/** Apply a resize handle drag to a rect, respecting minimums. */
export function resizeRect(rect, handle, dx, dy, minW, minH) {
  let { x, y, w, h } = rect;
  if (handle.includes('e')) w = Math.max(minW, rect.w + dx);
  if (handle.includes('s')) h = Math.max(minH, rect.h + dy);
  if (handle.includes('w')) {
    w = Math.max(minW, rect.w - dx);
    x = rect.x + (rect.w - w);
  }
  if (handle.includes('n')) {
    h = Math.max(minH, rect.h - dy);
    y = rect.y + (rect.h - h);
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export const OPPOSITE = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const sizeOf = (node) => ({ w: node.w ?? NODE_W, h: node.h ?? NODE_H });

/**
 * Anchor point (world coords) on a side of a node.
 * `t` is the position along that side, 0..1 (0.5 = centre).
 */
export function anchor(node, side, t = 0.5) {
  const { x, y } = node;
  const { w, h } = sizeOf(node);
  switch (side) {
    case 'top':
      return { x: x + w * t, y, nx: 0, ny: -1 };
    case 'bottom':
      return { x: x + w * t, y: y + h, nx: 0, ny: 1 };
    case 'left':
      return { x, y: y + h * t, nx: -1, ny: 0 };
    default:
      return { x: x + w, y: y + h * t, nx: 1, ny: 0 };
  }
}

/**
 * Pick the pair of sides that gives the shortest, most natural link.
 * This is what makes the arrow "stretch" naturally while dragging.
 */
export function bestSides(a, b, rects = []) {
  let best = null;
  for (const sa of SIDES) {
    for (const sb of SIDES) {
      const pa = anchor(a, sa);
      const pb = anchor(b, sb);
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.hypot(dx, dy);
      // reward anchors that point toward each other
      const align = pa.nx * dx + pa.ny * dy + (-pb.nx * dx + -pb.ny * dy);

      // punish sides that are boxed in or that stare straight at a card
      let blocked = 0;
      const ea = { x: pa.x + pa.nx * EDGE_STUB, y: pa.y + pa.ny * EDGE_STUB };
      const eb = { x: pb.x + pb.nx * EDGE_STUB, y: pb.y + pb.ny * EDGE_STUB };
      for (const r of rects) {
        if (pointIn(ea, r) || pointIn(eb, r)) blocked += 1200;
        else if (lineHits(pa, pb, r)) blocked += 260;
      }

      const score = dist - align * 0.6 + blocked;
      if (!best || score < best.score) best = { score, sa, sb };
    }
  }
  return [best.sa, best.sb];
}

/* ------------------------------------------------------------------ *
 * Obstacle-aware routing
 * ------------------------------------------------------------------ */

/** How far a link leaves a node before it is allowed to turn. */
export const EDGE_STUB = 24;
/** Breathing room kept between a link and any card it passes. */
export const EDGE_CLEARANCE = 16;
/** Corner radius of the routed polyline. */
const CORNER = 10;

const inflate = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

/** Axis-aligned segment vs rect. */
function segHits(p, q, r) {
  const minX = Math.min(p.x, q.x);
  const maxX = Math.max(p.x, q.x);
  const minY = Math.min(p.y, q.y);
  const maxY = Math.max(p.y, q.y);
  return minX < r.x + r.w && maxX > r.x && minY < r.y + r.h && maxY > r.y;
}

/** General segment vs rect (Liang–Barsky), used for scoring sides. */
function lineHits(p, q, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const tests = [
    [-dx, p.x - r.x],
    [dx, r.x + r.w - p.x],
    [-dy, p.y - r.y],
    [dy, r.y + r.h - p.y],
  ];
  for (const [pi, qi] of tests) {
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
  }
  return t0 < t1;
}

const pointIn = (p, r) =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

function countHits(points, rects) {
  let n = 0;
  for (let i = 0; i < points.length - 1; i++) {
    for (const r of rects) if (segHits(points[i], points[i + 1], r)) n++;
  }
  return n;
}

function tidy(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
  }
  // drop collinear middles
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const collinear =
      (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) ||
      (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (collinear) out.splice(i, 1);
    else i++;
  }
  return out;
}

const pathLen = (pts) => {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return L;
};

/**
 * Route an orthogonal polyline from `p1` to `p2` that leaves each node
 * along its normal and steps around every obstacle rect.
 */
export function routePoints(p1, p2, allRects) {
  const a = { x: p1.x + p1.nx * EDGE_STUB, y: p1.y + p1.ny * EDGE_STUB };
  const b = { x: p2.x + p2.nx * EDGE_STUB, y: p2.y + p2.ny * EDGE_STUB };

  // only cards inside the corridor between the two ends can matter
  const box = {
    x: Math.min(p1.x, p2.x) - 140,
    y: Math.min(p1.y, p2.y) - 140,
    w: Math.abs(p2.x - p1.x) + 280,
    h: Math.abs(p2.y - p1.y) + 280,
  };
  const rects = allRects.filter(
    (r) =>
      r.x < box.x + box.w && r.x + r.w > box.x && r.y < box.y + box.h && r.y + r.h > box.y
  );

  const evaluate = (raws) => {
    let best = null;
    for (const raw of raws) {
      const pts = tidy([p1, ...raw, p2]);
      const hits = countHits(pts, rects);
      const score = hits * 10000 + (pts.length - 2) * 60 + pathLen(pts);
      if (!best || score < best.score) best = { score, pts, hits };
    }
    return best;
  };

  // tier 1 — straight run or a single elbow
  let best = evaluate([
    [a, b],
    [a, { x: b.x, y: a.y }, b],
    [a, { x: a.x, y: b.y }, b],
  ]);
  if (best.hits === 0) return best.pts;

  const xs = [(a.x + b.x) / 2, a.x, b.x];
  const ys = [(a.y + b.y) / 2, a.y, b.y];
  for (const r of rects) {
    xs.push(r.x - 1, r.x + r.w + 1);
    ys.push(r.y - 1, r.y + r.h + 1);
  }

  // tier 2 — one dog-leg past an obstacle edge
  const tier2 = [];
  for (const x of xs) tier2.push([a, { x, y: a.y }, { x, y: b.y }, b]);
  for (const y of ys) tier2.push([a, { x: a.x, y }, { x: b.x, y }, b]);
  const t2 = evaluate(tier2);
  if (t2 && t2.score < best.score) best = t2;
  if (best.hits === 0) return best.pts;

  // tier 3 — full detour, only worth the cost on a crowded board
  if (rects.length <= 20) {
    const tier3 = [];
    for (const x of xs) {
      for (const y of ys) {
        tier3.push([a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]);
        tier3.push([a, { x: a.x, y }, { x, y }, { x, y: b.y }, b]);
      }
    }
    const t3 = evaluate(tier3);
    if (t3 && t3.score < best.score) best = t3;
  }
  return best ? best.pts : tidy([p1, a, b, p2]);
}

/** Rounded-corner SVG path through a polyline. */
export function roundedPath(pts, radius = CORNER) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const d1 = Math.hypot(c.x - p.x, c.y - p.y);
    const d2 = Math.hypot(n.x - c.x, n.y - c.y);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    if (r < 1) {
      d += ` L ${c.x} ${c.y}`;
      continue;
    }
    const s = { x: c.x + ((p.x - c.x) / d1) * r, y: c.y + ((p.y - c.y) / d1) * r };
    const e = { x: c.x + ((n.x - c.x) / d2) * r, y: c.y + ((n.y - c.y) / d2) * r };
    d += ` L ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x} ${e.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/** Point halfway along a polyline — used to place the label. */
export function midOf(pts) {
  const half = pathLen(pts) / 2;
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (walked + seg >= half) {
      const t = seg === 0 ? 0 : (half - walked) / seg;
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      };
    }
    walked += seg;
  }
  return pts[pts.length - 1];
}

/**
 * Resolve every edge into a drawable path, fanning out the connections
 * that share the same node side so that they never overlap.
 *
 * Returns `[{ edge, d, mid, from, to }]`.
 */
export function layoutEdges(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const padded = nodes.map((n) => ({ id: n.id, ...inflate(rectOf(n), EDGE_CLEARANCE) }));
  const around = (idA, idB) => padded.filter((r) => r.id !== idA && r.id !== idB);

  // 1. decide which side each end of each edge leaves from
  const resolved = [];
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [sa, sb] =
      e.pinned && e.fromSide && e.toSide
        ? [e.fromSide, e.toSide]
        : bestSides(a, b, around(a.id, b.id));
    resolved.push({ edge: e, a, b, sa, sb });
  }

  // 2. bucket the endpoints by (node, side)
  const slots = new Map();
  const push = (nodeId, side, item) => {
    const key = `${nodeId}|${side}`;
    if (!slots.has(key)) slots.set(key, []);
    slots.get(key).push(item);
  };
  for (const r of resolved) {
    push(r.a.id, r.sa, { r, end: 'a', other: r.b });
    push(r.b.id, r.sb, { r, end: 'b', other: r.a });
  }

  // 3. spread each bucket evenly along its side, ordered by the
  //    neighbour's position so the fanned arrows don't cross
  const offsets = new Map();
  for (const [key, items] of slots) {
    const side = key.slice(key.indexOf('|') + 1);
    const horizontal = side === 'top' || side === 'bottom';
    items.sort((p, q) => {
      const pc = horizontal
        ? p.other.x + (p.other.w ?? NODE_W) / 2
        : p.other.y + (p.other.h ?? NODE_H) / 2;
      const qc = horizontal
        ? q.other.x + (q.other.w ?? NODE_W) / 2
        : q.other.y + (q.other.h ?? NODE_H) / 2;
      return pc - qc;
    });
    const n = items.length;
    const span = 0.76; // keep the fan inside the middle 76% of the side
    items.forEach((item, i) => {
      const t = n === 1 ? 0.5 : 0.5 - span / 2 + (span * i) / (n - 1);
      offsets.set(`${item.r.edge.id}|${item.end}`, t);
    });
  }

  // 4. route each path around every other card
  return resolved.map((r) => {
    const p1 = anchor(r.a, r.sa, offsets.get(`${r.edge.id}|a`) ?? 0.5);
    const p2 = anchor(r.b, r.sb, offsets.get(`${r.edge.id}|b`) ?? 0.5);
    const pts = routePoints(p1, p2, around(r.a.id, r.b.id));
    return { edge: r.edge, d: roundedPath(pts), mid: midOf(pts), from: p1, to: p2 };
  });
}

/** Offset used when spawning a node from a "+" handle. */
export function spawnOffset(side) {
  switch (side) {
    case 'top':
      return { dx: 0, dy: -(NODE_H + GAP) };
    case 'bottom':
      return { dx: 0, dy: NODE_H + GAP };
    case 'left':
      return { dx: -(NODE_W + GAP), dy: 0 };
    default:
      return { dx: NODE_W + GAP, dy: 0 };
  }
}

export function screenToWorld(clientX, clientY, rect, view) {
  return {
    x: (clientX - rect.left - view.x) / view.zoom,
    y: (clientY - rect.top - view.y) / view.zoom,
  };
}

/** Free spot near `x,y` that doesn't sit on top of an existing node. */
export function findFreeSpot(nodes, x, y, side) {
  let guard = 0;
  while (
    guard++ < 60 &&
    nodes.some((n) => Math.abs(n.x - x) < 60 && Math.abs(n.y - y) < 60)
  ) {
    if (side === 'left' || side === 'right') y += NODE_H + 40;
    else x += NODE_W + 40;
  }
  return { x, y };
}
