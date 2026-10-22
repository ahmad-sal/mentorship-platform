const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const {
  AD_UNITS,
  MAX_AD_CODE_LENGTH,
  getAdDatabaseFailure,
  getAdStatus,
  getAdUnit,
  validateAdCode
} = require('../ads.cjs');

test('Supabase clients explicitly select public without changing auth options', () => {
  const supabasePath = require.resolve('../supabase.cjs');
  const cachedSupabaseModule = require.cache[supabasePath];
  const originalLoad = Module._load;
  const envKeys = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  const calls = [];

  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    delete require.cache[supabasePath];

    Module._load = function (request, parent, isMain) {
      if (request === 'dotenv') return { config: () => ({}) };
      if (request === '@supabase/supabase-js') {
        return {
          createClient: (url, key, options) => {
            calls.push({ url, key, options });
            return {};
          }
        };
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const supabase = require('../supabase.cjs');
    const expectedOptions = {
      db: { schema: 'public' },
      auth: { persistSession: false, autoRefreshToken: false }
    };

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      url: 'https://example.supabase.co',
      key: 'test-anon-key',
      options: expectedOptions
    });
    assert.deepEqual(calls[1], {
      url: 'https://example.supabase.co',
      key: 'test-service-role-key',
      options: expectedOptions
    });
    assert.equal(supabase.supabaseAdmin, supabase.admin);
    assert.equal(supabase.hasServiceRoleKey, true);
  } finally {
    Module._load = originalLoad;
    if (cachedSupabaseModule) {
      require.cache[supabasePath] = cachedSupabaseModule;
    } else {
      delete require.cache[supabasePath];
    }
    envKeys.forEach((key) => {
      if (originalEnv.get(key) === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv.get(key);
      }
    });
  }
});

test('advertising catalog contains all eleven requested independent units', () => {
  assert.equal(AD_UNITS.length, 11);
  assert.deepEqual(AD_UNITS.map((unit) => unit.name), [
    'Pop Under',
    'Smart Link',
    'Social Bar',
    'Native Banner',
    'Banner 300 × 250',
    'Banner 728 × 90',
    'Banner 320 × 50',
    'Banner 468 × 60',
    'Banner 400 × 60',
    'Banner 160 × 300',
    'Banner 160 × 600'
  ]);
  assert.equal(getAdUnit('banner-300x250').dimensions, '300 × 250');
  assert.equal(getAdUnit('banner-400x60').dimensions, '400 × 60');
  assert.equal(getAdUnit('unknown'), null);
});

test('ad code validation preserves code, accepts empty drafts, and enforces size and type', () => {
  const code = '<div id="provider-slot"></div>';
  assert.equal(validateAdCode(code), code);
  assert.equal(validateAdCode('  '), null);
  assert.throws(() => validateAdCode({}), /text value/);
  assert.throws(() => validateAdCode('x'.repeat(MAX_AD_CODE_LENGTH + 1)), /characters or fewer/);
});

test('status reports live publication ahead of pending draft changes', () => {
  assert.equal(getAdStatus({ enabled: false, draft_code: 'draft', published_code: 'live' }), 'Disabled');
  assert.equal(getAdStatus({ enabled: true, draft_code: 'draft', published_code: 'live' }), 'Published');
  assert.equal(getAdStatus({ enabled: true, draft_code: 'draft', published_code: null }), 'Draft');
  assert.equal(getAdStatus({ enabled: true, draft_code: null, published_code: null }), 'Unpublished');
});

test('database failures distinguish missing schema, missing columns, and permissions', () => {
  const missingTable = getAdDatabaseFailure({ code: 'PGRST205' });
  assert.equal(missingTable.status, 503);
  assert.match(missingTable.error, /public\.ad_unit_configurations/);
  assert.match(missingTable.error, /public\.published_ad_units/);
  assert.match(missingTable.error, /migrations\/003_advertising_schema_repair\.sql/);

  const missingColumn = getAdDatabaseFailure({ code: 'PGRST204' });
  assert.equal(missingColumn.status, 503);
  assert.match(missingColumn.error, /missing a required column/);

  const denied = getAdDatabaseFailure({ code: '42501' });
  assert.equal(denied.status, 503);
  assert.match(denied.error, /service-role key, table grants, and RLS/);

  const unknown = getAdDatabaseFailure({ code: 'XX000' });
  assert.equal(unknown.code, 'XX000');
  assert.match(unknown.error, /database operation failed/);
});

