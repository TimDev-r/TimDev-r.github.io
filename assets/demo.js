/* ═══════════════════════════════════════════════════════════════════
   Interactive motion-signature demo.

   Runs the same algorithm as motion-groundtruth-tools/gt_tools/motion.py:
   difference two frames, deproject the changed pixels through a depth map,
   histogram those distances into 128 bins, render each bin as a symbol.

   The scene is simulated rather than filmed — a subject rectangle on a flat
   wall — which is exactly what gt_tools/synth.py generates for the tests.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var root = document.getElementById('sig-demo');
  if (!root) return;

  // ── constants, mirroring motion.py ──────────────────────────────────
  var BINS = 128;
  var DEPTH_MIN = 0, DEPTH_MAX = 8;        // metres
  var HIST_THRESHOLD = 3;                  // bins below this count read as empty
  var MICRO_THRESHOLD = 30;                // at or under this -> 'x', else '+'
  var WALL_M = 6.0;

  // Compute on a coarse grid, then scale counts up so the thresholds behave
  // as they would on a real 640x480 frame.
  var GW = 160, GH = 120;
  var PIXEL_SCALE = (640 * 480) / (GW * GH);

  var view = root.querySelector('.demo-view');
  var ctx = view.getContext('2d');
  var sigEl = root.querySelector('.demo-sig');
  var depthInput = root.querySelector('#demo-depth');
  var depthOut = root.querySelector('#demo-depth-val');
  var playBtn = root.querySelector('#demo-play');
  var readout = root.querySelector('.demo-readout');

  // Visual only: the last few positions, drawn as fading echoes. The
  // histogram itself still compares exactly two frames (prevX -> x).
  var TRAIL_MAX = 4;
  var trail = [];

  function pushTrail(v) {
    trail.push(v);
    while (trail.length > TRAIL_MAX) trail.shift();
  }

  // 'depth'  — the 128-bin signature, the thing this project produces
  // 'plain'  — what a bare motion detector gives you: movement, yes or no
  var mode = 'depth';

  var state = {
    x: 0.35,            // subject centre, 0..1 across the frame
    prevX: 0.30,
    depth: 3.0,
    playing: true,
    dir: 1,
    dragging: false
  };

  function binFor(m) {
    return Math.min(BINS - 1, Math.floor((m - DEPTH_MIN) / (DEPTH_MAX - DEPTH_MIN) * BINS));
  }

  // ── perspective ─────────────────────────────────────────────────────
  // A real pinhole view, so the person stands ON the floor and recedes
  // correctly instead of floating and merely shrinking.
  var HORIZON = 0.42;      // eye level, as a fraction of canvas height
  var CAM_H = 1.4;         // camera height above the floor, metres
  var PERSON_H = 1.75;
  var PERSON_W = 0.52;
  var FOCAL = 0.9;         // in canvas-height units

  function aspect() { return view.width / Math.max(1, view.height); }

  // Vertical screen position (0..1) of a point `up` metres above the floor
  // at distance `z`.
  function projY(z, up) {
    return HORIZON + ((CAM_H - up) / Math.max(0.35, z)) * FOCAL;
  }
  // Half-width (0..1 of canvas width) of a `metres`-wide object at distance z.
  function projHalfW(z, metres) {
    return (metres / Math.max(0.35, z)) * FOCAL / aspect() / 2;
  }

  function subjectRect(cx, depth) {
    var hw = projHalfW(depth, PERSON_W);
    return {
      x0: cx - hw, x1: cx + hw,
      y0: projY(depth, PERSON_H),   // head
      y1: projY(depth, 0)           // feet, on the floor
    };
  }

  function inRect(r, u, v) {
    return u >= r.x0 && u <= r.x1 && v >= r.y0 && v <= r.y1;
  }

  /* The algorithm: which bins light up, and how strongly. */
  function computeHistogram() {
    var prev = subjectRect(state.prevX, state.depth);
    var curr = subjectRect(state.x, state.depth);
    var hist = new Float64Array(BINS);

    for (var gy = 0; gy < GH; gy++) {
      var v = (gy + 0.5) / GH;
      for (var gx = 0; gx < GW; gx++) {
        var u = (gx + 0.5) / GW;
        var wasSubject = inRect(prev, u, v);
        var isSubject = inRect(curr, u, v);
        if (wasSubject === isSubject) continue;   // nothing changed here

        // Depth is read from the CURRENT frame — so a pixel the subject has
        // just vacated reports the wall behind it, not the subject.
        var d = isSubject ? state.depth : WALL_M;
        if (d < DEPTH_MIN || d > DEPTH_MAX) continue;
        hist[binFor(d)] += PIXEL_SCALE;
      }
    }
    return hist;
  }

  function symbolFor(count) {
    if (count < HIST_THRESHOLD) return '-';
    if (count <= MICRO_THRESHOLD) return 'x';
    return '+';
  }

  function renderSignature(hist) {
    var frag = document.createDocumentFragment();
    var counts = { '-': 0, x: 0, '+': 0 };

    for (var i = 0; i < BINS; i++) {
      var sym = symbolFor(hist[i]);
      counts[sym]++;
      var span = document.createElement('span');
      span.className = 'sig-' + (sym === '-' ? 'none' : sym === 'x' ? 'micro' : 'move');
      span.textContent = sym;
      span.title = ((i / BINS) * DEPTH_MAX).toFixed(2) + ' m';
      frag.appendChild(span);
    }
    sigEl.textContent = '';
    sigEl.appendChild(frag);

    var active = [];
    for (var j = 0; j < BINS; j++) {
      if (symbolFor(hist[j]) !== '-') active.push(((j / BINS) * DEPTH_MAX).toFixed(1) + ' m');
    }
    var out = sigEl.closest('.demo-out');
    if (mode === 'plain') {
      // Everything the histogram knows, collapsed to the one bit a plain
      // detector reports. The distances are still computed — they just
      // have nowhere to go.
      sigEl.classList.add('is-plain');
      if (out) out.classList.add('is-plain');
      sigEl.setAttribute('data-plain', active.length ? 'movement detected' : 'no movement');
      readout.textContent = active.length
        ? 'Something moved. That is all this tells you — not how far away, not how many things.'
        : 'Nothing is moving right now.';
      return;
    }

    sigEl.classList.remove('is-plain');
    if (out) out.classList.remove('is-plain');
    sigEl.removeAttribute('data-plain');

    if (!active.length) {
      readout.textContent = 'Nothing is moving right now.';
    } else if (active.length === 1) {
      readout.textContent = 'Movement ' + active[0] + ' from the camera.';
    } else {
      readout.textContent = 'Movement at two distances — ' + active.join(' and ') +
                            ' from the camera.';
    }
  }

  /* ── scene rendering ──────────────────────────────────────────────
     A room drawn in the same perspective the histogram is computed in:
     floor grid, back wall, depth haze, and a silhouette standing on the
     floor. The orange echoes are the positions just vacated — the thing
     the signature picks up as a second band. */

  function personPath(c, r) {
    var w = (r.x1 - r.x0) * view.width;
    var x = r.x0 * view.width;
    var top = r.y0 * view.height;
    var bottom = r.y1 * view.height;
    var h = bottom - top;
    if (h < 4 || w < 2) return;

    var headR = Math.min(w * 0.42, h * 0.11);
    var cxp = x + w / 2;
    var shoulder = top + headR * 2.25;

    c.beginPath();
    c.arc(cxp, top + headR, headR, 0, Math.PI * 2);          // head
    c.closePath();
    c.fill();

    c.beginPath();                                            // torso + legs
    c.moveTo(cxp - w * 0.5, shoulder + h * 0.06);
    c.quadraticCurveTo(cxp - w * 0.46, shoulder - h * 0.03, cxp - w * 0.24, shoulder - h * 0.02);
    c.lineTo(cxp + w * 0.24, shoulder - h * 0.02);
    c.quadraticCurveTo(cxp + w * 0.46, shoulder - h * 0.03, cxp + w * 0.5, shoulder + h * 0.06);
    c.lineTo(cxp + w * 0.34, bottom);
    c.lineTo(cxp + w * 0.07, bottom);
    c.lineTo(cxp + w * 0.05, top + h * 0.62);
    c.lineTo(cxp - w * 0.05, top + h * 0.62);
    c.lineTo(cxp - w * 0.07, bottom);
    c.lineTo(cxp - w * 0.34, bottom);
    c.closePath();
    c.fill();
  }

  function groundShadow(c, r, alpha) {
    var cxp = (r.x0 + r.x1) / 2 * view.width;
    var y = r.y1 * view.height;
    var rx = (r.x1 - r.x0) * view.width * 0.78;
    if (rx < 1 || y > view.height + 40) return;
    var g = c.createRadialGradient(cxp, y, 0, cxp, y, rx);
    g.addColorStop(0, 'rgba(0,0,0,' + (0.5 * alpha).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.save();
    c.translate(cxp, y);
    c.scale(1, 0.22);
    c.beginPath();
    c.arc(0, 0, rx, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /* The room. The BACK WALL is the reason this demo has two bands: when the
     person steps sideways they uncover the wall behind them, and the wall is
     at a different distance from the camera than they are. Drawing it makes
     that readable instead of asserted. */
  var WALL_TOP_M = 2.8;   // ceiling height

  function drawRoom() {
    var w = view.width, h = view.height;
    var wallBase = projY(WALL_M, 0) * h;        // where wall meets floor
    var wallTop = projY(WALL_M, WALL_TOP_M) * h; // where wall meets ceiling

    // Ceiling
    var ceil = ctx.createLinearGradient(0, 0, 0, wallTop);
    ceil.addColorStop(0, '#090c10');
    ceil.addColorStop(1, '#12181f');
    ctx.fillStyle = ceil;
    ctx.fillRect(0, 0, w, wallTop);

    // Back wall — a real surface, lit from the camera side.
    var wall = ctx.createLinearGradient(0, wallTop, 0, wallBase);
    wall.addColorStop(0, '#1b232d');
    wall.addColorStop(1, '#232d3a');
    ctx.fillStyle = wall;
    ctx.fillRect(0, wallTop, w, wallBase - wallTop);

    // A faint horizontal band across the wall so it reads as a plane rather
    // than flat fill, and a brighter line where it meets the floor.
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (var b = 1; b < 4; b++) {
      var by = wallTop + (wallBase - wallTop) * (b / 4);
      ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(w, by); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(148,163,184,0.28)';
    ctx.beginPath(); ctx.moveTo(0, wallBase); ctx.lineTo(w, wallBase); ctx.stroke();

    // Floor, from the wall forward to the camera
    var floor = ctx.createLinearGradient(0, wallBase, 0, h);
    floor.addColorStop(0, '#141a22');
    floor.addColorStop(1, '#0b0f14');
    ctx.fillStyle = floor;
    ctx.fillRect(0, wallBase, w, h - wallBase);

    // Depth lines on the floor, every metre up to the wall.
    for (var z = 1; z < WALL_M; z++) {
      var y = projY(z, 0) * h;
      if (y <= wallBase || y > h) continue;
      ctx.strokeStyle = 'rgba(94,230,192,' + (0.24 * (1 - z / (WALL_M + 2))).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Converging lateral lines, to sell the perspective.
    for (var lx = -5; lx <= 5; lx++) {
      var nearX = (0.5 + projHalfW(1.1, lx * 1.8) * 2) * w;
      var farX = (0.5 + projHalfW(WALL_M, lx * 1.8) * 2) * w;
      ctx.strokeStyle = 'rgba(94,230,192,0.05)';
      ctx.beginPath();
      ctx.moveTo(nearX, h);
      ctx.lineTo(farX, wallBase);
      ctx.stroke();
    }
  }

  function vignette() {
    var w = view.width, h = view.height;
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28,
                                     w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawScene() {
    var w = view.width, h = view.height;
    ctx.clearRect(0, 0, w, h);
    drawRoom();

    // Echo trail: where the person just was. These vacated pixels are what
    // produce the second band in the signature.
    for (var i = trail.length - 1; i >= 0; i--) {
      var a = (1 - (trail.length - i) / (trail.length + 1)) * 0.34;
      var er = subjectRect(trail[i], state.depth);
      groundShadow(ctx, er, a * 0.5);
      ctx.fillStyle = 'rgba(255,176,92,' + a.toFixed(3) + ')';
      personPath(ctx, er);
    }

    var curr = subjectRect(state.x, state.depth);
    groundShadow(ctx, curr, 1);

    // Nearer reads brighter; distance desaturates toward the haze.
    var near = 1 - Math.min(1, (state.depth - 0.5) / 7);
    ctx.save();
    ctx.shadowColor = 'rgba(94,230,192,0.5)';
    ctx.shadowBlur = 18 * near + 6;
    ctx.fillStyle = 'rgba(' + Math.round(130 + 40 * near) + ',' +
                    Math.round(226 + 12 * near) + ',' +
                    Math.round(200 + 20 * near) + ',' + (0.72 + 0.26 * near).toFixed(3) + ')';
    personPath(ctx, curr);
    ctx.restore();

    vignette();

    // Labels, placed on the surfaces they name.
    ctx.font = '11px ui-monospace, monospace';
    var wallMid = (projY(WALL_M, WALL_TOP_M) + projY(WALL_M, 0)) / 2 * h;
    // Kept short: on a 300px canvas the long form ran under the figure, and
    // the readout below the strip already says "from the camera".
    ctx.fillStyle = 'rgba(168,182,198,0.9)';
    ctx.fillText('back wall — ' + WALL_M.toFixed(1) + ' m', 12, wallMid);

    ctx.fillStyle = '#5ee6c0';
    ctx.fillText('person — ' + state.depth.toFixed(1) + ' m', 12, 20);

    if (trail.length) {
      ctx.fillStyle = 'rgba(255, 176, 92, 0.95)';
      ctx.fillText('wall they just uncovered', 12, h - 12);
    }
  }

  function step() {
    drawScene();
    renderSignature(computeHistogram());
  }

  function advance() {
    if (!state.playing || state.dragging) return;
    state.prevX = state.x;
    pushTrail(state.x);
    state.x += 0.018 * state.dir;
    if (state.x > 0.78) { state.x = 0.78; state.dir = -1; }
    if (state.x < 0.22) { state.x = 0.22; state.dir = 1; }
    step();
  }

  // ── input ───────────────────────────────────────────────────────────
  function pointerX(e) {
    var r = view.getBoundingClientRect();
    return Math.max(0.12, Math.min(0.88, (e.clientX - r.left) / r.width));
  }

  view.addEventListener('pointerdown', function (e) {
    // Apply the interaction BEFORE requesting capture: setPointerCapture can
    // throw (NotFoundError) and must never take the update down with it.
    state.dragging = true;
    state.prevX = state.x;
    pushTrail(state.x);
    state.x = pointerX(e);
    step();
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* capture optional */ }
  });

  view.addEventListener('pointermove', function (e) {
    if (!state.dragging) return;
    var nx = pointerX(e);
    if (Math.abs(nx - state.x) < 0.002) return;
    state.prevX = state.x;
    pushTrail(state.x);
    state.x = nx;
    step();
  });

  function endDrag(e) {
    if (!state.dragging) return;
    state.dragging = false;
    try { view.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  }
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  depthInput.addEventListener('input', function () {
    state.depth = parseFloat(depthInput.value);
    depthOut.textContent = state.depth.toFixed(1) + ' m';
    step();
  });

  root.querySelectorAll('.seg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      mode = btn.getAttribute('data-mode');
      root.querySelectorAll('.seg-btn').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      step();
    });
  });

  playBtn.addEventListener('click', function () {
    if (state.playing) { trail.length = 0; step(); }   // settle when paused
    state.playing = !state.playing;
    playBtn.textContent = state.playing ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(state.playing));
  });

  // ── loop ────────────────────────────────────────────────────────────
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    state.playing = false;
    playBtn.textContent = 'Play';
  }

  // Size the canvas to its container, accounting for device pixel ratio.
  function resize() {
    var rect = view.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    view.width = Math.round(rect.width * dpr);
    view.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Draw in CSS pixels from here on.
    view.width = Math.round(rect.width);
    view.height = Math.round(rect.height);
    step();
  }

  window.addEventListener('resize', resize);

  // Only animate while the section is on screen.
  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }, { threshold: 0.05 }).observe(root);
  }

  var last = 0;
  function tick(now) {
    if (visible && now - last > 90) { advance(); last = now; }
    requestAnimationFrame(tick);
  }

  resize();
  requestAnimationFrame(tick);
})();


