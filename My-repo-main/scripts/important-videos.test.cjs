const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_LENGTH,
  slugify,
  normalizeVideoInput,
  hasMp4Signature,
  uploadLargeWithCallback
} = require('../important-videos.cjs');

function validVideo(overrides = {}) {
  return {
    title: 'Muse AI — Complete Setup Guide',
    description: 'A practical walkthrough.',
    details: 'Steps and notes.',
    category: 'AI tools',
    slug: 'muse-ai-setup',
    status: 'draft',
    display_order: '2',
    ...overrides
  };
}

test('slugify generates safe lowercase route identifiers', () => {
  assert.equal(slugify(' Muse AI — Setup & Guide '), 'muse-ai-setup-guide');
  assert.equal(slugify('../unsafe? path'), 'unsafe-path');
  assert.equal(slugify('💡'), '');
});

test('video input normalization trims content and applies defaults', () => {
  const record = normalizeVideoInput(validVideo({ title: '  Video title  ', category: ' ' }));
  assert.equal(record.title, 'Video title');
  assert.equal(record.slug, 'muse-ai-setup');
  assert.equal(record.category, null);
  assert.equal(record.display_order, 2);
  assert.equal(record.status, 'draft');
});

test('video input validation rejects missing titles, invalid status, and invalid order', () => {
  assert.throws(() => normalizeVideoInput(validVideo({ title: ' ' })), /Title is required/);
  assert.throws(() => normalizeVideoInput(validVideo({ status: 'public' })), /Choose Draft or Published/);
  assert.throws(() => normalizeVideoInput(validVideo({ display_order: '-1' })), /Display order/);
  assert.throws(() => normalizeVideoInput(validVideo({ display_order: '1.5' })), /Display order/);
});

test('video input validation enforces content length limits', () => {
  assert.throws(() => normalizeVideoInput(validVideo({ title: 't'.repeat(MAX_TITLE_LENGTH + 1) })), /Title is required/);
  assert.throws(() => normalizeVideoInput(validVideo({ description: 'd'.repeat(MAX_DESCRIPTION_LENGTH + 1) })), /Short description/);
  assert.throws(() => normalizeVideoInput(validVideo({ details: 'd'.repeat(MAX_DETAILS_LENGTH + 1) })), /Detailed information/);
});

test('video input creates a safe slug from its title when no slug is supplied', () => {
  assert.equal(normalizeVideoInput(validVideo({ slug: '', title: 'A title / with punctuation' })).slug, 'a-title-with-punctuation');
  assert.throws(() => normalizeVideoInput(validVideo({ slug: '', title: '💡' })), /route identifier/);
});

test('MP4 signature check requires an ftyp brand marker', () => {
  assert.equal(hasMp4Signature(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])), true);
  assert.equal(hasMp4Signature(Buffer.from('not-an-mp4-file')), false);
  assert.equal(hasMp4Signature('video/mp4'), false);
});

test('large Cloudinary uploads wait for the SDK callback response', async () => {
  const expected = { secure_url: 'https://res.cloudinary.com/sample/video/upload/sample.mp4', public_id: 'sample' };
  const stream = new EventEmitter();
  const uploader = {
    upload_large(filePath, options, callback) {
      assert.equal(filePath, 'video.mp4');
      assert.equal(options.resource_type, 'video');
      setImmediate(() => callback(null, expected));
      return stream;
    }
  };

  assert.equal(await uploadLargeWithCallback(uploader, 'video.mp4', { resource_type: 'video' }), expected);
});

test('large Cloudinary uploads reject provider and stream errors', async () => {
  const providerFailure = new Error('Cloudinary rejected the upload.');
  await assert.rejects(
    uploadLargeWithCallback({
      upload_large(filePath, options, callback) {
        setImmediate(() => callback(providerFailure));
        return new EventEmitter();
      }
    }, 'video.mp4', {}),
    providerFailure
  );

  const streamFailure = new Error('Upload stream failed.');
  await assert.rejects(
    uploadLargeWithCallback({
      upload_large() {
        const stream = new EventEmitter();
        setImmediate(() => stream.emit('error', streamFailure));
        return stream;
      }
    }, 'video.mp4', {}),
    streamFailure
  );
});

test('seed migration keeps one editable Muse draft across repeated deployments', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_important_videos.sql'), 'utf8');
  assert.match(migration, /00000000-0000-4000-8000-000000000001/);
  assert.match(migration, /Muse AI — Complete Setup Guide and One-Million-Token Context Window/);
  assert.match(migration, /'draft'/);
  assert.match(migration, /on conflict \(id\) do nothing/i);
});

test('migration aligns API columns and restricts table access with RLS', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '004_important_videos.sql'), 'utf8');
  for (const column of [
    'id uuid',
    'title text',
    'slug text',
    'description text',
    'details text',
    'thumbnail_url text',
    'thumbnail_public_id text',
    'video_url text',
    'video_public_id text',
    "status text not null default 'draft'",
    'display_order integer',
    'created_at timestamptz',
    'updated_at timestamptz',
    'published_at timestamptz'
  ]) {
    assert.ok(migration.includes(column), `Expected migration to define ${column}`);
  }
  assert.match(migration, /alter table public\.important_videos enable row level security/i);
  assert.match(migration, /grant usage on schema public to anon, authenticated, service_role/i);
  assert.match(migration, /to anon, authenticated\s+using\s*\(\s*status = 'published'/i);
  assert.match(migration, /is_important_video_admin\(\)/i);
  assert.match(migration, /grant all on public\.important_videos to service_role/i);
});

test('public API requests return persisted video fields and never substitute sample records', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  assert.match(server, /\.from\('important_videos'\)\s*\.select\('id, title, slug, description, details, category, thumbnail_url, status, display_order, created_at, updated_at, published_at'\)\s*\.eq\('status', 'published'\)/);
  assert.match(server, /\.from\('important_videos'\)\s*\.select\('id, title, slug, description, details, category, thumbnail_url, video_url, display_order, published_at'\)\s*\.eq\('slug', req\.params\.slug\)\s*\.eq\('status', 'published'\)/);
});

test('public library uses the listing grid and compact empty state, not the oversized hero play icon', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'important-videos.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'important-videos.css'), 'utf8');
  const themeCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'theme.css'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'important-videos.js'), 'utf8');
  assert.match(html, /id="ivVideoGrid"/);
  assert.match(html, /href="\/tools\.css"/);
  assert.doesNotMatch(html, /iv-hero-art|iv-hero-play/);
  assert.doesNotMatch(css, /\.iv-hero-art|\.iv-hero-play/);
  assert.match(css, /\.iv-empty\s*\{[^}]*padding:\s*1\.25rem/s);
  assert.match(themeCss, /@media \(min-width: 1161px\)[\s\S]*?\.nav-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(themeCss, /@media \(max-width: 1160px\)[\s\S]*?\.mobile-menu-btn\s*\{\s*display:\s*inline-flex/);
  assert.match(script, /There are no published videos yet/);
  assert.match(script, /Videos could not be loaded right now/);
});

test('How to Use / Benefits toggles its content and opts into the existing popup ad', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'important-videos.js'), 'utf8');
  assert.match(script, /makeText\('button', 'iv-details-toggle', 'How to Use \/ Benefits'\)[\s\S]*?button\.setAttribute\('data-ad-popup', 'on'\)/);
  assert.match(script, /details\.hidden = expanded/);
});