test('schema repair is additive, preserves saved code, seeds all catalog units, and reloads PostgREST', () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'migrations', '003_advertising_schema_repair.sql'), 'utf8');
  AD_UNITS.forEach((unit) => {
    assert.match(migration, new RegExp(`\\('${unit.id}', '${unit.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`));
  });
  assert.match(migration, /on conflict \(unit_id\) do update\s+set display_name = excluded\.display_name,\s+dimensions = excluded\.dimensions/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on public\.ad_unit_configurations from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /\b(delete from|truncate|drop table)\b/i);
  assert.doesNotMatch(migration, /set (draft_code|published_code|enabled)\s*=/i);
});

test('schema repair defines every queried table column and a valid published view', () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'migrations', '003_advertising_schema_repair.sql'), 'utf8');
  const tableDefinition = migration.match(/create table if not exists public\.ad_unit_configurations\s*\(([\s\S]*?)\);/i);

  assert.ok(tableDefinition, 'repair migration creates public.ad_unit_configurations');
  [
    ['unit_id', 'text'],
    ['display_name', 'text'],
    ['dimensions', 'text'],
    ['enabled', 'boolean'],
    ['draft_code', 'text'],
    ['published_code', 'text'],
    ['created_at', 'timestamptz'],
    ['updated_at', 'timestamptz'],
    ['published_at', 'timestamptz'],
    ['updated_by', 'text']
  ].forEach(([column, type]) => {
    assert.match(tableDefinition[1], new RegExp(`^\\s*${column}\\s+${type}\\b`, 'im'));
  });
  assert.match(
    migration,
    /create or replace view public\.published_ad_units as\s*select unit_id, display_name, dimensions, published_code, published_at\s*from public\.ad_unit_configurations\s*where enabled = true and published_code is not null and length\(published_code\) > 0;/i
  );
});

