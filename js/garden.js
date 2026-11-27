// Back garden details from listing photo zillow-02 and tour frames v184-v186:
// English ivy carpet and banks, the ivy mound in front of the brick terrace, and the small roofed pavilion.
import * as THREE from 'three/webgpu';
import { texture, uv, color, vec3, float, mix, hash, instanceIndex, positionWorld, mx_noise_float, smoothstep } from 'three/tsl';
import { GY, lawnBack, onPath, lawnDist, pathDist, TERRACE } from './site.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// cheap smooth value noise for mound shapes
const n2 = (x, z) => Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2.3) * Math.cos(z * 0.27 - x * 0.12) * 0.5 + Math.sin(x * 0.83 + z * 0.61) * 0.25;

// Ivy surface height above the ground (ft), or -1 where there is no ivy.
export function ivyHeight(x, z) {
  if (x < -38 || x > 77 || z < 56 || z > 131) return -1;
  const T = TERRACE;
  if (z > T.z - 5.7 && x > T.sx0 - 0.9 && x < T.sx1 + 3.2 && z < T.z + 1) return -1;   // steps, cheeks, pier
  if (x > -1 && x < 19.5 && z < 63) return -1;     // pergola patio
  if (x > 21.8 && x < T.x1 + 0.2 && z > T.uz - 0.2) return -1;   // upper tier
  // ivy grows over the terrace top left of the steps, under the redwoods, and on the bed behind the pavilion
  const onTop = z > T.z && x > T.x0 && x < T.x1;
  if (onTop && !(x > T.sx1 + 3.2 || z > 123)) return -1;
  const dl = lawnDist(x, z), dp = pathDist(x, z);
  if (dl < 0.3 || dp < 0.2) return -1;
  const free = sstep(0.3, 3.5, Math.min(dl, dp));   // mounds rise away from lawn and path edges
  let h = 0.16 + 0.2 * (0.5 + 0.5 * n2(x, z)) * (0.4 + 0.6 * free);
  if (onTop) return T.h + 0.25 + 0.9 * (0.5 + 0.5 * n2(x * 1.3, z)) ;
  // ivy mound against the terrace wall, left of the steps (photo centre): it covers the wall face
  if (x > T.sx1 + 3.2 && x < T.x1 + 2) h += (T.h + 0.6) * sstep(T.z - 10, T.z - 0.5, z) * (0.8 + 0.25 * n2(x * 1.7, z)) * free;
  // the big ivy bank rising toward the east lot line (photo left, frames v184/v186)
  h += 3.4 * sstep(44, 74, x) * (0.8 + 0.3 * n2(x * 0.7, z * 0.9)) * free;
  // west side bank behind the right-hand trees
  h += 1.6 * sstep(-12, -34, x) * free;
  return h;
}

function ivyLeafTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  // Hedera helix leaf: five pointed lobes, cordate base
  const lobes = [[0, -0.46], [0.36, -0.2], [0.42, 0.18], [-0.42, 0.18], [-0.36, -0.2]];
  g.translate(S / 2, S * 0.56); g.scale(S, S);
  g.beginPath(); g.moveTo(0, 0.24);
  const order = [3, 4, 0, 1, 2];
  let prev = [-0.1, 0.3];
  g.moveTo(-0.08, 0.3);
  for (const k of order) {
    const [x, y] = lobes[k];
    const mx = (prev[0] + x) / 2 * 0.62, my = (prev[1] + y) / 2 * 0.62;
    g.quadraticCurveTo(mx * 1.25, my * 1.25, mx, my); g.lineTo(x, y); prev = [x, y];
  }
  g.quadraticCurveTo(0.18, 0.34, 0.08, 0.3); g.lineTo(0, 0.24); g.closePath();
  const gr = g.createRadialGradient(0, 0, 0.02, 0, 0, 0.5);
  gr.addColorStop(0, '#d8e6c8'); gr.addColorStop(1, '#a8bc98');
  g.fillStyle = gr; g.fill();
  // pale veins
  g.strokeStyle = 'rgba(240,248,225,0.9)'; g.lineWidth = 0.018;
  for (const [x, y] of lobes) { g.beginPath(); g.moveTo(0, 0.2); g.lineTo(x * 0.85, y * 0.85); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}

