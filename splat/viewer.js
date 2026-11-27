// Real photo views: Gaussian splats reconstructed from the listing tour video.
// The camera starts on a real recorded frame and stays close to the recorded path,
// because a splat trained on one walk-through falls apart far from where the phone went.
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

const $ = s => document.querySelector(s);
const canvas = $('#c'), poster = $('#poster'), statusEl = $('#status'), hint = $('#hint');
const scrub = $('#scrub'), playBtn = $('#play'), sceneBar = $('#scenes');
const q = new URLSearchParams(location.search);
const SHOT = q.has('shot'); // headless screenshot mode: no autoplay, no hint

// ---------- renderer ----------
// Opaque canvas: splats composite over a sky gradient drawn inside WebGL. A transparent
// canvas over a CSS gradient washes the splats out.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: SHOT, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const skyCanvas = Object.assign(document.createElement('canvas'), { width: 4, height: 256 });
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
// Sky gradient as a full-screen quad drawn first. (scene.background breaks Spark's
// blending in 2.4: splats come out washed and streaky.)
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: { map: { value: skyTex } }, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }',
}));
bgQuad.frustumCulled = false; bgQuad.renderOrder = -1000;
scene.add(bgQuad);
function paintSky(sky) {
  const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, sky.top); gr.addColorStop(0.48, sky.mid); gr.addColorStop(1, sky.bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
}
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 2000);
const sparkOpts = { renderer };
if (q.has('radial')) sparkOpts.sortRadial = q.get('radial') === '1';
if (q.has('minalpha')) sparkOpts.minAlpha = +q.get('minalpha');
const spark = new SparkRenderer(sparkOpts);
scene.add(spark);

// ---------- state ----------
let scenes = [], cur = null, mesh = null, loadToken = 0;
const st = {
  u: 0, uT: 0,            // position along the path in pose units (displayed / target)
  yaw: 0, pitch: 0, yawT: 0, pitchT: 0, // free-look orbit offsets (radians)
  panX: 0, panY: 0, panXT: 0, panYT: 0, // small pan offsets (fraction of path length)
  playing: !SHOT, dir: 1, lastInput: 0, dirty: true, idleUntil: 0,
};
const LIM = { yaw: 0.32, pitch: 0.2, pan: 0.06 };
const PLAY_SECONDS = 34; // one pass along the recorded path

// ---------- path math ----------
const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
function cr(a, b, c, d, t) { // uniform Catmull-Rom, per component
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
const basePos = new THREE.Vector3(), baseQuat = new THREE.Quaternion();
function samplePath(u) {
  const P = cur.path, n = P.length;
  u = THREE.MathUtils.clamp(u, 0, n - 1);
  const i = Math.min(Math.floor(u), n - 2), t = u - i;
  const idx = [Math.max(i - 1, 0), i, i + 1, Math.min(i + 2, n - 1)];
  idx.forEach((k, j) => { _v[j].fromArray(P[k].p); _q[j].fromArray(P[k].q); });
  basePos.set(
    cr(_v[0].x, _v[1].x, _v[2].x, _v[3].x, t),
    cr(_v[0].y, _v[1].y, _v[2].y, _v[3].y, t),
    cr(_v[0].z, _v[1].z, _v[2].z, _v[3].z, t));
  // rotation: slerp between the two neighbouring recorded poses, with a light
  // Catmull-Rom correction so the motion has no visible kinks at the nodes
  baseQuat.slerpQuaternions(_q[1], _q[2], t);
  const qc = new THREE.Quaternion(
    cr(_q[0].x, _q[1].x, _q[2].x, _q[3].x, t), cr(_q[0].y, _q[1].y, _q[2].y, _q[3].y, t),
    cr(_q[0].z, _q[1].z, _q[2].z, _q[3].z, t), cr(_q[0].w, _q[1].w, _q[2].w, _q[3].w, t)).normalize();
  baseQuat.slerp(qc, 0.5);
  const d = THREE.MathUtils.lerp(P[i].d, P[i + 1].d, t);
  return d;
}

const _e = new THREE.Euler(), _off = new THREE.Quaternion(), _fwd = new THREE.Vector3(), _pivot = new THREE.Vector3();
const _r = new THREE.Vector3(), _u = new THREE.Vector3();
function applyCamera() {
  const depth = samplePath(st.u);
  // orbit around a point in front of the camera; the pivot distance is capped so the
  // camera never swings far off the recorded path
  const rp = Math.min(depth * 0.5, cur.pathLength * 0.22 + 1e-3);
  _fwd.set(0, 0, -1).applyQuaternion(baseQuat);
  _pivot.copy(basePos).addScaledVector(_fwd, rp);
  _off.setFromEuler(_e.set(st.pitch, st.yaw, 0, 'YXZ'));
  camera.quaternion.copy(baseQuat).multiply(_off);
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  camera.position.copy(_pivot).addScaledVector(_fwd, -rp);
  _r.set(1, 0, 0).applyQuaternion(baseQuat); _u.set(0, 1, 0).applyQuaternion(baseQuat);
  const L = cur.pathLength;
  camera.position.addScaledVector(_r, st.panX * L).addScaledVector(_u, st.panY * L);
  camera.updateMatrixWorld(true);
}

// Fit the recorded frame's height to the viewport (portrait video), extend sideways.
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (cur) {
    const c = cur.camera;
    camera.fov = 2 * Math.atan(c.h / 2 / c.fy) * 180 / Math.PI;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[0] *= c.fx / c.fy; // non-square pixels from COLMAP
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const band = h * c.w / c.h;
    poster.style.width = band + 'px';
    // side panels start a little inside the frame edge and feather outwards
    const side = Math.max(0, (w - band * 1.12) / 2 + 60);
    document.querySelectorAll('.side').forEach(el => { el.style.width = side + 'px'; });
  } else camera.updateProjectionMatrix();
  st.dirty = true;
}
addEventListener('resize', resize);

