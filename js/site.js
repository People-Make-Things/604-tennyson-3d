// Lot, streets, fence, garden, trees and neighbouring houses.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { texture, uv, color, vec3, float, mix, hash, instanceIndex, positionWorld, mx_noise_float, normalWorld, max, dot, smoothstep, transformNormalToView } from 'three/tsl';

export const GY = -1.6;   // ground level relative to the ground floor

export function buildSite(B) {
  const G = 'garden';
  // ground: one big lawn, with streets, sidewalks, curbs and parkways laid on top
  B.box(G, 'grass', -600, -600, 700, 700, GY - 0.4, GY);
  const road = (x0, z0, x1, z1, y = 0.02) => B.box(G, 'asphalt', x0, z0, x1, z1, GY - 0.2, GY - 0.45 + y);
  road(-600, -74, 700, -42); road(-82, -600, -50, 700, 0.015);
  const curbH = 0.45;
  const strip = (key, x0, z0, x1, z1, y0, y1) => B.box(G, key, x0, z0, x1, z1, GY + y0, GY + y1);
  // Tennyson: curbs, parkway, sidewalk on both sides
  for (const s of [1, -1]) {
    const zc = s > 0 ? -42 : -74, d = s;
    strip('curb', -600, zc - 0.5 * d > zc ? zc : zc - 0.5, 700, zc + (d > 0 ? 0.5 : 0), -0.45, curbH - 0.45 + 0.01);
    strip('concrete', -600, d > 0 ? -38 : -82.5, 700, d > 0 ? -33.5 : -78, 0, 0.06);
  }
  for (const s of [1, -1]) {
    const xc = s > 0 ? -50 : -82;
    strip('curb', s > 0 ? -50 : -82.5, -600, s > 0 ? -49.5 : -82, 700, -0.45, curbH - 0.45 + 0.012);
    strip('concrete', s > 0 ? -46 : -90.5, -600, s > 0 ? -41.5 : -86, 700, 0, 0.065);
  }
  // front walk: exposed aggregate with brick borders, from the gate to the steps
  // gentle S-bend as in the listing photo; poured slabs about 4 ft long with tooled joints, soldier-course brick edging
  {
    const z0 = -33.5, z1 = -3.1, N = 60;
    const cx = z => 24.5 - 0.75 * Math.sin(Math.PI * 2 * (z - z0) / (z1 - z0)) * Math.min(1, (z1 - z) / 6);
    for (let i = 0; i < N; i++) {
      const za = z0 + (z1 - z0) * i / N, zb = z0 + (z1 - z0) * (i + 1) / N, xa = cx(za), xb = cx(zb);
      const len = Math.hypot(xb - xa, zb - za), ang = Math.atan2(xb - xa, zb - za), mx = (xa + xb) / 2, mz = (za + zb) / 2;
      const joint = (i % 8) === 7;
      B.obox(G, 'aggregate', mx, GY + 0.045, mz, 3.2, 0.09, len - (joint ? 0.06 : -0.02), ang);
      for (const sd of [-1, 1]) B.obox(G, 'brick', mx + Math.cos(ang) * sd * 1.82, GY + 0.05, mz - Math.sin(ang) * sd * 1.82, 0.44, 0.1, len + 0.03, ang);
    }
    B.obox(G, 'firebox', 24.5, GY + 0.02, (z0 + z1) / 2, 3.3, 0.04, z1 - z0, 0);
  }
  // driveway (side is a guess, see README) with a curb cut
  strip('concrete', 64, -42, 74, 40, 0, 0.07);
  // planting beds along the front and sides of the house
  const bed = (x0, z0, x1, z1) => strip('mulch', x0, z0, x1, z1, 0, 0.05);
  strip('groundcover', -6, -8.5, 21.6, 0, 0, 0.05); bed(27.4, -7.5, 63, 8.6); bed(-6, 0, 0, 48); bed(61.4, 8, 64, 52); bed(-41, -33, -20, -26); bed(30, -33, 64, -29);
  // back terraces (three brick levels) and curved brick paths
  for (let k = 0; k < 3; k++) strip(k === 2 ? 'grass' : 'brick', -10, 98 + k * 2.6, 44, 118, 0.05, 0.6 * (k + 1));
  for (let k = 0; k < 3; k++) strip('brick', -10 + 0, 98 + k * 2.6 - 0.05, 44, 98 + k * 2.6 + 0.35, 0.6 * (k + 1) - 0.08, 0.6 * (k + 1) + 0.02);
  const path = (p, w, ivy = 0) => {
    const pt = t => [0, 1].map(i => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i]);
    for (let t = 0; t < 1; t += 0.01) {
      const a = pt(t), b = pt(t + 0.01);
      const ang = Math.atan2(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.08;
      B.obox(G, 'brick', mx, GY + 0.04, mz, w, 0.1, len, ang);
      // ivy bed along the outer side of the path, as in the back garden photo
      if (ivy) B.obox(G, 'groundcover', mx + Math.cos(ang) * ivy * (w / 2 + 2.6), GY + 0.03, mz - Math.sin(ang) * ivy * (w / 2 + 2.6), 5, 0.06, len, ang);
    }
  };
  path([[54, 52], [54, 72], [30, 74], [30, 98]], 3.2, -1); path([[9, 62], [4, 76], [24, 84], [20, 98]], 2.6, 1);
  strip('groundcover', -10, 91, 44, 98, 0, 0.06);   // ivy bank at the foot of the terraces
  // brick patio under the pergola
  strip('brick', 0, 48.6, 18.4, 62, 0, 0.1);
  // board fence on the back lot line, weathered redwood
  B.box(G, 'pergola', -40, 131.8, 80, 132.1, GY, GY + 6.5);
  for (let x = -40; x < 80; x += 8) B.box(G, 'pergola', x - 0.2, 131.5, x + 0.2, 131.8, GY, GY + 6.7);
  // pergola behind the kitchen
  [0.6, 9.2, 17.8].forEach(x => [49.4, 55.5, 61.6].forEach(z => B.box(G, 'pergola', x - 0.3, z - 0.3, x + 0.3, z + 0.3, GY, 8.6)));
  [0.6, 9.2, 17.8].forEach(x => B.box(G, 'pergola', x - 0.22, 48.4, x + 0.22, 62.6, 8.6, 9.5));
  for (let z = 48.8; z <= 62.4; z += 1.4) B.box(G, 'pergola', -0.8, z - 0.1, 19.2, z + 0.1, 9.5, 9.85);
  // EV charger
  B.box(G, 'sash', 72, 40, 72.8, 40.6, GY, 3.6); B.box(G, 'darkMetal', 72.1, 39.95, 72.7, 40.0, 2, 3.3);
}

