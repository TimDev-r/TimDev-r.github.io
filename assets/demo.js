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

  // Subject size shrinks with distance, as a real camera would see it.
  function subjectRect(cx, depth) {
    var scale = 3.0 / Math.max(0.5, depth);
    var w = 0.14 * scale, h = 0.55 * scale;
    return { x0: cx - w / 2, x1: cx + w / 2, y0: 0.5 - h / 2, y1: 0.5 + h / 2 };
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
    readout.textContent = active.length
      ? 'Motion at ' + active.join(' and ') + '  ·  ' + counts['+'] + ' strong, ' + counts.x + ' micro'
      : 'No motion — the subject is stationary.';
  }

  function drawScene() {
    var w = view.width, h = view.height;
    var curr = subjectRect(state.x, state.depth);
    var prev = subjectRect(state.prevX, state.depth);

    // Wall: darker with distance, so the scene reads as a room.
    ctx.fillStyle = '#11161d';
    ctx.fillRect(0, 0, w, h);

    // Floor line for a sense of depth.
    ctx.strokeStyle = '#1e2732';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.82);
    ctx.lineTo(w, h * 0.82);
    ctx.stroke();

    // Ghost of the previous position — the vacated region.
    ctx.fillStyle = 'rgba(255, 176, 92, 0.16)';
    ctx.fillRect(prev.x0 * w, prev.y0 * h, (prev.x1 - prev.x0) * w, (prev.y1 - prev.y0) * h);

    // The subject now.
    var near = 1 - Math.min(1, (state.depth - 0.5) / 7);
    ctx.fillStyle = 'rgba(94, 230, 192, ' + (0.35 + 0.5 * near).toFixed(3) + ')';
    ctx.fillRect(curr.x0 * w, curr.y0 * h, (curr.x1 - curr.x0) * w, (curr.y1 - curr.y0) * h);

    ctx.strokeStyle = '#5ee6c0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(curr.x0 * w, curr.y0 * h, (curr.x1 - curr.x0) * w, (curr.y1 - curr.y0) * h);

    // Labels.
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('wall ' + WALL_M.toFixed(1) + ' m', 10, 18);
    ctx.fillStyle = '#5ee6c0';
    ctx.fillText('subject ' + state.depth.toFixed(1) + ' m', 10, 34);
    ctx.fillStyle = 'rgba(255, 176, 92, 0.85)';
    ctx.fillText('vacated → reads as wall', 10, h - 12);
  }

  function step() {
    drawScene();
    renderSignature(computeHistogram());
  }

  function advance() {
    if (!state.playing || state.dragging) return;
    state.prevX = state.x;
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
    state.dragging = true;
    view.setPointerCapture(e.pointerId);
    state.prevX = state.x;
    state.x = pointerX(e);
    step();
  });

  view.addEventListener('pointermove', function (e) {
    if (!state.dragging) return;
    var nx = pointerX(e);
    if (Math.abs(nx - state.x) < 0.002) return;
    state.prevX = state.x;
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

  playBtn.addEventListener('click', function () {
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
  var calibIn = root.querySelector('#st-calib');
  var p1El = root.querySelector('#st-p1');
  var p2El = root.querySelector('#st-p2');
  var dEl = root.querySelector('#st-d');
  var verdictEl = root.querySelector('#st-verdict');

  // World extents shown in the plan view.
  // Z_MIN sits below zero so the camera glyphs and their labels have room
  // under the z = 0 line instead of being clipped by the canvas edge.
  var X_MIN = -1.6, X_MAX = 2.6, Z_MIN = -0.8, Z_MAX = 6.5;

  var state = { sx: 0.5, sz: 3.2, baseline: 0.06, noise: 0.01, calib: false, dragging: false };

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

  function drawCamera(x, label, active) {
    var p = toPx(x, 0.12);
    ctx.fillStyle = active ? '#5ee6c0' : '#55636f';
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(p.px - 9, p.py + 13);
    ctx.lineTo(p.px + 9, p.py + 13);
    ctx.closePath();
    ctx.fill();

    // Field of view
    var far = toPx(x + Math.tan(HFOV / 2) * Z_MAX, Z_MAX);
    var far2 = toPx(x - Math.tan(HFOV / 2) * Z_MAX, Z_MAX);
    ctx.fillStyle = active ? 'rgba(94,230,192,0.05)' : 'rgba(120,130,140,0.04)';
    ctx.beginPath();
    ctx.moveTo(p.px, p.py);
    ctx.lineTo(far.px, far.py);
    ctx.lineTo(far2.px, far2.py);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = active ? '#5ee6c0' : '#6f7d8c';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(label, p.px - 10, p.py + 26);
  }

  function draw(r) {
    var w = view.width, h = view.height;
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, w, h);

    // Depth gridlines every metre.
    ctx.strokeStyle = '#1a212a';
    ctx.fillStyle = '#4a5764';
    ctx.font = '9px ui-monospace, monospace';
    ctx.lineWidth = 1;
    for (var z = 1; z <= 6; z++) {
      var y = toPx(0, z).py;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillText(z + ' m', 6, y - 4);
    }

    drawCamera(r.cam1X, 'cam 1', r.v1);
    drawCamera(r.cam2X, 'cam 2', r.v2);

    // Rays from each camera to the point it believes it sees.
    function ray(camX, p, colour) {
      var a = toPx(camX, 0.12), b = toPx(camX + p.x, p.z);
      ctx.strokeStyle = colour;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colour;
      ctx.beginPath(); ctx.arc(b.px, b.py, 4, 0, Math.PI * 2); ctx.fill();
      return b;
    }

    var e1 = r.v1 ? ray(r.cam1X, r.p1, '#5ee6c0') : null;
    var e2 = r.v2 ? ray(r.cam2X, r.p2, '#ffb05c') : null;

    // The gap the matcher actually measures.
    if (e1 && e2) {
      var g2 = r.calib ? toPx(r.cam1X + r.q2.x, r.q2.z) : e2;
      if (r.calib) {
        ctx.fillStyle = 'rgba(255,176,92,0.55)';
        ctx.beginPath(); ctx.arc(g2.px, g2.py, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = r.dist < MATCH_THRESHOLD ? '#5ee6c0' : '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(e1.px, e1.py); ctx.lineTo(g2.px, g2.py); ctx.stroke();
    }

    // The subject itself.
    var s = toPx(state.sx, state.sz);
    ctx.strokeStyle = '#e7edf4';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(s.px, s.py, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('subject', s.px + 13, s.py + 3);
  }

  function fmt(p) { return '(' + p.x.toFixed(3) + ', ' + p.z.toFixed(3) + ') m'; }

  function render() {
    var r = compute();
    draw(r);

    p1El.textContent = r.v1 ? fmt(r.p1) : 'not in view';
    p2El.textContent = r.v2 ? fmt(state.calib ? r.q2 : r.p2) : 'not in view';

    if (!r.v1 || !r.v2) {
      dEl.textContent = '—';
      verdictEl.textContent = 'Only one camera can see the subject — nothing to match.';
      verdictEl.className = 'stereo-verdict warn';
      return;
    }

    dEl.textContent = r.dist.toFixed(3) + ' m';
    var ok = r.dist < MATCH_THRESHOLD;
    verdictEl.textContent = ok
      ? 'MATCH — ' + r.dist.toFixed(3) + ' m < 0.100 m threshold. One person, not two.'
      : 'NO MATCH — ' + r.dist.toFixed(3) + ' m ≥ 0.100 m. Counted as two separate people.';
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
    state.dragging = true;
    view.setPointerCapture(e.pointerId);
    setFromPointer(e);
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
  calibIn.addEventListener('change', function () {
    state.calib = calibIn.checked;
    render();
  });

  function resize() {
    var rect = view.getBoundingClientRect();
    view.width = Math.round(rect.width);
    view.height = Math.round(rect.height);
    render();
  }
  window.addEventListener('resize', resize);
  resize();
})();
