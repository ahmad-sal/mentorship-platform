const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_LENGTH,
  MAX_UPDATE_FILE_BYTES,
  IMPORTANT_UPDATE_STORAGE_BUCKET,
  slugify,
  normalizeVideoInput,
  hasMp4Signature,
  sanitizeOriginalFilename,
  validateUpdateFileMetadata,
  createImportantUpdateStoragePath,
  isValidImportantUpdateStoragePath,
  hasExpectedUpdateFileSignature,
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
  assert.equal(record.content_type, 'video');
});

test('update input supports a distinct file content type and rejects unknown types', () => {
  assert.equal(normalizeVideoInput(validVideo({ content_type: 'file' })).content_type, 'file');
  assert.throws(() => normalizeVideoInput(validVideo({ content_type: 'executable' })), /Choose Video Update or File Update/);
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

test('update filenames are sanitized and supported file metadata is validated', () => {
  const file = validateUpdateFileMetadata({
    originalname: '..\\private\\lesson notes.PDF',
    mimetype: 'application/pdf',
    size: 1024
  });
  assert.equal(file.originalFilename, 'lesson notes.PDF');
  assert.equal(file.extension, '.pdf');
  assert.equal(file.mimeType, 'application/pdf');
  assert.equal(MAX_UPDATE_FILE_BYTES, 50 * 1024 * 1024);
  assert.equal(IMPORTANT_UPDATE_STORAGE_BUCKET, 'important-updates-files');
  assert.throws(() => validateUpdateFileMetadata({
    originalname: 'payload.exe',
    mimetype: 'application/x-msdownload',
    size: 100
  }), /supported PDF, Office document[\s\S]*Received: \.exe[\s\S]*Supported extensions:/);
  assert.throws(() => validateUpdateFileMetadata({
    originalname: 'scan',
    mimetype: 'image/jpeg',
    size: 100
  }), /Received: no extension/);
  assert.throws(() => validateUpdateFileMetadata({
    originalname: 'document.pdf',
    mimetype: 'text/plain',
    size: 100
  }), /extension and MIME type do not match/);
  assert.throws(() => validateUpdateFileMetadata({
    originalname: 'document.pdf',
    mimetype: 'application/pdf',
    size: MAX_UPDATE_FILE_BYTES + 1
  }), /50 MiB or smaller/);
  assert.equal(sanitizeOriginalFilename('../../bad:name.pdf'), 'bad_name.pdf');
});

test('Supabase update object paths use unguessable UUIDs and the validated extension', () => {
  const objectPath = createImportantUpdateStoragePath('.pdf', '7b4a9704-a72d-4c7f-9f60-a9f399b631ea');
  assert.equal(objectPath, 'important-updates/7b4a9704-a72d-4c7f-9f60-a9f399b631ea.pdf');
  assert.equal(isValidImportantUpdateStoragePath(objectPath, '.pdf'), true);
  assert.equal(isValidImportantUpdateStoragePath('important-updates/other.pdf', '.pdf'), false);
  assert.equal(isValidImportantUpdateStoragePath(`${objectPath}/../other.pdf`, '.pdf'), false);
  assert.throws(() => createImportantUpdateStoragePath('.exe'), /extension is not supported/);
});

test('10, 11, 13, and 30 MiB update files fit the independent 50 MiB application limit', () => {
  const fileAtProviderLimit = {
    originalname: 'limit.pdf',
    mimetype: 'application/pdf',
    size: 10 * 1024 * 1024
  };
  assert.equal(validateUpdateFileMetadata(fileAtProviderLimit).mimeType, 'application/pdf');

  for (const size of [11, 13, 30].map((megabytes) => megabytes * 1024 * 1024)) {
    assert.equal(validateUpdateFileMetadata({
      ...fileAtProviderLimit,
      size
    }).mimeType, 'application/pdf');
  }
  assert.equal(validateUpdateFileMetadata({
    ...fileAtProviderLimit,
    size: MAX_UPDATE_FILE_BYTES
  }).mimeType, 'application/pdf');
});

test('file uploads verify file signatures rather than trusting their names', () => {
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from('%PDF-1.7'), '.pdf'), true);
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from('MZ executable'), '.pdf'), false);
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]), '.docx'), true);
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), '.doc'), true);
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from('text file'), '.txt'), true);
  assert.equal(hasExpectedUpdateFileSignature(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), '.png'), true);
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