// White picket fence along Tennyson, drawn as one instanced mesh.
export function buildFence(group, mats) {
  const xs = [];
  for (let x = -41.2; x < 64; x += 0.62) if (x < 22.3 || x > 26.7) xs.push(x);
  // broad flat boards (about 5.5 in by 1 in) with a single angled cut on top, as in the listing photo
  const geo = new THREE.BoxGeometry(0.46, 3.3, 0.085);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + (pos.getX(i) < 0 ? 0.26 : 0));
  geo.computeVertexNormals();
  const merged = mergeGeos([geo]);
  const im = new THREE.InstancedMesh(merged, mats.picket, xs.length);
  const m = new THREE.Matrix4();
  xs.forEach((x, i) => { m.makeTranslation(x, GY + 1.65, -33.1); im.setMatrixAt(i, m); });
  im.castShadow = im.receiveShadow = true; im.name = 'Picket fence';
  group.add(im);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.28, 0.12), mats.picket);
  for (const [a, b] of [[-41.3, 22.3], [26.7, 64]]) for (const y of [0.8, 2.5]) {
    const r = rail.clone(); r.scale.x = b - a; r.position.set((a + b) / 2, GY + y, -33.0); r.castShadow = r.receiveShadow = true; group.add(r);
  }
  // gate, standing open into the yard, as in the listing photo
  const gate = new THREE.Group();
  for (let k = 0; k < 6; k++) { const p = new THREE.Mesh(merged, mats.picket); p.position.set(k * 0.62 + 0.3, 1.65, 0); p.castShadow = true; gate.add(p); }
  gate.position.set(22.3, GY, -33.1); gate.rotation.y = -2.1; group.add(gate);
}

