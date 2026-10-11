const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { createUpscaleImageProcessor, inspectImage } = require('../upscale-image.cjs');

const animatedGif = Buffer.from(
  '47494638396101000100800000000000ffffff21f904010a0000002c000000000100010000020244010021f904010a0000002c00000000010001000002024c01003b',
  'hex'
);

function imageFile(name, buffer) {
  return { originalname: name, buffer };
}

async function createFixture() {
  const width = 24;
  const height = 16;
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = (index * 7) % 256;
    rgba[index * 4 + 1] = (index * 13) % 256;
    rgba[index * 4 + 2] = (index * 19) % 256;
    rgba[index * 4 + 3] = index % width < width / 2 ? 0 : 255;
  }
  const raw = { raw: { width, height, channels: 4 } };
  return {
    width,
    height,
    png: await sharp(rgba, raw).png().toBuffer(),
    jpeg: await sharp(rgba, raw).flatten({ background: '#ffffff' }).jpeg().toBuffer(),
    webp: await sharp(rgba, raw).webp().toBuffer(),
    tiff: await sharp(rgba, raw).tiff().toBuffer(),
    avif: await sharp(rgba, raw).avif({ effort: 0 }).toBuffer()
  };
}

function createProcessor(options) {
  const state = { uploads: [], deletions: [], eager: null };
  const cloudinary = {
    config() {
      return { cloud_name: 'test', api_key: 'test', api_secret: 'test' };
    },
    uploader: {
      upload_stream(settings, callback) {
        state.uploads.push(settings);
        state.eager = settings.eager[0];
        return {
          end() {
            callback(null, {
              eager: [{ secure_url: 'https://processor.example/result.png' }]
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
  const fetchImage = async () => {
    if (options && options.failFetch) throw new Error('mock fetch failure');
    const dimensions = state.eager.match(/c_scale,w_(\d+),h_(\d+)/);
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    const output = await sharp({
      create: {
        width: options && options.wrongDimensions ? width / 2 : width,
        height,
        channels: 4,
        background: '#5794c8'
      }
    }).png().toBuffer();
    return new Response(output, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(output.length) }
    });
  };
  return { processor: createUpscaleImageProcessor(cloudinary, fetchImage), state };
}

async function main() {
  const root = path.join(__dirname, '..');
  const registry = fs.readFileSync(path.join(root, 'public', 'tools.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public', 'upscale-image.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'public', 'upscale-image.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8');
  assert.equal((registry.match(/id: 'upscale-image'/g) || []).length, 1);
  assert.match(registry, /name: 'Upscale Image'[\s\S]*?route: '\/tools\/upscale-image'/);
  assert.match(page, /data-current-tool="upscale-image"/);
  assert.match(page, /src="\/upscale-image\.js"/);
  assert.match(page, /data-action="upscale"/);
  assert.match(page, /data-action="download"/);
  assert.match(page, /Cloudinary, an external service/);
  assert.match(server, /app\.get\('\/tools\/upscale-image'/);
  assert.match(server, /app\.post\('\/api\/tools\/upscale-image\/preview'/);
  assert.match(server, /app\.post\('\/api\/tools\/upscale-image'/);
  assert.match(script, /createImageBitmap/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /responseFilename/);
  assert.match(script, /downloadButton\.download = outputFilename/);

  const fixture = await createFixture();
  const supported = [
    ['photo.JPEG', fixture.jpeg, 'jpeg'],
    ['picture.png', fixture.png, 'png'],
    ['picture.webp', fixture.webp, 'webp'],
    ['picture.tif', fixture.tiff, 'tiff'],
    ['picture.avif', fixture.avif, 'avif']
  ];
  for (const [name, bytes, expectedFormat] of supported) {
    const inspected = await inspectImage(imageFile(name, bytes));
    assert.equal(inspected.format, expectedFormat, name);
    assert.equal(inspected.width, fixture.width);
    assert.equal(inspected.height, fixture.height);
  }

  const { processor, state } = createProcessor();
  const rasterPreview = await processor.createRasterPreview(imageFile('picture.tif', fixture.tiff));
  const rasterPreviewMetadata = await sharp(rasterPreview.bytes).metadata();
  assert.equal(rasterPreviewMetadata.format, 'png');
  assert.equal(rasterPreview.width, fixture.width);
  assert.equal(rasterPreview.height, fixture.height);
  assert.equal(rasterPreviewMetadata.width, fixture.width);
  assert.equal(rasterPreviewMetadata.height, fixture.height);

  const result = await processor.upscaleImage(imageFile('My photo.PNG', fixture.png));
  assert.equal(result.filename, 'My-photo-upscaled.png');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.width, fixture.width * 2);
  assert.equal(result.height, fixture.height * 2);
  assert.equal(result.originalWidth, fixture.width);
  assert.equal(result.originalHeight, fixture.height);
  assert.equal(result.hasAlpha, true);
  assert.equal((await sharp(result.bytes).metadata()).format, 'png');
  assert.equal((await sharp(result.bytes).metadata()).width, fixture.width * 2);
  assert.equal((await sharp(result.bytes).metadata()).height, fixture.height * 2);
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
  const alphaValues = await sharp(result.bytes).extractChannel(3).raw().toBuffer();
  assert.ok(alphaValues.some((value) => value === 0), 'transparent areas should be restored');
  assert.ok(alphaValues.some((value) => value === 255), 'opaque areas should be retained');
  assert.match(state.eager, /e_upscale/);
  assert.match(state.eager, /e_auto_enhance/);
  assert.match(state.eager, /w_48,h_32/);
  assert.equal(state.uploads[0].type, 'authenticated');
  assert.equal(state.deletions.length, 1, 'temporary Cloudinary images should be deleted');
  assert.equal(state.deletions[0].settings.invalidate, true);

  const opaque = await processor.upscaleImage(imageFile('photo.jpg', fixture.jpeg));
  assert.equal(opaque.width, fixture.width * 2);
  assert.equal(opaque.height, fixture.height * 2);
  assert.equal(opaque.hasAlpha, false);

  const { processor: brokenProcessor, state: brokenState } = createProcessor({ wrongDimensions: true });
  await assert.rejects(
    brokenProcessor.upscaleImage(imageFile('photo.png', fixture.png)),
    /valid 2× PNG/
  );
  assert.equal(brokenState.deletions.length, 1, 'temporary images should be deleted on invalid AI output');

  const { processor: fetchFailureProcessor, state: fetchFailureState } = createProcessor({ failFetch: true });
  await assert.rejects(fetchFailureProcessor.upscaleImage(imageFile('photo.jpg', fixture.jpeg)), /could not be retrieved/);
  assert.equal(fetchFailureState.deletions.length, 1, 'temporary images should be deleted when retrieval fails');

  const { processor: cleanupFailureProcessor } = createProcessor({ failCleanup: true });
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      cleanupFailureProcessor.upscaleImage(imageFile('photo.jpg', fixture.jpeg)),
      /cleanup could not be confirmed/
    );
  } finally {
    console.error = originalConsoleError;
  }

  await assert.rejects(inspectImage(imageFile('renamed.png', fixture.jpeg)), /contents do not match/);
  await assert.rejects(inspectImage(imageFile('corrupt.png', Buffer.from('not an image'))), /damaged or is not a supported/);
  await assert.rejects(inspectImage(imageFile('moving.GIF', animatedGif)), /Animated GIFs cannot be upscaled/);
  await assert.rejects(inspectImage(imageFile('vector.svg', Buffer.from('<svg/>'))), /SVG is a vector format/);
  await assert.rejects(inspectImage(imageFile('old.bmp', fixture.png)), /BMP and ICO cannot be validated/);

  console.log('Upscale Image verified for supported raster formats, exact 2× PNG output, alpha restoration, temporary cleanup, and invalid/animated input handling.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
