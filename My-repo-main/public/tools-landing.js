/* ==========================================================================
   Tools Landing — "Storm Grid" motion layer
   --------------------------------------------------------------------------
   Progressive enhancement for public/tools.html only. Everything here is
   decorative: 3D card tilt, cursor spotlight, bolt overlays, ambient canvas
   (particles + lightning strikes) and hero stat count-ups. It never touches
   the tool data or links rendered by tools.js, so navigation, the nav
   dropdown, theme toggle and mobile drawer keep working exactly as before.
   All motion shuts off when the visitor prefers reduced motion.
   ========================================================================== */
(function () {
  'use strict';

  if (!document.body || !document.body.classList.contains('tools-public-page')) return;

  var reducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------
     1. Bolt SVG injected into every rendered card (purely decorative).
     --------------------------------------------------------------------- */
  var BOLT_SVG =
    '<svg class="fx-card-bolt" viewBox="0 0 24 40" fill="currentColor" aria-hidden="true">' +
    '<path d="M14.5 0 3 22h7.2L8 40 21 16h-7.4L14.5 0Z"/></svg>';

  var BOLT_MARK_SVG =
    '<svg class="fx-bolt-mark {SIDE}" viewBox="0 0 24 40" fill="currentColor" aria-hidden="true">' +
    '<path d="M14.5 0 3 22h7.2L8 40 21 16h-7.4L14.5 0Z"/></svg>';

  /* ---------------------------------------------------------------------
     2. Card enhancements: stagger index, tilt, spotlight, bolt overlay.
        Runs after tools.js paints the grid; also survives later re-renders
        via a MutationObserver so cards never lose their effects.
     --------------------------------------------------------------------- */
  var finePointer = !window.matchMedia || window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function enhanceCard(card, index) {
    if (card.dataset.fxReady === 'true') return;
    card.dataset.fxReady = 'true';
    card.style.setProperty('--fx-i', String(index));

    if (!card.querySelector('.fx-card-bolt')) {
      card.insertAdjacentHTML('afterbegin', BOLT_SVG);
    }

    if (reducedMotion || !finePointer) return;

    var frame = null;
    var pending = null;

    function apply() {
      frame = null;
      if (!pending) return;
      var rect = card.getBoundingClientRect();
      var px = (pending.clientX - rect.left) / rect.width;
      var py = (pending.clientY - rect.top) / rect.height;
      px = Math.min(1, Math.max(0, px));
      py = Math.min(1, Math.max(0, py));
      /* tilt away from the cursor, capped so text stays readable */
      card.style.setProperty('--card-ry', ((px - 0.5) * 11).toFixed(2) + 'deg');
      card.style.setProperty('--card-rx', ((0.5 - py) * 9).toFixed(2) + 'deg');
      card.style.setProperty('--spot-x', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--spot-y', (py * 100).toFixed(1) + '%');
      pending = null;
    }

    card.addEventListener('pointermove', function (event) {
      pending = { clientX: event.clientX, clientY: event.clientY };
      if (frame === null) frame = requestAnimationFrame(apply);
    });

    function reset() {
      card.style.setProperty('--card-rx', '0deg');
      card.style.setProperty('--card-ry', '0deg');
    }
    card.addEventListener('pointerleave', reset);
    card.addEventListener('blur', reset, true);
  }

  function enhanceCards() {
    var grid = document.querySelector('[data-tools-grid]');
    if (!grid) return;
    var cards = grid.querySelectorAll('.tools-card');
    for (var i = 0; i < cards.length; i += 1) enhanceCard(cards[i], i);
  }

  /* tools.js renders on DOMContentLoaded; cover both timing orders. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceCards);
  } else {
    enhanceCards();
  }

  /* If tools.js ever re-renders the grid, re-tag the fresh cards. */
  if (typeof MutationObserver !== 'undefined') {
    var gridRoot = document.querySelector('[data-tools-grid]');
    if (gridRoot) {
      var observer = new MutationObserver(function () { enhanceCards(); });
      observer.observe(gridRoot, { childList: true });
    }
  }

  /* ---------------------------------------------------------------------
     3. Hero heading bolt marks — injected so the server HTML stays clean.
     --------------------------------------------------------------------- */
  function injectHeadingBolts() {
    var heading = document.querySelector('.tools-page-heading h1');
    if (!heading || heading.querySelector('.fx-bolt-mark')) return;
    heading.insertAdjacentHTML('afterbegin',
      BOLT_MARK_SVG.replace('{SIDE}', 'fx-bolt-left'));
    heading.insertAdjacentHTML('beforeend',
      BOLT_MARK_SVG.replace('{SIDE}', 'fx-bolt-right'));
  }

  /* ---------------------------------------------------------------------
     4. Stat count-ups. The pills live in the HTML with data-fx-count, so
        the real numbers are readable even if this script never runs.
     --------------------------------------------------------------------- */
  function countUpStats() {
    var stats = document.querySelectorAll('[data-fx-count]');
    if (!stats.length) return;
    stats.forEach(function (el) {
      var target = Number(el.getAttribute('data-fx-count'));
      if (!isFinite(target)) return;
      if (reducedMotion) { el.textContent = String(target); return; }

      var duration = 1100;
      var start = null;
      function step(timestamp) {
        if (start === null) start = timestamp;
        var progress = Math.min((timestamp - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = String(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------------------------------------------------------------------
     5. Ambient canvas — drifting sparks plus occasional lightning strikes
        behind the content. Paused when the tab is hidden.
     --------------------------------------------------------------------- */
  function initCanvas() {
    var canvas = document.querySelector('.fx-canvas');
    var saveData = navigator.connection && navigator.connection.saveData;
    var smallScreen = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    if (!canvas || reducedMotion || saveData || smallScreen) {
      if (canvas) canvas.style.display = 'none';
      return;
    }
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var width = 0;
    var height = 0;
    var particles = [];
    var strikes = [];
    var running = true;
    var nextStrikeIn = 2200; /* ms until the first bolt */

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    }

    function seedParticles() {
      var count = Math.round(Math.min(28, Math.max(16, width / 48)));
      particles = [];
      for (var i = 0; i < count; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.6 + Math.random() * 1.8,
          vx: (Math.random() - 0.5) * 0.22,
          vy: -0.12 - Math.random() * 0.32,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.5 ? 224 : 189 /* periwinkle / cyan */
        });
      }
    }

    /* Build a jagged polyline from the top of the scene to a ground point. */
    function makeBolt() {
      var endX = width * (0.12 + Math.random() * 0.76);
      var endY = height * (0.45 + Math.random() * 0.4);
      var segments = [];
      var x = endX + (Math.random() - 0.5) * 90;
      var y = -10;
      var steps = 9 + Math.floor(Math.random() * 5);
      for (var i = 1; i <= steps; i += 1) {
        var t = i / steps;
        segments.push({
          x: x + (endX - x) * t + (Math.random() - 0.5) * 46 * (1 - t),
          y: y + (endY - y) * t
        });
      }
      return { points: segments, life: 1 };
    }

    function drawBolt(bolt, alpha) {
      if (!bolt.points.length) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(167, 190, 255, 0.95)';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = 'rgba(129, 140, 248, 0.9)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(width * 0.5 + (bolt.points[0].x - width * 0.5), -10);
      for (var i = 0; i < bolt.points.length; i += 1) {
        ctx.lineTo(bolt.points[i].x, bolt.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    var last = 0;
    function frame(now) {
      if (!running) return;
      if (last && now - last < 33) {
        requestAnimationFrame(frame);
        return;
      }
      var dt = last ? Math.min(now - last, 64) : 33;
      last = now;

      ctx.clearRect(0, 0, width, height);

      /* drifting sparks */
      for (var i = 0; i < particles.length; i += 1) {
        var p = particles[i];
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.phase += 0.02;
        if (p.y < -8) { p.y = height + 8; p.x = Math.random() * width; }
        if (p.x < -8) p.x = width + 8;
        if (p.x > width + 8) p.x = -8;
        var twinkle = 0.35 + Math.sin(p.phase) * 0.25;
        ctx.beginPath();
        ctx.fillStyle = 'hsla(' + p.hue + ', 90%, 70%, ' + twinkle + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      /* schedule + decay lightning strikes */
      nextStrikeIn -= dt;
      if (nextStrikeIn <= 0) {
        strikes.push(makeBolt());
        if (Math.random() < 0.35) strikes.push(makeBolt()); /* double flash */
        nextStrikeIn = 3200 + Math.random() * 4200;
      }
      for (var s = strikes.length - 1; s >= 0; s -= 1) {
        strikes[s].life -= dt / 420;
        if (strikes[s].life <= 0) {
          strikes.splice(s, 1);
        } else {
          /* flicker: fade out then snap bright again briefly */
          var life = strikes[s].life;
          var alpha = life > 0.6 ? (1 - life) * 2.4 : life * 1.4;
          drawBolt(strikes[s], Math.max(0, Math.min(0.9, alpha)));
        }
      }

      requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        running = false;
      } else if (!running) {
        running = true;
        last = 0;
        requestAnimationFrame(frame);
      }
    });

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------------
     Boot
     --------------------------------------------------------------------- */
  function boot() {
    try {
      injectHeadingBolts();
      enhanceCards();
      countUpStats();
      initCanvas();
    } catch (error) {
      /* Decorative layer must never break the page. */
      console.error('[ToolsLanding] motion layer failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
