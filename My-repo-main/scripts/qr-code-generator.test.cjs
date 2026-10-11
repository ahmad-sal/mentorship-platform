const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const {
  COUNTRY_CODES,
  MAX_SHARE_BYTES,
  inspectShareFile,
  normalizePhoneNumber,
  uploadShareFile
} = require('../qr-code-generator.cjs');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'public', 'qr-code-generator.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public', 'qr-code-generator.js'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'public', 'tools.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');

function file(originalname, buffer) {
  return { originalname, buffer };
}

function makeBox(type, payload) {
  const box = Buffer.alloc(8 + payload.length);
  box.writeUInt32BE(box.length, 0);
  box.write(type, 4, 4, 'ascii');
  payload.copy(box, 8);
  return box;
}

function mp3Fixture() {
  const header = ((0x7ff << 21) | (3 << 19) | (1 << 17) | (1 << 16) |
    (9 << 12) | (3 << 6)) >>> 0;
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(header, 0);
  return frame;
}

function wavFixture() {
  const audio = Buffer.alloc(46);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(2, 40);
  return audio;
}

function m4aFixture() {
  const ftyp = makeBox('ftyp', Buffer.from('M4A \0\0\0\0M4A '));
  const mediaData = makeBox('mdat', Buffer.from([0, 0, 0, 0]));
  const handler = makeBox('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('soun'), Buffer.alloc(12)]));
  const audioSample = makeBox('mp4a', Buffer.alloc(28));
  const sampleDescription = makeBox('stsd', Buffer.concat([Buffer.alloc(4), Buffer.from([0, 0, 0, 1]), audioSample]));
  const sampleTable = makeBox('stbl', sampleDescription);
  const mediaInfo = makeBox('minf', sampleTable);
  const media = makeBox('mdia', Buffer.concat([handler, mediaInfo]));
  const track = makeBox('trak', media);
  const movie = makeBox('moov', track);
  return Buffer.concat([ftyp, mediaData, movie]);
}

test('public registry and page include one QR tool and exactly six input types', () => {
  assert.equal((registry.match(/id: 'qr-code-generator'/g) || []).length, 1);
  assert.match(registry, /name: 'QR Code Generator'[\s\S]*?route: '\/tools\/qr-code-generator'/);
  assert.match(server, /app\.get\('\/tools\/qr-code-generator'/);
  assert.match(page, /data-current-tool="qr-code-generator"/);
  assert.equal((page.match(/class="qr-code-type-card" data-type=/g) || []).length, 6);
  for (const type of ['url', 'pdf', 'image', 'text', 'audio', 'whatsapp']) {
    assert.match(page, new RegExp('data-type="' + type + '"'));
  }
  assert.match(page, /data-template-grid/);
  assert.match(page, /data-frame-grid/);
  assert.match(page, /data-body-grid/);
  assert.match(page, /data-outer-grid/);
  assert.match(page, /data-inner-grid/);
  assert.match(page, /data-logo-grid/);
  assert.match(script, /QRCodeStyling/);
  assert.match(script, /new TextEncoder\(\)/);
  assert.match(script, /previewRevision \+= 1/);
  assert.match(script, /image\/png/);
});

test('country data supports international validation and WhatsApp normalization', () => {
  assert.ok(COUNTRY_CODES.length > 200);
  assert.ok(COUNTRY_CODES.includes('PK'));
  assert.equal(normalizePhoneNumber('0300 1234567', 'PK'), '+923001234567');
  assert.equal(normalizePhoneNumber('+1 (202) 555-0125', 'US'), '+12025550125');
  assert.throws(() => normalizePhoneNumber('12345', 'PK'), /valid phone number/);
  assert.throws(() => normalizePhoneNumber('03001234567', 'XX'), /valid country/);
});

test('PDF, MP3, WAV, and M4A files are structurally validated with matching extensions', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const pdf = Buffer.from(await document.save());
  assert.deepEqual(await inspectShareFile(file('document.pdf', pdf), 'pdf'), {
    resourceType: 'raw',
    format: 'pdf'
  });
  const mp3 = mp3Fixture();
  assert.deepEqual(await inspectShareFile(file('audio.mp3', mp3), 'audio'), {
    resourceType: 'raw',
    format: 'mp3'
  });
  const wav = wavFixture();
  assert.deepEqual(await inspectShareFile(file('audio.wav', wav), 'audio'), {
    resourceType: 'raw',
    format: 'wav'
  });
  assert.deepEqual(await inspectShareFile(file('audio.m4a', m4aFixture()), 'audio'), {
    resourceType: 'raw',
    format: 'm4a'
  });
  await assert.rejects(inspectShareFile(file('document.pdf', Buffer.from('%PDF-1.7\nnot a PDF document\n%%EOF\n')), 'pdf'), /corrupted/);
  await assert.rejects(inspectShareFile(file('audio.mp3', Buffer.from('ID3' + '0'.repeat(32))), 'audio'), /valid MP3/);
  await assert.rejects(inspectShareFile(file('audio.wav', Buffer.from('RIFF0000WAVE000000000000')), 'audio'), /valid MP3/);
  await assert.rejects(inspectShareFile(file('audio.m4a', makeBox('ftyp', Buffer.from('M4A \0\0\0\0M4A '))), 'audio'), /valid MP3/);
  await assert.rejects(inspectShareFile(file('document.pdf', pdf), 'other'), /supported file QR category/);
  await assert.rejects(inspectShareFile(file('empty.pdf', Buffer.alloc(0)), 'pdf'), /non-empty file/);
});

test('image uploads require matching decodable PNG, JPEG, or WebP content', async () => {
  const image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#24a148' }
  }).png().toBuffer();
  assert.deepEqual(await inspectShareFile(file('qr-image.png', image), 'image'), {
    resourceType: 'image',
    format: 'png'
  });
  await assert.rejects(inspectShareFile(file('qr-image.jpg', image), 'image'), /do not match/);
  await assert.rejects(inspectShareFile(file('qr-image.png', Buffer.from('invalid')), 'image'), /corrupted/);
  await assert.rejects(
    inspectShareFile(file('large.pdf', Buffer.alloc(MAX_SHARE_BYTES + 1)), 'pdf'),
    /20 MB/
  );
});