function mergeGeos(list) {
  const out = new THREE.BufferGeometry();
  const P = [], N = [], U = [];
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; P.push(...g.attributes.position.array); N.push(...g.attributes.normal.array); U.push(...g.attributes.uv.array); }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  return out;
}

// ---------- trees ----------
const TREES = [
  // [model, x, z, height ft, rotation, crown width scale]; front-yard trees placed by trunk base and crown outline
  // against listing photo zillow-01 from the registered street camera (see SHOTS.street in main.js)
  // back-garden redwoods sit in line behind the trees the photo shows, leaving its two patches of open sky above the roof
  ['redwood', -30, 104, 112, 0, 1.5], ['redwood', -44, 122, 104, 0, 1.4], ['redwood', -36, 112, 118, 0, 1.5], ['redwood', 26, 126, 96, 0, 1.4],
  ['redwood', 22, 68, 92, 0, 1.6],                // the tall sparse redwood above the roof, centre of the listing photo
  ['deodar', 82, 72, 64, 0, 1.25], ['deodar', 96, 30, 56, 0, 1.2], // dense dark cedars behind the left (east) roof
  ['oak_live', -20, 14, 52], ['oak', -26, 66, 48], ['oak_m', 80, 96, 44], ['oak', 120, -110, 56], ['oak', -130, -120, 50],
  ['jmaple', 36, 4, 15, 0, 1.1], ['jmaple', 45, 10.5, 13], ['jmaple', 51, 11, 11, 0, 0.9],   // orange Japanese maples against the left facade
  ['entry_tree', 20.2, -6, 18],                    // yellow-green tree over the entry and the den wing
  ['oak_m', 112, -40, 38],
  ['deodar', -110, 160, 64], ['redwood', 150, 120, 104, 0, 1.4], ['oak_m', 30, 140, 46], ['oak', 100, 126, 54], ['redwood', 120, 140, 96, 0, 1.4], ['oak', 180, 10, 50], ['oak_m', -150, 60, 40],
];
const BUSHES = [];
(() => {
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const along = (x0, z0, x1, z1, n, h0, h1) => { for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; BUSHES.push([['bush_a', 'bush_b', 'bush_c'][Math.floor(r() * 3)], x0 + (x1 - x0) * t + (r() - 0.5) * 1.5, z0 + (z1 - z0) * t + (r() - 0.5) * 1.2, h0 + r() * (h1 - h0), r() * 6.28]); } };
  // front beds, from the listing photo: big rounded shrubs flanking the steps, one reaching the den window,
  // a layer of medium shrubs against the foundation and low spreading clumps in front
  const S = (n, x, z, h, w = 1) => BUSHES.push([n, x, z, h, r() * 6.28, w]);
  S('bush_b', 17.2, -2.6, 7.2, 1.15); S('bush_a', 14.6, -1.6, 5.2); S('bush_c', 11.5, -2.2, 3.6, 1.2); S('bush_a', 3.2, -2.4, 4.6, 1.1); S('bush_c', 0.6, -1.4, 5.8);
  S('bush_b', 29.6, -2.8, 4.8, 1.2); S('bush_a', 32.4, -1.2, 4.2); S('bush_c', 35.2, -3.6, 5.6, 1.25); S('bush_b', 38.6, -0.6, 4.4); S('bush_a', 42.4, -2.2, 5.4, 1.2);
  S('bush_c', 46.5, 3.2, 6.4); S('bush_b', 50.8, 5.6, 5.2, 1.2); S('bush_a', 55.5, 4.4, 6.6); S('bush_c', 60.2, 6.2, 5);
  along(-4.5, -6.6, 21, -6.2, 11, 1.1, 1.8); along(27.5, -6.6, 62, -5.8, 12, 1.2, 2.2);
  for (const b of BUSHES.slice(-23)) b[5] = 1.8 + r() * 0.8;   // low clumps spread wide
  along(-3, 2, -3, 46, 10, 4, 7); along(63, 10, 63, 50, 8, 4, 7);
  along(-38, -30, -22, -30, 4, 3, 4.5); along(32, -31, 62, -31, 6, 2.5, 4);
  along(-40, 0, -40, 120, 16, 6, 10);       // hedge along Webster
  along(78, -20, 78, 130, 18, 7, 11);       // hedge along the east lot line
  along(-12, 96, 46, 96, 10, 2.5, 4);       // ivy-covered bank at the terraces
  along(-38, 120, 80, 132, 16, 8, 12);      // back lot line
})();