test('public placement registry covers every tool route and isolates provider code', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');
  const catalogScript = fs.readFileSync(path.join(root, 'public', 'ad-catalog.js'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'public', 'admin-dashboard.html'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'migrations', '002_advertising_banner_400x60.sql'), 'utf8');
  const toolRoutes = [...server.matchAll(/app\.get\('(\/tools(?:\/[^']*)?)'/g)].map((match) => match[1]);

  assert.equal(toolRoutes.length, 14);
  toolRoutes.forEach((route) => assert.ok(runtime.includes(`'${route}'`), `${route} is registered for placements`));
  assert.ok((admin.match(/data-ad-code/g) || []).length >= 2);
  assert.match(admin, /appendChild\(createAdCard\(unit\)\)/);
  assert.match(migration, /banner-400x60/);
  assert.match(catalogScript, /root\.AD_UNIT_CATALOG/);
  assert.match(admin, /Configuration editors remain available/);
  assert.match(admin, /preserveEdit/);
  assert.match(admin, /api\/admin\/ads/);
  assert.match(server, /app\.get\('\/api\/admin\/ads'/);
  assert.match(server, /app\.put\('\/api\/admin\/ads\/:unitId\/draft'/);
  assert.match(server, /app\.post\('\/api\/admin\/ads\/:unitId\/publish'/);
  assert.match(server, /app\.post\('\/api\/admin\/ads\/:unitId\/unpublish'/);
  assert.match(server, /requireAdmin, requireSameOriginAdMutation/);
  const publishRoute = server.match(/app\.post\('\/api\/admin\/ads\/:unitId\/publish'[\s\S]*?\n\}\);/);
  assert.ok(publishRoute, 'ad publish endpoint is registered');
  assert.match(publishRoute[0], /\.update\(\{\s*enabled: true,\s*published_code: current\.draft_code/);
  assert.match(admin, /Published and enabled\. Public placements will use this configuration on their next load\./);
  assert.match(runtime, /if \(!ad \|\| !ad\.published_code \|\| !size\) return/);
  assert.match(runtime, /setAttribute\('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'\)/);
  assert.match(runtime, /waitForResult/);
});

test('public ad API reads the published view with the server-only service role client', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  const route = server.match(/app\.get\('\/api\/ads'[\s\S]*?\n}\);/);

  assert.ok(route, 'GET /api/ads is registered');
  assert.match(route[0], /Cache-Control', 'no-store'/);
  assert.match(route[0], /const client = supabase\.supabaseAdmin;/);
  assert.match(route[0], /if \(!client\)[\s\S]*?return res\.status\(503\)\.json/);
  assert.match(route[0], /\.from\('published_ad_units'\)/);
  assert.doesNotMatch(route[0], /\.from\('ad_unit_configurations'\)/);
  assert.doesNotMatch(route[0], /draft_code/);
});

test('ad runtime loads on every visitor page but never on admin screens', () => {
  const root = path.join(__dirname, '..');
  const appUi = fs.readFileSync(path.join(root, 'public', 'app-ui.js'), 'utf8');

  assert.doesNotMatch(appUi, /publicAdPaths/);
  assert.match(appUi, /\/\^\\\/admin/);
  assert.match(appUi, /adRuntime\.src = '\/ad-runtime\.js'/);
  assert.match(appUi, /window\.__adRuntimeRequested/);
  assert.match(fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8'), /window\.__adRuntimeStarted/);
});

test('every catalog unit has an execution strategy, including site-wide formats', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');

  AD_UNITS.forEach((unit) => {
    assert.ok(
      runtime.includes(`'${unit.id}':`) || runtime.includes(`'${unit.id}'`),
      `${unit.id} has a runtime strategy`
    );
  });
  assert.match(runtime, /pop-under/);
  assert.match(runtime, /smart-link/);
  assert.match(runtime, /social-bar/);
  assert.match(runtime, /injectSocialBar/);
  assert.match(runtime, /injectSmartLink/);
  assert.match(runtime, /openPopupAd/);
});

test('eligible button clicks open a real configured ad URL in a new tab without cancelling actions', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');

  assert.match(runtime, /document\.addEventListener\('click'/);
  assert.match(runtime, /}, true\);/);
  assert.match(runtime, /event\.isTrusted && event\.button === 0/);
  assert.match(runtime, /!event\.metaKey && !event\.ctrlKey && !event\.shiftKey && !event\.altKey/);
  assert.match(runtime, /trigger\.closest\('nav, \.site-header/);
  assert.match(runtime, /theme-toggle-btn/);
  assert.match(runtime, /function popupDestination\(\)/);
  assert.match(runtime, /adUrl\(adsById\.get\('pop-under'\)\) \|\| adUrl\(adsById\.get\('smart-link'\)\)/);
  assert.match(runtime, /window\.open\(target, '_blank', 'noopener'\)/);
  assert.match(runtime, /clickTriggers\.set\(event, trigger\)/);
  assert.match(runtime, /clickTriggers\.get\(event\)/);
  assert.match(runtime, /openPopupAd\(\);\s*\}, false\);/);
  assert.doesNotMatch(runtime, /openPopupAd\(\);\s*\}, true\);/);
  assert.doesNotMatch(runtime, /window\.open\('', '_blank'\)/);
  assert.doesNotMatch(runtime, /popupDocument|document\.write|Continue to sponsor|about:blank|ad-popup-label/);
  assert.doesNotMatch(runtime, /popupShown|popup=yes|showPopupFallback|event\.defaultPrevented/);
  assert.doesNotMatch(runtime, /\.preventDefault\(|\.stopPropagation\(/);
});

test('homepage placements cover the requested sections and keep side ads responsive', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');
  const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  [
    /placeAfter\(header, 'banner-468x60', 'home-below-header'\)/,
    /addResponsiveTop\(hero\)/,
    /placeAfter\(anchor, 'banner-728x90', 'top-desktop'/,
    /placeAfter\(marquee, 'banner-468x60', 'home-below-course-strip'\)/,
    /placeAfter\(mentorshipSection, 'banner-468x60', 'home-after-mentorship'\)/,
    /placeBefore\(process\.closest\('\.section-block'\) \|\| process, 'banner-468x60', 'home-before-process'\)/,
    /placeBefore\(workspace, 'banner-468x60', 'home-before-workspace'\)/,
    /placeBefore\(mentorSection, 'banner-468x60', 'home-before-mentor'\)/,
    /placeAfter\(mentorSection, 'banner-468x60', 'home-after-mentor'\)/,
    /placeAfter\(faq, 'banner-468x60', 'home-after-faq'\)/,
    /appendTo\(main, 'banner-160x600', 'home-left-rail'/,
    /appendTo\(main, 'banner-160x600', 'home-right-rail'/
  ].forEach((pattern) => assert.match(runtime, pattern));

  assert.match(runtime, /@media\(min-width:1700px\) and \(min-height:701px\)/);
  assert.match(runtime, /@media\(max-width:1699px\), \(max-height:700px\)/);
  assert.match(runtime, /classList\.toggle\('ad-placement-home-side-visible', home\.classList\.contains\('active'\)\)/);
  assert.match(homepage, /id="heroExploreBtn" data-ad-popup="on"/);
  assert.match(homepage, /id="navCoursesBtn" data-ad-popup="on"/);
  assert.match(homepage, /onclick="app\.navigate\('courses'\)" data-ad-popup="on">[\s\S]*?Browse tracks/i);
  assert.match(homepage, /href="\/register" data-ad-popup="on">[\s\S]*?Create free account/i);
  assert.match(homepage, /href="\/register" data-ad-popup="on">[\s\S]*?Start learning/i);
  assert.match(homepage, /href="https:\/\/wa\.me\/923327451571" target="_blank" rel="noopener noreferrer" data-ad-popup="on"/);
  assert.match(homepage, /href="\/register" data-ad-popup="on">[\s\S]*?Create student account/i);
  assert.match(homepage, /href="\/login" data-ad-popup="on">I already have an account/);
});

test('courses view reuses its three existing top slots and adds the requested placements', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');
  const mentor = fs.readFileSync(path.join(root, 'Mentor.js'), 'utf8');

  assert.match(runtime, /var topSlots = \[belowHeader, responsiveTop\[0\], responsiveTop\[1\]\]/);
  assert.match(runtime, /courses\.insertBefore\(topRow, coursesContainer\)/);
  assert.match(runtime, /topRow\.appendChild\(slot\)/);
  assert.match(runtime, /position\.placeholder\.parentNode\.insertBefore\(position\.slot, position\.placeholder\.nextSibling\)/);
  assert.match(runtime, /courses-after-listing/);
  assert.match(runtime, /placeAfter\(trackFit, 'banner-468x60', 'courses-after-track-fit'\)/);
  assert.match(runtime, /\.ad-placement-courses-top-row\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(runtime, /@media\(max-width:767px\)\{\.ad-placement-courses-top-row\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(runtime, /#viewCourses a\.course-card, #viewCourses \.middle-banner a\[href="\/register"\]/);
  assert.match(runtime, /#viewCourses \.middle-banner a\[href="\/register"\]/);
  [
    'course-youtube-automation.html',
    'course-canva.html',
    'course-wordpress.html',
    'course-artificial-intelligence.html'
  ].forEach((coursePage) => assert.ok(mentor.includes(`page: '${coursePage}'`), `${coursePage} keeps its existing course URL`));
});

test('every course detail page opts its requested controls into click ads', () => {
  const root = path.join(__dirname, '..');
  const pages = [
    'course-artificial-intelligence.html',
    'course-canva.html',
    'course-wordpress.html',
    'course-youtube-automation.html'
  ];

  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');

    assert.match(html, /class="btn course-back-btn" href="\/#viewCourses" data-ad-popup="on"/, `${page} keeps the courses destination`);
    assert.match(html, /class="btn course-live-btn"\s+href="practical-classes\.html\?course=[^"]+" data-ad-popup="on"/, `${page} keeps the live classes destination`);
    assert.match(html, /class="btn btn-primary btn-lg" href="\/register" data-ad-popup="on">Enroll in this track/, `${page} enables the hero enrollment action`);
    assert.match(html, /class="btn btn-primary btn-block mt-3" href="\/register" data-ad-popup="on">Enroll in this track/, `${page} enables the Track Facts enrollment action`);
    assert.match(html, /class="btn btn-secondary btn-block mt-2" href="practical-classes\.html\?course=[^"]+" data-ad-popup="on">[\s\S]*?Open video playlist/, `${page} keeps the playlist destination`);
  });
});

test('Live Classes pages place a banner before the playlist card and enable requested click ads', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');
  const practicalClasses = fs.readFileSync(path.join(root, 'practical-classes.html'), 'utf8');

  assert.match(runtime, /function addPracticalClassPlacements\(\)\s*\{\s*addGenericPlacements\(\);[\s\S]*?var playlistHeading = main\.querySelector\('\.playlist-heading'\);[\s\S]*?var playlistCard = playlistHeading && playlistHeading\.closest\('\.card'\);[\s\S]*?placeBefore\(playlistCard, 'banner-468x60', 'live-classes-before-playlist'\)/);
  assert.match(runtime, /path === '\/practical-classes\.html' \|\| path === '\/student\/practical-classes'\) addPracticalClassPlacements\(\)/);
  assert.match(practicalClasses, /class="btn btn-primary" href="\/student\/dashboard" data-ad-popup="on">[\s\S]*?Open your workspace/i);
  assert.match(practicalClasses, /class="btn btn-secondary" href="\/register" data-ad-popup="on">Create student account/i);
  assert.match(practicalClasses, /<h2 id="playlistTitle">Course video playlist<\/h2>/);
  assert.match(practicalClasses, /id="playlistThumbnail"/);
});

test('button coverage is central, dynamic, and excludes non-action controls', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');

  assert.match(runtime, /function findPopupTrigger/);
  assert.match(runtime, /event\.composedPath\(\)/);
  assert.match(runtime, /node\.matches\(POPUP_TRIGGER\)/);
  assert.match(runtime, /input\[type="reset"\], input\[type="image"\]/);
  assert.doesNotMatch(runtime, /, a\.btn'/);
  assert.match(runtime, /\[aria-haspopup\], \[aria-expanded\], \[aria-controls\]/);
  assert.match(runtime, /\[role="tab"\], \[role="menuitem"\]/);
  assert.match(runtime, /\[data-disclosure\], \.accordion-button, \.faq-question/);
  assert.doesNotMatch(runtime, /dialog, \[role="dialog"\], \.modal, \.confirmation-dialog/);
  assert.doesNotMatch(runtime, /\.calculator-mode button/);
  assert.doesNotMatch(runtime, /if \(!placements\.length\) return;/);
  assert.doesNotMatch(runtime, /querySelectorAll\(POPUP_TRIGGER\)|addEventListener\('click'.*forEach/);
  assert.doesNotMatch(runtime, /dataset\.adBound|adHandlerAttached|button\.dataset/);
});

test('dimensions stay centralized and every slot reads the same shared unit record', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');

  AD_UNITS.filter((unit) => /^banner-/.test(unit.id)).forEach((unit) => {
    const match = runtime.match(new RegExp(`'${unit.id}': \\{ width: (\\d+), height: (\\d+) \\}`));
    assert.ok(match, `${unit.id} has a declared frame size`);
    assert.equal(`${match[1]} × ${match[2]}`, unit.dimensions);
  });
  assert.match(runtime, /renderSlot\(slot, adsById\.get\(slot\.dataset\.adUnit\)\)/);
});

test('generic layouts cover dashboards, auth pages, 404 and future pages', () => {
  const root = path.join(__dirname, '..');
  const runtime = fs.readFileSync(path.join(root, 'public', 'ad-runtime.js'), 'utf8');

  assert.match(runtime, /else addGenericPlacements\(\)/);
  assert.match(runtime, /document\.querySelector\('\.app-content'\)/);
  assert.match(runtime, /document\.querySelector\('\.nf-header'\)/);
  assert.match(runtime, /querySelector\('\.workspace-section, section, \.card, \.auth-card, \.nf-card'\)/);
  assert.match(runtime, /pageFooter\(\)/);
});