export function buildIvy(group) {
  let seed = 23; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tex = ivyLeafTexture();
  // ground under the ivy: a dark leafy heightfield so the carpet has body and gaps read as shade, not soil
  const x0 = -40, x1 = 78, z0 = 54, z1 = 132, st = 1;
  const nx = (x1 - x0) / st, nz = (z1 - z0) / st;
  const pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); pg.rotateX(-Math.PI / 2); pg.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const P = pg.attributes.position;
  for (let i = 0; i < P.count; i++) { const h = ivyHeight(P.getX(i), P.getZ(i)); P.setY(i, h < 0 ? GY - 0.12 : GY + h * 0.92); }
  pg.computeVertexNormals();
  const gm = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  gm.colorNode = mix(color('#1E2E12'), color('#33461C'), mx_noise_float(positionWorld.xz.mul(0.4)).mul(0.5).add(0.5));
  const ground = new THREE.Mesh(pg, gm); ground.receiveShadow = true; ground.name = 'Ivy bank'; group.add(ground);

  // leaves: one card each, scattered on a jittered grid over the ivy area
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardNodeMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.42, metalness: 0 });
  const tx = texture(tex, uv());
  const h1 = hash(instanceIndex.add(31)), h2 = hash(instanceIndex.add(77));
  const macro = mx_noise_float(positionWorld.xz.mul(0.12)).mul(0.5).add(0.5);
  // old leaves deep green, new growth brighter yellow-green; a few lighter, sun-bleached leaves
  let col = mix(color('#22401A'), color('#3F6A24'), h1);
  col = mix(col, color('#6E9638'), smoothstep(0.72, 1, h2).mul(0.8));
  col = col.mul(macro.mul(0.3).add(0.85));
  mat.colorNode = tx.rgb.mul(col).mul(1.35);
  mat.opacityNode = tx.a;
  const pts = [];
  const step = 0.24;
  for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
    const px = x + (r() - 0.5) * step * 1.6, pz = z + (r() - 0.5) * step * 1.6;
    const h = ivyHeight(px, pz); if (h < 0) continue;
    // thin out far beds that the cameras only see from a distance
    if ((pz > 112 || px < -20) && r() < 0.5) continue;
    // on slopes add leaves up the rise so mound faces are covered, not just their tops
    const gx = ivyHeight(px + 0.3, pz), gz = ivyHeight(px, pz + 0.3);
    const g = Math.min(6, (Math.abs((gx < 0 ? h : gx) - h) + Math.abs((gz < 0 ? h : gz) - h)) / 0.3);
    const extra = Math.round(g * 1.2);
    pts.push(px, h, pz);
    for (let k = 0; k < extra; k++) pts.push(px + (r() - 0.5) * step, h - r() * g * step, pz + (r() - 0.5) * step);
  }
  const n = pts.length / 3;
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), e = new THREE.Euler(), s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    e.set((r() - 0.5) * 1.3, r() * 6.28, (r() - 0.5) * 1.3); q.setFromEuler(e);
    const k = 0.26 + r() * 0.22; s.set(k, k, k);
    p.set(pts[i * 3], GY + pts[i * 3 + 1] + (r() - 0.3) * 0.22, pts[i * 3 + 2]);
    m.compose(p, q, s); im.setMatrixAt(i, m);
  }
  im.receiveShadow = true; im.castShadow = false; im.name = 'Ivy leaves';
  group.add(im);
  return n;
}

// Small hip-roofed pavilion on the terrace, behind the right-hand redwood (zillow-02).
export function buildPavilion(group, mats) {
  const { cx, cz, w, d } = TERRACE.pavilion;
  const y0 = GY + TERRACE.h, H = 7.6;
  const wood = mats.pergola;
  const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; group.add(o); return o; };
  const post = new THREE.BoxGeometry(0.5, H, 0.5);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) add(post, wood, cx + sx * w / 2, y0 + H / 2, cz + sz * d / 2);
  for (const sx of [-1, 1]) add(post, wood, cx + sx * w / 2, y0 + H / 2, cz);
  // beams and a low rail
  for (const sz of [-1, 1]) { add(new THREE.BoxGeometry(w + 0.8, 0.8, 0.45), wood, cx, y0 + H - 0.4, cz + sz * d / 2); add(new THREE.BoxGeometry(w, 0.3, 0.3), wood, cx, y0 + 2.6, cz + sz * d / 2); }
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.45, 0.8, d + 0.8), wood, cx + sx * w / 2, y0 + H - 0.4, cz);
  // dark interior ceiling so the underside reads as shade
  add(new THREE.BoxGeometry(w + 0.6, 0.15, d + 0.6), mats.furnDark, cx, y0 + H - 0.05, cz);
  // hip roof: a four-sided pyramid scaled to the rectangle, plus a short ridge
  const ov = 1.8, rise = 3.6;
  let cone = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true); cone.rotateY(Math.PI / 4); cone = cone.toNonIndexed(); cone.computeVertexNormals();
  const roof = add(cone, mats.shingles, cx, y0 + H + rise / 2, cz);
  roof.scale.set(w + 2 * ov, rise, d + 2 * ov);
  add(new THREE.BoxGeometry(w + 2 * ov + 0.3, 0.35, 0.18), wood, cx, y0 + H, cz - d / 2 - ov);
  add(new THREE.BoxGeometry(w + 2 * ov + 0.3, 0.35, 0.18), wood, cx, y0 + H, cz + d / 2 + ov);
}