/* ═══════════════════════════════════════════════════════════════════
   Cross-camera matching demo.

   Mirrors realsense-multicam-detection/src/depth_matching.py: each camera
   deprojects its own bbox centre to a 3D point, and two detections are the
   same object when those points fall within MATCH_THRESHOLD of each other.

   The plan view is top-down. Both cameras look along +z; camera 2 is offset
   along x by the baseline. The point of the demo is what happens when that
   offset is never accounted for.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var root = document.getElementById('stereo-demo');
  if (!root) return;

  var MATCH_THRESHOLD = 0.10;        // metres — depth_matching.py
  var HFOV = 87 * Math.PI / 180;     // Intel RealSense D455 colour FOV

  var view = root.querySelector('.stereo-view');
  var ctx = view.getContext('2d');
  var baseIn = root.querySelector('#st-baseline');
  var baseOut = root.querySelector('#st-baseline-val');
  var noiseIn = root.querySelector('#st-noise');
  var noiseOut = root.querySelector('#st-noise-val');
  var segBtns = root.querySelectorAll('.seg-btn');
  var p1El = root.querySelector('#st-p1');
  var p2El = root.querySelector('#st-p2');
  var dEl = root.querySelector('#st-d');
  var verdictEl = root.querySelector('#st-verdict');

  // World extents shown in the plan view.
  // Z_MIN sits below zero so the camera glyphs and their labels have room
  // under the z = 0 line instead of being clipped by the canvas edge.
  var X_MIN = -1.6, X_MAX = 2.6, Z_MIN = -0.8, Z_MAX = 6.5;

  var hasHover = window.matchMedia('(hover: hover)').matches;

  var state = { sx: 0.5, sz: 3.2, baseline: 0.45, noise: 0.01, calib: true, dragging: false };
  var dashPhase = 0;   // marching-ants offset for the measurement rays

  function toPx(x, z) {
    return {
      px: (x - X_MIN) / (X_MAX - X_MIN) * view.width,
      py: view.height - (z - Z_MIN) / (Z_MAX - Z_MIN) * view.height
    };
  }
  function toWorld(px, py) {
    return {
      x: px / view.width * (X_MAX - X_MIN) + X_MIN,
      z: (view.height - py) / view.height * (Z_MAX - Z_MIN) + Z_MIN
    };
  }

  /* Deterministic pseudo-noise, so the readout is stable while dragging
     instead of flickering every frame.

     Uses a hash rather than plain sin(a*seed): with two nearby seeds, sin can
     land on near-identical values at a given position, and the two cameras'
     noise then cancels instead of accumulating. */
  function jitter(seed) {
    var v = Math.sin(state.sx * 12.9898 + state.sz * 78.233 + seed * 37.719) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;    // well-distributed in [-1, 1]
  }

  function visible(camX) {
    var dx = state.sx - camX;
    return Math.abs(Math.atan2(dx, state.sz)) <= HFOV / 2 && state.sz > 0.15;
  }

  function compute() {
    var cam1X = 0, cam2X = state.baseline;

    // Each camera measures the subject in ITS OWN frame, with depth error.
    var p1 = { x: state.sx - cam1X, z: state.sz + state.noise * jitter(11.7) };
    var p2 = { x: state.sx - cam2X, z: state.sz + state.noise * jitter(7.3) };

    // depth_matching.py compares these directly. Applying the stored
    // extrinsics would first bring camera 2's point into camera 1's frame.
    var q2 = state.calib ? { x: p2.x + state.baseline, z: p2.z } : p2;

    var dx = p1.x - q2.x, dz = p1.z - q2.z;
    return {
      cam1X: cam1X, cam2X: cam2X, p1: p1, p2: p2, q2: q2,
      dist: Math.sqrt(dx * dx + dz * dz),
      v1: visible(cam1X), v2: visible(cam2X)
    };
  }

  function drawCameraLabels(x1, x2, a1, a2) {
    var p1x = toPx(x1, 0.12).px, p2x = toPx(x2, 0.12).px;
    var y = toPx(0, 0.12).py + 26;
    ctx.font = '10px ui-monospace, monospace';
    // At a small baseline the two cameras are only a few pixels apart, so two
    // labels overprint into unreadable mush. Merge them instead.
    if (Math.abs(p2x - p1x) < 38) {
      ctx.fillStyle = (a1 || a2) ? '#5ee6c0' : '#6f7d8c';
      ctx.textAlign = 'center';
      ctx.fillText('cam 1 + 2', (p1x + p2x) / 2, y);
      ctx.textAlign = 'left';
      return;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = a1 ? '#5ee6c0' : '#6f7d8c';
    ctx.fillText('cam 1', p1x, y);
    ctx.fillStyle = a2 ? '#5ee6c0' : '#6f7d8c';
    ctx.fillText('cam 2', p2x, y);
    ctx.textAlign = 'left';
  }

  function drawCamera(x, active) {
    var p = toPx(x, 0.12);
    var col = active ? '#5ee6c0' : '#55636f';

    // Field of view, fading with distance rather than a flat wash.
    var apex = { x: p.px, y: p.py };
    var spread = Math.tan(HFOV / 2) * Z_MAX;
    var l = toPx(x - spread, Z_MAX), rr = toPx(x + spread, Z_MAX);
    var g = ctx.createLinearGradient(apex.x, apex.y, apex.x, l.py);
    g.addColorStop(0, active ? 'rgba(94,230,192,0.10)' : 'rgba(120,132,145,0.05)');
    g.addColorStop(0.55, active ? 'rgba(94,230,192,0.028)' : 'rgba(120,132,145,0.018)');
    g.addColorStop(1, 'rgba(94,230,192,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(apex.x, apex.y);
    ctx.lineTo(rr.px, rr.py);
    ctx.lineTo(l.px, l.py);
    ctx.closePath();
    ctx.fill();

    // Cone edges
    ctx.strokeStyle = active ? 'rgba(94,230,192,0.13)' : 'rgba(120,132,145,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l.px, l.py); ctx.lineTo(apex.x, apex.y); ctx.lineTo(rr.px, rr.py);
    ctx.stroke();

    // Camera body: a small block with a lens, rather than a bare triangle.
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.shadowColor = active ? 'rgba(94,230,192,0.55)' : 'transparent';
    ctx.shadowBlur = active ? 10 : 0;
    ctx.fillStyle = col;
    roundRect(ctx, -9, 2, 18, 12, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0f14';
    ctx.beginPath(); ctx.arc(0, 8, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 8, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();                      // lens hood, pointing up-range
    ctx.moveTo(-5, 2); ctx.lineTo(5, 2); ctx.lineTo(0, -5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawFloor() {
    var w = view.width, h = view.height;

    var bg = ctx.createLinearGradient(0, h, 0, 0);
    bg.addColorStop(0, '#121821');
    bg.addColorStop(1, '#0b0e13');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Distance arcs centred between the cameras: distance from the rig, not
    // a flat y coordinate, which is what the matcher actually reasons about.
    var o = toPx(state.baseline / 2, 0.12);
    ctx.lineWidth = 1;
    for (var z = 1; z <= 6; z++) {
      var edge = toPx(state.baseline / 2, z);
      var rad = Math.abs(o.py - edge.py);
      ctx.strokeStyle = 'rgba(94,230,192,' + (0.13 * (1 - z / 8)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(o.px, o.py, rad, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(110,125,140,0.5)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(z + ' m', 7, edge.py - 4);
    }
  }

  function draw(r) {
    var w = view.width, h = view.height;
    ctx.clearRect(0, 0, w, h);
    drawFloor();

    drawCamera(r.cam1X, r.v1);
    drawCamera(r.cam2X, r.v2);
    drawCameraLabels(r.cam1X, r.cam2X, r.v1, r.v2);

    // Two different things are drawn here, and keeping them apart is the
    // whole point:
    //   1. the SIGHTLINES — where each camera physically sees the person.
    //      Both are correct; both point at the same spot.
    //   2. the READINGS — where each camera's measurement lands once the
    //      matcher treats both as if they shared one coordinate frame.
    //      Without calibration, camera 2's lands a baseline away from
    //      camera 1's, which is the disagreement the number reports.
    var personPt = toPx(state.sx, state.sz);

    function sightline(camX, colour, active) {
      if (!active) return;
      var a = toPx(camX, 0.12);
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -dashPhase;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(personPt.px, personPt.py);
      ctx.stroke();
      ctx.restore();
    }
    sightline(r.cam1X, 'rgba(94,230,192,0.65)', r.v1);
    sightline(r.cam2X, 'rgba(255,176,92,0.65)', r.v2);

    if (r.v1 && r.v2) {
      var e1 = toPx(r.p1.x, r.p1.z);          // camera 1's reading
      var e2 = toPx(r.q2.x, r.q2.z);          // camera 2's, as the matcher reads it
      var ok = r.dist < MATCH_THRESHOLD;
      var col = ok ? '#5ee6c0' : '#ff6b6b';

      if (!ok) {
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(e1.px, e1.py); ctx.lineTo(e2.px, e2.py); ctx.stroke();
        ctx.restore();
      }

      function readingDot(pt, colour, r) {
        ctx.save();
        ctx.shadowColor = colour;
        ctx.shadowBlur = 9;
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(pt.px, pt.py, r || 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // When the two readings agree they land on the same pixel, and drawing
      // both plus the person turns into an unreadable blob. Agreement is one
      // marker; disagreement is two.
      var sep = Math.hypot(e1.px - e2.px, e1.py - e2.py);
      if (sep < 9) {
        readingDot(e1, '#5ee6c0', 5);
        ctx.strokeStyle = 'rgba(94,230,192,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e1.px, e1.py, 9, 0, Math.PI * 2); ctx.stroke();
      } else {
        readingDot(e1, '#5ee6c0');
        readingDot(e2, '#ffb05c');
      }

      if (!ok) {
        // Below the span: the person ring and its label occupy the space above.
        var mx = (e1.px + e2.px) / 2, my = (e1.py + e2.py) / 2;
        var label = human(r.dist) + ' apart';
        ctx.font = '10px ui-monospace, monospace';
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(11,15,20,0.9)';
        roundRect(ctx, mx - tw / 2 - 6, my + 9, tw + 12, 16, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,107,107,0.35)';
        ctx.lineWidth = 1;
        roundRect(ctx, mx - tw / 2 - 6, my + 9, tw + 12, 16, 4);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.textAlign = 'center';
        ctx.fillText(label, mx, my + 20);
        ctx.textAlign = 'left';
      }
    }

    // Where the person actually is: a hollow ring, so the coloured readings
    // sit legibly inside it instead of being covered by it.
    var sp = toPx(state.sx, state.sz);
    var glow = ctx.createRadialGradient(sp.px, sp.py, 0, sp.px, sp.py, 26);
    glow.addColorStop(0, 'rgba(231,237,244,0.13)');
    glow.addColorStop(1, 'rgba(231,237,244,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sp.px, sp.py, 26, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(231,237,244,0.8)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(sp.px, sp.py, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(231,237,244,0.85)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('person', sp.px + 20, sp.py - 12);

    if (!hasHover) {
      ctx.fillStyle = 'rgba(139,148,158,0.75)';
      ctx.font = '10px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('tap to move the person', view.width - 10, 16);
      ctx.textAlign = 'left';
    }
  }

  function fmt(p) { return '(' + p.x.toFixed(2) + ', ' + p.z.toFixed(2) + ') m'; }

  /* Centimetres read more naturally than "0.060 m" for anything under a metre. */
  function human(m) {
    return m < 1 ? Math.round(m * 100) + ' cm' : m.toFixed(2) + ' m';
  }

  function render() {
    var r = compute();
    draw(r);

    p1El.textContent = r.v1 ? fmt(r.p1) : 'not in view';
    p2El.textContent = r.v2 ? fmt(state.calib ? r.q2 : r.p2) : 'not in view';

    if (!r.v1 || !r.v2) {
      dEl.textContent = '—';
      verdictEl.textContent = 'Only one camera can see this person — there is nothing to compare.';
      verdictEl.className = 'stereo-verdict warn';
      return;
    }

    dEl.textContent = human(r.dist);
    var ok = r.dist < MATCH_THRESHOLD;
    verdictEl.textContent = ok
      ? 'SAME PERSON — the two cameras agree to within ' + human(r.dist) + '. Counted once.'
      : 'COUNTED TWICE — the cameras disagree by ' + human(r.dist) +
        ', so this one person is recorded as two.';
    verdictEl.className = 'stereo-verdict ' + (ok ? 'ok' : 'bad');
  }

  // ── input ───────────────────────────────────────────────────────────
  function setFromPointer(e) {
    var rect = view.getBoundingClientRect();
    var w = toWorld((e.clientX - rect.left) / rect.width * view.width,
                    (e.clientY - rect.top) / rect.height * view.height);
    state.sx = Math.max(X_MIN + 0.2, Math.min(X_MAX - 0.2, w.x));
    state.sz = Math.max(0.4, Math.min(Z_MAX - 0.3, w.z));
    render();
  }

  view.addEventListener('pointerdown', function (e) {
    // Tap-to-place is the primary touch interaction: on a phone `touch-action:
    // pan-y` hands vertical gestures to the page scroller, so the subject
    // cannot be dragged toward/away — a single tap sets both x and z at once.
    // Apply it before requesting capture, which can throw.
    state.dragging = true;
    setFromPointer(e);
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* capture optional */ }
  });
  view.addEventListener('pointermove', function (e) {
    if (state.dragging) setFromPointer(e);
  });
  function end(e) {
    if (!state.dragging) return;
    state.dragging = false;
    try { view.releasePointerCapture(e.pointerId); } catch (err) { /* already gone */ }
  }
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);

  baseIn.addEventListener('input', function () {
    state.baseline = parseFloat(baseIn.value);
    baseOut.textContent = state.baseline.toFixed(2) + ' m';
    render();
  });
  noiseIn.addEventListener('input', function () {
    state.noise = parseFloat(noiseIn.value);
    noiseOut.textContent = Math.round(state.noise * 1000) + ' mm';
    render();
  });
  segBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.calib = btn.getAttribute('data-calib') === '1';
      segBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      render();
    });
  });

  function resize() {
    var rect = view.getBoundingClientRect();
    view.width = Math.round(rect.width);
    view.height = Math.round(rect.height);
    render();
  }
  window.addEventListener('resize', resize);

  // The rays march slowly so the plan reads as live measurement rather than a
  // diagram. Only while the section is on screen, and never under
  // prefers-reduced-motion.
  var stillness = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var onScreen = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
    }, { threshold: 0.05 }).observe(root);
  }

  var lastTick = 0;
  function tick(now) {
    if (!stillness && onScreen && now - lastTick > 34) {
      dashPhase = (dashPhase + 0.6) % 9;
      lastTick = now;
      render();
    }
    requestAnimationFrame(tick);
  }

  resize();
  requestAnimationFrame(tick);
})();
