/**
 * Ahmad Saleem Mentorship — Shared UI runtime
 * ------------------------------------------------------------------
 * Progressive enhancement only. Nothing here is required for the
 * platform to function: every page keeps its own data logic.
 *
 * Provides:
 *   - canonical theme (light / dark) helpers: MentorUI.syncTheme / toggleTheme
 *   - scroll-reveal + stagger (IntersectionObserver, transform/opacity only)
 *   - stat counter animation
 *   - sticky header scrolled state
 *   - dashboard sidebar drawer
 *   - password visibility toggles
 *   - progress bar / progress ring fill animation
 *
 * All decorative motion is disabled when the visitor prefers reduced motion.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'themePreference';
  var revealReady = false;
  var prefersReduced = function () {
    return (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  };

  /* ------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------ */

  function currentTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function syncTheme() {
    var theme = currentTheme();
    var body = document.body;
    if (!body) return theme;
    body.classList.toggle('dark-theme', theme === 'dark');
    body.classList.toggle('light-theme', theme === 'light');
    body.classList.toggle('dark', theme === 'dark');

    var label = document.getElementById('themeLabel');
    if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';

    var icon = document.getElementById('themeIcon');
    if (icon) {
      var name = theme === 'dark' ? 'sun' : 'moon';
      if (typeof window.getIcon === 'function') {
        icon.innerHTML = window.getIcon(name);
      }
      var label2 = document.getElementById('themeIconLabel');
      if (label2) label2.textContent = name;
    }

    var button = document.getElementById('themeToggleBtn');
    if (button) button.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    return theme;
  }

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* storage unavailable — theme still applies for this view */
    }
    syncTheme();
    if (window.app && typeof window.app.renderIcons === 'function') window.app.renderIcons();
  }

  /* ------------------------------------------------------------------
     Scroll reveal + stagger
     ------------------------------------------------------------------ */

  function collectRevealTargets() {
    var targets = [];
    document.querySelectorAll('[data-reveal], .scroll-reveal').forEach(function (el) {
      targets.push(el);
    });
    document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
      var step = Number(group.getAttribute('data-reveal-step') || 70);
      var max = Number(group.getAttribute('data-reveal-max') || 6);
      var children = group.querySelectorAll('[data-reveal-item], [data-reveal], .scroll-reveal');
      children.forEach(function (child, index) {
        child.style.setProperty('--reveal-delay', Math.min(index, max) * step + 'ms');
      });
    });
    return targets;
  }

  /* Safety net: the CSS hides [data-reveal] until .is-visible is added, so if
     anything in this file throws before the observer runs the page would be
     left blank. Reveal everything and stand down. */
  function revealAll() {
    document.querySelectorAll('[data-reveal], .scroll-reveal').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  function initReveal() {
    var targets = collectRevealTargets();
    if (!targets.length) return;

    revealReady = true;

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      targets.forEach(function (el) {
        el.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );

    targets.forEach(function (el) {
      if (el.classList.contains('is-visible')) return;
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Animated counters
     ------------------------------------------------------------------ */

  function animateCounter(el) {
    var target = Number(el.getAttribute('data-count-to'));
    if (!isFinite(target)) return;
    if (prefersReduced) {
      el.textContent = target.toLocaleString();
      return;
    }

    var duration = Number(el.getAttribute('data-count-duration') || 1200);
    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initCounters() {
    var counters = document.querySelectorAll('[data-count-to]');
    if (!counters.length) return;

    if (typeof IntersectionObserver === 'undefined') {
      counters.forEach(animateCounter);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Progress fill animation
     ------------------------------------------------------------------ */

  function initProgress() {
    var bars = document.querySelectorAll('.progress-bar-fill[data-progress]');
    bars.forEach(function (bar) {
      var value = Math.max(0, Math.min(100, Number(bar.getAttribute('data-progress')) || 0));
      if (prefersReduced) {
        bar.style.width = value + '%';
        return;
      }
      requestAnimationFrame(function () {
        setTimeout(function () {
          bar.style.width = value + '%';
        }, 90);
      });
    });

    var rings = document.querySelectorAll('.progress-ring[data-progress]');
    rings.forEach(function (ring) {
      var value = Math.max(0, Math.min(100, Number(ring.getAttribute('data-progress')) || 0));
      ring.style.setProperty('--value', String(value));
    });
  }

  /* ------------------------------------------------------------------
     Sticky header state
     ------------------------------------------------------------------ */

  function initHeader() {
    var header = document.getElementById('siteHeader');
    if (!header) return;
    var ticking = false;

    function apply() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    }
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------------------------------------------
     Mobile dashboard sidebar drawer
     ------------------------------------------------------------------ */

  function closeSidebar() {
    var sidebar = document.getElementById('appSidebar');
    var scrim = document.getElementById('sidebarScrim');
    var toggle = document.getElementById('sidebarToggle');
    if (sidebar) sidebar.classList.remove('is-open');
    if (scrim) scrim.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.style.removeProperty('overflow');
  }

  function initSidebar() {
    var sidebar = document.getElementById('appSidebar');
    var toggle = document.getElementById('sidebarToggle');
    var scrim = document.getElementById('sidebarScrim');
    var shell = document.querySelector('.app-shell');
    if (!sidebar || !toggle) return;

    toggle.addEventListener('click', function () {
      if (window.innerWidth > 1024) {
        var isCollapsed = shell && shell.classList.toggle('sidebar-collapsed');
        toggle.setAttribute('aria-expanded', String(!isCollapsed));
        return;
      }
      var isOpen = sidebar.classList.toggle('is-open');
      if (scrim) scrim.classList.toggle('is-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) document.body.style.overflow = 'hidden';
      else document.body.style.removeProperty('overflow');
    });

    if (scrim) scrim.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeSidebar();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024) {
        closeSidebar();
      } else if (shell) {
        shell.classList.remove('sidebar-collapsed');
      }
    });
  }

  /* ------------------------------------------------------------------
     Password visibility toggles
     ------------------------------------------------------------------ */

  function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
      button.addEventListener('click', function () {
        var input = document.getElementById(button.getAttribute('data-password-toggle'));
        if (!input) return;
        var reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', String(reveal));
        var iconName = reveal ? 'eye-off' : 'eye';
        if (typeof window.getIcon === 'function') button.innerHTML = window.getIcon(iconName);
        else if (window.app && window.app.renderIcons) window.app.renderIcons();
      });
    });
  }

  /* ------------------------------------------------------------------
     Accordions / dropdowns with ARIA
     ------------------------------------------------------------------ */

  function initDisclosures() {
    document.querySelectorAll('[data-disclosure]').forEach(function (button) {
      button.addEventListener('click', function () {
        var panel = document.getElementById(button.getAttribute('data-disclosure'));
        if (!panel) return;
        var isOpen = panel.hidden === false;
        panel.hidden = isOpen;
        button.setAttribute('aria-expanded', String(!isOpen));
        var wrapper = button.closest('[data-disclosure-root]');
        if (wrapper) wrapper.classList.toggle('open', !isOpen);
      });
    });
  }

  /* ------------------------------------------------------------------
     Theme toggle button
     ------------------------------------------------------------------ */

  function initThemeButton() {
    var button = document.getElementById('themeToggleBtn');
    if (!button || button.dataset.themeWired === 'true') return;
    button.dataset.themeWired = 'true';
    button.addEventListener('click', function (event) {
      // Pages that expose their own onclick handler keep it.
      if (button.getAttribute('onclick')) return;
      event.preventDefault();
      toggleTheme();
    });
  }

  /* ------------------------------------------------------------------
     Re-scan the DOM after async content renders
     ------------------------------------------------------------------ */

  function refresh() {
    initReveal();
    initCounters();
    initProgress();
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */

  function init() {
    try {
      syncTheme();
      initThemeButton();
      initHeader();
      initReveal();
      initCounters();
      initProgress();
      initSidebar();
      initPasswordToggles();
      initDisclosures();
    } catch (error) {
      // Never let a partial failure leave reveal-marked sections invisible.
      console.error('[MentorUI] init failed:', error);
    } finally {
      if (!revealReady) revealAll();
    }
  }

  window.MentorUI = {
    syncTheme: syncTheme,
    toggleTheme: toggleTheme,
    closeSidebar: closeSidebar,
    refresh: refresh,
    revealAll: revealAll,
    reducedMotion: prefersReduced
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
