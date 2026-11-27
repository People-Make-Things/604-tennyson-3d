// Geometry batching: every static surface is written into one buffer per (group, material),
// so the whole house draws in a few dozen calls instead of thousands of meshes.
import * as THREE from 'three/webgpu';

export class Batcher {
  constructor() { this.b = new Map(); }
  _get(group, key) {
    const id = group + '|' + key;
    let e = this.b.get(id);
    if (!e) { e = { group, key, pos: [], nor: [], uv: [] }; this.b.set(id, e); }
    return e;
  }
  // a, b, c, d: corners in counter-clockwise order seen from the side the face points to
  quad(group, key, a, b, c, d) {
    const e = this._get(group, key);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const P = [a, b, c, a, c, d];
    for (const p of P) {
      e.pos.push(p[0], p[1], p[2]); e.nor.push(nx, ny, nz);
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      if (ay >= ax && ay >= az) e.uv.push(p[0], p[2]); else if (ax >= az) e.uv.push(p[2], p[1]); else e.uv.push(p[0], p[1]);
    }
  }
  tri(group, key, a, b, c) {
    const e = this._get(group, key);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { e.pos.push(p[0], p[1], p[2]); e.nor.push(nx, ny, nz); e.uv.push(p[0], p[2]); }
  }
  // Axis-aligned box. key is a material key or {px,nx,py,ny,pz,nz,def} per face. skip: faces to leave out.
  box(group, key, x0, z0, x1, z1, y0, y1, skip) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (z0 > z1) [z0, z1] = [z1, z0]; if (y0 > y1) [y0, y1] = [y1, y0];
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4 || y1 - y0 < 1e-4) return;
    const k = f => typeof key === 'string' ? key : (key[f] || key.def);
    const s = skip || '';
    if (!s.includes('px')) this.quad(group, k('px'), [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (!s.includes('nx')) this.quad(group, k('nx'), [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    if (!s.includes('py')) this.quad(group, k('py'), [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (!s.includes('ny')) this.quad(group, k('ny'), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!s.includes('pz')) this.quad(group, k('pz'), [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!s.includes('nz')) this.quad(group, k('nz'), [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
  }
  // Oriented box from a center, size and a rotation matrix (for beams, rails, path pavers).
  obox(group, key, cx, cy, cz, sx, sy, sz, rotY = 0, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
    m.setPosition(cx, cy, cz);
    const v = (x, y, z) => { const p = new THREE.Vector3(x * sx / 2, y * sy / 2, z * sz / 2).applyMatrix4(m); return [p.x, p.y, p.z]; };
    const F = [
      [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]],
      [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]],
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    for (const f of F) this.quad(group, key, ...f.map(c => v(...c)));
  }
  build(groups, mats, shadows = true) {
    for (const e of this.b.values()) {
      if (!e.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(e.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(e.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(e.uv, 2));
      g.computeBoundingSphere();
      const mat = mats[e.key];
      if (!mat) console.warn('missing material', e.key);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = e.group + ' / ' + e.key;
      const transparent = mat && mat.transparent;
      mesh.castShadow = shadows && !transparent; mesh.receiveShadow = true;
      groups[e.group].add(mesh);
    }
    this.b.clear();
  }
}
