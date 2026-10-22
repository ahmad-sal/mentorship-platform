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
    var header = document.querySelector('.site-header');
    if (header) placeAfter(header, 'banner-468x60', 'home-below-header');

    // Keep the existing responsive banner between the hero and course strip.
    addResponsiveTop(hero);

    var marquee = home.querySelector('.home-marquee');
    if (marquee) placeAfter(marquee, 'banner-468x60', 'home-below-course-strip');

    var mentorship = home.querySelector('.mentorship-highlight');
    var mentorshipSection = mentorship && mentorship.closest('.section-block');
    if (mentorshipSection) placeAfter(mentorshipSection, 'banner-468x60', 'home-after-mentorship');

    var process = home.querySelector('#howItWorks');
    if (process) placeBefore(process.closest('.section-block') || process, 'banner-468x60', 'home-before-process');

    var workspace = Array.prototype.find.call(home.querySelectorAll('.section-block'), function (section) {
      var kicker = section.querySelector('.section-kicker');
      return kicker && kicker.textContent.trim().toLowerCase() === 'your workspace';
    });
    if (workspace) placeBefore(workspace, 'banner-468x60', 'home-before-workspace');

    var mentor = home.querySelector('.mentor-panel');
    var mentorSection = mentor && mentor.closest('.section-block');
    if (mentorSection) {
      placeBefore(mentorSection, 'banner-468x60', 'home-before-mentor');
      placeAfter(mentorSection, 'banner-468x60', 'home-after-mentor');
    }

    var faq = home.querySelector('#faq');
    if (faq) placeAfter(faq, 'banner-468x60', 'home-after-faq');

    var homeSidePlacements = [
      appendTo(main, 'banner-160x600', 'home-left-rail', 'ad-placement-home-side ad-placement-home-side-left'),
      appendTo(main, 'banner-160x600', 'home-right-rail', 'ad-placement-home-side ad-placement-home-side-right')
    ].filter(Boolean);
    var syncHomeSideVisibility = function () {
      homeSidePlacements.forEach(function (slot) {
        slot.classList.toggle('ad-placement-home-side-visible', home.classList.contains('active'));
      });
    };
    syncHomeSideVisibility();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(syncHomeSideVisibility).observe(home, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

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

  // Button popups are independent of inline placements: a page may have no
  // banner slot at all and still needs its action buttons covered.
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
    '@media(max-width:900px){.ad-placement-sidebar{display:none!important}}',
    '.ad-placement-home-side{display:none!important}',
    '@media(min-width:1700px) and (min-height:701px){.ad-placement-home-side-visible{display:flex!important;position:fixed;top:50%;z-index:20;width:160px;margin:0;transform:translateY(-50%)}.ad-placement-home-side-left{left:calc((100vw - 1220px)/2 - 170px)}.ad-placement-home-side-right{right:calc((100vw - 1220px)/2 - 170px)}}',
    '@media(max-width:1699px), (max-height:700px){.ad-placement-home-side{display:none!important}}'
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

  // A provider pop-under snippet cannot render an advertisement by itself in
  // an empty tab; loading it there produces exactly the placeholder screen we
  // must avoid. Use a real provider destination instead: a Pop Under value
  // that is already an http(s) URL, or the published Smart Link URL. Smart Link
  // is the provider's direct ad destination and redirects to the advertiser.
  function popupDestination() {
    return adUrl(adsById.get('pop-under')) || adUrl(adsById.get('smart-link'));
  }

  function openPopupAd() {
    var target = popupDestination();
    if (!target) return false;
    try {
      // Keep the referrer for the provider's delivery rules, but detach the
      // opener so the ad page cannot navigate or script the original tab.
      window.open(target, '_blank', 'noopener');
      return true;
    } catch (error) {
      // A blocked tab or a failed provider request must never cancel the
      // button's own action, which runs in the original tab afterwards.
      console.warn('[AdSystem] The advertisement tab could not be opened:', error.message);
      return false;
    }
  }

  // Native action buttons plus explicitly identified custom action controls.
  // Dropdowns, selects, text fields, checkboxes, sliders, navigation and menu
  // controls are not in this selector, so they never open an ad.
  var POPUP_TRIGGER = 'button, [role="button"], input[type="submit"], input[type="button"], ' +
    'a[data-ad-popup="on"], ' +
    'input[type="reset"], input[type="image"]';
  // Exclusions describe controls that are not action buttons: chrome,
  // navigation, dropdown/menu toggles, tabs, disclosure/accordion toggles and
  // close controls. Action buttons inside dialogs and modals stay eligible;
  // only the entire-dialog exclusion used previously removed them.
  var POPUP_EXCLUDE = '[data-ad-exempt], [data-ad-popup="off"], ' +
    '[aria-haspopup], [aria-expanded], [aria-controls], ' +
    '[role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], ' +
    '[role="radio"], [role="slider"], [role="combobox"], ' +
    '.theme-toggle-btn, #themeToggleBtn, .sidebar-toggle, #sidebarToggle, .sidebar-link, .sidebar-scrim, ' +
    '.mobile-nav-toggle, .mobile-menu-btn, #mobileMenuBtn, .tools-nav-toggle, .mobile-tools-toggle, ' +
    '.modal-close, [data-modal-close], [data-dismiss], .ad-close, [aria-label*="close" i], [aria-label*="dismiss" i], ' +
    '[data-disclosure], .accordion-button, .faq-question, [role="menu"], .dropdown-menu';

  function isEligiblePopupTrigger(trigger) {
    if (!trigger || trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return false;
    if (trigger.closest('[data-ad-exempt], [data-ad-popup="off"]')) return false;
    var explicitlyEnabled = trigger.getAttribute('data-ad-popup') === 'on';
    if (!explicitlyEnabled && trigger.closest(POPUP_EXCLUDE)) return false;
    if (!explicitlyEnabled && trigger.closest('nav, .site-header, .app-sidebar, .app-topbar, .tools-dropdown, .mobile-tools-list, .skip-link')) return false;
    if (trigger.tagName === 'A') {
      var href = trigger.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return false;
    }
    return true;
  }

  // Resolve the button through the composed path so a click on any child icon
  // or text node still maps to its action button, including custom controls.
  function findPopupTrigger(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (var index = 0; index < path.length; index += 1) {
      var node = path[index];
      if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') continue;
      if (node.matches && node.matches(POPUP_TRIGGER)) return node;
    }
    return event.target && event.target.closest ? event.target.closest(POPUP_TRIGGER) : null;
  }

  // One delegated listener pair covers static, async-rendered and future
  // buttons without attaching per-button handlers. The trigger is resolved in
  // the capture phase, but the ad opens in the bubble phase after the button's
  // own handler. That ordering is deliberate: opening a tab first would consume
  // the click's transient activation and block native file pickers. It also
  // means the ad never cancels, duplicates or delays the original action.
  // Keyed by the click event so a file-picker button's nested input click does
  // not overwrite the original trigger before the outer event finishes bubbling.
  // Programmatic input.click() events are untrusted and must not open an ad
  // before the browser handles the native file picker.
  var clickTriggers = typeof WeakMap === 'function' ? new WeakMap() : null;
  var fallbackPopupTrigger = null;

  document.addEventListener('click', function (event) {
    var trigger = null;
    if (event.isTrusted && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      trigger = findPopupTrigger(event);
    }
    if (clickTriggers) clickTriggers.set(event, trigger);
    else fallbackPopupTrigger = trigger;
  }, true);

  document.addEventListener('click', function (event) {
    var trigger = clickTriggers ? clickTriggers.get(event) : fallbackPopupTrigger;
    if (clickTriggers) clickTriggers.delete(event);
    else fallbackPopupTrigger = null;
    if (!isEligiblePopupTrigger(trigger)) return;
    openPopupAd();
  }, false);

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

      // Site-wide formats have no dimensions of their own. Pop Under and Smart
      // Link supply the direct destination for each eligible button click, the
      // Social Bar is injected once per page, and Smart Link also becomes a
      // labelled sponsored link when its value is a URL.
      injectSocialBar(adsById.get('social-bar'));
      injectSmartLink(adsById.get('smart-link'));
    })
    .catch(function (error) {
      console.warn('[AdSystem] Public ads are unavailable:', error.message);
    });
})();
