// Physically based materials. Textures are CC0 from Poly Haven; siding, shingles, paneling and paint are procedural (TSL).
import * as THREE from 'three/webgpu';
import {
  texture, positionWorld, normalWorld, vec2, vec3, float, color, mix, fract, floor, abs, max, smoothstep,
  hash, mx_noise_float, mx_fractal_noise_float, Fn, select, transformNormalToView, normalMap, length, step, sin, uniform
} from 'three/tsl';

const loader = new THREE.TextureLoader();
const texCache = {};
export const pending = [];
function tex(file, srgb) {
  if (texCache[file]) return texCache[file];
  const t = loader.load('assets/tex/' + file);
  pending.push(new Promise(r => { const i = setInterval(() => { if (t.image && t.image.complete !== false && t.image.width) { clearInterval(i); r(); } }, 50); }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return texCache[file] = t;
}

// World-space planar UVs: pick the plane the surface faces. Works for every axis-aligned box in the model.
export const worldUV = Fn(([scale]) => {
  const n = normalWorld.abs(), p = positionWorld;
  return select(n.y.greaterThan(max(n.x, n.z)), p.xz, select(n.x.greaterThan(n.z), p.zy, p.xy)).div(scale);
});

// Breaks up visible texture repetition: blends the texture with a rotated, rescaled copy using low-frequency noise.
function antiTile(t, uvn) {
  const a = texture(t, uvn);
  const uv2 = vec2(uvn.y.mul(0.83).add(0.37), uvn.x.mul(-0.83).add(0.11));
  const b = texture(t, uv2);
  const k = smoothstep(0.35, 0.65, mx_noise_float(uvn.mul(0.23)).mul(0.5).add(0.5));
  return mix(a, b, k);
}

function pbr(name, o = {}) {
  const scale = o.scale ?? 4;
  const uvn = o.uv || worldUV(float(scale));
  const d = tex(name + '_diff.webp', true), n = tex(name + '_nor.webp'), r = tex(name + '_orm.webp');
  const m = new THREE.MeshStandardNodeMaterial();
  const base = o.antiTile ? antiTile(d, uvn) : texture(d, uvn);
  let col = base.rgb.mul(color(o.tint || '#ffffff'));
  if (o.colorFn) col = o.colorFn(col, uvn);
  m.colorNode = col;
  m.normalNode = normalMap(o.antiTile ? antiTile(n, uvn) : texture(n, uvn), vec2(o.normalScale ?? 1));
  const orm = texture(r, uvn);
  m.roughnessNode = orm.g.mul(o.rough ?? 1).clamp(0.02, 1);
  m.aoNode = mix(float(1), orm.r, o.ao ?? 1);
  m.metalness = 0;
  return m;
}

function paint(hex, rough = 0.85, o = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: rough, metalness: 0, ...o });
  // faint roller texture so large painted areas are not perfectly flat
  const nz = mx_noise_float(positionWorld.mul(3.1)).mul(0.5).add(0.5);
  m.colorNode = color(hex).mul(float(0.965).add(nz.mul(0.05)));
  return m;
}

// Lap siding: 4.5" reveal boards. Each board tilts outward at the bottom; the drip edge faces down and
// the top of the board below sits in a shadow line.
function siding() {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0 });
  const R = 0.375;
  const f = fract(positionWorld.y.div(R));
  const n = normalWorld;
  const board = floor(positionWorld.y.div(R));
  const along = select(abs(n.x).greaterThan(abs(n.z)), positionWorld.z, positionWorld.x);
  const grain = mx_fractal_noise_float(vec3(along.mul(0.6), board.mul(7.3), 0), 3).mul(0.5).add(0.5);
  const dirt = mx_noise_float(positionWorld.mul(0.18)).mul(0.5).add(0.5);
  const paintCol = color('#F1EFE8').mul(float(0.94).add(grain.mul(0.06))).mul(mix(float(1), float(0.93), dirt.mul(smoothstep(4, -1, positionWorld.y))));
  m.colorNode = paintCol.mul(mix(float(1), float(0.72), smoothstep(0.86, 1.0, f)));
  const tilt = n.add(vec3(0, -0.11, 0)).normalize();
  const drip = n.mul(0.35).add(vec3(0, -1, 0)).normalize();
  m.normalNode = transformNormalToView(select(f.lessThan(0.05), drip, tilt));
  m.roughnessNode = float(0.55).add(grain.mul(0.12));
  return m;
}

