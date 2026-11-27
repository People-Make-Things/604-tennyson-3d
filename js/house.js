// Builds the house: walls with real window and door assemblies, floors, fixtures, and a roof
// computed as a height field from the roof planes read off the aerial photo.
import * as THREE from 'three/webgpu';
import { OUTLINE, FY, HFN, DORMERS, ROOMS, OPEN, C } from './data.js';

export const T = 0.35;          // wall thickness (ft)
export const WALL_TOP = 9;      // ground floor wall height

const indoor = (f, x, z) => ROOMS.some(r => r.f === f && !r.out && x > r.r[0] && x < r.r[2] && z > r.r[1] && z < r.r[3]);
const onOutline = (kind, at, m) => {
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    if (kind === 'h' && az === bz && Math.abs(az - at) < 0.01 && m > Math.min(ax, bx) && m < Math.max(ax, bx)) return true;
    if (kind === 'v' && ax === bx && Math.abs(ax - at) < 0.01 && m > Math.min(az, bz) && m < Math.max(az, bz)) return true;
  }
  return false;
};

// ---------- roof planes ----------
const PARTS = [
  { rects: [[-1.2, 7.2, 42.4, 50.9], [42.4, 13.0, 62.6, 50.9]], ridge: 'x', at: 28, top: 23.95, s: 0.65, mat: 'shingles', main: true },
  { rects: [[-1.9, -1.9, 20.3, 27]], ridge: 'z', at: 9.2, top: 14.9, s: 0.56, mat: 'shingles' },
  ...DORMERS.map(c => { const zf = (c > 42.4 ? 14.2 : 12) - 0.5; return { rects: [[c - 3.7, zf, c + 3.7, zf + 11.5]], ridge: 'z', at: c, top: 19.6, s: 0.6, mat: 'shingles', dormer: { c, zf } }; }),
  { rects: [[18.4, 0.2, 30.8, 8.6]], shed: { at0: 0.2, y0: 8.7, s: 0.12 }, mat: 'shingles' },
  { rects: [[22.6, 48.3, 47.9, 58.4]], flat: 9.75, mat: 'roofSheet' },
  { rects: [[47.2, 50.6, 62.0, 52.5]], flat: 9.75, mat: 'roofSheet' },
];
const CUTS = [[28, 32, 36, 38.3]];
const SLAB = 0.45, FASCIA = 0.8;
const inRect = (r, x, z) => x > r[0] - 1e-6 && x < r[2] + 1e-6 && z > r[1] - 1e-6 && z < r[3] + 1e-6;
function partH(p, x, z) {
  if (p.flat != null) return p.flat;
  if (p.shed) return p.shed.y0 + p.shed.s * (z - p.shed.at0);
  return p.top - p.s * Math.abs((p.ridge === 'x' ? z : x) - p.at);
}
function planeId(p, x, z) {
  if (p.flat != null || p.shed) return 0;
  return ((p.ridge === 'x' ? z : x) >= p.at) ? 1 : 2;
}
function partsAt(x, z) {
  if (CUTS.some(c => inRect(c, x, z))) return [];
  return PARTS.filter(p => p.rects.some(r => inRect(r, x, z)));
}
export function roofTop(x, z) { const ps = partsAt(x, z); return ps.length ? Math.max(...ps.map(p => partH(p, x, z))) : -Infinity; }

