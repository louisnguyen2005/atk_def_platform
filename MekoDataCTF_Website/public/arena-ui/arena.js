/* MekoDataCTF Crypto Range — 3D battle arena.
 * Renders one starship per team over a deep-space backdrop. New captures fire plasma volleys from the attacker
 * to the victim; defense awards (flag kept through the round) raise a hex shield around the defender.
 * Listens to the `crypto-range:state` event dispatched by dashboard.js; no extra network requests. */
(() => {
  'use strict';
  const section = document.getElementById('arena');
  const canvas = document.getElementById('arena-canvas');
  if (!section || !canvas) return;
  const ctx = canvas.getContext('2d');
  const platesHost = document.getElementById('hud-plates');
  const feedHost = document.getElementById('hud-feed');
  const fxButton = document.getElementById('fx-demo');
  const params = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = reduced ? 0.35 : 1;
  const timeScale = Math.min(3, Math.max(0.05, Number(params.get('timescale')) || 1));   // debugging aid: ?timescale=0.2
  const ASSET = name => '/arena-ui/assets/' + name;
  const TASK_LABEL = { idor: 'IDOR', sqli: 'SQLI', upload: 'UPLOAD', jwt: 'JWT', backup: 'BACKUP' };
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  // Team slots follow the composition of the backdrop: one ship left, one right, one high in the distance.
  // Sprite anchors are normalised [0..1] image coordinates: nose (muzzle), engines and exhaust direction.
  const SHIPS = [
    { key: 'raptor', src: 'ship-raptor.png', call: 'RAPTOR', color: '#46d6ff', rgb: '70,214,255', size: 2.55,
      slot: [0.785, 0.6, 6.4], nose: [0.04, 0.86], engines: [[0.58, 0.25], [0.74, 0.43], [0.53, 0.72]], exhaust: [0.86, -0.5], phase: 0, maxTurn: 0.75 },
    { key: 'saucer', src: 'ship-saucer.png', call: 'EMBER', color: '#ff8a3d', rgb: '255,138,61', size: 2.75,
      slot: [0.215, 0.6, 6.4], nose: [0.97, 0.6], engines: [[0.15, 0.36], [0.27, 0.83], [0.34, 0.12]], exhaust: [-1, 0.08], phase: 2.1, maxTurn: 0.65 },
    { key: 'manta', src: 'ship-manta.png', call: 'MANTA', color: '#a98bff', rgb: '169,139,255', size: 2.6,
      slot: [0.5, 0.43, 9.6], nose: [0.86, 0.14], engines: [[0.115, 0.63], [0.25, 0.745]], exhaust: [-0.42, 0.62], phase: 4.4, maxTurn: 1.2, restTurn: 0.85 },
  ];
  // Phones: stack the three ships diagonally so each keeps a readable size and its own plate.
  const MOBILE_SLOTS = [[0.7, 0.75, 6.4], [0.3, 0.6, 6.4], [0.55, 0.42, 9.6]];
  let narrow = false;
  const EXTRA_SLOTS = [[0.33, 0.27, 12], [0.67, 0.27, 12], [0.12, 0.33, 11], [0.88, 0.33, 11], [0.5, 0.72, 5.6], [0.36, 0.5, 9], [0.64, 0.5, 9]];

  const images = {};
  function load(name) {
    const img = new Image();
    img.decoding = 'async';
    img.src = ASSET(name);
    images[name] = img;
    return img;
  }
  load('space-bg.webp');
  SHIPS.forEach(s => load(s.src));
  const ready = img => img && img.complete && img.naturalWidth > 0;

  // ---------- canvas & camera ----------
  let W = 0, H = 0, DPR = 1, F = 600, unit = 1;
  const cam = { yaw: 0, pitch: 0, mx: 0, my: 0, shake: 0, sx: 0, sy: 0 };
  function resize() {
    const rect = section.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width); H = Math.max(360, rect.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    narrow = W < 700;
    F = narrow ? W * 1.05 : Math.min(H * 0.95, W * 0.62);
    unit = narrow ? 0.72 : clamp(W / 1250, 0.52, 1.15);
  }
  new ResizeObserver(resize).observe(section);
  resize();
  section.addEventListener('pointermove', e => {
    const r = section.getBoundingClientRect();
    cam.mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    cam.my = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  section.addEventListener('pointerleave', () => { cam.mx = 0; cam.my = 0; });

  const PIVOT = 8;
  function project(x, y, z) {
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const zc = z - PIVOT;
    const x1 = x * cy - zc * sy; let z1 = x * sy + zc * cy;
    const y1 = y * cp - z1 * sp; z1 = y * sp + z1 * cp + PIVOT;
    const s = F / Math.max(0.5, z1);
    return { x: W / 2 + x1 * s + cam.sx, y: H / 2 + y1 * s + cam.sy, s, z: z1 };
  }
  const worldFromSlot = (fx, fy, z) => [(fx - 0.5) * W * z / F, (fy - 0.5) * H * z / F, z];

  // ---------- environment: warp stars, distant fleet, foreground dust ----------
  const stars = Array.from({ length: 240 }, () => newStar(true));
  function newStar(initial) {
    const a = rand(0, TAU), r = Math.pow(Math.random(), 0.6);
    return { a, r: r * 1.4 + 0.02, z: initial ? rand(0.05, 1) : 1, speed: rand(0.05, 0.16), hue: Math.random() < 0.25 ? 'violet' : 'white' };
  }
  const fleet = Array.from({ length: 11 }, (_, i) => newFleet(i, true));
  function newFleet(i, initial) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const ship = dir < 0 ? SHIPS[0] : SHIPS[1];
    return { ship, dir, z: rand(16, 34), fy: rand(0.12, 0.46), fx: initial ? rand(-0.1, 1.1) : (dir > 0 ? -0.15 : 1.15),
      speed: rand(0.008, 0.02), bob: rand(0, TAU), trail: [] };
  }
  const dust = Array.from({ length: 22 }, () => ({ x: rand(0, 1), y: rand(0, 1), r: rand(40, 160), a: rand(0.025, 0.08),
    vx: rand(-0.004, 0.004), depth: rand(0.4, 1), hue: Math.random() < 0.5 ? '118,92,255' : '64,150,255' }));

  let bgRect = { x: 0, y: 0, w: 0, h: 0 };
  function drawBackground(t) {
    const img = images['space-bg.webp'];
    ctx.fillStyle = '#05071a';
    ctx.fillRect(0, 0, W, H);
    if (!ready(img)) return;
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight) * (1.13 + 0.015 * Math.sin(t * 0.05));
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    const x = (W - w) / 2 - cam.yaw * W * 0.55 + cam.sx * 0.3;
    const y = (H - h) / 2 - cam.pitch * H * 0.55 + cam.sy * 0.3;
    bgRect = { x, y, w, h };
    ctx.drawImage(img, x, y, w, h);
  }

  function drawWarp(dt, t) {
    // Streaks radiate from the bright core of the backdrop, which acts as the vanishing point.
    const vx = bgRect.x + bgRect.w * 0.51, vy = bgRect.y + bgRect.h * 0.19;
    const reach = Math.hypot(W, H) * 0.55;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const z0 = s.z;
      s.z -= s.speed * dt * motion;
      if (s.z <= 0.03) { stars[i] = newStar(false); continue; }
      const d0 = s.r / z0 * reach * 0.12, d1 = s.r / s.z * reach * 0.12;
      const ca = Math.cos(s.a), sa = Math.sin(s.a) * 0.72;
      const x0 = vx + ca * d0, y0 = vy + sa * d0, x1 = vx + ca * d1, y1 = vy + sa * d1;
      if (x1 < -50 || x1 > W + 50 || y1 < -50 || y1 > H + 50) { stars[i] = newStar(false); continue; }
      const near = clamp(1 - s.z, 0, 1);
      ctx.strokeStyle = s.hue === 'violet' ? `rgba(190,160,255,${0.15 + near * 0.6})` : `rgba(220,235,255,${0.12 + near * 0.7})`;
      ctx.lineWidth = 0.4 + near * 2.1;
      const stretch = 1 + near * 4;
      ctx.beginPath(); ctx.moveTo(x1 - (x1 - x0) * stretch, y1 - (y1 - y0) * stretch); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // Soft pulse of the warp core.
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, 220 * unit);
    g.addColorStop(0, `rgba(210,190,255,${0.22 + 0.06 * Math.sin(t * 1.3)})`);
    g.addColorStop(1, 'rgba(120,90,255,0)');
    ctx.fillStyle = g; ctx.fillRect(vx - 240 * unit, vy - 240 * unit, 480 * unit, 480 * unit);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFleet(dt, t) {
    for (let i = 0; i < fleet.length; i++) {
      const f = fleet[i];
      f.fx += f.dir * f.speed * dt * motion;
      if (f.fx < -0.2 || f.fx > 1.2) { fleet[i] = newFleet(i, false); continue; }
      const img = images[f.ship.src];
      if (!ready(img)) continue;
      const [x, y, z] = worldFromSlot(f.fx, f.fy + Math.sin(t * 0.6 + f.bob) * 0.006, f.z);
      const p = project(x, y, z);
      const w = f.ship.size * p.s * unit * 0.9, h = w * img.naturalHeight / img.naturalWidth;
      ctx.globalAlpha = clamp(0.95 - (f.z - 16) / 30, 0.35, 0.8);
      ctx.globalCompositeOperation = 'lighter';
      const tail = ctx.createLinearGradient(p.x, p.y, p.x - f.dir * w * 2.6, p.y);
      tail.addColorStop(0, `rgba(${f.ship.rgb},0.55)`); tail.addColorStop(1, `rgba(${f.ship.rgb},0)`);
      ctx.strokeStyle = tail; ctx.lineWidth = Math.max(1, h * 0.16);
      ctx.beginPath(); ctx.moveTo(p.x - f.dir * w * 0.3, p.y); ctx.lineTo(p.x - f.dir * w * 2.6, p.y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, p.x - w / 2, p.y - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function drawDust(dt, front) {
    for (const d of dust) {
      if ((d.depth > 0.7) !== front) continue;
      d.x += d.vx * dt * motion;
      if (d.x < -0.2) d.x = 1.2; if (d.x > 1.2) d.x = -0.2;
      const px = d.x * W - cam.yaw * W * 2.2 * d.depth, py = d.y * H - cam.pitch * H * 2.2 * d.depth;
      const r = d.r * unit * (0.6 + d.depth);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${d.hue},${d.a})`); g.addColorStop(1, `rgba(${d.hue},0)`);
      ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  // ---------- tinted sprite caches (hit flash) and hex shield pattern ----------
  const tintCache = new Map();
  function tinted(img, color) {
    const key = img.src + color;
    if (tintCache.has(key)) return tintCache.get(key);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
    return c;
  }
  const hexCache = new Map();
  function hexPattern(rgb) {
    if (hexCache.has(rgb)) return hexCache.get(rgb);
    const r = 14, hw = Math.sqrt(3) * r;
    const c = document.createElement('canvas');
    c.width = Math.round(hw * 2); c.height = Math.round(r * 3);
    const g = c.getContext('2d');
    g.strokeStyle = `rgba(${rgb},1)`; g.lineWidth = 1.3;
    const hex = (cx, cy) => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } g.closePath(); g.stroke(); };
    for (let row = -1; row < 3; row++) for (let col = -1; col < 3; col++) hex(col * hw + (row % 2 ? hw / 2 : 0), row * r * 1.5);
    const pattern = ctx.createPattern(c, 'repeat');
    hexCache.set(rgb, pattern);
    return pattern;
  }

  // ---------- teams / ships ----------
  let teams = [];           // [{id, name, ship, slot, ...live state}]
  const byId = new Map();
  let snapshot = null;

  function syncTeams(list) {
    const sorted = [...(list || [])].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const ids = sorted.map(t => t.id).join('|');
    if (ids !== teams.map(t => t.id).join('|')) {
      teams = sorted.map((team, i) => {
        const prev = byId.get(team.id);
        const ship = SHIPS[i % SHIPS.length];
        const slot = i < SHIPS.length ? ship.slot : EXTRA_SLOTS[(i - SHIPS.length) % EXTRA_SLOTS.length];
        return prev ? Object.assign(prev, { ship, slot, index: i }) : {
          id: team.id, name: team.name, ship, slot, index: i, phase: ship.phase + i * 1.7,
          pos: null, vel: { x: 0, y: 0 }, kick: { x: 0, y: 0, vx: 0, vy: 0 }, roll: 0, flash: 0, recoil: 0,
          off: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }, goal: { x: 0, y: 0, z: 0 }, face: null, nextIdle: 1 + i * 1.3, busyUntil: 0,
          flip: 1, flipTarget: 1, turn: 0, turnTarget: 0, spin: 0,
          shield: null, plate: null, bump: 0,
        };
      });
      byId.clear();
      teams.forEach(t => byId.set(t.id, t));
      buildPlates();
    }
    for (const team of sorted) { const t = byId.get(team.id); if (t) t.name = team.name; }
  }

  const SHIP_SCALE = 0.7;
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const baseWorld = team => {
    const slot = narrow && team.index < MOBILE_SLOTS.length ? MOBILE_SLOTS[team.index] : team.slot;
    return worldFromSlot(slot[0], slot[1], slot[2]);
  };

  // Steering: each ship flies toward `goal` (world offset from its slot) on an under-damped spring and turns its
  // nose toward `face`. Turning past what a rotation can show flips the sprite through scaleX=0, which reads as the
  // ship swinging around in 3D. `spin` plays a barrel roll.
  function maneuver(team, t, dt) {
    if (t >= team.nextIdle && t >= team.busyUntil) {
      const rivals = teams.filter(x => x !== team);
      team.face = rivals.length ? rivals[Math.floor(Math.random() * rivals.length)] : null;
      team.goal = { x: rand(-0.9, 0.9), y: rand(-0.35, 0.35), z: rand(-1.1, 1.3) };
      if (Math.random() < 0.22) roll(team, t);
      team.nextIdle = t + rand(4.5, 8.5);
    }
    if (team.busyUntil && t >= team.busyUntil) { team.busyUntil = 0; team.goal = { x: 0, y: 0, z: 0 }; team.nextIdle = t + rand(1.2, 2.5); }
    const o = team.off, g = team.goal;
    for (const a of ['x', 'y', 'z']) { o['v' + a] += ((g[a] - o[a]) * 7 - o['v' + a] * 4.2) * dt; o[a] += o['v' + a] * dt * motion; }
    if (team.spin > 0) team.spin = Math.max(0, team.spin - dt * TAU / 0.95);
  }
  function roll(team) { if (!team.spin) team.spin = TAU; }

  function shipState(team, t, dt) {
    const s = team.ship;
    maneuver(team, t, dt);
    const [bx, by, bz] = baseWorld(team);
    const k = t * motion + team.phase;
    const ox = (0.22 * Math.sin(k * 0.41) + 0.1 * Math.sin(k * 0.93 + 1.3)) * motion;
    const oy = (0.14 * Math.sin(k * 0.57 + 0.7) + 0.06 * Math.sin(k * 1.31)) * motion;
    const oz = 0.4 * Math.sin(k * 0.33 + 2.1) * motion;
    // spring for hits and recoil (in screen px, scaled later)
    const kick = team.kick;
    kick.vx += (-kick.x * 38 - kick.vx * 7.5) * dt; kick.vy += (-kick.y * 38 - kick.vy * 7.5) * dt;
    kick.x += kick.vx * dt; kick.y += kick.vy * dt;
    const lift = Math.sin(team.spin / 2) * 0.25;      // rises a little through a barrel roll
    const p = project(bx + ox + team.off.x, by + oy + team.off.y - lift, bz + oz + team.off.z + team.recoil * 0.5);
    p.x += kick.x * unit; p.y += kick.y * unit;
    if (team.pos && dt > 0) {
      team.vel.x += ((p.x - team.pos.x) / dt - team.vel.x) * Math.min(1, dt * 4);
      team.vel.y += ((p.y - team.pos.y) / dt - team.vel.y) * Math.min(1, dt * 4);
    }
    team.pos = p;
    const img = images[s.src];
    const w = s.size * SHIP_SCALE * p.s * unit, h = ready(img) ? w * img.naturalHeight / img.naturalWidth : w * 0.5;

    // --- heading: pick between the sprite as drawn and its mirror, whichever needs less rotation to face the target
    const native = Math.atan2((s.nose[1] - 0.5) * h, (s.nose[0] - 0.5) * w);
    const tgt = team.face && team.face.pos ? team.face.pos : null;
    if (tgt) {
      const want = Math.atan2(tgt.y - p.y, tgt.x - p.x);
      const straight = wrapAngle(want - native), mirrored = wrapAngle(want - (Math.PI - native));
      const keep = team.flipTarget > 0 ? straight : mirrored, other = team.flipTarget > 0 ? mirrored : straight;
      if (Math.abs(other) + 0.35 < Math.abs(keep)) team.flipTarget = -team.flipTarget;
      team.turnTarget = clamp(team.flipTarget > 0 ? straight : mirrored, -s.maxTurn, s.maxTurn);
    } else team.turnTarget = s.restTurn || 0;
    team.flip += clamp(team.flipTarget - team.flip, -dt * 3.2, dt * 3.2);
    team.turn += (team.turnTarget - team.turn) * Math.min(1, dt * 3.4);
    const bank = clamp(team.vel.x * 0.0011 + team.vel.y * 0.0007, -0.18, 0.18) * team.flip + kick.vx * 0.0007 + Math.sin(k * 0.7) * 0.025 * motion;
    team.roll += (bank - team.roll) * Math.min(1, dt * 5);
    const skew = clamp(team.vel.y * 0.001, -0.1, 0.1);
    // flip passes through 0: keep a sliver of width so the turn reads as a yaw, not a vanish
    const sx = Math.sign(team.flip || 1) * Math.max(0.08, Math.abs(team.flip));
    const sy = Math.cos(team.spin) * (1 - 0.05 * Math.abs(Math.sin(k * 0.29)));
    const m = new DOMMatrix().translate(p.x, p.y).rotate((team.turn + team.roll) * 57.2958).skewY(skew * 57.2958).scale(sx, Math.abs(sy) < 0.06 ? 0.06 * Math.sign(sy || 1) : sy);
    if (team.recoilAt && t >= team.recoilAt) { team.recoil = 1; team.recoilAt = 0; }
    team.recoil = Math.max(0, team.recoil - dt * 2.4);
    team.flash = Math.max(0, team.flash - dt * 2.2);
    team.bump = Math.max(0, team.bump - dt * 1.6);
    return { p, w, h, m, img };
  }

  const localPoint = (st, nx, ny) => st.m.transformPoint(new DOMPoint((nx - 0.5) * st.w, (ny - 0.5) * st.h));

  const particles = [];
  function emitExhaust(team, st, dt) {
    const s = team.ship;
    const o = localPoint(st, 0.5, 0.5), e = localPoint(st, 0.5 + s.exhaust[0] * 0.1, 0.5 + s.exhaust[1] * 0.1);
    const len = Math.hypot(e.x - o.x, e.y - o.y) || 1;
    const dir = { x: (e.x - o.x) / len, y: (e.y - o.y) / len };
    const rate = (34 + team.recoil * 60) * motion;
    for (const [ex, ey] of s.engines) {
      const n = Math.random() < (rate * dt % 1) ? Math.ceil(rate * dt) : Math.floor(rate * dt);
      for (let i = 0; i < n; i++) {
        const pt = localPoint(st, ex, ey);
        const sp = rand(60, 140) * st.p.s / 90 * unit * SHIP_SCALE;
        particles.push({ kind: 'ember', x: pt.x, y: pt.y, vx: dir.x * sp + rand(-12, 12) + team.vel.x * 0.4, vy: dir.y * sp + rand(-12, 12) + team.vel.y * 0.4,
          life: 0, max: rand(0.25, 0.55), size: rand(1.6, 4.2) * st.p.s / 90 * unit * SHIP_SCALE, rgb: s.rgb });
      }
    }
  }

  function drawShip(team, st, t) {
    const { p, w, h, m, img } = st;
    const s = team.ship;
    // under-glow so the ship sits inside the scene light
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, w * 0.7);
    gl.addColorStop(0, `rgba(${s.rgb},${0.16 + team.bump * 0.25})`); gl.addColorStop(1, `rgba(${s.rgb},0)`);
    ctx.fillStyle = gl; ctx.fillRect(p.x - w, p.y - w, w * 2, w * 2);
    ctx.globalCompositeOperation = 'source-over';
    if (!ready(img)) return;
    ctx.save();
    ctx.setTransform(DPR * m.a, DPR * m.b, DPR * m.c, DPR * m.d, DPR * m.e, DPR * m.f);
    // depth haze: farther ships lose contrast
    const haze = clamp((p.z - 6) / 10, 0, 0.45);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    if (haze > 0.02) { ctx.globalAlpha = haze; ctx.drawImage(tinted(img, '#1b2a7a'), -w / 2, -h / 2, w, h); }
    // rim light that sweeps across the hull
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 + 0.07 * Math.sin(t * 1.7 + team.phase);
    ctx.drawImage(tinted(img, s.color), -w / 2, -h / 2, w, h);
    if (team.flash > 0) { ctx.globalAlpha = team.flash * 0.9; ctx.drawImage(tinted(img, '#ff3b3b'), -w / 2, -h / 2, w, h); }
    // engine cores
    for (const [ex, ey] of s.engines) {
      const x = (ex - 0.5) * w, y = (ey - 0.5) * h;
      const r = w * (0.07 + 0.012 * Math.sin(t * 22 + ex * 9)) * (1 + team.recoil * 0.5);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, `rgba(${s.rgb},0.85)`); g.addColorStop(1, `rgba(${s.rgb},0)`);
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function drawShield(team, st, t) {
    const sh = team.shield;
    if (!sh) return;
    const age = t - sh.t0;
    if (age > sh.dur) { team.shield = null; return; }
    const { p, w, h } = st;
    const s = team.ship;
    const grow = ease(clamp(age / 0.45, 0, 1));
    const fade = clamp((sh.dur - age) / 1.2, 0, 1);
    const pulse = 0.85 + 0.15 * Math.sin(t * 5);
    const rx = w * 0.64 * grow, ry = Math.max(h * 0.78, w * 0.4) * grow;
    if (rx < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, team.roll * 0.5, 0, TAU);
    const body = ctx.createRadialGradient(p.x - rx * 0.3, p.y - ry * 0.35, rx * 0.05, p.x, p.y, Math.max(rx, ry));
    body.addColorStop(0, `rgba(255,255,255,${0.1 * fade})`);
    body.addColorStop(0.55, `rgba(${s.rgb},${0.05 * fade})`);
    body.addColorStop(0.92, `rgba(${s.rgb},${0.32 * fade * pulse})`);
    body.addColorStop(1, `rgba(${s.rgb},${0.55 * fade})`);
    ctx.fillStyle = body; ctx.fill();
    ctx.clip();
    // hex lattice drifts over the dome, brightest near the rim
    const pat = hexPattern(s.rgb);
    pat.setTransform(new DOMMatrix().translate(p.x + t * 12, p.y + t * 7).scale(unit * clamp(p.s / 90, 0.6, 1.3)));
    ctx.globalAlpha = (0.22 + 0.12 * Math.sin(t * 3 + team.phase)) * fade;
    ctx.fillStyle = pat; ctx.fillRect(p.x - rx, p.y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = 1;
    // sweeping scan band
    const band = ((age * 0.6) % 1) * ry * 2.4 - ry * 1.2;
    const bg = ctx.createLinearGradient(0, p.y + band - 30, 0, p.y + band + 30);
    bg.addColorStop(0, `rgba(${s.rgb},0)`); bg.addColorStop(0.5, `rgba(255,255,255,${0.22 * fade})`); bg.addColorStop(1, `rgba(${s.rgb},0)`);
    ctx.fillStyle = bg; ctx.fillRect(p.x - rx, p.y + band - 30, rx * 2, 60);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${s.rgb},${0.9 * fade})`; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx, ry, team.roll * 0.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * fade})`; ctx.lineWidth = 1.2 * unit;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * 0.97, ry * 0.97, team.roll * 0.5, Math.PI * 1.1, Math.PI * 1.55); ctx.stroke();
    // activation ripple
    if (age < 1.1) {
      const k = ease(age / 1.1);
      ctx.strokeStyle = `rgba(${s.rgb},${(1 - k) * 0.9})`; ctx.lineWidth = 6 * (1 - k) * unit + 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, rx * (1 + k * 0.6), ry * (1 + k * 0.6), 0, 0, TAU); ctx.stroke();
    }
    // impacts deflected while the shield is up
    for (const hit of sh.hits) {
      const k = (t - hit.t) / 0.6;
      if (k < 0 || k > 1) continue;
      const hx = p.x + Math.cos(hit.a) * rx, hy = p.y + Math.sin(hit.a) * ry;
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 50 * unit);
      g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.3, `rgba(${s.rgb},${0.7 * (1 - k)})`); g.addColorStop(1, `rgba(${s.rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(hx - 50 * unit, hy - 50 * unit, 100 * unit, 100 * unit);
    }
    ctx.restore();
  }

  // ---------- projectiles, explosions, floating text ----------
  const bolts = [];
  const texts = [];
  const WINDUP = 0.55;   // seconds the attacker spends swinging round and charging in before the first shot
  function fireVolley(attacker, victim, task, t) {
    const count = 5;
    // Attacker: turn to the victim and make a strafing run toward it; victim: swing round to face the threat.
    const [ax, ay, az] = baseWorld(attacker), [vx, vy, vz] = baseWorld(victim);
    const dx = vx - ax, dy = vy - ay, dz = vz - az, d = Math.hypot(dx, dy, dz) || 1, run = Math.min(1.9, d * 0.32);
    const side = Math.random() < 0.5 ? -1 : 1;
    attacker.face = victim; attacker.busyUntil = t + WINDUP + 1.7;
    attacker.goal = { x: dx / d * run + side * 0.15, y: dy / d * run - 0.25, z: dz / d * run - 0.4 };
    if (Math.random() < 0.35) roll(attacker);
    victim.face = attacker; victim.busyUntil = Math.max(victim.busyUntil, t + WINDUP + 1.9);
    victim.goal = { x: -dx / d * 0.25, y: -dy / d * 0.1, z: 0.3 };
    attacker.recoilAt = t + WINDUP;
    for (let i = 0; i < count; i++) {
      bolts.push({ from: attacker, to: victim, t0: t + WINDUP + i * 0.09, dur: rand(0.72, 0.9), bend: rand(-0.35, 0.35),
        spread: [rand(-0.18, 0.18), rand(-0.22, 0.22)], first: i === 0, last: i === count - 1, task, trail: [] });
    }
    text(attacker, '+1 ATK', attacker.ship.color, t + WINDUP, 0);
  }

  function boltPoints(b, t) {
    const st = b.from.st, vt = b.to.st;
    if (!st || !vt) return null;
    const a = localPoint(st, b.from.ship.nose[0], b.from.ship.nose[1]);
    const v = { x: vt.p.x + b.spread[0] * vt.w, y: vt.p.y + b.spread[1] * vt.h };
    const mx = (a.x + v.x) / 2, my = (a.y + v.y) / 2;
    const nx = -(v.y - a.y), ny = v.x - a.x;
    const c = { x: mx + nx * b.bend * 0.35, y: my + ny * b.bend * 0.35 - 40 * unit };
    const at = u => ({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * v.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * v.y });
    return { at, a, v, sa: st.p.s, sv: vt.p.s };
  }

  function updateBolts(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const u = (t - b.t0) / b.dur;
      if (u < 0) continue;
      const path = boltPoints(b, t);
      if (!path) { bolts.splice(i, 1); continue; }
      if (u >= 1) { impact(b, path.v, t); bolts.splice(i, 1); continue; }
      if (!b.muzzled) { b.muzzled = true; burst(path.a.x, path.a.y, b.from.ship.rgb, 10, 0.6); }
      const head = path.at(ease(u) * 0.15 + u * 0.85);
      const scale = (path.sa + (path.sv - path.sa) * u) / 90 * unit;
      const rgb = b.from.ship.rgb;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const uu = clamp(u - 0.16 * (k / 8), 0, 1);
        const pt = path.at(ease(uu) * 0.15 + uu * 0.85);
        k ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y);
      }
      ctx.strokeStyle = `rgba(${rgb},0.18)`; ctx.lineWidth = 14 * scale; ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb},0.55)`; ctx.lineWidth = 6 * scale; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.2 * scale; ctx.stroke();
      const r = 18 * scale;
      const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, r);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, `rgba(${rgb},0.8)`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(head.x - r, head.y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  function burst(x, y, rgb, n, power) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(80, 420) * power * unit;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: rand(0.35, 0.9), size: rand(1.2, 2.8) * unit, rgb });
    }
  }

  function impact(b, v, t) {
    const victim = b.to;
    if (victim.shield && t - victim.shield.t0 < victim.shield.dur) {
      victim.shield.hits.push({ t, a: Math.atan2(v.y - victim.pos.y, v.x - victim.pos.x) });
    }
    burst(v.x, v.y, b.from.ship.rgb, b.first ? 46 : 16, b.first ? 1 : 0.6);
    burst(v.x, v.y, '255,214,150', b.first ? 22 : 6, 0.8);
    particles.push({ kind: 'flash', x: v.x, y: v.y, life: 0, max: b.first ? 0.55 : 0.3, size: (b.first ? 120 : 60) * unit, rgb: b.from.ship.rgb });
    particles.push({ kind: 'ring', x: v.x, y: v.y, life: 0, max: 0.7, size: (b.first ? 150 : 70) * unit, rgb: '255,255,255' });
    victim.flash = Math.min(1, victim.flash + (b.first ? 1 : 0.4));
    const dx = v.x - b.from.pos.x, dy = v.y - b.from.pos.y, d = Math.hypot(dx, dy) || 1;
    victim.kick.vx += dx / d * (b.first ? 420 : 160); victim.kick.vy += dy / d * (b.first ? 420 : 160);
    if (b.first) {
      // evasive jink perpendicular to the incoming fire, sometimes with a barrel roll
      const side = Math.random() < 0.5 ? -1 : 1;
      victim.goal = { x: -dy / d * 0.7 * side, y: dx / d * 0.45 * side, z: rand(0.2, 0.9) };
      if (Math.random() < 0.5) roll(victim);
      cam.shake = Math.max(cam.shake, 14 * motion);
      text(victim, '−1 DEF', '#ff5d6c', t, 0);
      text(victim, TASK_LABEL[b.task] || String(b.task).toUpperCase(), '#ffd0d6', t + 0.05, 1);
    }
  }

  function text(team, value, color, t, line) {
    texts.push({ team, value, color, t0: t, line, dx: rand(-14, 14) });
  }

  function updateParticles(dt) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i];
      q.life += dt;
      const k = q.life / q.max;
      if (k >= 1) { particles.splice(i, 1); continue; }
      if (q.kind === 'ember') {
        q.x += q.vx * dt; q.y += q.vy * dt;
        const r = q.size * (1 + k * 2.2);
        ctx.fillStyle = `rgba(${q.rgb},${(1 - k) * 0.45})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
      } else if (q.kind === 'spark') {
        q.vx *= Math.pow(0.12, dt); q.vy *= Math.pow(0.12, dt);
        const x0 = q.x, y0 = q.y;
        q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.strokeStyle = `rgba(${q.rgb},${1 - k})`; ctx.lineWidth = q.size;
        ctx.beginPath(); ctx.moveTo(x0 - q.vx * 0.03, y0 - q.vy * 0.03); ctx.lineTo(q.x, q.y); ctx.stroke();
      } else if (q.kind === 'flash') {
        const r = q.size * (0.5 + k * 0.8);
        const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(0.3, `rgba(${q.rgb},${0.8 * (1 - k)})`); g.addColorStop(1, `rgba(${q.rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
      } else if (q.kind === 'ring') {
        ctx.strokeStyle = `rgba(${q.rgb},${(1 - k) * 0.7})`; ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.size * ease(k), q.size * ease(k) * 0.62, 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
    if (particles.length > 1600) particles.splice(0, particles.length - 1600);
  }

  function drawTexts(t) {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = texts.length - 1; i >= 0; i--) {
      const x = texts[i];
      const age = t - x.t0;
      if (age < 0) continue;
      if (age > 1.9 || !x.team.st) { texts.splice(i, 1); continue; }
      const st = x.team.st;
      const rise = ease(clamp(age / 1.9, 0, 1)) * 46 * unit;
      const size = x.line ? 11 : 26;
      const pop = x.line ? 1 : 1 + 0.35 * Math.max(0, 1 - age * 5);
      ctx.globalAlpha = clamp(Math.min(age * 6, (1.9 - age) / 0.5), 0, 1);
      ctx.font = `${x.line ? 600 : 800} ${Math.round(size * pop * unit + (x.line ? 2 : 4))}px Orbitron, 'Chakra Petch', sans-serif`;
      ctx.shadowColor = x.color; ctx.shadowBlur = 18;
      ctx.fillStyle = x.color;
      ctx.fillText(x.value, st.p.x + x.dx, st.p.y - st.h * 0.2 - rise + x.line * 22 * unit);
    }
    ctx.restore();
  }

  // ---------- HUD plates & feed ----------
  function buildPlates() {
    platesHost.replaceChildren();
    for (const team of teams) {
      const el = document.createElement('div');
      el.className = 'plate';
      el.style.setProperty('--c', team.ship.color);
      el.style.setProperty('--rgb', team.ship.rgb);
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
      const row = scores[rank] || { total: 0, attack: 0, defense: 0, sla: 0 };
      el.querySelector('.plate-name').textContent = team.name;
      const pos = rank >= 0 ? `#${rank + 1}` : '#-';
      const label = el.querySelector('.plate-pos');
      if (label.textContent !== pos) { label.textContent = pos; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      el.classList.toggle('leader', rank === 0 && row.total > 0);
    }
  }

  const blockers = [...section.querySelectorAll('.hud-round')];
  function placePlates() {
    const base = section.getBoundingClientRect();
    const rects = blockers.map(el => { const r = el.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, b: r.bottom - base.top }; });
    for (const team of teams) {
      if (!team.plate || !team.st) continue;
      const { p, h, w } = team.st;
      const ph = team.plate.offsetHeight || 28, pw = team.plate.offsetWidth || 120;
      const top = rects.reduce((m, r) => (p.x + pw / 2 > r.l && p.x - pw / 2 < r.r ? Math.max(m, r.b + 10) : m), 84);
      let y = p.y - Math.max(h * 0.62, w * 0.3) - 8;
      if (y - ph < top) y = p.y + h * 0.6 + ph + 8;   // no room above: hang the plate under the ship
      team.plate.style.transform = `translate3d(${p.x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-100%)`;
      team.plate.classList.toggle('shielded', !!team.shield);
    }
  }

  function feed(html, kind) {
    const row = document.createElement('div');
    row.className = 'feed-row feed-' + kind;
    row.innerHTML = html;
    row.querySelectorAll('[data-c]').forEach(el => { el.style.color = el.dataset.c; });   // CSP chặn thuộc tính style trong HTML
    feedHost.prepend(row);
    while (feedHost.children.length > 2) feedHost.lastChild.remove();
  }
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const chip = team => `<b data-c="${team.ship.color}">${esc(team.name)}</b>`;

  // ---------- events ----------
  const queue = [];
  let nextEventAt = 0;
  let lastCapture = null, lastDefense = null;
  let clock = 0;

  function ingest(state) {
    snapshot = state;
    if (fxButton) fxButton.hidden = !(state.demoTeamTokens || params.has('fx'));
    syncTeams(state.teams || []);
    updatePlates();
    const captures = [...(state.captures || [])].sort((a, b) => a.id - b.id);
    const defenses = [...(state.defenses || [])].sort((a, b) => a.id - b.id);
    const maxCap = captures.length ? captures[captures.length - 1].id : 0;
    const maxDef = defenses.length ? defenses[defenses.length - 1].id : 0;
    if (lastCapture === null || maxCap < lastCapture) lastCapture = maxCap;      // first load or reset: baseline only
    if (lastDefense === null || maxDef < lastDefense) lastDefense = maxDef;
    for (const c of captures) if (c.id > lastCapture) queue.push({ type: 'attack', attacker: c.attacker_id, victim: c.victim_id, task: c.task, tick: c.tick });
    lastCapture = Math.max(lastCapture, maxCap);
    // While the checker is still walking services, awards trickle in one by one: wait so each team gets one shield.
    if (state.game?.phase === 'checking' && lastDefense !== maxDef) return;
    const groups = new Map();
    for (const d of defenses) {
      if (d.id <= lastDefense) continue;
      const key = d.team_id + ':' + d.tick;
      if (!groups.has(key)) groups.set(key, { type: 'shield', team: d.team_id, tick: d.tick, tasks: [], note: d.note, float: d.float });
      groups.get(key).tasks.push(d.task);
    }
    queue.push(...groups.values());
    lastDefense = Math.max(lastDefense, maxDef);
  }

  function runEvent(ev, t) {
    if (ev.type === 'attack') {
      const a = byId.get(ev.attacker), v = byId.get(ev.victim);
      if (!a || !v || !a.st || !v.st) return;
      fireVolley(a, v, ev.task, t);
      feed(`<span class="feed-icon">⚔</span>${chip(a)} <span class="feed-dim">bắn hạ flag</span> ${esc(TASK_LABEL[ev.task] || ev.task)} <span class="feed-dim">của</span> ${chip(v)}<span class="feed-pts"><em class="up">+1</em><em class="down">−1</em></span>${ev.sim ? '<span class="feed-sim">SIM</span>' : ''}`, 'attack');
    } else if (ev.type === 'shield') {
      const team = byId.get(ev.team);
      if (!team) return;
      const n = ev.tasks.length;
      team.shield = { t0: t, dur: 5.5 + n * 0.9, hits: [] };
      team.bump = 1;
      // brace: pull forward toward the camera and hold position behind the shield
      team.goal = { x: 0, y: -0.15, z: -0.9 }; team.busyUntil = t + 2.4;
      text(team, ev.float || 'SHIELD UP', team.ship.color, t, 0);
      feed(`<span class="feed-icon">⬡</span>${chip(team)} <span class="feed-dim">${esc(ev.note || 'phòng thủ')} · tick</span> ${esc(ev.tick)}${ev.sim ? '<span class="feed-sim">SIM</span>' : ''}`, 'shield');
    }
  }

  function simulate() {
    if (teams.length < 2) return;
    const tasks = Object.keys(TASK_LABEL);
    if (Math.random() < 0.62) {
      const a = teams[Math.floor(Math.random() * teams.length)];
      const others = teams.filter(x => x !== a);
      const v = others[Math.floor(Math.random() * others.length)];
      queue.push({ type: 'attack', attacker: a.id, victim: v.id, task: tasks[Math.floor(Math.random() * 3)], tick: snapshot?.game?.tick || 0, sim: true });
    } else {
      const team = teams[Math.floor(Math.random() * teams.length)];
      queue.push({ type: 'shield', team: team.id, tick: snapshot?.game?.tick || 0, tasks: tasks.slice(0, 1 + Math.floor(Math.random() * 3)), sim: true });
    }
  }
  if (fxButton) fxButton.addEventListener('click', () => { simulate(); simulate(); });
  if (params.get('fx') === 'auto') setInterval(() => { if (!document.hidden) simulate(); }, 2600);
  document.addEventListener('crypto-range:state', e => ingest(e.detail));

  // Placeholder fleet before the first snapshot arrives so the arena never looks empty.
  syncTeams([{ id: 'team1', name: 'Team 01' }, { id: 'team2', name: 'Team 02' }, { id: 'team3', name: 'Team 03' }]);
  if (window.cryptoRangeState) ingest(window.cryptoRangeState);

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
    last = now;
    clock += dt;
    const t = clock;
    cam.yaw += ((Math.sin(t * 0.07) * 0.05 + cam.mx * 0.035) * motion - cam.yaw) * Math.min(1, dt * 2);
    cam.pitch += ((Math.sin(t * 0.05 + 1) * 0.025 + cam.my * 0.02) * motion - cam.pitch) * Math.min(1, dt * 2);
    cam.shake *= Math.pow(0.02, dt);
    cam.sx = (Math.random() - 0.5) * cam.shake; cam.sy = (Math.random() - 0.5) * cam.shake;

    if (queue.length && t >= nextEventAt) {
      const ev = queue.shift();
      runEvent(ev, t);
      nextEventAt = t + (ev.type === 'attack' ? 0.75 : 0.45);
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(t);
    drawDust(dt, false);
    drawWarp(dt, t);
    drawFleet(dt, t);
    const live = teams.map(team => { team.st = shipState(team, t, dt); return team; }).sort((a, b) => b.st.p.z - a.st.p.z);
    for (const team of live) emitExhaust(team, team.st, dt);
    updateParticles(dt);
    for (const team of live) { drawShip(team, team.st, t); drawShield(team, team.st, t); }
    updateBolts(t);
    drawTexts(t);
    drawDust(dt, true);
    // cinematic vignette keeps the HUD legible
    const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(3,5,20,0)'); v.addColorStop(1, 'rgba(3,5,20,0.72)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    const fade = ctx.createLinearGradient(0, H * 0.78, 0, H);
    fade.addColorStop(0, 'rgba(5,8,26,0)'); fade.addColorStop(1, 'rgba(5,8,26,0.92)');
    ctx.fillStyle = fade; ctx.fillRect(0, H * 0.78, W, H * 0.22);
    placePlates();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.cryptoArena = { simulate, queue };
})();