export async function loadTrees(group, onProgress) {
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const tl = new THREE.TextureLoader();
  const ltex = n => { const t = tl.load('assets/trees/' + n); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const btex = n => { const t = tl.load('assets/trees/' + n); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const leafTex = { ash: ltex('leaf_ash.webp'), aspen: ltex('leaf_aspen.webp'), oak: ltex('leaf_oak.webp'), pine: ltex('leaf_pine.webp') };
  const bark = { oak: [btex('bark_oak_diff.webp'), btex('bark_oak_nor.webp')], pine: [btex('bark_pine_diff.webp'), btex('bark_pine_nor.webp')] };
  bark.oak[0].colorSpace = bark.pine[0].colorSpace = THREE.SRGBColorSpace;
  const want = [...new Set([...TREES, ...BUSHES].map(t => t[0]))];
  const models = {};
  await Promise.all(want.map(async n => { models[n] = (await loader.loadAsync('assets/trees/' + n + '.glb')).scene; onProgress && onProgress(n); }));
  const all = [...TREES.map(t => ({ n: t[0], x: t[1], z: t[2], h: t[3], r: t[4] || (t[1] * 7.3 + t[2] * 3.1) % 6.28, w: t[5] || 1 })), ...BUSHES.map(b => ({ n: b[0], x: b[1], z: b[2], h: b[3], r: b[4], w: b[5] || 1 }))];
  for (const n of want) {
    const list = all.filter(t => t.n === n);
    const root = models[n];
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const H = box.max.y - box.min.y;
    root.traverse(o => {
      if (!o.isMesh) return;
      const isLeaf = o.name.includes('leaves') || (o.material && o.material.name.startsWith('leaf'));
      const src = o.material;
      let mat;
      if (isLeaf) {
        const type = (src.name.split('_')[1]) || 'oak';
        mat = new THREE.MeshStandardNodeMaterial({ map: leafTex[type] || leafTex.oak, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
        const tint = src.color.clone();
        // per-instance color variation and a faint transmitted-light lift so canopies are not flat
        const v = hash(instanceIndex.add(7)).mul(0.25).add(0.87);
        const tx = texture(mat.map, uv());
        const autumn = tint.r > tint.g * 1.15;
        const lum = dot(tx.rgb, vec3(0.3, 0.59, 0.11));
        let base = autumn ? vec3(lum).mul(2.5).mul(color(tint)) : tx.rgb.mul(color(tint));
        // the entry tree is turning: world-space patches of yellow and orange through the green crown
        if (n === 'entry_tree') {
          const f = mx_noise_float(positionWorld.mul(0.35)).mul(0.5).add(0.5);
          base = mix(base, vec3(lum).mul(2.3).mul(mix(color('#E8C040'), color('#E07A30'), smoothstep(0.7, 0.95, f))), smoothstep(0.35, 0.7, f));
        }
        mat.colorNode = base.mul(v);
        mat.opacityNode = tx.a;
        mat.emissiveNode = base.mul(autumn || n === 'entry_tree' ? 0.14 : 0.06);   // light scattered through the leaves
      } else {
        const t = src.name.includes('pine') ? bark.pine : bark.oak;
        mat = new THREE.MeshStandardNodeMaterial({ map: t[0], normalMap: t[1], color: src.color, roughness: 0.95, metalness: 0 });
      }
      let geo = o.geometry;
      if (isLeaf) {
        geo = geo.clone(); geo.computeBoundingBox();
        const c = new THREE.Vector3(); geo.boundingBox.getCenter(c); const sz = new THREE.Vector3(); geo.boundingBox.getSize(sz);
        c.y -= sz.y * 0.15;
        const P = geo.attributes.position, Nn = geo.attributes.normal, v = new THREE.Vector3(), nn = new THREE.Vector3();
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).sub(c).divide(sz).normalize();
          nn.fromBufferAttribute(Nn, i); if (nn.dot(v) < 0) nn.negate();
          nn.lerp(v, 0.75).normalize(); Nn.setXYZ(i, nn.x, nn.y, nn.z);
        }
        Nn.needsUpdate = true;
      }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((t, i) => {
        const k = t.h / H;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.r);
        s.set(k * t.w, k, k * t.w); p.set(t.x, GY - box.min.y * k - 0.2, t.z);
        m.compose(p, q, s).multiply(o.matrixWorld);
        im.setMatrixAt(i, m);
      });
      im.castShadow = true; im.receiveShadow = true; im.name = n + (isLeaf ? ' leaves' : ' branches');
      im.frustumCulled = false;
      group.add(im);
    });
  }
}

// ---------- neighbours (City of Palo Alto outlines via OSM) ----------
export async function buildNeighbors(group, mats, nmats) {
  const data = await (await fetch('js/neighbors.json')).json();
  const roofMat = mats.shingles;
  let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const winM = [], trimM = [];
  for (const nb of data) {
    let poly = nb.p.map(([x, z]) => new THREE.Vector2(x, z));
    if (THREE.ShapeUtils.isClockWise(poly)) poly = poly.reverse();
    const area = Math.abs(THREE.ShapeUtils.area(poly));
    if (area < 120) continue;
    const small = area < 500;
    const eave = small ? 8 : (rnd() < 0.45 ? 18 : 10);
    // walls
    const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, -p.y)));
    const wg = new THREE.ExtrudeGeometry(shape, { depth: eave - GY, bevelEnabled: false });
    wg.rotateX(-Math.PI / 2); wg.translate(0, GY, 0);
    const wm = new THREE.Mesh(wg, small ? mats.paintGrey : nmats[Math.floor(rnd() * nmats.length)]);
    wm.castShadow = wm.receiveShadow = true; group.add(wm);
    // hip roof from the distance to the outline (a straight-skeleton roof), with 1.5 ft overhang
    const slope = small ? 0.35 : 0.5, rise = small ? 4 : 9;
    const xs = poly.map(p => p.x), zs = poly.map(p => p.y);
    const x0 = Math.min(...xs) - 1.6, x1 = Math.max(...xs) + 1.6, z0 = Math.min(...zs) - 1.6, z1 = Math.max(...zs) + 1.6;
    const step = 0.6;
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const sd = (x, z) => {
      let d = Infinity, inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a.y > z) !== (b.y > z)) && (x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x)) inside = !inside;
        const vx = b.x - a.x, vz = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.y) * vz) / (vx * vx + vz * vz)));
        d = Math.min(d, Math.hypot(x - a.x - t * vx, z - a.y - t * vz));
      }
      return inside ? d : -d;
    };
    const Hs = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const d = sd(x0 + i * step, z0 + j * step); Hs.push(d); }
    const P = [], N = [];
    const h = (i, j) => eave + Math.min(rise, slope * Hs[j * (nx + 1) + i]);
    const pushTri = (a, b, c) => { const u = new THREE.Vector3().subVectors(b, a), v = new THREE.Vector3().subVectors(c, a); const n = u.cross(v).normalize(); for (const p of [a, b, c]) { P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z); } };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const dc = sd(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
      if (dc < -1.4) continue;
      const V = (ii, jj) => new THREE.Vector3(x0 + ii * step, h(ii, jj), z0 + jj * step);
      const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
      pushTri(a, d, c); pushTri(a, c, b);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    rg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(P.length / 3 * 2), 2));
    const rm = new THREE.Mesh(rg, roofMat); rm.castShadow = rm.receiveShadow = true; group.add(rm);
    // windows along the longer walls
    if (!small) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i]; const L = a.distanceTo(b); if (L < 9) continue;
      const n = Math.floor(L / 9); const ang = Math.atan2(b.x - a.x, b.y - a.y);
      const ox = (b.y - a.y) / L, oz = -(b.x - a.x) / L; // outward for counter-clockwise polygon in x/z after reversal
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, cx = a.x + (b.x - a.x) * t, cz = a.y + (b.y - a.y) * t;
        for (const fy of eave > 12 ? [4.6, 13.5] : [4.6]) {
          const w = new THREE.Mesh(winGeo, mats.glassDark); w.position.set(cx - ox * 0.0, fy, cz - oz * 0.0); w.rotation.y = ang + Math.PI / 2;
          const tr = new THREE.Mesh(winTrim, mats.sash); tr.position.copy(w.position); tr.rotation.copy(w.rotation);
          w.position.x += ox * 0.06; w.position.z += oz * 0.06; tr.position.x += ox * 0.03; tr.position.z += oz * 0.03;
          w.position.x -= ox * 0.12; w.position.z -= oz * 0.12; tr.position.x -= ox * 0.12; tr.position.z -= oz * 0.12;
          w.updateMatrix(); tr.updateMatrix(); winM.push(w.matrix.clone()); trimM.push(tr.matrix.clone());
        }
      }
    }
  }
  addInstances(group, winGeo, mats.glassDark, winM); addInstances(group, winTrim, mats.sash, trimM);
}
const winGeo = new THREE.BoxGeometry(3, 4.2, 0.3);
function addInstances(group, geo, mat, list) {
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.castShadow = false; im.receiveShadow = true; group.add(im);
}
const winTrim = new THREE.BoxGeometry(3.6, 4.8, 0.24);

