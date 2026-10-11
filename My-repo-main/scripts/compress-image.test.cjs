const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const {
  calculateResults,
  compressImage,
  getSafeSvgPreview,
  inspectImage
} = require('../compress-image.cjs');

const animatedGif = Buffer.from(
  '47494638396101000100800000000000ffffff21f904010a0000002c000000000100010000020244010021f904010a0000002c00000000010001000002024c01003b',
  'hex'
);

function imageFile(name, buffer) {
  return { originalname: name, buffer };
}

async function createFixtures() {
  const width = 192;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      raw[index] = (x * 11 + y * 7) % 256;
      raw[index + 1] = (x * 3 + y * 17) % 256;
      raw[index + 2] = (x * 19 + y * 5) % 256;
      raw[index + 3] = (x + y) % 3 === 0 ? 0 : 255;
    }
  }
  const png = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 0 }).toBuffer();
  const jpeg = await sharp(raw, { raw: { width, height, channels: 4 } })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
  const webp = await sharp(raw, { raw: { width, height, channels: 4 } })
    .webp({ quality: 100, effort: 0 }).toBuffer();
  const tiff = await sharp(raw, { raw: { width, height, channels: 4 } })
    .tiff({ compression: 'none' }).toBuffer();
  const avif = await sharp(raw, { raw: { width, height, channels: 4 } })
    .avif({ quality: 100, effort: 0 }).toBuffer();
  return { width, height, png, jpeg, webp, tiff, avif };
}