function buildRoof(B) {
  const lines = (vals, lo, hi, step) => {
    const s = new Set(vals.filter(v => v >= lo && v <= hi).map(v => +v.toFixed(3)));
    for (let v = lo; v <= hi + 1e-6; v += step) s.add(+v.toFixed(3));
    const a = [...s].sort((p, q) => p - q);
    return a.filter((v, i) => i === 0 || v - a[i - 1] > 0.04);
  };
  const xv = [9.2, ...DORMERS, ...OUTLINE.map(p => p[0])], zv = [28, ...OUTLINE.map(p => p[1])];
  PARTS.forEach(p => p.rects.forEach(r => { xv.push(r[0], r[2]); zv.push(r[1], r[3]); }));
  CUTS.forEach(r => { xv.push(r[0], r[2]); zv.push(r[1], r[3]); });
  const xs = lines(xv, -1.9, 62.6, 0.25), zs = lines(zv, -1.9, 58.4, 0.25);
  const NX = xs.length - 1, NZ = zs.length - 1;
  // per cell: parts list, height function, pure plane key
  const cells = new Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    const ps = partsAt(cx, cz);
    if (!ps.length) { cells[j * NX + i] = null; continue; }
    const H = (x, z) => Math.max(...ps.map(p => partH(p, x, z)));
    let win = ps[0], wh = -1e9; for (const p of ps) { const h = partH(p, cx, cz); if (h > wh) { wh = h; win = p; } }
    const corners = [[xs[i], zs[j]], [xs[i + 1], zs[j]], [xs[i + 1], zs[j + 1]], [xs[i], zs[j + 1]]];
    const hs = corners.map(([x, z]) => H(x, z));
    const pid = PARTS.indexOf(win) * 4 + planeId(win, cx, cz);
    const pure = corners.every(([x, z], k) => Math.abs(partH(win, x, z) - hs[k]) < 1e-5 && planeId(win, x, z) === planeId(win, cx, cz) || Math.abs(partH(win, x, z) - hs[k]) < 1e-5);
    cells[j * NX + i] = { ps, H, hs, pid, pure, mat: win.mat, key: ps.map(p => PARTS.indexOf(p)).join(',') };
  }
  const C_ = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ) ? null : cells[j * NX + i];
  // top and underside surfaces, merging runs of coplanar cells along x
  for (let j = 0; j < NZ; j++) {
    let i = 0;
    while (i < NX) {
      const c = C_(i, j);
      if (!c) { i++; continue; }
      const z0 = zs[j], z1 = zs[j + 1];
      if (c.pure) {
        let k = i;
        while (k + 1 < NX) { const n = C_(k + 1, j); if (n && n.pure && n.pid === c.pid && n.key === c.key) k++; else break; }
        const x0 = xs[i], x1 = xs[k + 1];
        const a = [x0, c.H(x0, z0), z0], b = [x1, c.H(x1, z0), z0], cc = [x1, c.H(x1, z1), z1], d = [x0, c.H(x0, z1), z1];
        B.quad('roof', c.mat, d, cc, b, a);
        B.quad('roof', 'soffit', [a[0], a[1] - SLAB, a[2]], [b[0], b[1] - SLAB, b[2]], [cc[0], cc[1] - SLAB, cc[2]], [d[0], d[1] - SLAB, d[2]]);
        i = k + 1;
      } else {
        const x0 = xs[i], x1 = xs[i + 1];
        const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [x, c.H(x, z), z]);
        const mid = c.H((x0 + x1) / 2, (z0 + z1) / 2);
        const dA = Math.abs((P[0][1] + P[2][1]) / 2 - mid), dB = Math.abs((P[1][1] + P[3][1]) / 2 - mid);
        const low = p => [p[0], p[1] - SLAB, p[2]];
        if (dA <= dB) { B.tri('roof', c.mat, P[3], P[2], P[0]); B.tri('roof', c.mat, P[2], P[1], P[0]); B.tri('roof', 'soffit', low(P[0]), low(P[2]), low(P[3])); B.tri('roof', 'soffit', low(P[0]), low(P[1]), low(P[2])); }
        else { B.tri('roof', c.mat, P[3], P[1], P[0]); B.tri('roof', c.mat, P[3], P[2], P[1]); B.tri('roof', 'soffit', low(P[0]), low(P[1]), low(P[3])); B.tri('roof', 'soffit', low(P[1]), low(P[2]), low(P[3])); }
        i++;
      }
    }
  }
  // edges: fascia on open edges, cheek walls where one roof stands above another
  const edge = (c, n, ex0, ez0, ex1, ez1, outward) => {
    const hA0 = c.H(ex0, ez0), hA1 = c.H(ex1, ez1);
    let bot0, bot1, open = !n;
    if (n) { bot0 = Math.min(hA0, n.H(ex0, ez0)); bot1 = Math.min(hA1, n.H(ex1, ez1)); if (hA0 - bot0 < 0.01 && hA1 - bot1 < 0.01) return; }
    const o = outward;
    const P = (x, y, z) => [x + o[0] * 0.001, y, z + o[1] * 0.001];
    // order so the face points along `outward`
    const flip = (o[0] * (ez1 - ez0) - o[1] * (ex1 - ex0)) > 0;
    const q = (ya0, ya1, yb0, yb1, key) => {
      const a = P(ex0, yb0, ez0), b = P(ex1, yb1, ez1), cc = P(ex1, ya1, ez1), d = P(ex0, ya0, ez0);
      if (flip) B.quad('roof', key, b, a, d, cc); else B.quad('roof', key, a, b, cc, d);
    };
    if (open) { q(hA0, hA1, hA0 - FASCIA, hA1 - FASCIA, 'trim'); return; }
    const f0 = Math.max(bot0, hA0 - FASCIA), f1 = Math.max(bot1, hA1 - FASCIA);
    q(hA0, hA1, f0, f1, 'trim');
    if (f0 - bot0 > 0.01 || f1 - bot1 > 0.01) q(f0, f1, bot0, bot1, 'siding');
  };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const c = C_(i, j); if (!c) continue;
    edge(c, C_(i + 1, j), xs[i + 1], zs[j], xs[i + 1], zs[j + 1], [1, 0]);
    edge(c, C_(i - 1, j), xs[i], zs[j], xs[i], zs[j + 1], [-1, 0]);
    edge(c, C_(i, j + 1), xs[i], zs[j + 1], xs[i + 1], zs[j + 1], [0, 1]);
    edge(c, C_(i, j - 1), xs[i], zs[j], xs[i + 1], zs[j], [0, -1]);
  }
  // gable and frieze infill: siding from the top of the ground floor walls up to the roof underside, on every outer wall
  for (let k = 0; k < OUTLINE.length; k++) {
    const [ax, az] = OUTLINE[k], [bx, bz] = OUTLINE[(k + 1) % OUTLINE.length];
    const horiz = az === bz;
    const vals = horiz ? xs.filter(v => v > Math.min(ax, bx) - 1e-6 && v < Math.max(ax, bx) + 1e-6) : zs.filter(v => v > Math.min(az, bz) - 1e-6 && v < Math.max(az, bz) + 1e-6);
    // outward normal for a clockwise outline in x/z (outline runs x+ first along z=0, which faces -z)
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const out = [dz / len, -dx / len];
    const off = 0.03;
    for (let t = 0; t < vals.length - 1; t++) {
      const p0 = horiz ? [vals[t], az] : [ax, vals[t]], p1 = horiz ? [vals[t + 1], az] : [ax, vals[t + 1]];
      const mx = (p0[0] + p1[0]) / 2 - out[0] * 0.05, mz = (p0[1] + p1[1]) / 2 - out[1] * 0.05;
      const ps = partsAt(mx, mz); if (!ps.length) continue;
      const H = (x, z) => Math.max(...ps.map(p => partH(p, x, z))) - SLAB;
      const h0 = H(p0[0], p0[1]), h1 = H(p1[0], p1[1]);
      if (h0 <= WALL_TOP + 0.02 && h1 <= WALL_TOP + 0.02) continue;
      const a = [p0[0] + out[0] * off, WALL_TOP, p0[1] + out[1] * off], b = [p1[0] + out[0] * off, WALL_TOP, p1[1] + out[1] * off];
      const cc = [b[0], Math.max(WALL_TOP, h1), b[2]], d = [a[0], Math.max(WALL_TOP, h0), a[2]];
      const flip = (out[0] * (p1[1] - p0[1]) - out[1] * (p1[0] - p0[0])) > 0;
      if (flip) B.quad('roof', 'siding', b, a, d, cc); else B.quad('roof', 'siding', a, b, cc, d);
    }
  }
}

