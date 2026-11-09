/* Picks the arena renderer: WebGL 3D on desktop-sized screens with WebGL2, otherwise the 2D canvas arena.
 * `?arena=2d` forces the 2D version. If the 3D modules fail to load or start, the 2D arena takes over. */
const params = new URLSearchParams(location.search);

function load2D(reason) {
  if (reason) console.info('crypto-arena: using 2D arena —', reason);
  const gl = document.getElementById('arena-gl');
  if (gl) gl.remove();
  const canvas = document.getElementById('arena-canvas');
  if (canvas) canvas.hidden = false;
  const script = document.createElement('script');
  script.src = '/arena-ui/arena.js';
  document.head.appendChild(script);
}

function hasWebGL2() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch (_) { return false; }
}

if (document.getElementById('arena')) {
  if (params.get('arena') === '2d') load2D('requested by ?arena=2d');
  else if (innerWidth < 900) load2D('narrow screen');
  else if (!hasWebGL2()) load2D('WebGL2 unavailable');
  else import('./scene.js?v=3').then(m => m.start()).catch(error => { console.error(error); load2D('3D start failed'); });
}
