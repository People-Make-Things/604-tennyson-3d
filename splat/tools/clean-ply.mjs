#!/usr/bin/env node
// Remove reconstruction junk from a Brush/3DGS binary PLY before compression.
//
//   node clean-ply.mjs in.ply out.ply --sphere cx,cy,cz,r [--min-opacity 0.02]
//        [--max-scale 2.5] [--max-aniso 12] [--aniso-min-size 0.15] [--stats]
//
// Drops: NaNs, near-transparent splats, splats outside the crop sphere, splats larger
// than --max-scale (world units, largest axis), and thin needle-like streaks whose
// longest axis is more than --max-aniso times the middle axis (and longer than
// --aniso-min-size). Those needles are the dark scratches a short video leaves in
// front of the sky.
import fs from 'fs';

const [,, inp, outp, ...rest] = process.argv;
const o = {}; for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) o[rest[i].slice(2)] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
const buf = fs.readFileSync(inp);
const hEnd = buf.indexOf('end_header\n') + 'end_header\n'.length;
const header = buf.subarray(0, hEnd).toString();
if (!header.includes('binary_little_endian')) throw new Error('need binary_little_endian PLY');
const props = [...header.matchAll(/^property (\w+) (\w+)$/gm)].map(m => { if (m[1] !== 'float') throw new Error('only float props'); return m[2]; });
const N = +header.match(/element vertex (\d+)/)[1];
const stride = props.length;
const f = new Float32Array(buf.buffer.slice(buf.byteOffset + hEnd, buf.byteOffset + hEnd + N * stride * 4));
const ix = Object.fromEntries(props.map((p, i) => [p, i]));
const [X, Y, Z, O, S0, S1, S2] = ['x', 'y', 'z', 'opacity', 'scale_0', 'scale_1', 'scale_2'].map(k => ix[k]);

const sph = o.sphere ? o.sphere.split(',').map(Number) : null;
const minOpLogit = Math.log((+o['min-opacity'] || 0.02) / (1 - (+o['min-opacity'] || 0.02)));
const maxScale = o['max-scale'] ? +o['max-scale'] : Infinity;
const maxAniso = o['max-aniso'] ? +o['max-aniso'] : Infinity;
const anisoMin = o['aniso-min-size'] ? +o['aniso-min-size'] : 0;

const keep = new Uint8Array(N); let kept = 0;
const why = { nan: 0, opacity: 0, sphere: 0, scale: 0, aniso: 0 };
const big = [];
for (let i = 0; i < N; i++) {
  const b = i * stride;
  let bad = false;
  for (let k = 0; k < stride; k++) if (!Number.isFinite(f[b + k])) { bad = true; break; }
  if (bad) { why.nan++; continue; }
  if (f[b + O] < minOpLogit) { why.opacity++; continue; }
  if (sph) { const dx = f[b + X] - sph[0], dy = f[b + Y] - sph[1], dz = f[b + Z] - sph[2]; if (dx * dx + dy * dy + dz * dz > sph[3] * sph[3]) { why.sphere++; continue; } }
  const s = [Math.exp(f[b + S0]), Math.exp(f[b + S1]), Math.exp(f[b + S2])].sort((p, q) => q - p);
  if (o.stats) big.push(s[0]);
  if (s[0] > maxScale) { why.scale++; continue; }
  if (s[0] > anisoMin && s[0] > maxAniso * s[1]) { why.aniso++; continue; }
  keep[i] = 1; kept++;
}
if (o.stats) {
  big.sort((p, q) => p - q);
  const pc = q => big[Math.floor(big.length * q)].toFixed(3);
  console.log(`largest-axis percentiles: 50% ${pc(.5)} 90% ${pc(.9)} 99% ${pc(.99)} 99.9% ${pc(.999)}`);
}
const out = new Float32Array(kept * stride); let j = 0;
for (let i = 0; i < N; i++) if (keep[i]) { out.set(f.subarray(i * stride, i * stride + stride), j * stride); j++; }
const newHeader = header.replace(/element vertex \d+/, 'element vertex ' + kept);
fs.writeFileSync(outp, Buffer.concat([Buffer.from(newHeader), Buffer.from(out.buffer)]));
console.log(`clean: kept ${kept} / ${N}`, JSON.stringify(why));
