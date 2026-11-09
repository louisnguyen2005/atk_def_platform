/* Procedural starships for the 3D arena, modelled after the three reference images.
 * Every ship faces +Z, is centred on the origin, ~2.6 units long, and reports its muzzle and engine nozzles
 * so the arena can attach exhaust, muzzle flashes and recoil. A .glb listed in models/manifest.json can
 * replace any of them (see loadModelShip). */
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- shared textures ----------
let panelTex = null;
function panelTexture() {
  if (panelTex) return panelTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#a7adb8'; g.fillRect(0, 0, 512, 512);
  // hull plating: random panels with seams and a little grime
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    const w = 24 + rnd() * 120, h = 16 + rnd() * 70, x = rnd() * 512, y = rnd() * 512;
    const v = 150 + rnd() * 50 | 0;
    g.fillStyle = `rgb(${v},${v + 3},${v + 10})`; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(40,44,56,.55)'; g.lineWidth = 1.2; g.strokeRect(x + .5, y + .5, w, h);
  }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(30,34,46,${rnd() * .5})`; g.fillRect(rnd() * 512, rnd() * 512, 2, 2); }
  panelTex = new THREE.CanvasTexture(c);
  panelTex.wrapS = panelTex.wrapT = THREE.RepeatWrapping;
  panelTex.colorSpace = THREE.SRGBColorSpace;
  panelTex.anisotropy = 4;
  return panelTex;
}

function materials(accent, opts = {}) {
  const hull = new THREE.MeshStandardMaterial({ color: opts.hull ?? 0xc3c8d2, map: panelTexture(), metalness: 0.82,
    roughness: opts.rough ?? 0.34, envMapIntensity: opts.env ?? 1.0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x262c3a, metalness: 0.75, roughness: 0.42, envMapIntensity: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: opts.trim ?? 0x2a3550, metalness: 0.6, roughness: 0.35, envMapIntensity: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: opts.glass ?? 0x1d6fb8, metalness: 0.2, roughness: 0.04, clearcoat: 1,
    clearcoatRoughness: 0.12, envMapIntensity: 1.0, emissive: new THREE.Color(opts.glass ?? 0x1d6fb8).multiplyScalar(0.35) });
  // neon is pushed well above 1.0 so the bloom pass picks it up
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.7), toneMapped: false });
  const hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color(0xffffff), 0.55).multiplyScalar(1.5), toneMapped: false });
  return { hull, dark, trim, glass, neon, hot };
}

// ---------- geometry helpers ----------
/** Flat plate from (x, z) outline points, `t` thick, lying in the XZ plane. */
function plate(points, t, mat, bevel = 0.015) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -t / 2, 0);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
const mirrorX = pts => pts.map(([x, z]) => [-x, z]).reverse();
/** Vertical fin from (z, y) outline points. */
function fin(points, t, mat) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(t / 2, 0, 0);
  return new THREE.Mesh(geo, mat);
}
/** Glowing bar between two points. */
function strip(a, b, w, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.55, len), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.lookAt(b);
  return m;
}
/** Cylinder whose axis runs along Z. */
function tube(r1, r2, len, mat, seg = 18) {
  const geo = new THREE.CylinderGeometry(r1, r2, len, seg);
  geo.rotateX(Math.PI / 2);   // +Y axis -> +Z
  return new THREE.Mesh(geo, mat);
}
function ring(r, t, mat) {
  return new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 40), mat);
}
function nozzle(group, m, pos, r, engines) {
  const rim = ring(r, r * 0.16, m.neon); rim.position.copy(pos); group.add(rim);
  const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 28), m.hot);
  core.position.copy(pos).add(V(0, 0, -0.005)); core.rotation.y = Math.PI; group.add(core);
  engines.push({ pos: pos.clone().add(V(0, 0, -0.02)), radius: r });
}
const add = (g, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };

// ---------- RAPTOR: sharp delta fighter, blue neon (reference 2) ----------
function raptor(accent) {
  const m = materials(accent, { hull: 0xc9ced8, trim: 0x2b3448, glass: 0x2a9cff });
  const g = new THREE.Group(), engines = [];
  const body = tube(0.3, 0.36, 1.35, m.hull, 6); body.scale.set(1, 0.58, 1); add(g, body, 0, 0, -0.25);
  const noseGeo = new THREE.ConeGeometry(0.3, 1.55, 6); noseGeo.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, m.hull); nose.scale.set(1, 0.58, 1); add(g, nose, 0, 0, 1.2);
  const tailGeo = new THREE.ConeGeometry(0.36, 0.45, 6); tailGeo.rotateX(-Math.PI / 2);
  const tail = new THREE.Mesh(tailGeo, m.dark); tail.scale.set(1, 0.58, 1); add(g, tail, 0, 0, -1.15);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), m.glass); canopy.scale.set(0.85, 0.62, 2.3); add(g, canopy, 0, 0.15, 0.5);
  const wing = [[0.22, 0.55], [1.55, -0.5], [1.64, -0.82], [0.28, -1.0]];
  add(g, plate(wing, 0.05, m.hull)); add(g, plate(mirrorX(wing), 0.05, m.hull));
  const canard = [[0.2, 1.02], [0.62, 0.74], [0.64, 0.62], [0.22, 0.72]];
  add(g, plate(canard, 0.03, m.trim)); add(g, plate(mirrorX(canard), 0.03, m.trim));
  for (const s of [-1, 1]) {
    const pod = tube(0.05, 0.06, 0.6, m.dark, 10); add(g, pod, s * 1.6, 0, -0.62);
    const ant = tube(0.008, 0.008, 0.62, m.dark, 5); add(g, ant, s * 1.6, 0.03, -0.02);
    add(g, strip(V(s * 1.6, 0.03, 0.29), V(s * 1.6, 0.03, 0.33), 0.03, m.hot));
    const nac = tube(0.15, 0.17, 0.95, m.hull, 16); add(g, nac, s * 0.42, 0.13, -0.72);
    const intake = ring(0.14, 0.025, m.neon); add(g, intake, s * 0.42, 0.13, -0.24);
    nozzle(g, m, V(s * 0.42, 0.13, -1.2), 0.13, engines);
    const f = fin([[-0.45, 0], [-1.08, 0], [-1.2, 0.62], [-1.0, 0.62]], 0.035, m.trim); f.position.set(s * 0.26, 0.12, 0); f.rotation.z = -s * 0.22; g.add(f);
    add(g, strip(V(s * 0.27, 0.13, -0.47), V(s * 0.39, 0.72, -1.0), 0.022, m.neon));
    // neon edge lines along the leading edge and fuselage
    add(g, strip(V(s * 0.25, 0.035, 0.5), V(s * 1.52, 0.035, -0.46), 0.024, m.neon));
    add(g, strip(V(s * 0.3, 0.03, -0.98), V(s * 1.6, 0.03, -0.8), 0.018, m.neon));
    add(g, strip(V(s * 0.26, 0.02, 1.0), V(s * 0.3, 0.02, -0.9), 0.02, m.neon));
  }
  return { group: g, mats: m, engines, muzzle: V(0, 0, 1.98), size: V(3.3, 0.9, 3.0) };
}

// ---------- EMBER: armoured saucer, orange engines, maroon trim (reference 3) ----------
function saucer(accent) {
  const m = materials(accent, { hull: 0xb9bcc4, trim: 0x6a1f24, glass: 0x2b3a55, rough: 0.38 });
  const g = new THREE.Group(), engines = [];
  const profile = [[0, 0.17], [0.55, 0.16], [0.98, 0.11], [1.2, 0.04], [1.26, -0.01], [1.18, -0.07], [0.8, -0.11], [0, -0.12]].map(([r, y]) => new THREE.Vector2(r, y));
  const disc = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), m.hull); add(g, disc, 0, 0, 0.42);
  const band = ring(1.235, 0.05, m.trim); band.rotation.x = Math.PI / 2; add(g, band, 0, 0.0, 0.42);
  const lamp = ring(1.27, 0.012, m.neon); lamp.rotation.x = Math.PI / 2; add(g, lamp, 0, -0.035, 0.42);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
  dome.scale.set(1, 0.6, 1.3); add(g, dome, 0, 0.14, 0.18);
  const spine = tube(0.46, 0.58, 1.25, m.hull, 12); spine.scale.set(1, 0.42, 1); add(g, spine, 0, 0.02, -0.55);
  const deck = plate([[0.55, -0.05], [0.7, -1.05], [-0.7, -1.05], [-0.55, -0.05]], 0.07, m.trim); add(g, deck, 0, 0.13, 0);
  const pods = [[-0.64, -0.03, -0.95, 0.19], [0.64, -0.03, -0.95, 0.19], [0, 0.33, -0.85, 0.15]];
  for (const [x, y, z, r] of pods) {
    add(g, tube(r * 0.9, r, 1.15, m.hull, 18), x, y, z);
    const b = ring(r * 1.02, 0.03, m.trim); add(g, b, x, y, z + 0.25);
    const b2 = ring(r * 1.02, 0.03, m.trim); add(g, b2, x, y, z - 0.3);
    nozzle(g, m, V(x, y, z - 0.58), r * 0.86, engines);
  }
  // running lights / windows along the rim
  for (let i = -6; i <= 6; i++) {
    const a = i * 0.13, r = 1.02;
    add(g, new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.025), m.hot), Math.sin(a) * r, 0.085, 0.42 + Math.cos(a) * r).rotation.y = a;
  }
  add(g, strip(V(-0.45, 0.17, -0.2), V(-0.58, 0.17, -1.0), 0.02, m.neon));
  add(g, strip(V(0.45, 0.17, -0.2), V(0.58, 0.17, -1.0), 0.02, m.neon));
  return { group: g, mats: m, engines, muzzle: V(0, 0, 1.72), size: V(2.6, 0.8, 3.0) };
}

// ---------- MANTA: smooth flying-wing drone, twin ring engines (reference 4) ----------
function manta(accent) {
  // a mirror-smooth shell reflects the bright warp core and blooms into a blocky halo, so keep it satin
  const m = materials(accent, { hull: 0xd0d4dc, trim: 0x1c2238, glass: 0x2448c8, rough: 0.4, env: 0.7 });
  m.hull.map = null; m.hull.needsUpdate = true;   // glossy, seamless shell like the reference
  const g = new THREE.Group(), engines = [];
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 28), m.hull); body.scale.set(0.78, 0.5, 2.05); add(g, body, 0, 0.05, 0.08);
  const wing = [[0.28, 0.45], [1.62, -0.55], [1.56, -0.86], [0.32, -0.92]];
  const wl = plate(wing, 0.07, m.hull, 0.04); wl.rotation.z = 0.06; g.add(wl);
  const wr = plate(mirrorX(wing), 0.07, m.hull, 0.04); wr.rotation.z = -0.06; g.add(wr);
  for (const s of [-1, 1]) {
    add(g, strip(V(s * 0.3, 0.05, 0.42), V(s * 1.58, 0.11, -0.53), 0.022, m.neon));
    const pod = tube(0.19, 0.21, 0.6, m.hull, 24); add(g, pod, s * 0.32, -0.02, -0.78);
    const r1 = ring(0.2, 0.035, m.trim); add(g, r1, s * 0.32, -0.02, -1.04);
    nozzle(g, m, V(s * 0.32, -0.02, -1.1), 0.16, engines);
    const dorsal = fin([[-0.4, 0], [-0.8, 0], [-0.72, 0.28], [-0.55, 0.28]], 0.03, m.trim); dorsal.position.set(s * 0.28, 0.16, 0); dorsal.rotation.z = -s * 0.35; g.add(dorsal);
    const curve = new THREE.CatmullRomCurve3([V(s * 0.3, 0.16, 0.75), V(s * 0.39, 0.15, 0.1), V(s * 0.35, 0.12, -0.55)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 6), m.neon));
    for (let i = 0; i < 5; i++) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.012), m.neon), s * 0.39, 0.06, 0.28 - i * 0.05);
  }
  const keel = fin([[-0.25, 0], [-0.78, 0], [-0.68, -0.62], [-0.52, -0.62]], 0.03, m.trim); keel.position.y = -0.14; g.add(keel);
  const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.1), m.dark); add(g, sensor, 0, -0.02, -1.02);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 16), m.glass); lens.rotation.y = Math.PI; add(g, lens, 0, -0.02, -1.075);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), m.glass); cockpit.scale.set(0.9, 0.45, 1.6); add(g, cockpit, 0, 0.24, 0.45);
  return { group: g, mats: m, engines, muzzle: V(0, 0.05, 1.12), size: V(3.3, 0.8, 2.3) };
}

const BUILDERS = { raptor, saucer, manta };

/** Merge every part that shares a material into one mesh: ~60 parts become ~6 draw calls per ship. */
function bake(group) {
  const byMat = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    let geo = child.geometry.clone().applyMatrix4(child.matrix);
    if (geo.index) geo = geo.toNonIndexed();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!byMat.has(child.material)) byMat.set(child.material, []);
    byMat.get(child.material).push(geo);
    group.remove(child);
  }
  for (const [material, geos] of byMat) group.add(new THREE.Mesh(mergeGeometries(geos, false), material));
}

export function buildShip(key, accent) {
  const ship = BUILDERS[key](accent);
  bake(ship.group);
  ship.key = key;
  return ship;
}

/** A cheap copy for the distant fleet: shares geometry and materials with the hero ship. */
export function cloneShip(ship) {
  return ship.group.clone(true);
}

/** Replace a procedural ship by a glTF model: normalised to the same length, centred, nose on +Z. */
export async function loadModelShip(GLTFLoader, url, fallback) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const k = fallback.size.z / Math.max(size.z, 1e-3);
  root.position.sub(centre.multiplyScalar(k));
  root.scale.setScalar(k);
  const g = new THREE.Group();
  g.add(root);
  root.traverse(o => { if (o.isMesh && o.material) o.material.envMapIntensity = 1.3; });
  return { ...fallback, group: g, mats: fallback.mats, size: size.multiplyScalar(k) };
}
