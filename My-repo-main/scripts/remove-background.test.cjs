const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createRemoveBackgroundProcessor, inspectImage } = require('../remove-background.cjs');

const animatedGif = Buffer.from(
  '47494638396101000100800000000000ffffff21f904010a0000002c000000000100010000020244010021f904010a0000002c00000000010001000002024c01003b',
  'hex'
);

function imageFile(name, buffer) {
  return { originalname: name, buffer };
}

async function createFixtures() {
  const width = 32;
  const height = 24;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const subject = x >= 10 && x < 22 && y >= 5 && y < 20;
      rgba[offset] = subject ? 210 : 25;
      rgba[offset + 1] = subject ? 70 : 110;
      rgba[offset + 2] = subject ? 35 : 185;
      rgba[offset + 3] = x === 10 && y === 10 ? 128 : 255;
    }
  }
  const options = { raw: { width, height, channels: 4 } };
  return {
    width,
    height,
    png: await sharp(rgba, options).png().toBuffer(),
    jpeg: await sharp(rgba, options).flatten({ background: '#fff' }).jpeg().toBuffer(),
    webp: await sharp(rgba, options).webp().toBuffer(),
    gif: await sharp(rgba, options).gif().toBuffer(),
    tiff: await sharp(rgba, options).tiff().toBuffer(),
    avif: await sharp(rgba, options).avif({ effort: 0 }).toBuffer()
  };
}

function createProcessor(options) {
  const state = { uploads: [], deletions: [], source: null, transformations: [] };
  const cloudinary = {
    config() {
      return { cloud_name: 'test', api_key: 'test', api_secret: 'test' };
    },
    uploader: {
      upload_stream(settings, callback) {
        state.uploads.push(settings);
        return {
          end(buffer) {
            state.source = buffer;
            state.transformations.push(settings.eager[0]);
            callback(null, {
              eager: [{ secure_url: 'https://res.cloudinary.com/test/image/upload/processed.png' }]
            });
          }
        };
      },
      async destroy(publicId, settings) {
        state.deletions.push({ publicId, settings });
        if (options && options.failCleanup) return { result: 'error' };
        return { result: 'ok' };
      }
    }
  };
  const fetchImage = async (url) => {
    if (options && options.failFetch) throw new Error('mock fetch failed');
    const input = await sharp(state.source).raw().toBuffer({ resolveWithObject: true });
    const alpha = Buffer.alloc(input.info.width * input.info.height);
    for (let y = 0; y < input.info.height; y += 1) {
      for (let x = 0; x < input.info.width; x += 1) {
        const foreground = x >= 10 && x < 22 && y >= 5 && y < 20;
        alpha[y * input.info.width + x] = foreground ? 255 : 0;
      }
    }
    const rgb = await sharp(state.source).removeAlpha().raw().toBuffer();
    const result = options && options.opaqueMask
      ? await sharp(rgb, {
        raw: { width: input.info.width, height: input.info.height, channels: 3 }
      }).png().toBuffer()
      : await sharp(rgb, {
        raw: { width: input.info.width, height: input.info.height, channels: 3 }
      }).joinChannel(alpha, {
        raw: { width: input.info.width, height: input.info.height, channels: 1 }
      }).png().toBuffer();
    return new Response(result, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(result.length) }
    });
  };
  return { processor: createRemoveBackgroundProcessor(cloudinary, fetchImage), state };
}

