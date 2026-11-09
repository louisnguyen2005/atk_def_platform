/* MekoDataCTF Crypto Range — WebGL battle arena.
 * One 3D starship per team over the deep-space backdrop. A new capture makes the attacker swing round, charge and
 * fire a plasma volley at the victim; a defense award raises a hex shield. State comes from the
 * `crypto-range:state` event that dashboard.js dispatches (no extra polling). */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { buildShip, cloneShip, loadModelShip } from './ships.js?v=3';

const ASSET = name => '/arena-ui/assets/' + name;
const TASK_LABEL = { idor: 'IDOR', sqli: 'SQLI', upload: 'UPLOAD', jwt: 'JWT', backup: 'BACKUP' };
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - t, 3);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Team -> ship. Slots follow the backdrop's composition: one ship each side, one high in the distance.
const SHIPS = [
  { key: 'raptor', call: 'RAPTOR', color: 0x46d6ff, css: '#46d6ff' },
  { key: 'saucer', call: 'EMBER', color: 0xff8a3d, css: '#ff8a3d' },
  { key: 'manta', call: 'MANTA', color: 0xa98bff, css: '#a98bff' },
];
const SLOTS = [V(5.6, -1.3, 0.8), V(-5.6, -1.3, 0.8), V(0, 2.1, -5.2), V(-2.8, 3.4, -10), V(2.8, 3.4, -10), V(-8, 1.6, -7), V(8, 1.6, -7)];
const SHIP_SCALE = 1.3;
const BG_Z = -110;
const WINDUP = 0.6;    // seconds an attacker spends turning and charging before the first shot