test('file hosting refuses inaccessible or non-Cloudinary public URLs', async (context) => {
  const document = await PDFDocument.create();
  document.addPage();
  const pdf = file('hosted.pdf', Buffer.from(await document.save()));
  const uploader = {
    config: () => ({ cloud_name: 'test-cloud', api_key: 'key', api_secret: 'secret' }),
    uploader: {
      destroy: async () => ({ result: 'ok' }),
      upload_stream(options, callback) {
        assert.equal(options.resource_type, 'raw');
        return { end() { callback(null, { public_id: 'qr-code-shares/pdf/test.pdf', secure_url: 'https://res.cloudinary.com/test-cloud/raw/upload/qr-code.pdf' }); } };
      }
    }
  };
  const unreachableUploader = {
    config: uploader.config,
    uploader: {
      destroy: async (publicId, options) => {
        assert.equal(publicId, 'qr-code-shares/pdf/test.pdf');
        assert.equal(options.resource_type, 'raw');
        return { result: 'ok' };
      },
      upload_stream(options, callback) {
        assert.equal(options.resource_type, 'raw');
        return { end() { callback(null, { public_id: 'qr-code-shares/pdf/test.pdf', secure_url: 'https://res.cloudinary.com/test-cloud/raw/upload/qr-code.pdf' }); } };
      }
    }
  };
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/res\.cloudinary\.com\//);
    assert.equal(options.method, 'HEAD');
    return { ok: true, status: 200 };
  };
  const result = await uploadShareFile(pdf, 'pdf', uploader);
  assert.equal(result.url, 'https://res.cloudinary.com/test-cloud/raw/upload/qr-code.pdf');

  global.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(uploadShareFile(pdf, 'pdf', unreachableUploader), /not publicly accessible/);

  const invalidHost = {
    ...uploader,
    uploader: {
      upload_stream(options, callback) {
        return { end() { callback(null, { secure_url: 'https://private.example.com/file.pdf' }); } };
      }
    }
  };
  await assert.rejects(uploadShareFile(pdf, 'pdf', invalidHost), /accessible HTTPS file URL/);
});

console.log('QR code generator checks passed.');
