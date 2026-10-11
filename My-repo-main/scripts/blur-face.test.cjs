const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const bmp = require('bmp-js');
const {
  MAX_BLUR_AREAS,
  blurImage,
  inspectImage,
  validateRegions
} = require('../blur-face.cjs');

const animatedGif = Buffer.from(
  '47494638396101000100800000000000ffffff21f904010a0000002c000000000100010000020244010021f904010a0000002c00000000010001000002024c01003b',
  'hex'
);

function imageFile(name, buffer) {
  return { originalname: name, buffer };
}

async function createFixtures() {
  const width = 80;
  const height = 60;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const value = (x + y) % 2 ? 255 : 0;
      rgba[index] = value;
      rgba[index + 1] = value;
      rgba[index + 2] = value;
      rgba[index + 3] = y < 2 ? 0 : 255;
    }
  }
  const raw = { raw: { width, height, channels: 4 } };
  return {
    width,
    height,
    rgba,
    png: await sharp(rgba, raw).png().toBuffer(),
    jpeg: await sharp(rgba, raw).jpeg().toBuffer(),
    webp: await sharp(rgba, raw).webp().toBuffer(),
    tiff: await sharp(rgba, raw).tiff().toBuffer(),
    gif: await sharp(rgba, raw).gif().toBuffer(),
    avif: await sharp(rgba, raw).avif({ effort: 0 }).toBuffer(),
    svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#4682b4"/></svg>'),
    bmp: bmp.encode({ data: rgba, width, height }).data
  };
}

async function main() {
  const root = path.join(__dirname, '..');
  const registry = fs.readFileSync(path.join(root, 'public', 'tools.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public', 'blur-face.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public', 'blur-face.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  assert.equal((registry.match(/id: 'blur-face'/g) || []).length, 1);
  assert.match(registry, /name: 'Blur Face'[\s\S]*?route: '\/tools\/blur-face'/);
  assert.match(page, /data-current-tool="blur-face"/);
  assert.match(page, /Recommended <small>Medium<\/small>/);
  assert.match(page, /Low Detection/);
  assert.match(page, /High Detection/);
  assert.match(page, /data-action="add-area"/);
  assert.match(page, /data-action="blur"/);
  assert.match(page, /data-action="download"/);
  assert.match(page, /face_detection\.js/);
  assert.match(server, /app\.get\('\/tools\/blur-face'/);
  assert.match(server, /app\.post\('\/api\/tools\/blur-face\/prepare'/);
  assert.match(server, /app\.post\('\/api\/tools\/blur-face'/);
  assert.match(server, /vendor\/mediapipe-face-detection/);
  assert.match(script, /minDetectionConfidence: 0\.72/);
  assert.match(script, /minDetectionConfidence: 0\.5/);
  assert.match(script, /minDetectionConfidence: 0\.35/);
  assert.match(script, /model: 'full'/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /data-resize/);

  const fixtures = await createFixtures();
  const supported = [
    ['PORTRAIT.PNG', fixtures.png, 'png'],
    ['portrait.jpg', fixtures.jpeg, 'jpeg'],
    ['portrait.webp', fixtures.webp, 'webp'],
    ['portrait.tif', fixtures.tiff, 'tiff'],
    ['portrait.gif', fixtures.gif, 'gif'],
    ['portrait.avif', fixtures.avif, 'avif'],
    ['portrait.svg', fixtures.svg, 'svg'],
    ['portrait.bmp', fixtures.bmp, 'bmp']
  ];
  for (const [name, bytes, format] of supported) {
    const prepared = await inspectImage(imageFile(name, bytes));
    assert.equal(prepared.format, format, name);
    assert.equal(prepared.width, fixtures.width, name);
    assert.equal(prepared.height, fixtures.height, name);
    const metadata = await sharp(prepared.bytes).metadata();
    assert.equal(metadata.format, 'png', name);
    assert.equal(metadata.width, fixtures.width, name);
    assert.equal(metadata.height, fixtures.height, name);
  }

  await assert.rejects(
    inspectImage(imageFile('animated.gif', animatedGif)),
    /Animated GIFs are not supported/
  );
  await assert.rejects(
    inspectImage(imageFile('mismatch.png', fixtures.jpeg)),
    /contents do not match/
  );
  await assert.rejects(
    inspectImage(imageFile('corrupt.png', Buffer.from('not an image'))),
    /corrupted or is not a supported/
  );
  await assert.rejects(
    inspectImage(imageFile('unsafe.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>'))),
    /static images without scripts/
  );

  assert.equal(MAX_BLUR_AREAS, 100);
  const areas = [
    { x: 0.5, y: 0.5, width: 0.45, height: 0.6 },
    { x: 0.2, y: 0.2, width: 0.18, height: 0.24 }
  ];
  assert.equal(validateRegions(areas).length, 2);
  assert.throws(
    () => validateRegions([{ x: 0.02, y: 0.5, width: 0.2, height: 0.2 }]),
    /extends outside/
  );
  assert.throws(
    () => validateRegions(Array(MAX_BLUR_AREAS + 1).fill(areas[0])),
    /selected blur areas are invalid/
  );

  const result = await blurImage(imageFile('portrait.png', fixtures.png), areas, 'Portrait photo.jpg');
  assert.equal(result.filename, 'Portrait-photo-blurred.png');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.width, fixtures.width);
  assert.equal(result.height, fixtures.height);
  assert.equal(result.hasAlpha, true);
  const output = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  const source = await sharp(fixtures.png).ensureAlpha().raw().toBuffer();
  const pixel = (x, y) => (y * fixtures.width + x) * 4;
  const unchangedPixel = pixel(4, 10);
  assert.deepEqual(
    Array.from(output.subarray(unchangedPixel, unchangedPixel + 4)),
    Array.from(source.subarray(unchangedPixel, unchangedPixel + 4)),
    'pixels outside selected oval masks must remain unchanged'
  );
  const blurredPixel = pixel(40, 30);
  assert.notDeepEqual(
    Array.from(output.subarray(blurredPixel, blurredPixel + 3)),
    Array.from(source.subarray(blurredPixel, blurredPixel + 3)),
    'selected face-area pixels should be blurred'
  );
  const transparentPixel = pixel(4, 0);
  assert.equal(output[transparentPixel + 3], source[transparentPixel + 3], 'outside alpha should be preserved');
  await assert.rejects(
    blurImage(imageFile('portrait.png', fixtures.png), [], 'portrait.png'),
    /No blur areas were selected/
  );

  console.log('Blur Face verified for supported still image formats, content validation, SVG safety, animated-image rejection, bounded manual areas, oval-only blur, alpha preservation, and output metadata.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