// ---------- windows and doors ----------
// L: a box in wall-local coords (a = along the wall, w = across it).
function wallBox(B, group, kind, key, a0, a1, w0, w1, y0, y1) {
  if (kind === 'h') B.box(group, key, a0, w0, a1, w1, y0, y1); else B.box(group, key, w0, a0, w1, a1, y0, y1);
}
function windowAssembly(B, group, kind, at, dir, s, e, y0, sill, head, ext, inTrim, type) {
  const wo = at, wi = at - dir * T;                 // outer and inner faces
  const wmid = (wo + wi) / 2;
  const L = (key, a0, a1, w0, w1, b, t) => wallBox(B, group, kind, key, a0, a1, w0, w1, y0 + b, y0 + t);
  const fr = 0.16, fd = 0.14;                       // sash frame width and depth
  // glass
  L('glass', s + 0.05, e - 0.05, wmid - 0.015, wmid + 0.015, sill + 0.05, head - 0.05);
  // sash frame
  const sashKey = 'sash';
  L(sashKey, s, s + fr, wmid - fd, wmid + fd, sill, head); L(sashKey, e - fr, e, wmid - fd, wmid + fd, sill, head);
  L(sashKey, s + fr, e - fr, wmid - fd, wmid + fd, sill, sill + fr); L(sashKey, s + fr, e - fr, wmid - fd, wmid + fd, head - fr, head);
  if (type === 'casement') {
    const m = (s + e) / 2;
    L(sashKey, m - 0.1, m + 0.1, wmid - fd, wmid + fd * 0.4, sill + fr, head - fr);
    L(sashKey, s + fr, e - fr, wmid - 0.05, wmid + 0.05, head - 1.15, head - 1.08);
  } else if (type === 'win') {
    const m = (sill + head) / 2;
    L(sashKey, s + fr, e - fr, wmid - fd, wmid + fd * 0.2, m - 0.07, m + 0.07);
  } else if (type === 'french') {
    const cols = Math.max(1, Math.round((e - s) / 1.25)), rows = 5;
    for (let c = 1; c < cols; c++) { const a = s + (e - s) * c / cols; L(sashKey, a - (c === cols / 2 ? 0.1 : 0.035), a + (c === cols / 2 ? 0.1 : 0.035), wmid - 0.05, wmid + 0.05, sill + fr, head - fr); }
    for (let r = 1; r < rows; r++) { const y = sill + (head - sill) * r / rows; L(sashKey, s + fr, e - fr, wmid - 0.04, wmid + 0.04, y - 0.035, y + 0.035); }
  }
  // exterior casing in green, interior casing
  if (ext) {
    const o0 = wo, o1 = wo + dir * 0.1;
    L('trim', s - 0.35, s, o0, o1, sill - 0.1, head + 0.05); L('trim', e, e + 0.35, o0, o1, sill - 0.1, head + 0.05);
    L('trim', s - 0.45, e + 0.45, o0, o1 + dir * 0.03, head, head + 0.5);
    L('trim', s - 0.5, e + 0.5, o0, o1 + dir * 0.12, head + 0.5, head + 0.58);
    if (sill > 0.1) L('trim', s - 0.45, e + 0.45, o0, wo + dir * 0.22, sill - 0.14, sill);
  }
  const i0 = wi, i1 = wi - dir * 0.06;
  L(inTrim, s - 0.3, s, i0, i1, sill > 0.1 ? sill - 0.25 : 0, head + 0.05); L(inTrim, e, e + 0.3, i0, i1, sill > 0.1 ? sill - 0.25 : 0, head + 0.05);
  L(inTrim, s - 0.3, e + 0.3, i0, i1, head, head + 0.4);
  if (sill > 0.1) { L(inTrim, s - 0.35, e + 0.35, wi + dir * 0.02, wi - dir * 0.16, sill - 0.08, sill); L(inTrim, s - 0.3, e + 0.3, i0, i1, sill - 0.45, sill - 0.08); }
}
// A window applied on a face that has no opening behind it (dormer fronts, gable ends).
export function appliedWindow(B, kind, at, dir, s, e, y0, y1, group = 'roof', plain = false) {
  const L = (key, a0, a1, w0, w1, b, t) => wallBox(B, group, kind, key, a0, a1, w0, w1, b, t);
  const o = at, d = dir;
  L('glassDark', s, e, o, o + d * 0.04, y0, y1);
  const fr = 0.16;
  L('sash', s, s + fr, o, o + d * 0.1, y0, y1); L('sash', e - fr, e, o, o + d * 0.1, y0, y1);
  L('sash', s, e, o, o + d * 0.1, y0, y0 + fr); L('sash', s, e, o, o + d * 0.1, y1 - fr, y1);
  if (!plain) L('sash', s, e, o, o + d * 0.08, (y0 + y1) / 2 - 0.07, (y0 + y1) / 2 + 0.07);
  L('trim', s - 0.35, s, o, o + d * 0.14, y0 - 0.1, y1 + 0.05); L('trim', e, e + 0.35, o, o + d * 0.14, y0 - 0.1, y1 + 0.05);
  L('trim', s - 0.45, e + 0.45, o, o + d * 0.16, y1, y1 + 0.45); L('trim', s - 0.45, e + 0.45, o, o + d * 0.26, y0 - 0.14, y0);
}
function shutters(B, kind, at, dir, s, e, y0, y1, w = 1.45) {
  const o = at + dir * 0.08;
  for (const [a0, a1] of [[s - 0.3 - w, s - 0.3], [e + 0.3, e + 0.3 + w]]) {
    const st = 0.17, mid = (y0 + y1) / 2;
    // stiles and rails
    wallBox(B, 'f0', kind, 'trim', a0, a0 + st, o, o + dir * 0.13, y0, y1); wallBox(B, 'f0', kind, 'trim', a1 - st, a1, o, o + dir * 0.13, y0, y1);
    for (const y of [y0, mid - 0.09, y1 - 0.2]) wallBox(B, 'f0', kind, 'trim', a0 + st, a1 - st, o, o + dir * 0.13, y, y + 0.2);
    wallBox(B, 'f0', kind, 'glassDark', a0 + st, a1 - st, o, o + dir * 0.02, y0, y1);
    // louvers: thin slats tilted down and out so each one catches light on top and drops a shadow line
    const len = a1 - a0 - 2 * st, ca = (a0 + a1) / 2;
    for (let y = y0 + 0.28; y < y1 - 0.24; y += 0.16) {
      if (Math.abs(y - mid) < 0.16) continue;
      const wc = o + dir * 0.065;
      if (kind === 'h') B.obox('f0', 'trim', ca, y, wc, len, 0.025, 0.15, 0, dir * 0.75, 0);
      else B.obox('f0', 'trim', wc, y, ca, 0.15, 0.025, len, 0, 0, -dir * 0.75);
    }
  }
}
// ---------- walls ----------
// den front window [s, e, sill, head]: a tall casement pair with a central mullion, narrower than the data default
const DEN_WIN = [7.05, 11.35, 2.3, 7.0];
function spec(type, H, o) {
  if (type === 'casement') return { sill: o.sill, head: o.head, glass: true };
  if (type === 'win') return { sill: 3, head: Math.min(6.8, H - 0.4), glass: true };
  if (type === 'french') return { sill: 0, head: Math.min(7.4, H - 0.3), glass: true };
  if (type === 'open') return { sill: 0, head: Math.min(7.6, H - 0.3) };
  return { sill: 0, head: Math.min(7, H - 0.3) };
}
function wallLine(B, f, kind, at, a0, a1, inset, wallKey) {
  const group = f === 0 ? 'f0' : 'f1';
  const dir = inset > 0 ? -1 : 1;                  // points to the outer side of this wall
  const outFace = kind === 'h' ? (dir > 0 ? 'pz' : 'nz') : (dir > 0 ? 'px' : 'nx');
  const inFace = { pz: 'nz', nz: 'pz', px: 'nx', nx: 'px' }[outFace];
  const y0 = FY[f], hfn = HFN[f];
  const ops = OPEN.filter(o => o[0] === f && o[1] === kind && Math.abs(o[2] - at) < 0.01 && o[3] > a0 && o[3] < a1).map(o => ({ c: o[3], w: o[4], type: o[5] }));
  if (f === 0 && kind === 'h' && Math.abs(at) < 0.01) ops.forEach(o => { if (o.type === 'win') { o.c = (DEN_WIN[0] + DEN_WIN[1]) / 2; o.w = DEN_WIN[1] - DEN_WIN[0]; o.type = 'casement'; o.sill = DEN_WIN[2]; o.head = DEN_WIN[3]; } });
  const pts = new Set([a0, a1]);
  ops.forEach(o => { pts.add(Math.max(a0, o.c - o.w / 2)); pts.add(Math.min(a1, o.c + o.w / 2)); });
  if (f === 1) for (let v = Math.ceil(a0); v < a1; v++) pts.add(v);
  const arr = [...pts].sort((p, q) => p - q);
  const inTrim = f === 0 && !['paintGreen', 'paintGrey'].includes(wallKey) ? 'woodtrim' : 'sash';
  const baseKey = f === 0 ? 'woodtrim' : 'sash';
  for (let i = 0; i < arr.length - 1; i++) {
    const s = arr[i], e = arr[i + 1]; if (e - s < 0.02) continue;
    const m = (s + e) / 2, H = kind === 'h' ? hfn(at, m) : hfn(m, at);
    const o = ops.find(o => m > o.c - o.w / 2 && m < o.c + o.w / 2);
    const ext = kind === 'h' ? !indoor(f, m, at + dir * 0.5) : !indoor(f, at + dir * 0.5, m);
    const outline = onOutline(kind, at, m);
    // upstairs walls on the outline are covered by the gable infill; leave their outer face out
    const key = { def: wallKey, [outFace]: ext ? (f === 1 && outline ? wallKey : 'siding') : wallKey };
    const skip = f === 1 && outline ? outFace : '';
    const put = (b, t) => kind === 'h'
      ? B.box(group, key, s, at, e, at - dir * T, y0 + b, y0 + t, skip)
      : B.box(group, key, at, s, at - dir * T, e, y0 + b, y0 + t, skip);
    const base = (a, b2) => { if (b2 - a > 0.05) wallBox(B, group, kind, baseKey, a, b2, at - dir * T, at - dir * (T + 0.05), y0, y0 + 0.42); };
    if (!o) { put(0, H); if (H > 1) base(s, e); continue; }
    const sp = spec(o.type, H, o);
    if (sp.sill > 0) put(0, sp.sill);
    if (H > sp.head) put(sp.head, H);
    if (sp.sill > 0 && H > 1) base(s, e);
    const isFirst = Math.abs(s - Math.max(a0, o.c - o.w / 2)) < 0.01;
    if (sp.glass && isFirst) {
      const os = Math.max(a0, o.c - o.w / 2), oe = Math.min(a1, o.c + o.w / 2);
      windowAssembly(B, group, kind, at, dir, os, oe, y0, sp.sill, sp.head, ext && !(f === 1 && outline), inTrim, o.type);
      if (f === 1 && outline && ext) appliedWindow(B, kind, at + dir * 0.035, dir, os, oe, y0 + sp.sill, y0 + sp.head);
    }
    if (!sp.glass && isFirst && (o.type === 'door' || o.type === 'front')) {
      const os = Math.max(a0, o.c - o.w / 2), oe = Math.min(a1, o.c + o.w / 2);
      const L = (k, q0, q1, w0, w1, b, t) => wallBox(B, group, kind, k, q0, q1, w0, w1, y0 + b, y0 + t);
      for (const side of [at + dir * 0.0, at - dir * T]) {
        const sd = side === at ? dir : -dir;
        const k = ext && side === at ? 'trim' : inTrim;
        L(k, os - 0.3, os, side, side + sd * 0.06, 0, sp.head + 0.05); L(k, oe, oe + 0.3, side, side + sd * 0.06, 0, sp.head + 0.05);
        L(k, os - 0.3, oe + 0.3, side, side + sd * 0.06, sp.head, sp.head + 0.4);
      }
    }
  }
}