test('file updates use signed Supabase TUS uploads and verify the stored original before saving', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-important-videos.js'), 'utf8');
  const mediaUpload = server.match(/async function uploadImportantVideoMedia\([\s\S]*?\n\}/);
  assert.ok(mediaUpload);
  assert.match(mediaUpload[0], /Update documents must use Supabase Storage resumable uploads/);
  assert.doesNotMatch(mediaUpload[0], /resource_type: 'raw'/);
  assert.match(server, /app\.post\('\/api\/admin\/important-updates\/upload-session', requireAdmin, requireSameOriginAdMutation/);
  assert.match(server, /projectUrl\.pathname = '\/storage\/v1\/upload\/resumable\/sign'/);
  assert.match(server, /\.createSignedUploadUrl\(objectPath, \{ upsert: false \}\)/);
  assert.match(server, /const \{ data: fileInfo, error: infoError \} = await storage\.info\(objectPath\)/);
  assert.match(server, /fileInfo\.contentType/);
  assert.match(server, /Range: 'bytes=0-8191'/);
  assert.match(server, /hasExpectedUpdateFileSignature\(header, metadata\.extension\)/);
  assert.match(server, /verifySupabaseUpdateFile\(client, requestedPath, req\.body\)/);
  assert.match(server, /originalname:\s*rawMetadata\s*&&\s*\(rawMetadata\.file_original_filename\s*\|\|\s*rawMetadata\.original_filename\)/);
  assert.match(server, /file_storage_provider:[\s\S]*?file\.storageProvider/);
  assert.match(admin, /new window\.tus\.Upload\(file/);
  assert.match(admin, /'x-signature': session\.token/);
  assert.match(admin, /chunkSize: 6 \* 1024 \* 1024/);
  assert.match(admin, /onProgress\(bytesUploaded, bytesTotal\)/);
  assert.match(admin, /data\.set\('file_storage_path', uploadedFile\.path\)/);
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
  assert.match(server, /\.from\('important_videos'\)\s*\.select\('id, content_type, title, slug, description, details, category, thumbnail_url, video_url, file_url, original_filename, file_mime_type, file_size, file_uploaded_at, status, display_order, created_at, updated_at, published_at'\)\s*\.eq\('status', 'published'\)/);
  assert.match(server, /\.from\('important_videos'\)\s*\.select\('id, content_type, title, slug, description, details, category, thumbnail_url, video_url, display_order, published_at'\)\s*\.eq\('slug', req\.params\.slug\)\s*\.eq\('status', 'published'\)\s*\.eq\('content_type', 'video'\)/);
  assert.match(server, /content_type === 'file'[\s\S]*?file_url && update\.original_filename/);
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
  assert.match(script, /There are no published updates yet/);
  assert.match(script, /Important Updates could not be loaded right now/);
});

test('only the requested Important Updates, Watch Video, benefits, Open File, and Download clicks trigger popups', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'important-videos.js'), 'utf8');
  const root = path.join(__dirname, '..');
  const headerFiles = [
    'index.html',
    'public/tools.html',
    'public/meet-developer.html',
    'public/important-videos.html'
  ];
  headerFiles.forEach((file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /href="\/important-updates"[^>]*data-ad-popup="on">Important Updates/);
  });
  assert.match(script, /makeText\('button', 'iv-details-toggle', 'How to Use \/ Benefits'\)[\s\S]*?button\.setAttribute\('data-ad-popup', 'on'\)/);
  assert.match(script, /details\.hidden = expanded/);
  assert.match(script, /watch\.setAttribute\('data-ad-popup', 'on'\)/);
  assert.match(script, /open\.setAttribute\('data-ad-popup', 'on'\)/);
  assert.match(script, /download\.setAttribute\('data-ad-popup', 'on'\)/);
  assert.match(script, /download\.href = `\/api\/important-updates\/\$\{encodeURIComponent\(update\.id\)\}\/download`/);
  assert.match(script, /download\.setAttribute\('download', update\.original_filename \|\| ''\)/);
  assert.doesNotMatch(script, /download\.addEventListener\('click'/);
  assert.match(script, /open\.target = '_blank'/);
  assert.doesNotMatch(script, /open\.setAttribute\('data-ad-popup', 'off'\)|download\.setAttribute\('data-ad-popup', 'off'\)/);
});

test('file migration is additive and preserves existing video rows as video updates', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '005_important_updates_files.sql'), 'utf8');
  assert.match(migration, /add column if not exists content_type text default 'video'/i);
  assert.match(migration, /set content_type = 'video'\s+where content_type is null/i);
  assert.match(migration, /add column if not exists file_url text/i);
  assert.match(migration, /content_type = 'file'[\s\S]*?file_url is not null[\s\S]*?original_filename is not null/i);
  assert.match(migration, /create policy important_videos_public_read[\s\S]*?status = 'published'/i);
  assert.doesNotMatch(migration, /\b(drop table|delete from public\.important_videos|truncate)\b/i);
});