// ---------- lawn blades and fallen leaves ----------
// Instanced clumps of grass blades over the front lawn; they fade out (shrink into the turf texture)
// a long way from the house so only the near lawn pays for them.
// back lawn: a curved bowl between the brick paths, ivy beds around it
const bez = (p, t) => [0, 1].map(i => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i]);
const PATH_A = [[54, 52], [54, 72], [30, 74], [30, 98]], PATH_B = [[9, 62], [4, 76], [24, 84], [20, 98]];
const nearPath = (p, x, z, w) => { for (let t = 0; t <= 1; t += 0.02) { const q = bez(p, t); if (Math.hypot(q[0] - x, q[1] - z) < w) return true; } return false; };
const lawnBack = (x, z) => { const dx = (x - 27) / 19, dz = (z - 82) / 12; return dx * dx + dz * dz < 1 && !nearPath(PATH_A, x, z, 2.1) && !nearPath(PATH_B, x, z, 1.9); };
export function buildGrass(group) {
  let seed = 11; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // one clump: 14 tapered blades (one triangle each), normals mostly up so they shade like the turf
  const P = [], N = [], U = [];
  for (let b = 0; b < 18; b++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * 0.2, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 0.1 + r() * 0.13, w = 0.012 + r() * 0.01, ra = r() * 6.28, lean = 0.02 + r() * 0.06, la = r() * 6.28;
    const cx = Math.cos(ra) * w, cz = Math.sin(ra) * w;
    P.push(x - cx, 0, z - cz, x + cx, 0, z + cz, x + Math.cos(la) * lean, h, z + Math.sin(la) * lean);
    const nx = Math.sin(ra) * 0.35, nz = -Math.cos(ra) * 0.35, l = Math.hypot(nx, 1, nz);
    for (let k = 0; k < 3; k++) N.push(nx / l, 1 / l, nz / l);
    U.push(0, 0, 1, 0, 0.5, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
  // shade every blade with the turf normal (tilted a little per blade) so back faces do not go black
  mat.normalNode = transformNormalToView(vec3(hash(instanceIndex).sub(0.5).mul(0.5), 1, uv().y.sub(0.5).mul(0.3)).normalize());
  const macro = mx_noise_float(positionWorld.xz.mul(0.09)).mul(0.5).add(0.5);
  const fine = hash(instanceIndex.add(3));
  const root = color('#3A5718'), tip = mix(color('#86AE34'), color('#B2C653'), macro);
  const dry = color('#A8A25C');
  let col = mix(root, tip, uv().y.pow(0.8));
  col = mix(col, dry, smoothstep(0.62, 0.9, macro).mul(uv().y).mul(0.55));
  mat.colorNode = col.mul(fine.mul(0.35).add(0.8));
  // areas: front lawn either side of the walk, and the parkway strip
  const rects = [[-40.5, -32.9, 21.8, -8.6], [27.2, -32.9, 64, -7.6], [21.8, -32.9, 27.2, -30.5], [-40, -41.5, 64, -38.2], [6, 66, 50, 96]];
  const walkX = z => 24.5 - 0.75 * Math.sin(Math.PI * 2 * (z + 33.5) / 30.4) * Math.min(1, (-3.1 - z) / 6);
  const pts = [];
  for (const [x0, z0, x1, z1] of rects) {
    const step = 0.36;
    for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
      const px = x + (r() - 0.5) * step, pz = z + (r() - 0.5) * step;
      if (z > -33.5 && z < -3 && Math.abs(px - walkX(pz)) < 2.15) continue;
      if (z > 60 && !lawnBack(px, pz)) continue;
      pts.push(px, pz);
    }
  }
  const n = pts.length / 2;
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    // patchy height: longer tufts in low-frequency patches
    const patch = 0.75 + 0.5 * (0.5 + 0.5 * Math.sin(x * 0.37 + Math.cos(z * 0.29) * 2.1) * Math.cos(z * 0.23 - x * 0.11));
    q.setFromAxisAngle(up, r() * 6.28); const k = patch * (0.75 + r() * 0.5);
    sc.set(1.1 + r() * 0.4, k, 1.1 + r() * 0.4); p.set(x, GY - 0.01, z);
    m.compose(p, q, sc); im.setMatrixAt(i, m);
  }
  im.castShadow = false; im.receiveShadow = true; im.name = 'Lawn blades';
  group.add(im);
}