export async function start() {
  const section = document.getElementById('arena');
  const hud = section.querySelector('.arena-hud');
  const platesHost = document.getElementById('hud-plates');
  const feedHost = document.getElementById('hud-feed');
  const params = new URLSearchParams(location.search);
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1;
  const timeScale = clamp(Number(params.get('timescale')) || 1, 0.05, 3);
  const dtMax = clamp(Number(params.get('dtmax')) || 0.05, 0.02, 1);   // debugging aid for throttled previews

  // ---------- renderer ----------
  const canvas = document.createElement('canvas');
  canvas.id = 'arena-gl';
  canvas.setAttribute('aria-hidden', 'true');
  section.insertBefore(canvas, section.firstChild);
  const flat = document.getElementById('arena-canvas');
  if (flat) flat.hidden = true;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b1040, 0.011);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 400);
  const CAM = V(0, 3.4, 15.5), LOOK = V(0, -0.2, -3);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.38, 0.93);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- textures ----------
  const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]);
  const ringTex = radialTexture([[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
  const bgTex = await new THREE.TextureLoader().loadAsync(ASSET('space-bg.webp'));
  bgTex.colorSpace = THREE.SRGBColorSpace;

  // ---------- backdrop, lights, environment ----------
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bgTex, depthWrite: false, fog: false }));
  bg.renderOrder = -10;
  scene.add(bg);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(bgTex).texture;   // hulls reflect the nebula
  scene.add(new THREE.HemisphereLight(0x8a96ff, 0x120a30, 0.7));
  const key = new THREE.DirectionalLight(0xe6ecff, 2.4); key.position.set(-5, 9, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa07cff, 2.2); rim.position.set(2, 6, -14); scene.add(rim);
  const vp = V();     // vanishing point = the bright warp core painted in the backdrop

  function resize() {
    const w = section.clientWidth, h = section.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(Math.round(w * 0.5), Math.round(h * 0.5));   // bloom is blurry anyway: half-res saves most of its cost
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    particles.material.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.5;
    // backdrop: cover the frustum at its depth with margin for camera drift
    const dist = CAM.z - BG_Z;
    const fh = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist * 1.25, fw = fh * camera.aspect;
    const ia = bgTex.image.width / bgTex.image.height;
    let bw = fw, bh = fw / ia;
    if (bh < fh) { bh = fh; bw = fh * ia; }
    const y = CAM.y + (LOOK.y - CAM.y) / (LOOK.z - CAM.z) * (BG_Z - CAM.z);
    bg.scale.set(bw, bh, 1);
    bg.position.set(0, y, BG_Z);
    vp.set((0.51 - 0.5) * bw, y + (0.5 - 0.19) * bh, BG_Z + 4);
  }

  // ---------- particles (exhaust, sparks, debris) ----------
  const particles = makeParticles(3200);
  scene.add(particles.points);

  // ---------- warp streaks rushing out of the core ----------
  const STAR_N = 280;
  const starPos = new Float32Array(STAR_N * 6), starCol = new Float32Array(STAR_N * 6);
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const warp = new THREE.LineSegments(starGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  warp.frustumCulled = false;
  scene.add(warp);
  const stars = Array.from({ length: STAR_N }, () => newStar(Math.random()));
  function newStar(s = 0) { return { a: rand(0, TAU), R: rand(14, 70), s, v: rand(0.05, 0.14), tint: Math.random() < 0.3 }; }
  const starAt = (st, s, out) => { const e = Math.pow(s, 2.6); return out.set(vp.x + Math.cos(st.a) * st.R * e, vp.y + Math.sin(st.a) * st.R * 0.6 * e, vp.z + (13 - vp.z) * e); };
  const tmpA = V(), tmpB = V(), tmpC = V(), FACE_BIAS = V(0, 0.6, 4.5);
  function updateWarp(dt) {
    for (let i = 0; i < STAR_N; i++) {
      const st = stars[i];
      st.s += st.v * dt * motion;
      if (st.s >= 1) stars[i] = newStar(0);
      const s = stars[i].s;
      starAt(stars[i], Math.max(0, s - 0.006 - s * 0.022), tmpA); starAt(stars[i], s, tmpB);
      starPos.set([tmpA.x, tmpA.y, tmpA.z, tmpB.x, tmpB.y, tmpB.z], i * 6);
      const b = Math.min(1, s * 1.8) * (1 - THREE.MathUtils.smoothstep(s, 0.6, 0.95)) * 1.1;
      const [r, g, bl] = stars[i].tint ? [0.75 * b, 0.6 * b, 1.1 * b] : [0.85 * b, 0.92 * b, 1.1 * b];
      starCol.set([0, 0, 0, r, g, bl], i * 6);
    }
    starGeo.attributes.position.needsUpdate = true;
    starGeo.attributes.color.needsUpdate = true;
  }

  // ---------- nebula dust: soft sprites at many depths ----------
  const dust = [];
  for (let i = 0; i < 20; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: Math.random() < 0.5 ? 0x6a50ff : 0x3a8cff,
      transparent: true, opacity: rand(0.03, 0.09), blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.set(rand(-30, 30), rand(-10, 12), rand(-50, 9));
    sp.scale.setScalar(rand(7, 22));
    sp.userData.vx = rand(-0.25, 0.25);
    dust.push(sp); scene.add(sp);
  }

  // ---------- ships ----------
  const manifest = await fetch(ASSET('models/manifest.json'), { cache: 'no-store' }).then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  async function makeShip(spec) {
    let ship = buildShip(spec.key, spec.color);
    if (manifest[spec.key]) {
      try { ship = await loadModelShip(GLTFLoader, ASSET('models/' + manifest[spec.key]), ship); }
      catch (error) { console.warn('crypto-arena: model failed, using procedural ship', spec.key, error); }
    }
    return ship;
  }
  const flameGeo = new THREE.ConeGeometry(1, 1, 18, 1, true);
  flameGeo.rotateX(-Math.PI / 2); flameGeo.translate(0, 0, -0.5);    // base at nozzle, tip toward -Z
  function addFlames(group, engines, color, lite = false) {
    const outer = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.1), transparent: true, opacity: 0.24,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const inner = outer.clone(); inner.color = new THREE.Color(0xffffff).multiplyScalar(1.3); inner.opacity = 0.32;
    return engines.map(e => {
      const f = new THREE.Group();
      const o = new THREE.Mesh(flameGeo, outer); o.scale.set(e.radius * 0.85, e.radius * 0.85, 1);
      const c = new THREE.Mesh(flameGeo, inner); c.scale.set(e.radius * 0.4, e.radius * 0.4, 0.55);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(0.55),
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      halo.scale.setScalar(e.radius * 2.4);
      if (lite) f.add(o); else f.add(o, c, halo);
      f.position.copy(e.pos);
      group.add(f);
      return f;
    });
  }

  // distant fleet: small 3D ships crossing the horizon band, hazed by fog
  const fleetModels = SHIPS.map(s => buildShip(s.key, 0x7fb2ff));
  const fleet = [];
  for (let i = 0; i < 12; i++) {
    const model = fleetModels[i % 3];
    const g = cloneShip(model);
    addFlames(g, model.engines, 0x7fb2ff, true).forEach(f => { f.scale.z = 2.4; });
    g.scale.setScalar(rand(0.45, 0.7));
    scene.add(g);
    fleet.push(respawnFleet({ g, bob: rand(0, TAU) }, true));
  }
  function respawnFleet(f, initial) {
    f.dir = Math.random() < 0.5 ? -1 : 1;
    f.speed = rand(1.4, 3.2);
    f.g.position.set(initial ? rand(-45, 45) : -f.dir * 48, rand(3, 9), rand(-62, -28));
    f.g.rotation.set(0, f.dir * Math.PI / 2, 0);
    return f;
  }

  const shieldMat = color => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFade: { value: 0 }, uAge: { value: 9 },
      uHits: { value: [new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9), new THREE.Vector4(0, 0, 0, -9)] } },
    vertexShader: SHIELD_VERT, fragmentShader: SHIELD_FRAG, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shieldGeo = new THREE.SphereGeometry(1, 64, 40);

  let teams = [];
  const byId = new Map();
  const shipCache = new Map();
  async function syncTeams(list) {
    const sorted = [...(list || [])].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    if (sorted.map(t => t.id).join('|') === teams.map(t => t.id).join('|')) {
      sorted.forEach(t => { const x = byId.get(t.id); if (x) x.name = t.name; });
      return;
    }
    const next = [];
    for (const [i, team] of sorted.entries()) {
      let t = byId.get(team.id);
      if (!t) {
        const spec = SHIPS[i % SHIPS.length];
        const ship = shipCache.get(team.id) || await makeShip(spec);
        shipCache.set(team.id, ship);
        t = createTeam(team, spec, ship, i);
      }
      t.name = team.name; t.index = i; t.base = SLOTS[i % SLOTS.length].clone();
      next.push(t);
    }
    for (const old of teams) if (!next.includes(old)) scene.remove(old.group);
    teams = next;
    byId.clear(); teams.forEach(t => byId.set(t.id, t));
    teams.forEach(t => { if (!t.face) t.face = teams[(t.index + 1) % teams.length] !== t ? teams[(t.index + 1) % teams.length] : null; });
    buildPlates();
  }

  function createTeam(team, spec, ship, i) {
    const group = new THREE.Group();
    group.add(ship.group);
    group.scale.setScalar(SHIP_SCALE);
    const flames = addFlames(ship.group, ship.engines, spec.color);
    const glow = new THREE.PointLight(spec.color, 2.5, 5, 1.6); glow.position.set(0, -0.8, 0); group.add(glow);
    const shield = new THREE.Mesh(shieldGeo, shieldMat(spec.color));
    shield.scale.set(ship.size.x * 0.56, Math.max(ship.size.y * 1.25, 1.05), ship.size.z * 0.62);
    shield.visible = false;
    group.add(shield);
    const base = SLOTS[i % SLOTS.length].clone();
    group.position.copy(base);
    scene.add(group);
    return { id: team.id, name: team.name, spec, ship, group, flames, glow, shieldMesh: shield, base, index: i,
      phase: i * 2.1, off: V(), offV: V(), goal: V(), face: null, nextIdle: 1 + i * 1.4, busyUntil: 0,
      head: new THREE.Quaternion(), bank: 0, spin: 0, vel: V(), last: base.clone(), flash: 0, recoil: 0, recoilAt: 0,
      shield: null, plate: null };
  }

  // ---------- motion ----------
  const UP = V(0, 1, 0), Z = V(0, 0, 1), mtx = new THREE.Matrix4(), qWant = new THREE.Quaternion(), qBank = new THREE.Quaternion(), qInv = new THREE.Quaternion();
  const roll = team => { if (!team.spin) team.spin = TAU; };
  function steer(team, t, dt) {
    if (t >= team.nextIdle && t >= team.busyUntil) {
      const rivals = teams.filter(x => x !== team);
      if (rivals.length) team.face = rivals[Math.floor(Math.random() * rivals.length)];
      team.goal.set(rand(-1.4, 1.4), rand(-0.55, 0.65), rand(-1.6, 1.8));
      if (Math.random() < 0.25) roll(team);
      team.nextIdle = t + rand(4.5, 8.5);
    }
    if (team.busyUntil && t >= team.busyUntil) { team.busyUntil = 0; team.goal.set(0, 0, 0); team.nextIdle = t + rand(1.2, 2.6); }
    // under-damped spring toward the goal: overshoots a little, like a pilot correcting
    tmpA.copy(team.goal).sub(team.off).multiplyScalar(6.5).addScaledVector(team.offV, -3.9);
    team.offV.addScaledVector(tmpA, dt);
    team.off.addScaledVector(team.offV, dt * motion);
    const k = t * motion + team.phase;
    const pos = team.group.position;
    pos.copy(team.base).add(team.off);
    pos.x += 0.28 * Math.sin(k * 0.41) * motion; pos.y += 0.16 * Math.sin(k * 0.57 + 0.7) * motion; pos.z += 0.35 * Math.sin(k * 0.33 + 2.1) * motion;
    if (team.recoilAt && t >= team.recoilAt) { team.recoil = 1; team.recoilAt = 0; }
    team.recoil = Math.max(0, team.recoil - dt * 2.2);
    team.vel.copy(pos).sub(team.last).divideScalar(Math.max(dt, 1e-4)); team.last.copy(pos);

    // heading: turn the nose toward the current rival; bank into the turn; barrel roll on demand
    // aim at the rival but bias toward the camera, so duels read in three-quarter view instead of edge-on
    const target = team.face ? tmpC.copy(team.face.group.position).add(FACE_BIAS) : tmpC.set(0, 0, 10);
    mtx.lookAt(target, pos, UP);
    qWant.setFromRotationMatrix(mtx);
    team.head.slerp(qWant, 1 - Math.exp(-dt * 2.4));
    qInv.copy(team.head).invert();
    tmpA.copy(target).sub(pos).applyQuaternion(qInv);
    const yawErr = Math.atan2(tmpA.x, tmpA.z);
    tmpB.copy(team.vel).applyQuaternion(qInv);
    const bankWant = clamp(-yawErr * 0.85 - tmpB.x * 0.12, -0.95, 0.95) + Math.sin(k * 0.7) * 0.05 * motion;
    team.bank += (bankWant - team.bank) * Math.min(1, dt * 3);
    if (team.spin > 0) team.spin = Math.max(0, team.spin - dt * TAU / 0.95);
    qBank.setFromAxisAngle(Z, team.bank + (team.spin ? TAU - team.spin : 0));
    team.group.quaternion.copy(team.head).multiply(qBank);
    team.group.position.addScaledVector(tmpA.set(0, 0, 1).applyQuaternion(team.head), -team.recoil * 0.35);

    // engine flames stretch with throttle; hull flashes red when hit
    const throttle = 0.6 + clamp(team.offV.length() * 0.3, 0, 0.9) + team.recoil * 0.4;
    team.flames.forEach((f, i) => { f.scale.z = (0.75 + 0.18 * Math.sin(t * 31 + i * 2)) * throttle; });
    team.flash = Math.max(0, team.flash - dt * 2.2);
    const hull = team.ship.mats.hull;
    if (hull && hull.emissive) hull.emissive.setRGB(team.flash * 1.4, team.flash * 0.12, team.flash * 0.1);
    team.glow.intensity = 2.5 + team.recoil * 6 + team.flash * 8;
    emitExhaust(team, throttle);
  }

  function emitExhaust(team, throttle) {
    const back = tmpA.set(0, 0, -1).applyQuaternion(team.group.quaternion);
    const color = new THREE.Color(team.spec.color).multiplyScalar(0.9);
    for (const e of team.ship.engines) {
      if (Math.random() > 0.4 * motion) continue;
      const p = team.ship.group.localToWorld(tmpB.copy(e.pos));
      const sp = rand(2.2, 4.2) * throttle;
      particles.spawn(p, V(back.x * sp + rand(-0.3, 0.3), back.y * sp + rand(-0.3, 0.3), back.z * sp + rand(-0.3, 0.3)).addScaledVector(team.vel, 0.4),
        color, rand(0.12, 0.22) * SHIP_SCALE, rand(0.25, 0.45), 0.4);
    }
  }

  // ---------- combat ----------
  const bolts = [];
  const boltCore = new THREE.CylinderGeometry(0.05, 0.05, 1, 8); boltCore.rotateX(Math.PI / 2);
  const boltGlow = new THREE.CylinderGeometry(0.17, 0.06, 1, 10); boltGlow.rotateX(Math.PI / 2);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(4), toneMapped: false });
  const flashes = [];

  function fireVolley(attacker, victim, task, t) {
    const d = tmpA.copy(victim.base).sub(attacker.base), dist = d.length() || 1;
    d.divideScalar(dist);
    const run = Math.min(3.2, dist * 0.3);
    attacker.face = victim; attacker.busyUntil = t + WINDUP + 1.8;
    attacker.goal.set(d.x * run, d.y * run + 0.35, d.z * run + 0.6);
    if (Math.random() < 0.35) roll(attacker);
    attacker.recoilAt = t + WINDUP;
    victim.face = attacker; victim.busyUntil = Math.max(victim.busyUntil, t + WINDUP + 2);
    victim.goal.set(-d.x * 0.5, 0.2, 0.4);
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(attacker.spec.color).multiplyScalar(3), transparent: true,
      opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(boltCore, coreMat), new THREE.Mesh(boltGlow, glowMat));
      g.visible = false;
      scene.add(g);
      bolts.push({ g, from: attacker, to: victim, task, t0: t + WINDUP + i * 0.1, dur: rand(0.75, 0.95), first: i === 0,
        bend: rand(-1, 1), lift: rand(0.4, 1.4), spread: V(rand(-0.4, 0.4), rand(-0.25, 0.25), rand(-0.4, 0.4)) });
    }
    floatText(attacker, '+1 ATK', attacker.spec.css, t + WINDUP, 0);
  }

  const A = V(), B = V(), C = V(), P = V(), Q = V();
  function boltPath(b, u, out) {
    b.from.ship.group.localToWorld(A.copy(b.from.ship.muzzle));
    B.copy(b.to.group.position).add(b.spread);
    C.copy(A).add(B).multiplyScalar(0.5);
    tmpA.copy(B).sub(A).cross(UP).normalize();
    C.addScaledVector(tmpA, b.bend * 1.4); C.y += b.lift;
    const w = 1 - u;
    return out.set(w * w * A.x + 2 * w * u * C.x + u * u * B.x, w * w * A.y + 2 * w * u * C.y + u * u * B.y, w * w * A.z + 2 * w * u * C.z + u * u * B.z);
  }

  function updateBolts(t) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const u = (t - b.t0) / b.dur;
      if (u < 0) continue;
      if (!b.g.visible) { b.g.visible = true; boltPath(b, 0, P); flash(P, b.from.spec.color, 0.7, 0.2); }
      if (u >= 1) { boltPath(b, 1, P); impact(b, P, t); scene.remove(b.g); bolts.splice(i, 1); continue; }
      const uu = u * 0.85 + ease(u) * 0.15;
      boltPath(b, uu, P); boltPath(b, Math.min(1, uu + 0.02), Q);
      b.g.position.copy(P); b.g.lookAt(Q);
      b.g.scale.set(1, 1, 1.6);
    }
  }

  function flash(pos, color, size, life) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(1.6), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(pos); scene.add(sp);
    flashes.push({ sp, size, life, age: 0, kind: 'flash' });
  }
  function shock(pos, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.position.copy(pos); scene.add(sp);
    flashes.push({ sp, size, life: 0.75, age: 0, kind: 'ring' });
  }
  function updateFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) { scene.remove(f.sp); f.sp.material.dispose(); flashes.splice(i, 1); continue; }
      f.sp.scale.setScalar(f.size * (f.kind === 'ring' ? ease(k) : 0.5 + k * 0.8));
      f.sp.material.opacity = 1 - k;
    }
  }

  let shake = 0;
  function impact(b, pos, t) {
    const victim = b.to, color = new THREE.Color(b.from.spec.color);
    const warm = new THREE.Color(0xffc88a);
    for (let i = 0; i < (b.first ? 70 : 22); i++) {
      const dir = V(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(2, b.first ? 11 : 6));
      particles.spawn(pos, dir, (Math.random() < 0.5 ? color : warm).clone().multiplyScalar(2.5), rand(0.05, 0.14), rand(0.4, 1.0), 0.06);
    }
    flash(pos, b.from.spec.color, b.first ? 2.6 : 1.2, b.first ? 0.45 : 0.25);
    if (b.first) shock(pos, 5.5);
    victim.flash = Math.min(1, victim.flash + (b.first ? 1 : 0.35));
    if (victim.shield) {
      const local = victim.shieldMesh.worldToLocal(pos.clone()).normalize();
      const slot = victim.shield.hits++ % 4;
      victim.shieldMesh.material.uniforms.uHits.value[slot].set(local.x, local.y, local.z, t - victim.shield.t0);
    }
    const push = tmpA.copy(pos).sub(b.from.group.position).normalize();
    victim.offV.addScaledVector(push, b.first ? 4.5 : 1.5);
    if (b.first) {
      shake = Math.max(shake, 0.35 * motion);
      const side = Math.random() < 0.5 ? -1 : 1;
      victim.goal.set(-push.z * 1.3 * side, 0.6 * side, push.x * 0.8 + 0.5);
      if (Math.random() < 0.5) roll(victim);
      floatText(victim, '−1 DEF', '#ff5d6c', t, 0);
      floatText(victim, TASK_LABEL[b.task] || String(b.task).toUpperCase(), '#ffd0d6', t + 0.05, 1);
    }
  }

  function raiseShield(team, n, t, label) {
    team.shield = { t0: t, dur: 5.5 + n * 0.9, hits: 0 };
    team.shieldMesh.visible = true;
    team.shieldMesh.material.uniforms.uHits.value.forEach(h => h.set(0, 0, 0, -9));
    team.goal.set(0, 0.25, 1.4); team.busyUntil = t + 2.4;   // brace forward behind the shield
    floatText(team, label || 'SHIELD UP', team.spec.css, t, 0);
  }
  function updateShield(team, t) {
    const sh = team.shield;
    if (!sh) return;
    const age = t - sh.t0;
    if (age > sh.dur) { team.shield = null; team.shieldMesh.visible = false; return; }
    const u = team.shieldMesh.material.uniforms;
    u.uTime.value = t; u.uAge.value = age;
    u.uFade.value = clamp(age / 0.35, 0, 1) * clamp((sh.dur - age) / 1.2, 0, 1);
    const grow = 0.6 + 0.4 * ease(clamp(age / 0.5, 0, 1));
    const s = team.ship.size;
    team.shieldMesh.scale.set(s.x * 0.56 * grow, Math.max(s.y * 1.25, 1.05) * grow, s.z * 0.62 * grow);
  }

  // ---------- HUD: rank plates, floating text, battle log ----------
  const floats = document.createElement('div');
  floats.className = 'hud-floats';
  hud.appendChild(floats);
  const texts = [];
  function floatText(team, value, color, t, line) {
    const el = document.createElement('div');
    el.className = 'float-text' + (line ? ' float-sub' : '');
    el.textContent = value;
    el.style.color = color;
    el.hidden = true;
    floats.appendChild(el);
    texts.push({ el, team, t0: t, line, dx: rand(-12, 12) });
  }
  const proj = V();
  function toScreen(v) {
    proj.copy(v).project(camera);
    return { x: (proj.x + 1) / 2 * section.clientWidth, y: (1 - proj.y) / 2 * section.clientHeight, behind: proj.z > 1 };
  }
  function updateTexts(t) {
    for (let i = texts.length - 1; i >= 0; i--) {
      const x = texts[i], age = t - x.t0;
      if (age < 0) continue;
      if (age > 1.9) { x.el.remove(); texts.splice(i, 1); continue; }
      if (x.el.hidden) { x.el.hidden = false; x.el.style.animationDuration = (1.9 / timeScale) + 's'; }
      const s = toScreen(tmpA.copy(x.team.group.position).add(tmpB.set(0, 0.5, 0)));
      x.el.style.transform = `translate3d(${(s.x + x.dx).toFixed(1)}px,${(s.y + x.line * 24).toFixed(1)}px,0) translate(-50%,-50%)`;
    }
  }

  function buildPlates() {
    platesHost.replaceChildren();
    for (const team of teams) {
      const el = document.createElement('div');
      el.className = 'plate';
      el.style.setProperty('--c', team.spec.css);
      const c = new THREE.Color(team.spec.color);
      el.style.setProperty('--rgb', `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`);
      el.innerHTML = `<span class="plate-rank"><img class="plate-crown" src="${ASSET('crown.png')}" alt=""><span class="plate-pos">#-</span></span><b class="plate-name"></b><span class="plate-shield" aria-hidden="true">⬡</span>`;
      el.querySelector('.plate-name').textContent = team.name;
      team.plate = el;
      platesHost.appendChild(el);
    }
    if (snapshot) updatePlates();
  }
  function updatePlates() {
    const scores = snapshot.scores || [];
    for (const team of teams) {
      const el = team.plate;
      if (!el) continue;
      const rank = scores.findIndex(r => r.team_id === team.id);
      const row = scores[rank] || { total: 0 };
      el.querySelector('.plate-name').textContent = team.name;
      const pos = rank >= 0 ? `#${rank + 1}` : '#-';
      const label = el.querySelector('.plate-pos');
      if (label.textContent !== pos) { label.textContent = pos; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.classList.toggle('leader', rank === 0 && row.total > 0);
    }
  }
  const roundChip = section.querySelector('.hud-round');
  function placePlates() {
    const base = section.getBoundingClientRect(), r = roundChip ? roundChip.getBoundingClientRect() : null;
    for (const team of teams) {
      if (!team.plate) continue;
      const lift = Math.max(team.ship.size.y * 0.9, 0.75) * SHIP_SCALE;
      let s = toScreen(tmpA.copy(team.group.position).add(tmpB.set(0, lift + 0.3, 0)));
      const pw = team.plate.offsetWidth || 120;
      if (r && s.x + pw / 2 > r.left - base.left && s.x - pw / 2 < r.right - base.left && s.y - 30 < r.bottom - base.top + 8) {
        s = toScreen(tmpA.copy(team.group.position).add(tmpB.set(0, -lift - 0.9, 0)));
      }
      team.plate.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) translate(-50%,-100%)`;
      team.plate.classList.toggle('shielded', !!team.shield);
    }
  }

  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const chip = team => `<b data-c="${team.spec.css}">${esc(team.name)}</b>`;
  function feed(html, kind) {
    const row = document.createElement('div');
    row.className = 'feed-row feed-' + kind;
    row.innerHTML = html;
    row.querySelectorAll('[data-c]').forEach(el => { el.style.color = el.dataset.c; });   // CSP chặn thuộc tính style trong HTML
    feedHost.prepend(row);
    while (feedHost.children.length > 2) feedHost.lastChild.remove();
  }

  // ---------- events ----------
  const queue = [];
  let snapshot = null, lastCapture = null, lastDefense = null, nextEventAt = 0, clock = 0;
  async function ingest(state) {
    snapshot = state;
    await syncTeams(state.teams || []);
    updatePlates();
    const captures = [...(state.captures || [])].sort((a, b) => a.id - b.id);
    const defenses = [...(state.defenses || [])].sort((a, b) => a.id - b.id);
    const maxCap = captures.length ? captures[captures.length - 1].id : 0;
    const maxDef = defenses.length ? defenses[defenses.length - 1].id : 0;
    if (lastCapture === null || maxCap < lastCapture) lastCapture = maxCap;      // first load or reset: baseline only
    if (lastDefense === null || maxDef < lastDefense) lastDefense = maxDef;
    for (const c of captures) if (c.id > lastCapture) queue.push({ type: 'attack', attacker: c.attacker_id, victim: c.victim_id, task: c.task, tick: c.tick });
    lastCapture = Math.max(lastCapture, maxCap);
    // while the checker walks the services, awards trickle in one by one: wait so each team gets a single shield
    if (state.game?.phase === 'checking' && lastDefense !== maxDef) return;
    const groups = new Map();
    for (const d of defenses) {
      if (d.id <= lastDefense) continue;
      const k = d.team_id + ':' + d.tick;
      if (!groups.has(k)) groups.set(k, { type: 'shield', team: d.team_id, tick: d.tick, tasks: [], note: d.note, float: d.float });
      groups.get(k).tasks.push(d.task);
    }
    queue.push(...groups.values());
    lastDefense = Math.max(lastDefense, maxDef);
  }
  function runEvent(ev, t) {
    if (ev.type === 'attack') {
      const a = byId.get(ev.attacker), v = byId.get(ev.victim);
      if (!a || !v || a === v) return;
      fireVolley(a, v, ev.task, t);
      feed(`<span class="feed-icon">⚔</span>${chip(a)} <span class="feed-dim">bắn hạ flag</span> ${esc(TASK_LABEL[ev.task] || ev.task)} <span class="feed-dim">của</span> ${chip(v)}<span class="feed-pts"><em class="up">+1</em><em class="down">−1</em></span>${ev.sim ? '<span class="feed-sim">SIM</span>' : ''}`, 'attack');
    } else if (ev.type === 'shield') {
      const team = byId.get(ev.team);
      if (!team) return;
      raiseShield(team, ev.tasks.length, t, ev.float);
      feed(`<span class="feed-icon">⬡</span>${chip(team)} <span class="feed-dim">${esc(ev.note || 'phòng thủ')} · tick</span> ${esc(ev.tick)}${ev.sim ? '<span class="feed-sim">SIM</span>' : ''}`, 'shield');
    }
  }
  function simulate() {
    if (teams.length < 2) return;
    const tasks = Object.keys(TASK_LABEL), pick = arr => arr[Math.floor(Math.random() * arr.length)];
    if (Math.random() < 0.62) {
      const a = pick(teams), v = pick(teams.filter(x => x !== a));
      queue.push({ type: 'attack', attacker: a.id, victim: v.id, task: pick(tasks), tick: snapshot?.game?.tick || 0, sim: true });
    } else {
      queue.push({ type: 'shield', team: pick(teams).id, tick: snapshot?.game?.tick || 0, tasks: tasks.slice(0, 1 + Math.floor(Math.random() * 3)), sim: true });
    }
  }
  if (params.get('fx') === 'auto') setInterval(() => { if (!document.hidden) simulate(); }, 2600);
  let chain = Promise.resolve();   // ship models load asynchronously: apply states strictly in order
  document.addEventListener('crypto-range:state', e => { chain = chain.then(() => ingest(e.detail)).catch(console.error); });

  // ---------- camera & loop ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  section.addEventListener('pointermove', e => {
    const r = section.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  section.addEventListener('pointerleave', () => { mouse.tx = 0; mouse.ty = 0; });

  await syncTeams([{ id: 'team1', name: 'Team 01' }, { id: 'team2', name: 'Team 02' }, { id: 'team3', name: 'Team 03' }]);
  if (window.cryptoRangeState) await ingest(window.cryptoRangeState);
  new ResizeObserver(resize).observe(section);
  resize();

  // Adaptive quality: a sustained 24–120 ms frame time means the GPU is struggling (longer gaps are a throttled
  // background tab, not load). Step down pixel ratio, then bloom, at most once every few seconds.
  let ema = 16, slowFor = 0, level = 0;
  function adapt(ms) {
    ema += (ms - ema) * 0.05;
    if (document.hidden || level >= 2) return;
    slowFor = ema > 24 && ema < 120 ? slowFor + ms : 0;
    if (slowFor < 4000) return;
    level++; slowFor = 0;
    if (level === 1) { renderer.setPixelRatio(1); resize(); }
    else bloom.strength *= 0.6, bloom.enabled = false;
    console.info('crypto-arena: lowered render quality to level', level);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(dtMax, (now - last) / 1000) * timeScale;
    adapt(now - last);
    last = now;
    clock += dt;
    const t = clock;
    mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2); mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2);
    shake *= Math.pow(0.03, dt);
    camera.position.set(CAM.x + (Math.sin(t * 0.07) * 1.1 + mouse.x * 0.9) * motion + rand(-shake, shake),
      CAM.y + (Math.sin(t * 0.05 + 1) * 0.4 - mouse.y * 0.45) * motion + rand(-shake, shake), CAM.z + Math.sin(t * 0.04) * 0.6 * motion);
    camera.lookAt(LOOK);

    if (queue.length && t >= nextEventAt) {
      const ev = queue.shift();
      runEvent(ev, t);
      nextEventAt = t + (ev.type === 'attack' ? 1.1 : 0.5);
    }
    updateWarp(dt);
    for (const d of dust) { d.position.x += d.userData.vx * dt; if (d.position.x > 34) d.position.x = -34; if (d.position.x < -34) d.position.x = 34; }
    for (const f of fleet) {
      f.g.position.x += f.dir * f.speed * dt * motion;
      f.g.position.y += Math.sin(t * 0.8 + f.bob) * 0.004;
      f.g.rotation.z = Math.sin(t * 0.6 + f.bob) * 0.12;
      if (Math.abs(f.g.position.x) > 50) respawnFleet(f, false);
    }
    for (const team of teams) { steer(team, t, dt); updateShield(team, t); }
    updateBolts(t);
    updateFlashes(dt);
    particles.update(dt);
    composer.render();
    placePlates();
    updateTexts(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // bench(n): average milliseconds to render one frame (GPU synced), independent of the display's frame rate
  const bench = (n = 30) => { const gl = renderer.getContext(), px = new Uint8Array(4); composer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now(); for (let i = 0; i < n; i++) { for (const team of teams) steer(team, clock, 1 / 60); particles.update(1 / 60); composer.render(); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (performance.now() - t0) / n; };
  window.cryptoArena = { mode: '3d', simulate, queue, scene, camera, CAM, LOOK, bench, renderer, composer, bloom, resize, teams: () => teams };
}

// ---------- helpers ----------
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeParticles(max) {
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), alpha = new Float32Array(max), size = new Float32Array(max);
  const vel = new Float32Array(max * 3), life = new Float32Array(max).fill(1), span = new Float32Array(max).fill(1), drag = new Float32Array(max), base = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale;
      varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  let cursor = 0;
  return {
    points, material,
    spawn(p, v, color, s, l, d = 1) {
      const i = cursor; cursor = (cursor + 1) % max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
      col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b;
      size[i] = base[i] = s; life[i] = 0; span[i] = l; drag[i] = d;
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        if (life[i] >= span[i]) { alpha[i] = 0; continue; }
        life[i] += dt;
        const k = Math.min(1, life[i] / span[i]), f = Math.pow(drag[i], dt);
        vel[i * 3] *= f; vel[i * 3 + 1] *= f; vel[i * 3 + 2] *= f;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = 1 - k; size[i] = base[i] * (1 + k * 1.5);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aColor.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    },
  };
}

const SHIELD_VERT = `
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  void main(){
    vL = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }`;
const SHIELD_FRAG = `
  uniform vec3 uColor; uniform float uTime; uniform float uFade; uniform float uAge; uniform vec4 uHits[4];
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.732))), p.x); }
  float hexEdge(vec2 uv){
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(uv, r) - h, b = mod(uv - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    return smoothstep(0.40, 0.49, hexDist(gv));
  }
  void main(){
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
    vec2 uv = vec2(atan(vL.z, vL.x) * 3.2, vL.y * 5.5);
    float lattice = hexEdge(uv + vec2(uTime * 0.06, 0.0));
    float scan = exp(-pow((vL.y - (fract(uTime * 0.45) * 2.6 - 1.3)) * 7.0, 2.0));
    float ripple = exp(-pow((vL.y + 1.0 - uAge * 2.4) * 4.0, 2.0)) * step(uAge, 1.2);   // activation sweep
    float hit = 0.0;
    for (int i = 0; i < 4; i++) {
      float age = uAge - uHits[i].w;
      if (age < 0.0 || age > 1.0) continue;
      float d = distance(vL, uHits[i].xyz);
      hit += (exp(-pow((d - age * 2.2) * 9.0, 2.0)) + exp(-d * 9.0) * 1.5) * (1.0 - age);
    }
    float a = (fres * 1.3 + lattice * (0.32 + fres * 0.8) + scan * 0.35 + ripple * 0.9 + hit) * uFade;
    gl_FragColor = vec4(uColor * (2.0 + hit * 2.5), clamp(a, 0.0, 1.0));
  }`;
