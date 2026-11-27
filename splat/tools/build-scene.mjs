#!/usr/bin/env node
// Build one "Real photo views" scene from a COLMAP + Brush run.
//
//   node splat/tools/build-scene.mjs --name garden --label "Garden" \
//     --sfm /tmp/t604/sfm/garden_v0 [--model cam_txt] [--ply out/garden.ply] [--frames undist/images]
//
// Writes splat/scenes/<name>.sog (cropped around the recorded camera path),
// splat/scenes/<name>.jpg (the real start frame, shown while the splat loads)
// and merges an entry into splat/scenes/scenes.json.
//
// Coordinates: the splat stays in COLMAP world space. Each pose is stored as a
// three.js camera (position + quaternion, -Z forward, +Y up) in that space.
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../scenes');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const name = args.name;
const sfm = args.sfm;
if (!name || !sfm) { console.error('need --name and --sfm'); process.exit(1); }
const label = args.label || name[0].toUpperCase() + name.slice(1);
const modelDir = path.join(sfm, args.model || (fs.existsSync(path.join(sfm, 'undist/images.txt')) ? 'undist' : 'cam_txt'));
const ply = path.join(sfm, args.ply || `out/${name}.ply`);
const framesDir = path.join(sfm, args.frames || 'undist/images');
const samples = +(args.samples || 30);

// ---------- COLMAP text parsing ----------
const lines = f => fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const cam = lines(path.join(modelDir, 'cameras.txt'))[0].split(/\s+/);
if (cam[1] !== 'PINHOLE') throw new Error('expected PINHOLE camera, got ' + cam[1]);
const [W, H, fx, fy, cx, cy] = cam.slice(2).map(Number);

const pts = new Map();
for (const l of lines(path.join(modelDir, 'points3D.txt'))) {
  const p = l.split(' ');
  const track = (p.length - 8) / 2;
  if (track >= 3 && +p[7] < 2) pts.set(p[0], [+p[1], +p[2], +p[3]]);
}

const imgLines = lines(path.join(modelDir, 'images.txt'));
// images.txt has two lines per image, but the POINTS2D line can be empty and
// gets dropped by the filter above; detect header lines by field count.
const frames = [];
for (let i = 0; i < imgLines.length; i++) {
  const p = imgLines[i].split(' ');
  if (p.length !== 10 || !/\.(jpe?g|png)$/i.test(p[9])) continue;
  const [qw, qx, qy, qz, tx, ty, tz] = p.slice(1, 8).map(Number);
  const nxt = imgLines[i + 1] ? imgLines[i + 1].split(' ') : [];
  const ids = [];
  if (!(nxt.length === 10 && /\.(jpe?g|png)$/i.test(nxt[9]))) for (let k = 2; k < nxt.length; k += 3) if (nxt[k] !== '-1') ids.push(nxt[k]);
  frames.push({ file: p[9], q: [qw, qx, qy, qz], t: [tx, ty, tz], ids });
}
frames.sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }));
if (frames.length < 5) throw new Error('too few registered frames: ' + frames.length);

// ---------- math ----------
const quatToMat = ([w, x, y, z]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
  [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
  [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
];
const T = m => m[0].map((_, j) => m.map(r => r[j]));
const mulV = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function matToQuat(m) { // returns [x,y,z,w]
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const tr = m00 + m11 + m22; let x, y, z, w;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
  else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  const n = Math.hypot(x, y, z, w); return [x / n, y / n, z / n, w / n];
}
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.sqrt(dot(a, a));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0; };

// ---------- poses ----------
for (const f of frames) {
  const R = quatToMat(f.q); const Rt = T(R);
  f.c = mulV(Rt, f.t).map(v => -v);
  // three camera basis = Rt * diag(1,-1,-1)
  const M = Rt.map(r => [r[0], -r[1], -r[2]]);
  let q = matToQuat(M);
  f.qt = q;
  f.fwd = [Rt[0][2], Rt[1][2], Rt[2][2]]; // COLMAP +Z in world
  const depths = f.ids.map(id => pts.get(id)).filter(Boolean).map(p => dot(sub(p, f.c), f.fwd)).filter(d => d > 0);
  f.depth = depths.length > 8 ? median(depths) : null;
}
// keep quaternions in one hemisphere so interpolation takes the short way
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1].qt, b = frames[i].qt;
  if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) frames[i].qt = b.map(v => -v);
}
const allDepth = frames.map(f => f.depth).filter(Boolean);
const medDepth = median(allDepth) || 1;
for (const f of frames) if (!f.depth) f.depth = medDepth;

// path length, for even arc-length sampling
let acc = 0; frames[0].s = 0;
for (let i = 1; i < frames.length; i++) { acc += len(sub(frames[i].c, frames[i - 1].c)); frames[i].s = acc; }
const pathLen = acc;

// sample ~N poses evenly in frame index (the video moves at roughly constant speed;
// index sampling keeps the rotations where the camera pans in place)
const n = Math.min(samples, frames.length);
const picks = [];
for (let k = 0; k < n; k++) picks.push(frames[Math.round(k * (frames.length - 1) / (n - 1))]);
const r5 = v => +v.toFixed(5);
const poses = picks.map(f => ({ f: f.file.replace(/\.\w+$/, ''), p: f.c.map(r5), q: f.qt.map(r5), d: r5(f.depth) }));