// ---------- floors, rooms, fixtures ----------
export function buildHouse(B, floorDefs) {
  for (const rm of ROOMS) {
    if (['front', 'garden', 'side'].includes(rm.id)) continue;
    const [x0, z0, x1, z1] = rm.r;
    floorDefs.push(rm);
    if (!rm.out) {
      const wk = rm.wall || C.wall;
      wallLine(B, rm.f, 'h', z0, x0, x1, T / 2, wk);
      wallLine(B, rm.f, 'h', z1, x0, x1, -T / 2, wk);
      wallLine(B, rm.f, 'v', x0, z0, z1, T / 2, wk);
      wallLine(B, rm.f, 'v', x1, z0, z1, -T / 2, wk);
      // ceilings for the ground floor (shown with the roof); the kitchen keeps its vaulted ceiling
      if (rm.f === 0 && rm.id !== 'kitchen') B.box('ceil', rm.id === 'den' ? 'paneling' : 'ceiling', x0, z0, x1, z1, 9.0, 9.08);
    }
  }
  const F0 = 'f0', F1 = 'f1';
  // foundation skirt below the siding
  for (let k = 0; k < OUTLINE.length; k++) {
    const [ax, az] = OUTLINE[k], [bx, bz] = OUTLINE[(k + 1) % OUTLINE.length];
    if (az === bz) B.box(F0, 'foundation', Math.min(ax, bx) - 0.08, az - 0.08, Math.max(ax, bx) + 0.08, az + 0.08, -1.7, -0.25);
    else B.box(F0, 'foundation', ax - 0.08, Math.min(az, bz) - 0.08, ax + 0.08, Math.max(az, bz) + 0.08, -1.7, -0.25);
  }
  // water table board between siding and foundation
  for (let k = 0; k < OUTLINE.length; k++) {
    const [ax, az] = OUTLINE[k], [bx, bz] = OUTLINE[(k + 1) % OUTLINE.length];
    if (az === bz) B.box(F0, 'sash', Math.min(ax, bx) - 0.12, az - 0.12, Math.max(ax, bx) + 0.12, az + 0.12, -0.3, 0.25);
    else B.box(F0, 'sash', ax - 0.12, Math.min(az, bz) - 0.12, ax + 0.12, Math.max(az, bz) + 0.12, -0.3, 0.25);
  }
  // corner boards
  OUTLINE.forEach(([x, z]) => B.box(F0, 'sash', x - 0.22, z - 0.22, x + 0.22, z + 0.22, 0, WALL_TOP));
  // stairs: 14 steps along the living room back wall, rising from x=26 to x=40
  for (let i = 0; i < 14; i++) {
    B.box(F0, 'stair', 26 + i, 21.6, 27 + i + 0.08, 23.8, (i + 1) * 10 / 14 - 0.12, (i + 1) * 10 / 14);
    B.box(F0, 'sash', 26 + i, 21.65, 26 + i + 0.06, 23.8, 0, (i + 1) * 10 / 14 - 0.12);
    B.box(F0, 'woodtrim', 26.45 + i - 0.04, 21.48, 26.45 + i + 0.04, 21.56, (i + 1) * 10 / 14, (i + 1) * 10 / 14 + 2.9);
  }
  B.box(F0, 'paint', 26, 21.6, 40, 23.8, 0, 0.01);
  { const L = Math.hypot(14, 10); B.obox(F0, 'woodtrim', 33, 5 + 3, 21.52, L, 0.22, 0.2, 0, 0, Math.atan2(10, 14)); B.obox(F0, 'paint', 33, 5 - 0.35, 22.7, L, 0.5, 2.2, 0, 0, Math.atan2(10, 14)); }
  B.box(F0, 'woodtrim', 25.85, 21.4, 26.15, 21.7, 0, 3.6);
  B.box(F1, 'woodtrim', 26, 21.44, 40, 21.6, 12.8, 13); B.box(F1, 'woodtrim', 25.8, 21.5, 25.95, 24, 12.8, 13);
  for (let x = 26.3; x < 40; x += 0.45) B.box(F1, 'woodtrim', x - 0.03, 21.49, x + 0.03, 21.55, 10, 12.8);
  // back-to-back fireplaces sharing one chimney
  B.box(F0, 'sash', 18.6, 13, 20.3, 17.5, 0, 4.6); B.box(F0, 'firebox', 20.25, 14.3, 20.32, 16.2, 0.2, 3);
  B.box(F0, 'woodtrim', 18.6, 12.7, 20.6, 17.8, 4.55, 4.75);
  B.box(F0, 'stone', 16.4, 12.6, 18.2, 17.2, 0, 5.2); B.box(F0, 'firebox', 16.33, 14, 16.42, 15.8, 0.2, 2.8);
  for (let k = 0; k < 5; k++) B.box(F0, 'paneling', 2.5, 16.6, 13.5, 17.8, k * 1.6, k * 1.6 + 0.15);
  B.box(F0, 'paneling', 2.5, 17.6, 13.5, 17.8, 0, 7.2);
  // den ceiling beams
  for (const x of [4.6, 9.2, 13.8]) B.box('ceil', 'woodtrim', x - 0.3, 0.35, x + 0.3, 17.65, 8.4, 9.0);
  // dining and family room beams
  for (const z of [18.5, 23, 27.5]) B.box('ceil', 'woodtrim', 42.75, z - 0.3, 61.05, z + 0.3, 8.45, 9.0);
  for (const z of [37, 42, 47]) B.box('ceil', 'woodtrim', 42.75, z - 0.3, 61.05, z + 0.3, 8.45, 9.0);
  // kitchen
  B.box(F0, 'cabinet', 0.35, 30, 2.6, 46, 0.3, 2.9); B.box(F0, 'firebox', 0.35, 30, 2.5, 46, 0, 0.3); B.box(F0, 'counter', 0.35, 29.9, 2.75, 46.1, 2.9, 3.05);
  B.box(F0, 'cabinet', 0.35, 30, 1.6, 46, 4.6, 7.2);
  B.box(F0, 'cabinet', 2.6, 45.9, 6.5, 48.25, 0.3, 2.9); B.box(F0, 'counter', 2.6, 45.75, 6.5, 48.25, 2.9, 3.05);
  B.box(F0, 'cabinet', 7.5, 34, 10, 41, 0.3, 2.9); B.box(F0, 'firebox', 7.6, 34.1, 9.9, 40.9, 0, 0.3); B.box(F0, 'counter', 7.4, 33.9, 10.1, 41.1, 2.9, 3.05);
  B.box(F0, 'darkMetal', 7.55, 36, 9.95, 38.5, 3.05, 3.08);
  B.box(F0, 'cabinet', 15.8, 24.4, 18.05, 27.2, 0, 7.6); B.box(F0, 'metal', 15.7, 24.8, 15.8, 26.8, 2.2, 5.8); B.box(F0, 'firebox', 15.68, 25, 15.72, 26.6, 2.5, 3.8); B.box(F0, 'firebox', 15.68, 25, 15.72, 26.6, 4.2, 5.5);
  B.box(F0, 'porcelain', 15.8, 28.4, 18.05, 31.4, 0, 6.2); B.box(F0, 'cabinet', 15.8, 28.4, 18.05, 31.4, 6.2, 7.6);
  // half bath, laundry
  B.box(F0, 'porcelain', 18.8, 33, 20.2, 34.6, 0, 1.4); B.box(F0, 'porcelain', 18.6, 33.4, 19.2, 34.2, 1.4, 2.8);
  B.box(F0, 'porcelain', 21, 35.3, 22.6, 35.9, 2.4, 3);
  B.box(F0, 'porcelain', 27, 35.4, 29.8, 37.6, 0, 3); B.box(F0, 'porcelain', 23.8, 35.4, 26.6, 37.6, 0, 3);
  // ground full bath
  B.box(F0, 'porcelain', 36.8, 35.4, 42.0, 37.6, 0, 1.8);
  B.box(F0, 'tileHex', 39, 30.4, 42.0, 33.5, 0, 0.3); B.box(F0, 'tileHex', 38.8, 30.4, 39.05, 33.5, 0.3, 7);
  B.box(F0, 'porcelain', 31, 36, 32.5, 37.6, 0, 1.4); B.box(F0, 'porcelain', 33.5, 37.1, 34.9, 37.6, 0, 2.9);
  B.box(F0, 'tileWhite', 30.2, 30.2, 42.2, 30.21, 0, 4); B.box(F0, 'tileWhite', 30.2, 37.6, 42.2, 37.61, 0, 4);
  // upstairs bath
  B.box(F1, 'porcelain', 18.4, 33.4, 23, 36.6, 10, 11.7); B.box(F1, 'porcelain', 25.5, 35, 27, 36.6, 10, 11.4); B.box(F1, 'porcelain', 25.6, 27.4, 27.2, 28, 12.4, 13.2);
  // balcony: deck, railing, side walls through the roof
  for (let x = 28.2; x < 36; x += 0.5) B.box(F1, 'deck', x, 32, x + 0.44, 38, 9.95, 10.05);
  B.box(F1, 'sash', 28, 37.8, 36, 38, 12.8, 13.05); B.box(F1, 'sash', 28, 37.8, 36, 38, 10.05, 10.25);
  for (let x = 28.3; x < 36; x += 0.4) B.box(F1, 'sash', x - 0.04, 37.86, x + 0.04, 37.94, 10.25, 12.8);
  B.box('roof', 'siding', 27.75, 32, 28.05, 38.3, 10, roofTop(27.7, 32) - 0.3);
  B.box('roof', 'siding', 35.95, 32, 36.25, 38.3, 10, roofTop(36.3, 32) - 0.3);
  // porch: brick steps, floor, posts and front door with glass side panels
  B.box(F0, 'porchBrick', 18.4, 0.2, 30.4, 8.6, -0.35, 0);
  for (let k = 0; k < 3; k++) B.box(F0, 'brick', 19.6, -1.1 - k * 1.0, 28.6, 0.2, -0.35 - (k + 1) * 0.45, -0.35 - k * 0.45);
  B.box(F0, 'brick', 19.6, -3.1, 28.6, 0.2, -1.75, -1.7);
  [[19, 0.8], [29.8, 0.8]].forEach(([x, z]) => { B.box(F0, 'trim', x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0, 8.7); B.box(F0, 'trim', x - 0.4, z - 0.4, x + 0.4, z + 0.4, 0, 0.5); });
  B.box(F0, 'trim', 18.4, 0.4, 30.8, 1.0, 8.2, 8.75);
  B.box(F0, 'door', 21.3, 8.62, 24.7, 8.75, 0, 7);
  B.box(F0, 'darkMetal', 24.2, 8.5, 24.35, 8.62, 3.2, 3.5);
  for (const [a, b] of [[20.1, 21.15], [24.85, 25.9]]) { B.box(F0, 'sash', a, 8.55, b, 8.7, 0, 7); B.box(F0, 'glass', a + 0.15, 8.5, b - 0.15, 8.75, 0.6, 6.7); }
  B.box(F0, 'trim', 19.8, 8.5, 26.2, 8.7, 7, 7.6);
  // shutters on the big front window of the den wing
  shutters(B, 'h', 0, -1, DEN_WIN[0], DEN_WIN[1], DEN_WIN[2], DEN_WIN[3]);
  // small dark attic window high in the den gable, dormer windows
  appliedWindow(B, 'h', -0.035, -1, 7.8, 10.6, 10.5, 11.8, 'roof', true);
  DORMERS.forEach(c => { const zf = (c > 42.4 ? 14.2 : 12) - 0.5; appliedWindow(B, 'h', zf - 0.03, -1, c - 1.7, c + 1.7, 14.6 + (c > 42.4 ? 0.6 : 0), 16.9 + (c > 42.4 ? 0.3 : 0)); });
  // gable-end windows upstairs (northeast)
  // chimney
  B.box('roof', 'brickWall', 17.2, 13, 19.6, 16.6, 9.6, 24.5); B.box('roof', 'foundation', 17.0, 12.8, 19.8, 16.8, 24.5, 24.85);
  B.box('roof', 'darkMetal', 17.7, 13.6, 19.1, 16.0, 24.85, 25.6);
  buildRoof(B);
  // gutters along the main eaves
  const gut = (x0, x1, z, y) => { B.box('roof', 'trim', x0, z - 0.42, x1, z + 0.02, y - 0.95, y - 0.55); };
  gut(-1.2, 18.4, 50.9, roofTop(5, 50.85)); gut(-1.2, 42.4, 7.2, roofTop(30, 7.25)); gut(42.4, 62.6, 13.0, roofTop(50, 13.05));
}

export { PARTS };