export function buildLeaves(group) {
  let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const t = new THREE.TextureLoader().load('assets/trees/leaf_oak.webp'); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(0.32, 0.32); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardNodeMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const tx = texture(t, uv());
  const h = hash(instanceIndex.add(17));
  const lum = dot(tx.rgb, vec3(0.3, 0.59, 0.11)).mul(2.2);
  mat.colorNode = vec3(lum).mul(mix(mix(color('#B8501E'), color('#D89A32'), h), color('#6B4A2E'), hash(instanceIndex.add(5)).greaterThan(0.6).select(float(0.7), float(0))));
  mat.opacityNode = tx.a;
  const spots = [];
  const walkX = z => 24.5 - 0.75 * Math.sin(Math.PI * 2 * (z + 33.5) / 30.4) * Math.min(1, (-3.1 - z) / 6);
  for (let i = 0; i < 260; i++) { const z = -33 + r() * 30; spots.push([walkX(z) + (r() - 0.5) * 3.6, 0.1, z]); }
  for (let i = 0; i < 520; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 16; spots.push([33.5 + Math.cos(a) * d, 0.03, -6.5 + Math.sin(a) * d * 0.7]); }
  for (let i = 0; i < 380; i++) spots.push([-6 + r() * 70, 0.07, -8 + r() * 8]);
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), e = new THREE.Euler();
  spots.forEach(([x, y, z], i) => { e.set((r() - 0.5) * 0.5, r() * 6.28, (r() - 0.5) * 0.5); m.makeRotationFromEuler(e); const k = 0.7 + r() * 0.6; m.scale(new THREE.Vector3(k, k, k)); m.setPosition(x, GY + y + 0.04, z); im.setMatrixAt(i, m); });
  im.receiveShadow = true; im.castShadow = false; im.name = 'Fallen leaves';
  group.add(im);
}