// Asphalt laminate shingles in weathered brown-grey. u runs along the eave, v runs up the slope (true slope distance).
// Courses are 5" deep; each tab gets its own tone and a slight tilt so the roof reads as fine horizontal lines
// with a granular surface instead of a flat painted plane.
function shingles() {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const n = normalWorld, p = positionWorld;
  const hz = length(n.xz).max(0.05);
  const u = select(abs(n.x).greaterThan(abs(n.z)), p.z, p.x);
  const v = p.y.div(hz);
  const E = 0.4167;
  const row = floor(v.div(E));
  const fv = fract(v.div(E));
  const rowOff = fract(row.mul(0.618)).mul(0.9);
  const tw = hash(row.mul(13.7).add(1.3)).mul(0.5).add(0.85);
  const tu = u.add(rowOff).div(tw);
  const tab = floor(tu), fu = fract(tu);
  const h1 = hash(tab.mul(127.1).add(row.mul(311.7)).add(0.5)), h2 = hash(tab.mul(269.5).add(row.mul(183.3)).add(4.1));
  const gran = mx_noise_float(p.mul(42)).mul(0.5).add(0.5);
  const gran2 = mx_noise_float(p.mul(11)).mul(0.5).add(0.5);
  const streak = mx_fractal_noise_float(vec3(u.mul(0.09), v.mul(0.05), 0), 3).mul(0.5).add(0.5);
  let col = mix(color('#4A3D35'), color('#6A5A4F'), h1);
  col = mix(col, color('#3A302B'), step(0.8, h2).mul(0.8));
  col = col.mul(float(0.74).add(gran.mul(0.34)).add(gran2.mul(0.1))).mul(mix(float(0.86), float(1.1), streak));
  // the butt edge of the course above throws a thin shadow line onto the top of this course
  const shadow = mix(float(0.5), float(1), smoothstep(0.0, 0.1, fv));
  const slot = smoothstep(0.0, 0.015, fu).mul(smoothstep(1.0, 0.985, fu));
  m.colorNode = col.mul(shadow).mul(mix(float(0.62), float(1), slot.max(step(0.6, fv))));
  // downslope tangent; shingles are thicker at the butt, so the surface tilts slightly downhill, the butt faces downhill
  const t = vec3(n.x.mul(n.y), hz.mul(hz).negate(), n.z.mul(n.y)).normalize();
  const jitter = vec3(mx_noise_float(p.mul(37).add(3.1)), mx_noise_float(p.mul(37).add(7.7)), mx_noise_float(p.mul(37).add(9.3))).mul(0.12);
  const tilt = n.add(t.mul(h1.mul(0.06).add(0.05))).add(jitter);
  const butt = n.mul(0.5).add(t);
  m.normalNode = transformNormalToView(select(fv.lessThan(0.06), butt, tilt).normalize());
  m.roughnessNode = float(0.84).add(gran.mul(0.12));
  return m;
}

// Vertical-groove wood paneling for the den (dark stained fir).
function paneling() {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
  const n = normalWorld, p = positionWorld;
  const along = select(abs(n.x).greaterThan(abs(n.z)), p.z, p.x);
  const plank = floor(along.div(0.5)), fu = fract(along.div(0.5));
  const grain = mx_fractal_noise_float(vec3(along.mul(9), p.y.mul(0.35), plank.mul(3.3)), 4).mul(0.5).add(0.5);
  const tone = hash(plank.add(0.3));
  const col = mix(color('#4A2414'), color('#6E3A20'), grain.mul(0.7).add(tone.mul(0.3)));
  m.colorNode = col.mul(smoothstep(0.0, 0.03, fu).mul(0.5).add(0.5));
  m.roughnessNode = float(0.42).add(grain.mul(0.15));
  return m;
}

function glass(dark) {
  const m = new THREE.MeshPhysicalNodeMaterial({ color: dark ? '#141B1E' : '#24302F', roughness: 0.03, metalness: 0, transparent: !dark, opacity: dark ? 1 : 0.52, depthWrite: !!dark, ior: 1.52, specularIntensity: 1 });
  m.side = THREE.DoubleSide;
  return m;
}

const lawn = (col, uvn) => {
  const macro = mx_fractal_noise_float(vec3(uvn.mul(0.12), 0), 4).mul(0.5).add(0.5);
  const lush = col.mul(vec3(0.62, 1.08, 0.42)).mul(1.25);
  return mix(lush.mul(0.78), lush.mul(1.08).add(vec3(0.02, 0.02, 0)), macro);
};