async function main() {
  const root = path.join(__dirname, '..');
  const registry = fs.readFileSync(path.join(root, 'public', 'tools.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public', 'remove-background.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public', 'remove-background.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  assert.equal((registry.match(/id: 'remove-background'/g) || []).length, 1);
  assert.match(registry, /name: 'Remove Background'[\s\S]*?route: '\/tools\/remove-background'/);
  assert.match(page, /data-current-tool="remove-background"/);
  assert.match(page, /src="\/remove-background\.js"/);
  assert.match(page, /data-mode="automatic"/);
  assert.match(page, /data-mode="manual"/);
  assert.match(page, /data-brush-mode="keep"/);
  assert.match(page, /data-brush-mode="remove"/);
  assert.match(page, /data-action="undo"/);
  assert.match(page, /data-action="reset"/);
  assert.match(page, /Cloudinary, an external service/);
  assert.match(server, /app\.get\('\/tools\/remove-background'/);
  assert.match(server, /app\.post\('\/api\/tools\/remove-background\/preview'/);
  assert.match(server, /app\.post\('\/api\/tools\/remove-background'/);
  assert.match(script, /destination-out/);
  assert.match(script, /source-in/);
  assert.match(script, /pointerdown/);
  assert.match(script, /toBlob/);

  const fixtures = await createFixtures();
  const supported = [
    ['photo.JPEG', fixtures.jpeg, 'jpeg'],
    ['photo.png', fixtures.png, 'png'],
    ['photo.webp', fixtures.webp, 'webp'],
    ['photo.GIF', fixtures.gif, 'gif'],
    ['photo.tif', fixtures.tiff, 'tiff'],
    ['photo.avif', fixtures.avif, 'avif']
  ];
  for (const [name, buffer, format] of supported) {
    const result = await inspectImage(imageFile(name, buffer));
    assert.equal(result.format, format);
    assert.equal(result.width, fixtures.width);
    assert.equal(result.height, fixtures.height);
  }

  const { processor, state } = createProcessor();
  const preview = await processor.createRasterPreview(imageFile('photo.tiff', fixtures.tiff));
  const previewMetadata = await sharp(preview.bytes).metadata();
  assert.equal(previewMetadata.format, 'png');
  assert.equal(preview.width, fixtures.width);
  assert.equal(preview.height, fixtures.height);

  const result = await processor.removeBackground(imageFile('Product Image.PNG', fixtures.png));
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(result.filename, 'Product-Image-no-background.png');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.width, fixtures.width);
  assert.equal(result.height, fixtures.height);
  assert.equal(result.hasAlpha, true);
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, fixtures.width);
  assert.equal(metadata.height, fixtures.height);
  assert.equal(metadata.hasAlpha, true);
  const pixels = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  const alphaAt = (x, y) => pixels[(y * fixtures.width + x) * 4 + 3];
  assert.equal(alphaAt(0, 0), 0, 'background pixels should be transparent');
  assert.equal(alphaAt(15, 10), 255, 'subject pixels should remain opaque');
  assert.equal(alphaAt(10, 10), 128, 'input transparency should be retained within the subject');
  assert.deepEqual(Array.from(pixels.subarray((10 * fixtures.width + 15) * 4, (10 * fixtures.width + 15) * 4 + 3)),
    [210, 70, 35], 'the original subject colors should be preserved');
  assert.deepEqual(state.transformations, ['e_background_removal/f_png']);
  assert.equal(state.uploads[0].type, 'authenticated');
  assert.equal(state.deletions.length, 1);
  assert.equal(state.deletions[0].settings.invalidate, true);

  const { processor: opaqueProcessor, state: opaqueState } = createProcessor({ opaqueMask: true });
  await assert.rejects(
    opaqueProcessor.removeBackground(imageFile('photo.png', fixtures.png)),
    /did not return a transparent image/
  );
  assert.equal(opaqueState.deletions.length, 1, 'temporary images should be deleted on invalid AI output');

  const { processor: failedProcessor, state: failedState } = createProcessor({ failFetch: true });
  await assert.rejects(failedProcessor.removeBackground(imageFile('photo.png', fixtures.png)), /could not be retrieved/);
  assert.equal(failedState.deletions.length, 1);

  const { processor: cleanupProcessor } = createProcessor({ failCleanup: true });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      cleanupProcessor.removeBackground(imageFile('photo.png', fixtures.png)),
      /cleanup could not be confirmed/
    );
  } finally {
    console.error = originalConsoleError;
  }

  await assert.rejects(inspectImage(imageFile('renamed.png', fixtures.jpeg)), /contents do not match/);
  await assert.rejects(inspectImage(imageFile('broken.png', Buffer.from('not an image'))), /damaged or is not a supported/);
  await assert.rejects(inspectImage(imageFile('animated.GIF', animatedGif)), /Animated GIFs cannot be processed/);
  await assert.rejects(inspectImage(imageFile('vector.svg', Buffer.from('<svg/>'))), /SVG is a vector format/);
  await assert.rejects(inspectImage(imageFile('legacy.bmp', fixtures.png)), /BMP and ICO are not supported/);

  console.log('Remove Background verified for raster-format validation, transparent foreground masks, source-alpha preservation, output checks, and temporary cleanup.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