// ---------- crop ----------
// Keep splats near the recorded cameras: sphere around the path centroid plus the
// typical viewing depth. Everything beyond is sky / far junk from one video.
const centroid = [0, 1, 2].map(i => frames.reduce((s, f) => s + f.c[i], 0) / frames.length);
const camSpread = Math.max(...frames.map(f => len(sub(f.c, centroid))));
const ptDist = [...pts.values()].map(p => len(sub(p, centroid)));
const cropR = (+args['crop-mult'] || 3) * Math.max(camSpread + 1.6 * pct(allDepth, 0.9), pct(ptDist, 0.97) * 1.05);
console.log(`[${name}] ${frames.length} frames, path ${pathLen.toFixed(2)}, median depth ${medDepth.toFixed(2)}, crop r ${cropR.toFixed(2)}`);

// ---------- sky / ground colours from the real start frame ----------
function avgColor(img, geom) {
  const out = execFileSync('magick', [img, '-crop', geom, '+repage', '-resize', '1x1!', '-depth', '8', 'txt:-']).toString();
  const m = out.match(/#([0-9A-Fa-f]{6})/); return '#' + m[1].toLowerCase();
}
fs.mkdirSync(OUT, { recursive: true });
const startFrame = path.join(framesDir, frames[0].file);
const sky = {
  top: avgColor(startFrame, `${W}x${Math.round(H * 0.06)}+0+0`),
  mid: avgColor(startFrame, `${W}x${Math.round(H * 0.08)}+0+${Math.round(H * 0.3)}`),
  bottom: avgColor(startFrame, `${W}x${Math.round(H * 0.08)}+0+${Math.round(H * 0.9)}`),
};
execFileSync('magick', [startFrame, '-strip', '-quality', '82', path.join(OUT, `${name}.jpg`)]);

// ---------- convert ----------
const sog = path.join(OUT, `${args.out || name}.sog`);
// clean-ply thresholds scale with the scene: COLMAP units are arbitrary
const maxScale = +(args['max-scale'] || 0.08) * cropR;
const cleanArgs = ['--sphere', `${centroid.map(r5).join(',')},${r5(cropR)}`,
  '--min-opacity', args['min-opacity'] || '0.01', '--max-scale', String(r5(maxScale)),
  '--max-aniso', args['max-aniso'] || '25', '--aniso-min-size', String(r5(maxScale * 0.08)), '--stats'];
if (!args['skip-sog']) {
  const tmp = path.join(fs.mkdtempSync('/tmp/splatclean-'), 'clean.ply');
  const log = execFileSync('node', [path.join(HERE, 'clean-ply.mjs'), ply, tmp, ...cleanArgs]).toString();
  process.stdout.write(log);
  // keep each scene under ~15 MB: SOG v2 costs ~13 bytes per splat
  const kept = +log.match(/kept (\d+)/)[1], maxSplats = +(args['max-splats'] || 900000);
  let src = tmp;
  if (kept > maxSplats) {
    src = tmp.replace('clean.ply', 'dec.ply');
    execFileSync('npx', ['-y', '@playcanvas/splat-transform@3.12.0', '-q', '-w', tmp, '--decimate-adaptive', String(maxSplats), src], { stdio: 'inherit' });
    console.log(`decimated ${kept} -> ${maxSplats}`);
  }
  // SOG v2: Spark 2.4 renders v3 files wrongly
  const st = ['-y', '@playcanvas/splat-transform@3.12.0', '-q', '-w', src, sog, '--sog-version', '2'];
  console.log('npx ' + st.join(' '));
  execFileSync('npx', st, { stdio: 'inherit' });
  fs.rmSync(path.dirname(tmp), { recursive: true });
}
if (args.out) process.exit(0); // test build: do not touch scenes.json
const bytes = fs.statSync(sog).size;

// ---------- scenes.json ----------
const listFile = path.join(OUT, 'scenes.json');
const list = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : { scenes: [] };
const entry = {
  name, label, file: `${name}.sog`, poster: `${name}.jpg`, bytes,
  camera: { w: W, h: H, fx: r5(fx), fy: r5(fy), cx: r5(cx), cy: r5(cy) },
  sky, crop: { c: centroid.map(r5), r: r5(cropR) },
  depth: r5(medDepth), pathLength: r5(pathLen), frames: frames.length,
  start: poses[0], path: poses,
};
const order = ['garden', 'front', 'porch', 'kitchen', 'living', 'stairs', 'side', 'den', 'bedroom'];
list.scenes = list.scenes.filter(s => s.name !== name).concat(entry)
  .sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
fs.writeFileSync(listFile, '{"scenes": [\n' + list.scenes.map(s => JSON.stringify(s)).join(',\n') + '\n]}\n');
console.log(`[${name}] wrote ${path.relative(process.cwd(), sog)} (${(bytes / 1e6).toFixed(1)} MB) and scenes.json`);