test('storage-provider migration is additive and retains legacy Cloudinary records', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '006_important_updates_storage_provider.sql'), 'utf8');
  assert.match(migration, /add column if not exists file_storage_provider text/i);
  assert.match(migration, /file_storage_provider in \('cloudinary', 'supabase'\)/i);
  assert.match(migration, /revoke select on public\.important_videos from anon, authenticated/i);
  const publicColumns = migration.match(/grant select \(([\s\S]*?)\) on public\.important_videos to anon, authenticated/i);
  assert.ok(publicColumns);
  assert.doesNotMatch(publicColumns[1], /file_public_id|file_storage_provider/i);
  assert.doesNotMatch(migration, /\b(drop table|drop column|delete from|truncate|update public\.important_videos)\b/i);
});

test('file updates can be created, edited without replacing media, published, and deleted safely', () => {
  const root = path.join(__dirname, '..');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'public', 'admin-important-videos.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'private', 'admin-important-videos.html'), 'utf8');
  const persistence = server.match(/async function persistImportantVideo\([\s\S]*?return res\.json\(\{ update: safeUpdate, video: safeUpdate, cleanupWarnings \}\);/);
  assert.ok(persistence);
  assert.match(persistence[0], /\.\.\.input/);
  assert.match(persistence[0], /const isFileUpdate = input\.content_type === 'file'/);
  assert.match(persistence[0], /const fileUrl = isFileUpdate \? file[\s\S]*?\/api\/important-updates\/[\s\S]*?current\.file_url/);
  assert.match(persistence[0], /file_uploaded_at:[\s\S]*?current\.file_uploaded_at/);
  assert.match(server, /app\.post\('\/api\/admin\/important-videos', requireAdmin/);
  assert.match(server, /app\.put\('\/api\/admin\/important-videos\/:id', requireAdmin/);
  assert.match(server, /app\.patch\('\/api\/admin\/important-videos\/:id\/status', requireAdmin/);
  assert.match(server, /app\.delete\('\/api\/admin\/important-videos\/:id', requireAdmin/);
  assert.match(server, /limits:\s*\{[\s\S]*?fields:\s*20/);
  assert.match(server, /error\.code === 'LIMIT_FIELD_COUNT'[\s\S]*?too many fields/);
  assert.match(server, /\.eq\(referenceColumn, media\.publicId\)[\s\S]*?if \(references && references\.length\) continue/);
  assert.match(server, /\.from\(IMPORTANT_UPDATE_STORAGE_BUCKET\)\s*\.remove\(\[media\.publicId\]\)/);
  assert.match(admin, /data\.set\('content_type', typeInput\.value\)/);
  assert.match(admin, /record\.content_type === 'file'/);
  assert.match(admin, /videoInput\.disabled = isFile/);
  assert.match(admin, /fileInput\.disabled = !isFile/);
  assert.match(html, /name="file" type="file"/);
  assert.match(html, /File Updates require an update file[\s\S]*video uploads do not apply/);
});

test('file download is published-only, streamed, and returns a safe original attachment name', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  const downloadRoute = server.match(/app\.get\('\/api\/important-updates\/:id\/download',[\s\S]*?\n\}\);/);
  const streaming = server.match(/async function streamPublishedUpdateFile\([\s\S]*?\n\}/);
  assert.ok(downloadRoute);
  assert.ok(streaming);
  assert.match(streaming[0], /\.eq\('content_type', 'file'\)/);
  assert.match(streaming[0], /\.eq\('status', 'published'\)/);
  assert.match(streaming[0], /file_url, file_public_id, file_storage_provider, original_filename/);
  assert.match(streaming[0], /https\.get\(fileUrl/);
  assert.doesNotMatch(streaming[0], /private_download_url|signedDownloadUrl/);
  assert.match(streaming[0], /response: responseDetails/);
  assert.match(streaming[0], /cloudinaryError: upstream\.headers\['x-cld-error'\]/);
  assert.match(streaming[0], /Cloudinary denied delivery under its account security or access-control settings/);
  assert.match(streaming[0], /Content-Disposition/);
  assert.match(streaming[0], /upstream\.pipe\(res\)/);
  assert.match(streaming[0], /res\.set\('X-Content-Type-Options', 'nosniff'\)/);
  assert.match(streaming[0], /requestedDisposition === 'inline'/);
  assert.match(streaming[0], /: 'attachment'/);
  assert.match(streaming[0], /This file cannot be previewed in your browser/);
  assert.match(server, /app\.get\('\/api\/important-updates\/:id\/open'/);
});