// ---------- scene loading ----------
function setStatus(text, frac) {
  if (text == null) { statusEl.classList.add('off'); return; }
  statusEl.classList.remove('off');
  statusEl.querySelector('span').textContent = text;
  statusEl.querySelector('i').style.width = Math.round((frac || 0) * 100) + '%';
}

async function fetchBytes(url, onFrac) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader(), parts = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; onFrac(got / total); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function openScene(name, opts = {}) {
  const s = scenes.find(x => x.name === name) || scenes[0];
  const token = ++loadToken;
  cur = s;
  [...sceneBar.children].forEach(b => b.classList.toggle('on', b.dataset.name === s.name));
  sceneBar.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (!opts.keepHash) history.replaceState(null, '', '#' + s.name);
  const root = document.documentElement.style;
  root.setProperty('--sky-top', s.sky.top); root.setProperty('--sky-mid', s.sky.mid); root.setProperty('--sky-bottom', s.sky.bottom);
  paintSky(s.sky);
  // the real start frame shows at once; the splat fades in behind it, then the photo fades out
  canvas.classList.remove('on');
  poster.classList.remove('on');
  poster.src = 'scenes/' + s.poster;
  poster.onload = () => token === loadToken && poster.classList.add('on');
  st.u = st.uT = opts.u ?? 0; st.yaw = st.yawT = st.pitch = st.pitchT = 0;
  st.panX = st.panXT = st.panY = st.panYT = 0; st.dir = 1;
  resize(); applyCamera();
  if (mesh) { scene.remove(mesh); mesh.dispose(); mesh = null; }
  setStatus('Loading ' + s.label.toLowerCase(), 0);
  let bytes;
  const file = (SHOT && q.get('file')) || s.file;
  try { bytes = await fetchBytes('scenes/' + file, f => token === loadToken && setStatus('Loading ' + s.label.toLowerCase(), f)); }
  catch (e) { if (token === loadToken) setStatus('Could not load this view'); console.error(e); return; }
  if (token !== loadToken) return;
  setStatus('Preparing view', 1);
  const m = new SplatMesh({ fileBytes: bytes, fileName: file });
  await m.initialized;
  if (token !== loadToken) { m.dispose(); return; }
  mesh = m; scene.add(mesh);
  st.dirty = true;
  // give the sorter a couple of frames before revealing
  await new Promise(r => setTimeout(r, 250));
  if (token !== loadToken) return;
  setStatus(null);
  canvas.classList.add('on');
  setTimeout(() => token === loadToken && poster.classList.remove('on'), 650);
  window.viewReady = true;
  if (!SHOT && !sessionStorage.hinted) { sessionStorage.hinted = 1; hint.classList.remove('off'); setTimeout(() => hint.classList.add('off'), 4200); }
  st.lastInput = performance.now() - 1e4 + 1800; // start the dolly shortly after the reveal
}

// ---------- input ----------
const input = () => { st.lastInput = performance.now(); st.dirty = true; };
function setPlaying(p) {
  st.playing = p;
  playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
  playBtn.innerHTML = p ? '<svg viewBox="0 0 12 12"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>'
    : '<svg viewBox="0 0 12 12"><path d="M2.5 1l8 5-8 5z"/></svg>';
}
playBtn.onclick = () => {
  if (!cur) return;
  if (!st.playing && st.uT >= cur.path.length - 1.01) st.dir = -1;
  if (!st.playing && st.uT <= 0.01) st.dir = 1;
  setPlaying(!st.playing); st.lastInput = 0; st.dirty = true;
};

