(function () {
  'use strict';

  // A page may include this file directly and through app-ui.js. Only one
  // loader may build placements or the page would receive duplicate ads.
  if (window.__adRuntimeStarted) return;
  window.__adRuntimeStarted = true;

  var path = window.location.pathname.toLowerCase();
  var toolRoutes = new Set([
    '/tools',
    '/tools/calculator',
    '/tools/honhaar-scholarship-2026',
    '/tools/merge-pdf',
    '/tools/split-pdf',
    '/tools/compress-pdf',
    '/tools/compress-image',
    '/tools/upscale-image',
    '/tools/remove-background',
    '/tools/blur-face',
    '/tools/qr-code-generator',
    '/tools/additive-pdf',
    '/tools/lock-unlock-pdf',
    '/tools/converter-suite'
  ]);
  var courseRoutes = new Set([
    '/course-artificial-intelligence.html',
    '/course-canva.html',
    '/course-wordpress.html',
    '/course-youtube-automation.html'
  ]);
  var isToolPage = toolRoutes.has(path);
  var isCoursePage = courseRoutes.has(path);
  var isHomePage = path === '/' || path === '/index.html';
  var isDeveloperPage = path === '/meet-developer';

  // Banner and native units are rendered inside one dedicated frame per slot.
  // The same unit id can appear any number of times: every slot asks the same
  // published record for its code, so one Admin Portal edit updates all of them.
  var INLINE_SIZES = {
    'banner-300x250': { width: 300, height: 250 },
    'banner-728x90': { width: 728, height: 90 },
    'banner-320x50': { width: 320, height: 50 },
    'banner-468x60': { width: 468, height: 60 },
    'banner-400x60': { width: 400, height: 60 },
    'banner-160x300': { width: 160, height: 300 },
    'banner-160x600': { width: 160, height: 600 },
    'native-banner': { width: '100%', height: 250 }
  };
  var placements = [];
  var adsById = new Map();
  var socialBarInjected = false;
  var smartLinkInjected = false;

  function makeSlot(unitId, name, placementClass) {
    var slot = document.createElement('div');
    slot.className = 'ad-placement' + (placementClass ? ' ' + placementClass : '');
    slot.dataset.adUnit = unitId;
    slot.dataset.adPlacement = name;
    slot.setAttribute('aria-label', 'Advertisement');
    slot.hidden = true;
    placements.push(slot);
    return slot;
  }

  function placeAfter(anchor, unitId, name, placementClass) {
    if (!anchor || !anchor.parentNode) return null;
    var slot = makeSlot(unitId, name, placementClass);
    anchor.parentNode.insertBefore(slot, anchor.nextSibling);
    return slot;
  }

  function placeBefore(anchor, unitId, name, placementClass) {
    if (!anchor || !anchor.parentNode) return null;
    var slot = makeSlot(unitId, name, placementClass);
    anchor.parentNode.insertBefore(slot, anchor);
    return slot;
  }

  function appendTo(parent, unitId, name, placementClass) {
    if (!parent) return null;
    var slot = makeSlot(unitId, name, placementClass);
    parent.appendChild(slot);
    return slot;
  }

  function addResponsiveTop(anchor) {
    var desktop = placeAfter(anchor, 'banner-728x90', 'top-desktop', 'ad-placement-desktop');
    if (desktop) {
      placeAfter(desktop, 'banner-320x50', 'top-mobile', 'ad-placement-mobile');
    } else {
      placeAfter(anchor, 'banner-320x50', 'top-mobile', 'ad-placement-mobile');
    }
  }

  function addLowerStack(anchor, names, before) {
    if (!anchor) return;
    var chain = anchor;
    names.forEach(function (entry) {
      var slot = before
        ? placeBefore(anchor, entry[0], entry[1], entry[2])
        : placeAfter(chain, entry[0], entry[1], entry[2]);
      if (slot) chain = slot;
    });
  }

  function pageHost() {
    return document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.querySelector('.app-content') ||
      document.querySelector('.app-main') ||
      document.body;
  }

  function pageFooter() {
    return document.querySelector('footer') || document.querySelector('.site-footer');
  }

  // Walk up to the block that sits directly inside <main> so a top banner is
  // never inserted into a heading's flex row (which would shrink a 728x90 unit).
  function topLevelBlock(main, heading) {
    if (!heading) return main.firstElementChild || main;
    var header = heading.closest('header');
    if (header && header.parentNode === main) return header;
    var node = heading;
    while (node.parentElement && node.parentElement !== main && node.parentElement !== document.body) {
      node = node.parentElement;
    }
    return node;
  }

  function addToolPlacements() {
    var main = document.querySelector('main') || document.body;
    var heading = main.querySelector('header h1') || main.querySelector('h1');
    addResponsiveTop(topLevelBlock(main, heading));

    if (path === '/tools/honhaar-scholarship-2026') {
      var notice = main.querySelector('.honhaar-notice');
      if (notice) placeAfter(notice, 'native-banner', 'after-eligibility');
      var result = main.querySelector('[data-honhaar-result]');
      if (result) {
        var resultSlot = placeAfter(result, 'banner-300x250', 'after-result', 'ad-placement-after-result');
        if (resultSlot) {
          resultSlot.dataset.waitForResult = 'true';
          resultSlot.hidden = result.hidden;
        }
      }
      addLowerStack(main.lastElementChild || main, [
        ['banner-468x60', 'tool-lower'],
        ['banner-400x60', 'tool-final']
      ], false);
      return;
    }

    var recommendations = main.querySelector('[data-tools-recommendations]');
    if (recommendations) {
      addLowerStack(recommendations, [
        ['native-banner', 'tool-content'],
        ['banner-300x250', 'tool-lower'],
        ['banner-468x60', 'tool-mid'],
        ['banner-400x60', 'tool-final']
      ], true);
    } else {
      var lowerAnchor = main.querySelector('.calculator-layout') ||
        main.querySelector('.calculator-panel') ||
        main.lastElementChild || main;
      addLowerStack(lowerAnchor, [
        ['native-banner', 'tool-content'],
        ['banner-300x250', 'tool-lower'],
        ['banner-468x60', 'tool-mid'],
        ['banner-400x60', 'tool-final']
      ], false);
    }
  }

  function addToolLandingPlacements() {
    var main = document.querySelector('main') || document.body;
    var heading = main.querySelector('.tools-page-heading');
    addResponsiveTop(heading || main.firstElementChild || main);
    var grid = main.querySelector('[data-tools-grid]');
    if (grid) {
      placeBefore(grid, 'native-banner', 'tools-grid-native');
      addLowerStack(grid, [
        ['banner-300x250', 'tools-lower'],
        ['banner-468x60', 'tools-mid'],
        ['banner-400x60', 'tools-final']
      ], false);
    }
  }

  function addHomePlacements() {
    var main = document.querySelector('main') || document.body;
    var home = main.querySelector('#viewHome') || main;
    var hero = home.querySelector('.hero-surface') || home.firstElementChild || home;
    addResponsiveTop(hero);

    var contentAnchor = home.querySelector('.middle-banner') ||
      home.querySelector('.stats-strip') ||
      home.querySelector('.features-grid') ||
      home.lastElementChild;
    if (contentAnchor) placeAfter(contentAnchor, 'native-banner', 'home-content');
    addLowerStack(home, [
      ['banner-300x250', 'home-lower'],
      ['banner-468x60', 'home-mid'],
      ['banner-400x60', 'home-final']
    ], false);

    var courses = main.querySelector('#viewCourses');
    if (courses) {
      var courseGrid = courses.querySelector('.course-grid');
      if (courseGrid) placeBefore(courseGrid, 'native-banner', 'home-courses');
    }
  }

  function addCoursePlacements() {
    var main = document.querySelector('main') || document.body;
    var hero = main.querySelector('.course-hero') || main.firstElementChild || main;
    addResponsiveTop(hero);

    var introduction = main.querySelector('#introduction');
    if (introduction) placeAfter(introduction, 'native-banner', 'course-content');

    var aside = main.querySelector('.course-aside-sticky');
    var sidebarUnit = path === '/course-canva.html' || path === '/course-wordpress.html'
      ? 'banner-160x300'
      : 'banner-160x600';
    if (aside) {
      appendTo(aside, sidebarUnit, 'course-sidebar', 'ad-placement-sidebar');
    } else if (introduction) {
      placeAfter(introduction, 'banner-160x300', 'course-lower');
    }

    var courseContent = main.querySelector('.course-content');
    var anchor = courseContent || introduction || main.lastElementChild || main;
    addLowerStack(anchor, [
      ['banner-300x250', 'course-lower-banner'],
      ['banner-468x60', 'course-mid'],
      ['banner-400x60', 'course-final']
    ], false);
  }

  function addDeveloperPlacements() {
    var main = document.querySelector('main') || document.body;
    var hero = main.querySelector('#inkHero');
    addResponsiveTop(hero || main.firstElementChild || main);
    var profile = main.querySelector('#inkProfile');
    if (profile) placeAfter(profile, 'native-banner', 'developer-content');
    var footer = main.querySelector('footer');
    addLowerStack(footer || main.lastElementChild || main, [
      ['banner-300x250', 'developer-lower'],
      ['banner-468x60', 'developer-mid'],
      ['banner-400x60', 'developer-final']
    ], Boolean(footer));
  }

  // Pages with their own layouts (auth, dashboard, practical classes, 404 and
  // any future page) still receive a complete, unit-driven ad set.
  function addGenericPlacements() {
    var host = pageHost();
    var header = document.querySelector('.site-header') ||
      document.querySelector('.app-topbar') ||
      document.querySelector('.nf-header') ||
      document.querySelector('header');
    addResponsiveTop(header || host.firstElementChild || host);

    var firstBlock = host.querySelector('.workspace-section, section, .card, .auth-card, .nf-card') ||
      host.firstElementChild;
    if (firstBlock && firstBlock !== host) placeAfter(firstBlock, 'native-banner', 'page-content');

    var footer = pageFooter();
    if (footer) {
      addLowerStack(footer, [
        ['banner-300x250', 'page-lower'],
        ['banner-468x60', 'page-mid'],
        ['banner-400x60', 'page-final']
      ], true);
    } else {
      var lowerAnchor = host.lastElementChild || host;
      addLowerStack(lowerAnchor, [
        ['banner-300x250', 'page-lower'],
        ['banner-468x60', 'page-mid'],
        ['banner-400x60', 'page-final']
      ], false);
    }
  }

  if (isToolPage && path !== '/tools') addToolPlacements();
  else if (path === '/tools') addToolLandingPlacements();
  else if (isHomePage) addHomePlacements();
  else if (isCoursePage) addCoursePlacements();
  else if (isDeveloperPage) addDeveloperPlacements();
  else addGenericPlacements();

  if (!placements.length) return;

  var style = document.createElement('style');
  style.textContent = [
    '.ad-placement{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:.5rem;max-width:100%;min-width:0;overflow:hidden;margin:1.25rem auto;clear:both}',
    '.ad-placement[hidden]{display:none!important}',
    '.ad-placement iframe{display:block;border:0;max-width:100%;background:transparent}',
    '.ad-placement-desktop iframe{width:min(728px,100%);height:90px}',
    '.ad-placement-mobile iframe{width:min(320px,100%);height:50px}',
    '.ad-placement[data-ad-unit="banner-300x250"] iframe{width:min(300px,100%);height:250px}',
    '.ad-placement[data-ad-unit="banner-468x60"] iframe{width:min(468px,100%);height:60px}',
    '.ad-placement[data-ad-unit="banner-400x60"] iframe{width:min(400px,100%);height:60px}',
    '.ad-placement[data-ad-unit="banner-160x300"] iframe{width:160px;height:300px}',
    '.ad-placement[data-ad-unit="banner-160x600"] iframe{width:160px;height:600px}',
    '.ad-placement[data-ad-unit="native-banner"] iframe{width:100%;height:250px}',
    '.ad-smart-link{display:block;width:min(720px,100%);margin:1.25rem auto;padding:.65rem 1rem;border:1px solid rgba(127,127,127,.28);border-radius:12px;text-align:center;font-size:.82rem}',
    '.ad-smart-link span{display:block;text-transform:uppercase;letter-spacing:.12em;font-size:.66rem;opacity:.62;margin-bottom:.2rem}',
    '.ad-smart-link a{font-weight:700;text-decoration:underline}',
    '.ad-social-bar{max-width:100%}',
    '@media(max-width:767px){.ad-placement-desktop{display:none!important}}',
    '@media(min-width:768px){.ad-placement-mobile{display:none!important}}',
    '@media(max-width:900px){.ad-placement-sidebar{display:none!important}}'
  ].join('');
  document.head.appendChild(style);

  function frameDocument(code) {
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<style>html,body{margin:0;padding:0;width:100%;min-height:100%;overflow:hidden}body{display:flex;justify-content:center;align-items:center}img,iframe,video{max-width:100%}</style>' +
      '</head><body>' + code + '</body></html>';
  }

  function revealResultSlot(slot) {
    if (slot.dataset.waitForResult !== 'true') {
      slot.hidden = false;
      return;
    }
    var result = document.querySelector('[data-honhaar-result]');
    slot.hidden = !result || result.hidden;
    if (!result || slot.dataset.resultObserver === 'true') return;
    slot.dataset.resultObserver = 'true';
    new MutationObserver(function () {
      slot.hidden = result.hidden || !slot.querySelector('iframe');
      if (!slot.hidden) slot.dispatchEvent(new Event('ad:render'));
    }).observe(result, { attributes: true, attributeFilter: ['hidden'] });
  }

  var observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.dispatchEvent(new Event('ad:render'));
      });
    }, { rootMargin: '200px 0px' })
    : null;

  function renderSlot(slot, ad) {
    var size = INLINE_SIZES[slot.dataset.adUnit];
    if (!ad || !ad.published_code || !size) return;

    var frame = document.createElement('iframe');
    frame.title = (ad.display_name || 'Advertisement') + ' advertisement';
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    // allow-same-origin is required by the ad providers' loader scripts; without
    // it they abort and every banner frame stays blank. Each unit still has its
    // own window, so per-unit globals such as atOptions cannot collide.
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.width = String(size.width);
    frame.height = String(size.height);
    slot.appendChild(frame);
    revealResultSlot(slot);

    var render = function () {
      if (frame.dataset.loaded) return;
      frame.dataset.loaded = 'true';
      frame.srcdoc = frameDocument(ad.published_code);
      if (observer) observer.unobserve(slot);
    };
    if (observer) observer.observe(slot);
    else render();
    slot.addEventListener('ad:render', render, { once: true });
  }

  function adUrl(ad) {
    if (!ad || !ad.published_code) return null;
    var code = String(ad.published_code).trim();
    if (!/^(https?:)?\/\//i.test(code)) return null;
    try {
      var url = new URL(code, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return url.href;
    } catch (error) {
      return null;
    }
  }

  function injectMarkup(container, code) {
    container.innerHTML = code;
    Array.prototype.forEach.call(container.querySelectorAll('script'), function (oldScript) {
      var script = document.createElement('script');
      Array.prototype.forEach.call(oldScript.attributes, function (attribute) {
        script.setAttribute(attribute.name, attribute.value);
      });
      script.text = oldScript.text || '';
      oldScript.parentNode.replaceChild(script, oldScript);
    });
  }

  function injectSocialBar(ad) {
    if (socialBarInjected || !ad || !ad.published_code) return;
    socialBarInjected = true;
    var container = document.createElement('div');
    container.className = 'ad-social-bar';
    container.dataset.adUnit = 'social-bar';
    container.setAttribute('aria-label', 'Advertisement');
    document.body.appendChild(container);
    injectMarkup(container, ad.published_code);
  }

  function injectSmartLink(ad) {
    if (smartLinkInjected || !ad || !ad.published_code) return;
    smartLinkInjected = true;
    var url = adUrl(ad);
    var container = document.createElement('div');
    container.className = 'ad-placement ad-smart-link';
    container.dataset.adUnit = 'smart-link';
    container.setAttribute('aria-label', 'Advertisement');

    if (url) {
      var label = document.createElement('span');
      label.textContent = 'Sponsored link';
      var link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'sponsored noopener noreferrer';
      link.textContent = ad.display_name || 'Visit sponsor';
      container.appendChild(label);
      container.appendChild(link);
    } else {
      injectMarkup(container, ad.published_code);
    }

    var footer = pageFooter();
    if (footer && footer.parentNode) footer.parentNode.insertBefore(container, footer);
    else document.body.appendChild(container);
  }

  function popupDocument(code, displayName, sponsorUrl) {
    var base = window.location.origin + '/';
    var fallback = sponsorUrl
      ? '<p class="ad-popup-fallback"><a href="' + sponsorUrl.replace(/"/g, '&quot;') + '" target="_blank" rel="sponsored noopener noreferrer">Continue to sponsor</a></p>'
      : '';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<base href="' + base.replace(/"/g, '&quot;') + '"><title>' + (displayName || 'Advertisement') + '</title>' +
      '<style>html,body{margin:0;padding:0;min-height:100%;background:#0b1220;color:#e5edf8;font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
      'body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}' +
      '.ad-popup-label{width:100%;text-align:center;text-transform:uppercase;letter-spacing:.16em;font-size:11px;opacity:.55;margin-bottom:18px}' +
      '.ad-popup-content{width:100%;display:flex;justify-content:center;align-items:center}' +
      '.ad-popup-fallback{margin-top:18px;font-size:13px;opacity:.8}.ad-popup-fallback a{color:#8fd6ff}' +
      'img,iframe,video{max-width:100%}</style></head><body>' +
      '<div class="ad-popup-label">Advertisement</div><div class="ad-popup-content">' + code + '</div>' + fallback +
      '</body></html>';
  }

  function openPopupAd() {
    if (!adsById.size) return;
    var popunder = adsById.get('pop-under');
    var smartLink = adsById.get('smart-link');
    var code = popunder && popunder.published_code ? String(popunder.published_code).trim() : '';
    var sponsorUrl = adUrl(smartLink);
    if (!code && !sponsorUrl) return;

    if (code && !adUrl(popunder)) {
      var adTab;
      try {
        adTab = window.open('', '_blank');
      } catch (error) {
        console.warn('[AdSystem] The advertisement tab could not be opened:', error.message);
        return;
      }
      if (!adTab) return;
      try {
        adTab.document.open();
        adTab.document.write(popupDocument(code, popunder.display_name, sponsorUrl));
        adTab.document.close();
        adTab.opener = null;
      } catch (error) {
        console.warn('[AdSystem] The advertisement could not be rendered:', error.message);
        adTab.close();
      }
      return;
    }

    var target = adUrl(popunder) || sponsorUrl;
    if (!target) return;
    try {
      window.open(target, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.warn('[AdSystem] The advertisement tab could not be opened:', error.message);
    }
  }

  var POPUP_TRIGGER = 'button, [role="button"], input[type="submit"], input[type="button"], a.btn';
  var POPUP_EXCLUDE = '[data-ad-exempt], [data-ad-popup="off"], .theme-toggle-btn, #themeToggleBtn, ' +
    '.sidebar-toggle, #sidebarToggle, .sidebar-link, .sidebar-scrim, .mobile-nav-toggle, .tools-nav-toggle, ' +
    '.mobile-tools-toggle, .modal-close, .tab-btn, .ad-close, .calculator-mode button, [aria-haspopup="true"], ' +
    'dialog, [role="dialog"], .modal, .confirmation-dialog';

  function isEligiblePopupTrigger(trigger) {
    if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return false;
    if (trigger.closest(POPUP_EXCLUDE)) return false;
    if (trigger.closest('nav, .site-header, .app-sidebar, .app-topbar, .tools-dropdown, .mobile-tools-list, .skip-link')) return false;
    if (trigger.tagName === 'A') {
      var href = trigger.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return false;
    }
    return true;
  }

  document.addEventListener('click', function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var trigger = event.target && event.target.closest ? event.target.closest(POPUP_TRIGGER) : null;
    if (!isEligiblePopupTrigger(trigger)) return;
    openPopupAd();
  }, true);

  fetch('/api/ads', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error('Published advertising settings could not be loaded.');
      return response.json();
    })
    .then(function (result) {
      adsById = new Map((result.ads || []).map(function (ad) {
        return [ad.unit_id, ad];
      }));

      placements.forEach(function (slot) {
        renderSlot(slot, adsById.get(slot.dataset.adUnit));
      });

      // Site-wide formats have no dimensions of their own. Pop Under runs on
      // each eligible button click, the Social Bar is injected once per page,
      // and Smart Link becomes a labelled sponsored link when its value is a URL.
      injectSocialBar(adsById.get('social-bar'));
      injectSmartLink(adsById.get('smart-link'));
    })
    .catch(function (error) {
      console.warn('[AdSystem] Public ads are unavailable:', error.message);
    });
})();
