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