const pointers = new Map(); let lastX = 0, lastY = 0, button = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e);
  lastX = e.clientX; lastY = e.clientY; button = e.button; canvas.classList.add('drag');
  setPlaying(false); input();
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, e);
  const k = 1 / Math.min(innerWidth, innerHeight);
  const dx = (e.clientX - lastX) * k, dy = (e.clientY - lastY) * k;
  lastX = e.clientX; lastY = e.clientY;
  if (pointers.size >= 2) { // two fingers: move along the path
    st.uT = THREE.MathUtils.clamp(st.uT - dy * 0.5 * (cur.path.length - 1) / pointers.size, 0, cur.path.length - 1);
  } else if (button === 2 || e.shiftKey) { // right drag: small pan
    st.panXT = THREE.MathUtils.clamp(st.panXT - dx * 0.25, -LIM.pan, LIM.pan);
    st.panYT = THREE.MathUtils.clamp(st.panYT + dy * 0.25, -LIM.pan, LIM.pan);
  } else {
    st.yawT = THREE.MathUtils.clamp(st.yawT + dx * 1.2, -LIM.yaw, LIM.yaw);
    st.pitchT = THREE.MathUtils.clamp(st.pitchT + dy * 1.0, -LIM.pitch, LIM.pitch);
  }
  input();
});
const up = e => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('drag'); };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('dblclick', () => { st.yawT = st.pitchT = st.panXT = st.panYT = 0; input(); });
addEventListener('wheel', e => {
  if (!cur || e.target.closest('#dock')) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  st.uT = THREE.MathUtils.clamp(st.uT + d * 0.0016 * (cur.path.length - 1) / 10, 0, cur.path.length - 1);
  setPlaying(false); input();
}, { passive: false });
scrub.addEventListener('input', () => {
  if (!cur) return;
  st.uT = scrub.value / 1000 * (cur.path.length - 1); setPlaying(false); input();
});
addEventListener('keydown', e => {
  if (!cur || e.target.tagName === 'INPUT' && e.key !== ' ') return;
  const n = cur.path.length - 1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') st.uT = Math.min(n, st.uT + n / 20);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') st.uT = Math.max(0, st.uT - n / 20);
  else if (e.key === ' ') { e.preventDefault(); playBtn.click(); return; }
  else if (e.key === 'Home') st.uT = 0;
  else return;
  setPlaying(false); input();
});

// ---------- loop ----------
let last = performance.now(), frames = 0, fpsT = last, slow = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (cur && cur.path.length > 1) {
    const n = cur.path.length - 1;
    if (st.playing && now - st.lastInput > 1e4 - 1) {
      st.uT += st.dir * dt * n / PLAY_SECONDS;
      if (st.uT >= n) { st.uT = n; st.dir = -1; } else if (st.uT <= 0) { st.uT = 0; st.dir = 1; }
      // drift the free-look back to the recorded view while dollying
      st.yawT *= 1 - dt * 0.6; st.pitchT *= 1 - dt * 0.6; st.panXT *= 1 - dt * 0.6; st.panYT *= 1 - dt * 0.6;
      st.dirty = true;
    }
    const a = 1 - Math.exp(-dt * 7);
    let moving = false;
    for (const k of ['u', 'yaw', 'pitch', 'panX', 'panY']) {
      const d = st[k + 'T'] - st[k];
      if (Math.abs(d) > 1e-5) { st[k] += d * a; moving = true; } else st[k] = st[k + 'T'];
    }
    if (moving || st.dirty) { applyCamera(); st.idleUntil = now + 1200; st.dirty = false; }
    if (document.activeElement !== scrub) {
      scrub.value = Math.round(st.u / n * 1000);
    }
    scrub.style.setProperty('--p', (st.u / n * 100).toFixed(2) + '%');
  }
  // render while anything changes and briefly after, so the async sort settles; then idle
  if (now < st.idleUntil || SHOT) {
    renderer.render(scene, camera);
    // adaptive resolution: step down if we cannot hold ~50 fps
    frames++;
    if (now - fpsT > 1000) {
      const fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now;
      if (fps < 48 && pixelRatio > 1) { if (++slow >= 2) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); slow = 0; } }
      else slow = 0;
      window.fps = fps;
    }
  } else { frames = 0; fpsT = now; }
  requestAnimationFrame(tick);
}

// ---------- boot ----------
(async () => {
  const data = await (await fetch('scenes/scenes.json', { cache: 'no-cache' })).json();
  scenes = data.scenes;
  for (const s of scenes) {
    const b = document.createElement('button');
    b.textContent = s.label; b.dataset.name = s.name; b.setAttribute('role', 'tab');
    b.onclick = () => { if (cur?.name !== s.name) { setPlaying(!SHOT); openScene(s.name); } };
    sceneBar.appendChild(b);
  }
  if (scenes.length < 2) sceneBar.hidden = true;
  setPlaying(st.playing);
  requestAnimationFrame(tick);
  const want = location.hash.slice(1) || q.get('scene');
  await openScene(want, { keepHash: !location.hash && !q.get('scene'), u: q.has('u') ? +q.get('u') : undefined });
})();

// test hooks for headless screenshots
window.viewer = {
  get scene() { return cur; }, camera, renderer,
  setU(u) { st.u = st.uT = u; st.dirty = true; applyCamera(); },
  setLook(yaw, pitch) { st.yaw = st.yawT = yaw; st.pitch = st.pitchT = pitch; st.dirty = true; applyCamera(); },
  open: openScene,
};