export function makeMaterials() {
  const M = {
    siding: siding(),
    shingles: shingles(),
    paneling: paneling(),
    paint: paint('#EFEBE2', 0.9),
    paintGreen: paint('#DCE6D6', 0.85),
    paintGrey: paint('#CFCFCB', 0.85),
    ceiling: paint('#F3F0E9', 0.95),
    soffit: paint('#ECEAE3', 0.8),
    trim: paint('#1F3A2E', 0.45),        // dark green exterior trim, fascia and shutters
    sash: paint('#F2F1EB', 0.4),
    woodtrim: new THREE.MeshStandardNodeMaterial({ color: '#5B3119', roughness: 0.38 }),
    door: paint('#8B1E24', 0.3),
    glass: glass(false),
    glassDark: glass(true),
    oak: pbr('wood_floor', { scale: 6, tint: '#E8A06A', rough: 0.55, normalScale: 0.6 }),
    oakDark: pbr('wood_floor', { scale: 6, tint: '#B36D44', rough: 0.5, normalScale: 0.6 }),
    stair: pbr('wood_floor', { scale: 3, tint: '#C77A45', rough: 0.45 }),
    terra: pbr('terracotta_floor_tiles', { scale: 6, tint: '#E9A58C', rough: 0.8 }),
    brick: pbr('red_brick_03', { scale: 5, tint: '#D8A898', rough: 1 }),
    brickWall: pbr('brick_wall_02', { scale: 6, rough: 1 }),
    porchBrick: pbr('red_brick_03', { scale: 4, tint: '#B5B1AA', rough: 1 }),
    concrete: pbr('concrete_pavement', { scale: 10, tint: '#E8E3DA', antiTile: true }),
    aggregate: pbr('gravel_embedded_concrete', { scale: 2.5, tint: '#FFF4E2', rough: 0.95 }),
    asphalt: pbr('asphalt_02', { scale: 14, tint: '#8E8E8E', antiTile: true }),
    grass: pbr('grass_ground', { scale: 9, antiTile: true, colorFn: lawn, rough: 1, normalScale: 1.4 }),
    mulch: pbr('forest_leaves_02', { scale: 6, tint: '#9A8170', antiTile: true }),
    groundcover: pbr('forest_leaves_02', { scale: 3, tint: '#7E9A5A', antiTile: true, colorFn: c => c.mul(vec3(0.55, 0.85, 0.42)) }),
    gravel: pbr('gravel_embedded_concrete', { scale: 6, tint: '#CFC6B6' }),
    roofSheet: paint('#55524D', 0.9),
    deck: new THREE.MeshStandardNodeMaterial({ color: '#8C8A84', roughness: 0.8 }),
    tileHex: paint('#3F5E58', 0.5),
    tileBeige: paint('#C9BEA8', 0.5),
    tileWhite: paint('#E8E8E2', 0.35),
    porcelain: paint('#F7F6F2', 0.18),
    metal: new THREE.MeshStandardNodeMaterial({ color: '#B8B8B4', roughness: 0.3, metalness: 1 }),
    darkMetal: new THREE.MeshStandardNodeMaterial({ color: '#2A2A2A', roughness: 0.45, metalness: 0.6 }),
    cabinet: pbr('wood_floor', { scale: 3, tint: '#D88E4E', rough: 0.45, normalScale: 0.3 }),
    counter: paint('#EDEBE4', 0.25),
    firebox: paint('#1D1B1A', 0.95),
    stone: pbr('brick_wall_02', { scale: 3, tint: '#A8A49C' }),
    pergola: new THREE.MeshStandardNodeMaterial({ color: '#5B4B3D', roughness: 0.9 }),
    picket: paint('#F2F1EA', 0.7),
    fabric: new THREE.MeshStandardNodeMaterial({ color: '#7D8A78', roughness: 1 }),
    furnWood: new THREE.MeshStandardNodeMaterial({ color: '#5C4A3A', roughness: 0.6 }),
    furnDark: new THREE.MeshStandardNodeMaterial({ color: '#3C3A36', roughness: 0.7 }),
    bedding: new THREE.MeshStandardNodeMaterial({ color: '#E7E3D8', roughness: 1 }),
    curb: pbr('concrete_pavement', { scale: 3, tint: '#D9D4CA' }),
    foundation: pbr('concrete_pavement', { scale: 3, tint: '#B9B4AA' }),
  };
  // Interiors: the sky light is mostly blocked indoors, so these surfaces take less of it.
  M.interior = ['paint', 'paintGreen', 'paintGrey', 'ceiling', 'paneling', 'woodtrim', 'oak', 'oakDark', 'stair', 'terra', 'tileHex', 'tileBeige', 'tileWhite', 'porcelain', 'cabinet', 'counter', 'firebox', 'stone', 'fabric', 'furnWood', 'furnDark', 'bedding', 'metal', 'darkMetal'];
  return M;
}

// Neighbor houses get a few muted siding colors
export function neighborMats() {
  return ['#E9E4D8', '#D8DCD6', '#E6DCCB', '#CBD3D6', '#EFEDE6'].map(c => { const m = siding(); m.colorNode = m.colorNode.mul(color(c)); return m; });
}
