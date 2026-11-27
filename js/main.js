import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, velocity, vec3, vec4, float, screenUV, sample, packNormalToRGB, unpackRGBToNormal, builtinAOContext, uniform, mix, smoothstep, length, color } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { ROOMS, FY } from './data.js';
import { Batcher } from './geo.js';
import { makeMaterials, neighborMats, pending } from './mats.js';
import { buildHouse } from './house.js';
import { buildSite, buildFence, loadTrees, buildNeighbors, GY } from './site.js';

const $ = s => document.querySelector(s);
const img = n => 'img/' + n + '.jpg';
const fmt = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const status = t => { const el = $('#loading p'); if (el) el.textContent = t; };
const params = new URLSearchParams(location.search);

async function start() {
  if (!navigator.gpu && !params.has('webgl')) status('WebGPU is not available here, falling back to WebGL 2.');
  const renderer = new THREE.WebGPURenderer({ antialias: false, reversedDepthBuffer: true, forceWebGL: params.has('webgl') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, params.has('hq') ? 2 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('#app').appendChild(renderer.domElement);
  await renderer.init();
  const css = new CSS2DRenderer();
  css.setSize(innerWidth, innerHeight);
  Object.assign(css.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
  $('#app').appendChild(css.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 4000);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.dampingFactor = 0.07; orbit.maxPolarAngle = Math.PI * 0.495; orbit.minDistance = 8; orbit.maxDistance = 520;
  const SHOTS = {
    street: { pos: [24.5, 3.6, -46], tgt: [24, 9, 10], fov: 58 },
    hero: { pos: [58, 62, -118], tgt: [26, 5, 18], fov: 36 },
    aerial: { pos: [30, 230, -60], tgt: [30, 0, 30], fov: 38 },
    garden: { pos: [10, 6, 112], tgt: [30, 10, 30], fov: 50 },
  };
  const shot = SHOTS[params.get('shot')] || SHOTS.hero;
  camera.position.set(...shot.pos); orbit.target.set(...shot.tgt); camera.fov = shot.fov; camera.updateProjectionMatrix();

  // ---------- sky and sun ----------
  // Sun for Palo Alto, late November afternoon (about 3:30 pm): azimuth ~228 deg, elevation ~19 deg.
  // House frame: north = (0.779, -0.627), east = (0.626, 0.779) in x/z (from the OSM outline fit).
  const N = new THREE.Vector2(0.779, -0.627), E = new THREE.Vector2(0.626, 0.779);
  const sun = new THREE.DirectionalLight('#FFE9CF', 4.2);
  const TIMES = { morning: [128, 24, '#FFF1DD', 3.6], afternoon: [228, 19, '#FFE5C4', 4.2], golden: [240, 8.5, '#FFC98F', 3.4], noon: [180, 33, '#FFF6EA', 4.6] };
  const sunDir = new THREE.Vector3();
  function setTime(k) {
    const [az, el, col, inten] = TIMES[k];
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    const h = N.clone().multiplyScalar(Math.cos(a)).add(E.clone().multiplyScalar(Math.sin(a)));
    sunDir.set(h.x * Math.cos(e), Math.sin(e), h.y * Math.cos(e)).normalize();
    sun.color.set(col); sun.intensity = inten;
    sun.position.copy(sunDir).multiplyScalar(400).add(new THREE.Vector3(30, 0, 30));
    sun.target.position.set(30, 0, 30);
    if (skyTex) alignSky();
    document.querySelectorAll('[data-time]').forEach(b => b.classList.toggle('on', b.dataset.time === k));
  }
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 50, far: 900 });
  sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  let skyTex = null, skySunAz = 0;
  function alignSky() {
    // rotate the sky so its sun sits behind the light's sun
    const want = Math.atan2(sunDir.x, sunDir.z);
    const rot = want - skySunAz;
    scene.backgroundRotation.set(0, rot, 0); scene.environmentRotation.set(0, rot, 0);
  }
  status('Loading sky');
  skyTex = await new HDRLoader().loadAsync('assets/hdri/sky_2k.hdr');
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  {
    // find the sun in the HDR (brightest pixel) to line the sky up with the light
    const { data, width, height } = skyTex.image; let best = 0, bi = 0;
    const toF = data instanceof Uint16Array ? THREE.DataUtils.fromHalfFloat : (v => v);
    for (let i = 0; i < width * height; i += 3) { const l = toF(data[i * 4]) + toF(data[i * 4 + 1]); if (l > best) { best = l; bi = i; } }
    const u = (bi % width) / width; skySunAz = (u - 0.5) * Math.PI * 2 * -1 + Math.PI / 2;
  }
  scene.background = skyTex; scene.environment = skyTex;
  scene.environmentIntensity = 0.85; scene.backgroundIntensity = 1.0;
  scene.fog = new THREE.FogExp2('#B7C8D6', 0.0009);
  setTime(params.get('time') || 'afternoon');

  // ---------- build ----------
  status('Building the house');
  const M = makeMaterials();
  const root = new THREE.Group(); root.name = '604 Tennyson Ave'; scene.add(root);
  const G = { f0: new THREE.Group(), f1: new THREE.Group(), roof: new THREE.Group(), ceil: new THREE.Group(), garden: new THREE.Group(), trees: new THREE.Group(), nb: new THREE.Group(), furn0: new THREE.Group(), furn1: new THREE.Group() };
  Object.entries(G).forEach(([k, g]) => g.name = k);
  root.add(G.f0, G.f1, G.roof, G.ceil, G.garden, G.trees, G.nb); G.f0.add(G.furn0); G.f1.add(G.furn1);
  const B = new Batcher();
  const floorRooms = [];
  buildHouse(B, floorRooms);
  buildSite(B);
  // sample furniture
  {
    const FU = 'furn0', FV = 'furn1';
    B.box(FU, 'bedding', 24, 10.6, 37, 20.4, 0.01, 0.04); B.box(FU, 'fabric', 26, 10, 35, 12.6, 0, 2.6); B.box(FU, 'fabric', 26, 18.2, 35, 20.8, 0, 2.6); B.box(FU, 'furnWood', 28.5, 14.2, 32.5, 16.4, 0, 1.4);
    B.box(FU, 'furnDark', 47, 19.5, 57, 24.5, 2.3, 2.5); B.box(FU, 'furnDark', 47.5, 20, 56.5, 24, 0, 2.3);
    [[48.5, 18.4], [52, 18.4], [55.5, 18.4], [48.5, 25.6], [52, 25.6], [55.5, 25.6], [45.8, 22], [58.2, 22]].forEach(([x, z]) => B.box(FU, 'fabric', x - 0.8, z - 0.8, x + 0.8, z + 0.8, 0, 3));
    [[2, 3], [9.5, 3], [2, 9], [9.5, 9]].forEach(([x, z]) => { B.box(FU, 'furnWood', x, z, x + 5, z + 2.5, 2.4, 2.5); B.box(FU, 'furnDark', x + 1.8, z + 2.8, x + 3.2, z + 4.2, 0, 3.2); });
    B.box(FU, 'bedding', 54.5, 42, 60, 48.7, 0, 2);
    [[21.5, 14.4, 26.8, 21.1], [34, 14.4, 39.3, 21.1], [49.5, 19, 56.2, 24.3]].forEach(([a, b, c, d]) => B.box(FV, 'bedding', a, b, c, d, 10, 12));
  }
  B.build(G, M);
  G.furn0.visible = G.furn1.visible = false;
  buildFence(G.garden, M);

  // floors: one mesh per room so rooms can be picked and highlighted
  const floorMeshes = [], labels = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const hiMat = new THREE.MeshBasicNodeMaterial({ color: '#C8392F', transparent: true, opacity: 0.32, depthWrite: false });
  function floorBox(grp, rm, r, th, lift) {
    const m = new THREE.Mesh(boxGeo, M[rm.floor] || M.oak);
    m.scale.set(r[2] - r[0], th, r[3] - r[1]); m.position.set((r[0] + r[2]) / 2, FY[rm.f] - th / 2 + lift, (r[1] + r[3]) / 2);
    m.receiveShadow = true; m.castShadow = rm.f === 1; m.userData.room = rm; m.name = rm.name + ' floor';
    grp.add(m); floorMeshes.push(m); return m;
  }
  const holeRects = (r, h) => [[r[0], r[1], h[0], r[3]], [h[2], r[1], r[2], r[3]], [h[0], r[1], h[2], h[1]], [h[0], h[3], h[2], r[3]]];
  for (const rm of ROOMS) {
    const grp = rm.f === 0 ? G.f0 : G.f1;
    const [x0, z0, x1, z1] = rm.r;
    const yard = ['front', 'garden', 'side'].includes(rm.id);
    if (yard) {
      const m = new THREE.Mesh(boxGeo, hiMat); m.scale.set(x1 - x0, 0.05, z1 - z0); m.position.set((x0 + x1) / 2, GY + 0.12, (z0 + z1) / 2);
      m.userData.room = rm; m.userData.invisible = true; m.visible = false; G.garden.add(m); floorMeshes.push(m); rm.meshes = [m];
    } else if (rm.id === 'porch' || rm.id === 'pergola') {
      const m = new THREE.Mesh(boxGeo, hiMat); m.scale.set(x1 - x0, 0.05, z1 - z0); m.position.set((x0 + x1) / 2, (rm.id === 'porch' ? 0 : GY + 0.1) + 0.04, (z0 + z1) / 2);
      m.userData.room = rm; m.userData.invisible = true; m.visible = false; grp.add(m); floorMeshes.push(m); rm.meshes = [m];
    } else if (rm.id === 'balcony') {
      const m = new THREE.Mesh(boxGeo, hiMat); m.scale.set(x1 - x0, 0.05, z1 - z0); m.position.set((x0 + x1) / 2, 10.08, (z0 + z1) / 2);
      m.userData.room = rm; m.userData.invisible = true; m.visible = false; grp.add(m); floorMeshes.push(m); rm.meshes = [m];
    } else {
      const fr = rm.hole ? holeRects(rm.r, rm.hole) : [rm.r];
      rm.meshes = fr.map(r => floorBox(grp, rm, r, rm.f === 0 ? 0.3 : 0.9, 0));
      // highlight overlay
      rm.hi = fr.map(r => { const h = new THREE.Mesh(boxGeo, hiMat); h.scale.set(r[2] - r[0] - 0.4, 0.02, r[3] - r[1] - 0.4); h.position.set((r[0] + r[2]) / 2, FY[rm.f] + 0.03, (r[1] + r[3]) / 2); h.visible = false; h.renderOrder = 2; grp.add(h); return h; });
    }
    const div = document.createElement('div');
    div.className = 'lbl' + (rm.out ? ' out' : ''); div.textContent = rm.name;
    const lbl = new CSS2DObject(div);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (yard) lbl.position.set(rm.id === 'front' ? 30 : rm.id === 'side' ? 69 : 24, GY + 1, rm.id === 'front' ? -22 : rm.id === 'side' ? 10 : 84);
    else lbl.position.set(rm.id === 'hallU' ? 21 : cx, FY[rm.f] + (rm.out ? 1 : 1.2), cz);
    (yard ? G.garden : grp).add(lbl); labels.push(lbl); rm.label = div; rm.lblObj = lbl;
  }
  { const st = (t, x, z) => { const d = document.createElement('div'); d.className = 'lbl out street'; d.textContent = t; const l = new CSS2DObject(d); l.position.set(x, GY, z); G.garden.add(l); labels.push(l); };
    st('Tennyson Ave', 10, -58); st('Webster St', -66, 40); }

  // ---------- post-processing ----------
  const pipeline = new THREE.RenderPipeline(renderer);
  const prePass = pass(scene, camera);
  prePass.transparent = false;
  prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
  prePass.getTexture('output').type = THREE.UnsignedByteType;
  const preNormal = sample(uvn => unpackRGBToNormal(prePass.getTextureNode().sample(uvn)));
  const preDepth = prePass.getTextureNode('depth');
  const preVel = prePass.getTextureNode('velocity');
  const aoPass = ao(preDepth, preNormal, camera);
  aoPass.radius.value = 2.2; aoPass.thickness.value = 2.5; aoPass.distanceExponent.value = 1.4; aoPass.scale.value = 1.0; aoPass.samples.value = 12;
  aoPass.resolutionScale = 0.5;
  const scenePass = pass(scene, camera);
  scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
  const aa = traa(scenePass, preDepth, preVel, camera);
  aa.useSubpixelCorrection = false;
  const glow = bloom(aa, 0.12, 0.35, 0.92);
  // gentle lens vignette
  const vig = smoothstep(1.25, 0.35, length(screenUV.sub(0.5).mul(vec3(1.6, 1.0, 0).xy)));
  pipeline.outputNode = vec4(aa.rgb.add(glow.rgb).mul(mix(float(0.84), float(1), vig)), 1);

  // ---------- neighbours and trees (streamed in after first frame) ----------
  const nmats = neighborMats();
  buildNeighbors(G.nb, M, nmats).catch(e => console.warn('neighbors', e));
  const treesReady = loadTrees(G.trees).catch(e => console.warn('trees', e));

  // ---------- ui ----------
  const roomsEl = $('#rooms');
  const area = r => Math.round((r.r[2] - r.r[0]) * (r.r[3] - r.r[1]) - (r.hole ? (r.hole[2] - r.hole[0]) * (r.hole[3] - r.hole[1]) : 0));
  [['Ground floor', r => r.f === 0 && !r.out], ['Upstairs', r => r.f === 1 && !r.out], ['Outside', r => r.out]].forEach(([h, fn]) => {
    const sec = document.createElement('div'); sec.innerHTML = `<h2>${h}</h2><ul></ul>`;
    ROOMS.filter(fn).forEach(rm => { const li = document.createElement('li'); const b = document.createElement('button');
      b.innerHTML = `${rm.name}<span>${rm.out ? '' : area(rm) + ' sq ft'}</span>`; b.onclick = () => select(rm, true); rm.btn = b; li.appendChild(b); sec.querySelector('ul').appendChild(li); });
    roomsEl.appendChild(sec);
  });
  const panel = $('#panel');
  let selected = null;
  const lb = $('#lb'), vd = $('#vd'), video = vd.querySelector('video');
  let videoOK = false;
  video.src = '604-tennyson-house-tour.mp4'; video.preload = 'metadata';
  video.addEventListener('loadedmetadata', () => { videoOK = true; if (selected) select(selected); });
  function playAt(t) { vd.showModal(); video.currentTime = t; video.play().catch(() => {}); }
  vd.addEventListener('close', () => video.pause());
  function select(rm, fly) {
    if (selected) { (selected.hi || selected.meshes || []).forEach(m => m.visible = false); selected.label.classList.remove('sel'); selected.btn.classList.remove('on'); }
    selected = rm;
    if (!rm) { panel.hidden = true; updateLabels(); return; }
    (rm.hi || rm.meshes).forEach(m => m.visible = true);
    rm.label.classList.add('sel'); rm.btn.classList.add('on'); updateLabels();
    const w = Math.round(rm.r[2] - rm.r[0]), d = Math.round(rm.r[3] - rm.r[1]);
    panel.querySelector('.fl').textContent = rm.out ? 'Outside' : rm.f === 0 ? 'Ground floor' : 'Upstairs';
    panel.querySelector('h2').textContent = rm.name;
    panel.querySelector('.size').textContent = rm.out ? '' : `About ${w} x ${d} ft | ~${area(rm)} sq ft (estimate)`;
    panel.querySelector('.desc').textContent = rm.desc;
    const idea = panel.querySelector('.idea'); idea.hidden = !rm.idea; idea.textContent = rm.idea ? 'Could work as: ' + rm.idea : '';
    const wb = panel.querySelector('.watch'); wb.hidden = rm.t == null || !videoOK; wb.textContent = `Watch in the tour at ${fmt(rm.t || 0)}`; wb.onclick = () => playAt(rm.t);
    const ph = panel.querySelector('.photos'); ph.innerHTML = '';
    if (!rm.imgs.length) ph.innerHTML = '<p class="size">No clear shot of this space in the video or listing.</p>';
    rm.imgs.forEach((n, i) => { const im = new Image(); im.src = img(n); im.alt = rm.name + ' photo'; im.loading = 'lazy'; if (n[0] === 'z' && i === 0) im.className = 'wide'; im.onclick = () => { lb.querySelector('img').src = im.src; lb.showModal(); }; ph.appendChild(im); });
    panel.hidden = false;
    if (fly) {
      if (!rm.out) { setRoof(false); if (rm.f === 0 && view !== 'g') setView('g'); if (rm.f === 1 && view !== 'u' && view !== 'x') setView('u'); }
      const cx = (rm.r[0] + rm.r[2]) / 2, cz = (rm.r[1] + rm.r[3]) / 2, cy = rm.out ? GY : (rm.f === 1 ? FY[1] + (view === 'x' ? XOFF : 0) : 0);
      flyTo(new THREE.Vector3(cx, cy, cz), rm.out ? 120 : 62);
    }
  }
  panel.querySelector('.x').onclick = () => select(null);
  let fly = null;
  function flyTo(target, dist) {
    const dir = camera.position.clone().sub(orbit.target).normalize();
    if (dir.y < 0.55) { dir.y = 0.55; dir.normalize(); }
    fly = { t0: performance.now(), p0: camera.position.clone(), q0: orbit.target.clone(), p1: target.clone().add(dir.multiplyScalar(dist)), q1: target.clone() };
  }
  let view = 'all'; const XOFF = 22;
  const roofOn = () => $('#tRoof').checked;
  function setRoof(on) { $('#tRoof').checked = on; setView(view); }
  function setView(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    G.f0.visible = v !== 'u'; G.f1.visible = v !== 'g';
    G.f1.position.y = v === 'x' ? XOFF : 0;
    G.roof.position.y = v === 'x' ? XOFF * 2 : 0;
    G.roof.visible = roofOn() && v !== 'g' && v !== 'u';
    G.ceil.visible = (G.roof.visible && v === 'all') || walking;
    const enclosed = G.roof.visible || walking;
    M.interior.forEach(k => { M[k].envMapIntensity = enclosed ? 0.28 : 0.85; });
    if (v !== 'all' && !walking) $('#tLabels').checked = true;
    updateLabels();
  }
  function updateLabels() {
    const on = $('#tLabels').checked, roof = G.roof.visible;
    ROOMS.forEach(rm => { if (!rm.lblObj) return;
      const covered = (view === 'all' && rm.f === 0 && !rm.out) || (roof && !rm.out);
      const offFloor = (view === 'g' && rm.f === 1) || (view === 'u' && rm.f === 0 && !rm.out);
      rm.lblObj.visible = !walking && !offFloor && on && (!covered || rm === selected); });
    labels.filter(l => l.element.classList.contains('street')).forEach(l => l.visible = on && !walking);
  }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { if (b.dataset.view !== 'all') $('#tRoof').checked = false; setView(b.dataset.view); });
  document.querySelectorAll('[data-time]').forEach(b => b.onclick = () => setTime(b.dataset.time));
  document.querySelectorAll('[data-shot]').forEach(b => b.onclick = () => { const s = SHOTS[b.dataset.shot]; if (b.dataset.shot !== 'aerial') setRoof(true); setView('all'); fly = { t0: performance.now(), p0: camera.position.clone(), q0: orbit.target.clone(), p1: new THREE.Vector3(...s.pos), q1: new THREE.Vector3(...s.tgt), fov0: camera.fov, fov1: s.fov }; });
  $('#tRoof').onchange = () => setView(view);
  $('#tLabels').onchange = updateLabels;
  $('#tFurn').onchange = e => { G.furn0.visible = G.furn1.visible = e.target.checked; };
  $('#tGarden').onchange = e => { G.garden.visible = G.trees.visible = G.nb.visible = e.target.checked; };

  // picking
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', e => {
    if (walking || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    ptr.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1); ray.setFromCamera(ptr, camera);
    const vis = floorMeshes.filter(m => { if (m.userData.invisible) { let o = m.parent; while (o) { if (!o.visible) return false; o = o.parent; } return true; } let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
    vis.forEach(m => { if (m.userData.invisible) m.visible = true; });
    const hit = ray.intersectObjects(vis, false)[0];
    vis.forEach(m => { if (m.userData.invisible && !(selected && selected.meshes && selected.meshes.includes(m))) m.visible = false; });
    if (G.roof.visible && hit && !hit.object.userData.room.out) return;
    select(hit ? hit.object.userData.room : null, false);
  });

  // walk mode
  const plc = new PointerLockControls(camera, document.body);
  let walking = false, walkFloor = 0, saved = null; const keys = {};
  $('#walk').onclick = () => plc.lock();
  plc.addEventListener('lock', () => {
    walking = true; saved = { p: camera.position.clone(), t: orbit.target.clone(), v: view, roof: roofOn(), fov: camera.fov };
    orbit.enabled = false; $('#tRoof').checked = true; setView('all'); walkFloor = 0;
    camera.fov = 62; camera.updateProjectionMatrix();
    camera.position.set(24.5, 4.0, -14); camera.lookAt(24.5, 4.5, 10);
    $('#walkhint').hidden = false; $('#cross').hidden = false; select(null);
  });
  plc.addEventListener('unlock', () => {
    walking = false; orbit.enabled = true; camera.position.copy(saved.p); orbit.target.copy(saved.t); camera.fov = saved.fov; camera.updateProjectionMatrix();
    $('#tRoof').checked = saved.roof; setView(saved.v);
    $('#walkhint').hidden = true; $('#cross').hidden = true;
  });
  addEventListener('keydown', e => { keys[e.code] = true; if (walking && e.code === 'KeyF') { walkFloor = 1 - walkFloor; camera.position.set(walkFloor ? 22 : 30, 0, walkFloor ? 24.5 : 16); } });
  addEventListener('keyup', e => keys[e.code] = false);

  setView('all');
  window.__api = { setView, setTime, select: id => select(ROOMS.find(r => r.id === id), true), camera, orbit, G, scene, renderer, aoPass, sun, treesReady,
    shot: k => { const s = SHOTS[k]; camera.position.set(...s.pos); orbit.target.set(...s.tgt); camera.fov = s.fov; camera.updateProjectionMatrix(); orbit.update(); } };

  status('Loading textures');
  await Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, 8000))]);
  // compile before first frame to avoid a stall when the user starts moving
  await renderer.compileAsync(scene, camera).catch(() => {});

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.t0) / 1100), e = k < .5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e); orbit.target.lerpVectors(fly.q0, fly.q1, e);
      if (fly.fov1) { camera.fov = fly.fov0 + (fly.fov1 - fly.fov0) * e; camera.updateProjectionMatrix(); }
      if (k >= 1) fly = null;
    }
    if (walking) {
      const sp = (keys.ShiftLeft ? 16 : 8) * dt;
      if (keys.KeyW) plc.moveForward(sp); if (keys.KeyS) plc.moveForward(-sp); if (keys.KeyD) plc.moveRight(sp); if (keys.KeyA) plc.moveRight(-sp);
      camera.position.y = walkFloor ? 15.4 : 5.4;
    } else orbit.update();
    pipeline.render();
    css.render(scene, camera);
  });
  $('#loading').classList.add('done');
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); css.setSize(innerWidth, innerHeight); });
  await treesReady;
  window.__ready = true;
}

start().catch(e => { console.error(e); status('Could not start: ' + e.message); });