async function main() {
  const registry = fs.readFileSync(path.join(__dirname, '..', 'public', 'tools.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'compress-image.html'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  assert.equal((registry.match(/id: 'compress-image'/g) || []).length, 1);
  assert.match(registry, /name: 'Compress Image'[\s\S]*?route: '\/tools\/compress-image'/);
  assert.match(page, /data-current-tool="compress-image"/);
  assert.match(page, /src="\/compress-image\.js"/);
  assert.match(server, /app\.get\('\/tools\/compress-image'/);
  assert.match(server, /app\.post\('\/api\/tools\/compress-image\/inspect'/);
  assert.match(server, /app\.post\('\/api\/tools\/compress-image\/preview'/);
  assert.match(server, /app\.post\('\/api\/tools\/compress-image'/);

  const fixtures = await createFixtures();
  const formats = [
    ['photo.JPEG', fixtures.jpeg, 'jpeg', 'image/jpeg'],
    ['picture.png', fixtures.png, 'png', 'image/png'],
    ['picture.webp', fixtures.webp, 'webp', 'image/webp'],
    ['picture.tiff', fixtures.tiff, 'tiff', 'image/tiff'],
    ['picture.avif', fixtures.avif, 'heif', 'image/avif']
  ];

  for (const [name, buffer, sharpFormat, mime] of formats) {
    const inspected = await inspectImage(imageFile(name, buffer));
    assert.equal(inspected.format, sharpFormat);
    assert.equal(inspected.width, fixtures.width);
    assert.equal(inspected.height, fixtures.height);

    const result = await compressImage(imageFile(name, buffer), 'extreme');
    assert.equal(result.mime, mime);
    assert.equal(result.width, fixtures.width);
    assert.equal(result.height, fixtures.height);
    const outputMetadata = await sharp(result.bytes).metadata();
    assert.equal(outputMetadata.format, sharpFormat);
    assert.equal(outputMetadata.width, fixtures.width);
    assert.equal(outputMetadata.height, fixtures.height);
    assert.notDeepEqual(result.bytes, buffer, name + ' must be re-encoded, not renamed');
  }

  const alphaOutput = await compressImage(imageFile('alpha.png', fixtures.png), 'extreme');
  assert.equal((await sharp(alphaOutput.bytes).metadata()).hasAlpha, true, 'PNG transparency should be retained');
  assert.ok(alphaOutput.bytes.length < fixtures.png.length, 'the unoptimized PNG fixture should become smaller');

  const jpegResults = await Promise.all(['extreme', 'recommended', 'less'].map((level) =>
    compressImage(imageFile('photo.jpg', fixtures.jpeg), level)));
  assert.ok(jpegResults[0].bytes.length < jpegResults[1].bytes.length);
  assert.ok(jpegResults[1].bytes.length < jpegResults[2].bytes.length);
  const orientedJpeg = await sharp({
    create: { width: 8, height: 4, channels: 3, background: '#c36' }
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const orientedOutput = await compressImage(imageFile('oriented.jpg', orientedJpeg), 'recommended');
  const orientedMetadata = await sharp(orientedOutput.bytes).metadata();
  assert.equal(orientedMetadata.width, 8);
  assert.equal(orientedMetadata.height, 4);
  assert.equal(orientedMetadata.orientation, 6, 'EXIF orientation should be retained without rotating the pixels');

  const gifFile = imageFile('moving.GIF', animatedGif);
  const gifInfo = await inspectImage(gifFile);
  assert.equal(gifInfo.width, 1);
  assert.equal(gifInfo.height, 1);
  assert.equal(gifInfo.pages, 2);
  assert.equal(gifInfo.animated, true);
  const gifResult = await compressImage(gifFile, 'recommended');
  const gifOutputInfo = await sharp(gifResult.bytes, { animated: true }).metadata();
  assert.equal(gifOutputInfo.format, 'gif');
  assert.equal(gifOutputInfo.width, 1);
  assert.equal(gifOutputInfo.pageHeight, 1);
  assert.equal(gifOutputInfo.pages, 2, 'all animated GIF frames should be retained');
  assert.equal(gifOutputInfo.hasAlpha, true, 'GIF transparency should be retained');
  assert.deepEqual(gifOutputInfo.delay, [100, 100], 'animation frame timing should be retained');
  assert.equal(gifOutputInfo.loop, 1, 'animation looping should be retained');

  const svg = Buffer.from(
    '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">\n  <!-- vector -->\n  <path d="M0 0h24v24H0z" fill="#336699"/>\n</svg>',
    'utf8'
  );
  const svgResult = await compressImage(imageFile('icon.SVG', svg), 'extreme');
  const safePreview = getSafeSvgPreview(imageFile('icon.svg', svg)).toString('utf8');
  assert.match(safePreview, /<path/);
  assert.doesNotMatch(safePreview, /<script|<style|https:/i);
  assert.equal(svgResult.mime, 'image/svg+xml');
  assert.equal(svgResult.bytes.toString('utf8').includes('<path'), true);
  assert.equal(svgResult.bytes.toString('utf8').includes('<!-- vector -->'), false);
  assert.equal(svgResult.width, 24);
  assert.equal(svgResult.height, 24);
  const svgRecommended = await compressImage(imageFile('icon.svg', svg), 'recommended');
  const svgLess = await compressImage(imageFile('icon.svg', svg), 'less');
  assert.ok(svgResult.bytes.length < svgRecommended.bytes.length);
  assert.ok(svgRecommended.bytes.length < svgLess.bytes.length);
  await assert.rejects(
    inspectImage(imageFile('unsafe.svg', Buffer.from('<svg><script>alert(1)</script></svg>'))),
    /cannot be safely processed/
  );
  await assert.rejects(
    inspectImage(imageFile('external.svg', Buffer.from('<svg><image href="https://example.test/a.png"/></svg>'))),
    /cannot be safely processed/
  );

  await assert.rejects(inspectImage(imageFile('renamed.png', fixtures.jpeg)), /contents do not match/);
  await assert.rejects(inspectImage(imageFile('corrupt.png', Buffer.from('not an image'))), /damaged or is not a supported/);
  await assert.rejects(inspectImage(imageFile('empty.png', Buffer.alloc(0))), /non-empty image/);
  await assert.rejects(inspectImage(imageFile('old.bmp', fixtures.png)), /BMP and ICO are not supported/);
  await assert.rejects(inspectImage(imageFile('icon.ico', fixtures.png)), /BMP and ICO are not supported/);
  await assert.rejects(compressImage(imageFile('picture.png', fixtures.png), 'unknown'), /Choose a compression level/);

  assert.deepEqual(calculateResults(1000, 750), {
    originalSize: 1000,
    compressedSize: 750,
    savedBytes: 250,
    percentSaved: 25,
    hasSavings: true,
    isLarger: false
  });
  assert.equal(calculateResults(1000, 1250).percentSaved, -25);
  assert.equal(calculateResults(1000, 1250).isLarger, true);
  assert.equal(calculateResults(1000, 1000).hasSavings, false);
  assert.throws(() => calculateResults(0, 10), /could not be measured/);

  console.log('Compress Image verified across JPEG, PNG, WebP, GIF, TIFF, AVIF, SVG, animation, transparency, validation, and size calculations.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
