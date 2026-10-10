(function () {
  'use strict';

  var tools = [
    {
      id: 'calculator',
      name: 'Calculator',
      description: 'Perform basic and advanced mathematical calculations.',
      icon: '🧮',
      route: '/tools/calculator',
      available: true
    },
    {
      id: 'merge-pdf',
      name: 'Merge PDF',
      description: 'Combine multiple PDF files into one document.',
      icon: '<svg class="pdf-merge-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5.5 9.5A3.5 3.5 0 0 1 9 6h12l6 6v4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M21 6v7h6" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 14.5h9M9 19h8M9 23.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M23 23h9.5M28 18l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M26 30v2.5a2 2 0 0 1-2 2H9a3.5 3.5 0 0 1-3.5-3.5V13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M29 27.5h4.5A2.5 2.5 0 0 1 36 30v4H24v-4a2.5 2.5 0 0 1 2.5-2.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M27 31.5h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      route: '/tools/merge-pdf',
      available: true
    },
    {
      id: 'split-pdf',
      name: 'Split PDF',
      description: 'Extract specific pages or page ranges from a PDF.',
      icon: '<svg class="pdf-split-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 5.5h14l6 6v8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M22 6v7h6M11 18h9M11 22h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M25 22v-3m0 3-3-3m3 3 3-3M25 22v4m0 0-3 3m3-3 3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 13v17a3 3 0 0 0 3 3h7m7-8h1.5a3 3 0 0 1 3 3v2.5h-9V31a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      route: '/tools/split-pdf',
      available: true
    }
  ];
  window.PUBLIC_TOOLS = tools;

  function toolLink(tool, className) {
    return '<a class="' + className + '" href="' + tool.route + '">' +
      '<span class="tool-link-icon" aria-hidden="true">' + tool.icon + '</span>' +
      '<span class="tool-link-copy"><strong>' + tool.name + '</strong><small>' + tool.description + '</small></span>' +
      '<span class="tool-link-arrow" aria-hidden="true">↗</span>' +
      '</a>';
  }

  function renderTools() {
    var dropdown = document.querySelector('[data-tools-menu]');
    if (dropdown) {
      dropdown.innerHTML = tools.filter(function (tool) { return tool.available; })
        .map(function (tool) { return toolLink(tool, 'tools-dropdown-link'); }).join('');
    }

    var mobileMenu = document.querySelector('[data-tools-mobile-menu]');
    if (mobileMenu) {
      mobileMenu.innerHTML = tools.filter(function (tool) { return tool.available; })
        .map(function (tool) {
          return '<a class="mobile-nav-item mobile-tool-item" href="' + tool.route + '">' +
            '<span aria-hidden="true">' + tool.icon + '</span> ' + tool.name + '</a>';
        }).join('');
    }

    initMobileToolsDropdown();

    var grid = document.querySelector('[data-tools-grid]');
    if (grid) {
      var availableTools = tools.filter(function (tool) { return tool.available; });
      grid.classList.toggle('has-single-tool', availableTools.length === 1);
      grid.innerHTML = availableTools
        .map(function (tool) {
          return '<a class="tools-card" href="' + tool.route + '">' +
            '<span class="tools-card-icon" aria-hidden="true">' + tool.icon + '</span>' +
            '<span class="tools-card-copy"><span class="tools-card-title">' + tool.name + '</span>' +
            '<span class="tools-card-description">' + tool.description + '</span></span>' +
            '<span class="tools-card-arrow" aria-hidden="true">↗</span>' +
            '</a>';
        }).join('');
    }

    var recommendations = document.querySelector('[data-tools-recommendations]');
    if (recommendations) {
      var currentTool = document.body.getAttribute('data-current-tool');
      var otherTools = tools.filter(function (tool) {
        return tool.available && tool.id !== currentTool;
      });
      recommendations.hidden = otherTools.length === 0;
      var recommendationGrid = recommendations.querySelector('[data-recommendation-grid]');
      if (recommendationGrid) recommendationGrid.innerHTML = otherTools.map(function (tool) {
        return '<a class="tool-recommendation" href="' + tool.route + '">' +
          '<span class="tool-recommendation-icon" aria-hidden="true">' + tool.icon + '</span>' +
          '<span class="tool-recommendation-copy"><strong>' + tool.name + '</strong><small>' + tool.description + '</small></span>' +
          '<span class="tool-recommendation-arrow" aria-hidden="true">↗</span>' +
          '</a>';
      }).join('');
    }

    initToolsDropdown();
  }

  function initMobileToolsDropdown() {
    document.querySelectorAll('[data-mobile-tools-nav]').forEach(function (wrapper) {
      if (wrapper.dataset.dropdownReady === 'true') return;
      var panel = wrapper.querySelector('[data-tools-mobile-menu]');
      var toggle = wrapper.querySelector('.mobile-tools-toggle');
      if (!panel || !toggle) return;
      wrapper.dataset.dropdownReady = 'true';

      function setOpen(open) {
        panel.hidden = !open;
        wrapper.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Hide available tools' : 'Show available tools');
      }

      toggle.addEventListener('click', function () { setOpen(panel.hidden); });
      wrapper.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          setOpen(false);
          toggle.focus();
        }
      });
      document.addEventListener('click', function (event) {
        if (!wrapper.contains(event.target)) setOpen(false);
      });
    });
  }

  function initToolsDropdown() {
    var themeButton = document.getElementById('themeToggleBtn');
    var themeIcon = document.getElementById('themeIcon');
    function syncToolsThemeIcon() {
      if (!themeIcon || !document.body.classList.contains('tools-public-page') &&
        !document.body.classList.contains('calculator-public-page') &&
        !document.body.classList.contains('merge-pdf-public-page') &&
        !document.body.classList.contains('split-pdf-public-page')) return;
      themeIcon.textContent = document.body.classList.contains('dark-theme') ? '☀' : '◐';
    }
    if (themeButton && themeButton.dataset.toolsThemeReady !== 'true') {
      themeButton.dataset.toolsThemeReady = 'true';
      themeButton.addEventListener('click', function () {
        window.setTimeout(syncToolsThemeIcon, 0);
      });
    }
    syncToolsThemeIcon();

    var mobileButton = document.getElementById('mobileMenuBtn');
    var mobileDrawer = document.getElementById('mobileDrawer');
    if (mobileButton && mobileDrawer && !mobileButton.getAttribute('onclick') && mobileButton.dataset.menuReady !== 'true') {
      mobileButton.dataset.menuReady = 'true';
      mobileButton.addEventListener('click', function () {
        var open = mobileDrawer.classList.toggle('open');
        mobileButton.setAttribute('aria-expanded', String(open));
        mobileButton.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      });
    }

    document.querySelectorAll('[data-tools-nav]').forEach(function (wrapper) {
      if (wrapper.dataset.dropdownReady === 'true') return;
      var panel = wrapper.querySelector('.tools-dropdown');
      var toggle = wrapper.querySelector('.tools-nav-toggle');
      if (!panel || !toggle) return;
      wrapper.dataset.dropdownReady = 'true';

      function setOpen(open) {
        panel.hidden = !open;
        wrapper.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
      }

      wrapper.addEventListener('mouseenter', function () { setOpen(true); });
      wrapper.addEventListener('mouseleave', function () {
        if (!wrapper.contains(document.activeElement)) setOpen(false);
      });
      wrapper.addEventListener('focusin', function () { setOpen(true); });
      wrapper.addEventListener('focusout', function (event) {
        if (!wrapper.contains(event.relatedTarget)) setOpen(false);
      });
      toggle.addEventListener('click', function () {
        setOpen(panel.hidden);
      });
      wrapper.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          setOpen(false);
          toggle.focus();
        }
      });
      document.addEventListener('click', function (event) {
        if (!wrapper.contains(event.target)) setOpen(false);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderTools);
  } else {
    renderTools();
  }
})();
