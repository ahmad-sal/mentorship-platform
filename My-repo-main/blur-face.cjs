'use strict';

const path = require('path');
const bmp = require('bmp-js');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 10 * 1000 * 1000;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_BLUR_AREAS = 100;
const IMAGE_FORMATS = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.gif': 'gif',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.avif': 'avif',
  '.svg': 'svg',
  '.bmp': 'bmp'
};

async function inspectImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw createError(400, 'Choose a non-empty image file.');
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw createError(413, 'Images must be 20 MB or smaller.');
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const expectedFormat = IMAGE_FORMATS[extension];
  if (!expectedFormat) {
    throw createError(400, 'Unsupported image format. Choose PNG, JPG/JPEG, WebP, still GIF/TIFF, AVIF, SVG, or BMP.');
  }

  if (expectedFormat === 'bmp') {
    return inspectBmp(file.buffer);
  }
  if (expectedFormat === 'svg') validateStaticSvg(file.buffer);

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
      animated: true,
      sequentialRead: true
    }).metadata();
  } catch (error) {
    throw createError(400, 'This file is corrupted or is not a supported image.');
  }
  const actualFormat = expectedFormat === 'avif' && metadata.format === 'heif' &&
    metadata.compression === 'av1' ? 'avif' : metadata.format;
  if (actualFormat !== expectedFormat) {
    throw createError(400, 'The image contents do not match the selected file format.');
  }
  if ((metadata.pages || 1) > 1) {
    throw createError(400, expectedFormat === 'gif'
      ? 'Animated GIFs are not supported because the face detector cannot preserve every frame. Choose a still image.'
      : 'Multi-page images are not supported because the face detector cannot preserve every page. Choose a single-page image.');
  }

  function validateStaticSvg(buffer) {
    const source = buffer.toString('utf8');
    if (!/<svg(?:\s|>)/i.test(source) ||
        /<\s*script\b|<\s*foreignObject\b|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i.test(source)) {
      throw createError(400, 'SVG files must be static images without scripts, event handlers, or external references.');
    }
  }

  let bytes;
  try {
    bytes = await sharp(file.buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
      sequentialRead: true
    }).rotate().png().toBuffer();
  } catch (error) {
    throw createError(400, 'This image could not be safely prepared for face detection.');
  }
  const normalized = await inspectPng(bytes);
  return {
    format: expectedFormat,
    width: normalized.width,
    height: normalized.height,
    hasAlpha: normalized.hasAlpha,
    bytes
  };
}

function inspectBmp(buffer) {
  if (buffer.length < 2 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
    throw createError(400, 'The image contents do not match the BMP file extension.');
  }
  let decoded;
  try {
    decoded = bmp.decode(buffer);
  } catch (error) {
    throw createError(400, 'This BMP image is corrupted or uses an unsupported encoding.');
  }
  if (!Number.isInteger(decoded.width) || !Number.isInteger(decoded.height) ||
      decoded.width < 1 || decoded.height < 1 ||
      decoded.width * decoded.height > MAX_IMAGE_PIXELS ||
      !decoded.data || decoded.data.length !== decoded.width * decoded.height * 4) {
    throw createError(413, 'This BMP image exceeds the 10-megapixel processing limit or is invalid.');
  }

  const rgba = Buffer.allocUnsafe(decoded.data.length);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = decoded.data[index + 3];
    rgba[index + 1] = decoded.data[index + 2];
    rgba[index + 2] = decoded.data[index + 1];
    rgba[index + 3] = decoded.data[index];
  }
  return sharp(rgba, {
    raw: { width: decoded.width, height: decoded.height, channels: 4 },
    limitInputPixels: MAX_IMAGE_PIXELS
  }).png().toBuffer().then(async (bytes) => {
    const metadata = await inspectPng(bytes);
    return {
      format: 'bmp',
      width: metadata.width,
      height: metadata.height,
      hasAlpha: metadata.hasAlpha,
      bytes
    };
  });
}

async function inspectPng(bytes) {
  let metadata;
  try {
    metadata = await sharp(bytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error'
    }).metadata();
  } catch (error) {
    throw createError(400, 'The image could not be safely prepared as a PNG.');
  }
  if (metadata.format !== 'png' || !Number.isInteger(metadata.width) ||
      !Number.isInteger(metadata.height) || metadata.width < 1 || metadata.height < 1 ||
      metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw createError(413, 'This image exceeds the 10-megapixel processing limit.');
  }
  if (!bytes.length || bytes.length > MAX_OUTPUT_BYTES) {
    throw createError(413, 'The prepared image exceeds the 100 MB output limit.');
  }
  return metadata;
}

async function blurImage(file, regions, originalName) {
  const input = await inspectImage(file);
  const normalizedRegions = validateRegions(regions);
  const result = await renderBlurred(input.bytes, input.width, input.height, normalizedRegions);
  const outputMetadata = await inspectPng(result);
  return {
    bytes: result,
    filename: safeOutputName(originalName || file.originalname),
    mime: 'image/png',
    width: outputMetadata.width,
    height: outputMetadata.height,
    hasAlpha: Boolean(outputMetadata.hasAlpha)
  };
}

async function renderBlurred(bytes, width, height, regions) {
  if (!regions.length) {
    throw createError(400, 'No blur areas were selected. Wait for face detection or add a manual blur area.');
  }

  let original;
  try {
    original = await sharp(bytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error'
    }).ensureAlpha().raw().toBuffer();
  } catch (error) {
    throw createError(422, 'The selected image could not be decoded for blur processing.');
  }
  const pixelCount = width * height;
  if (original.length !== pixelCount * 4) {
    throw createError(422, 'The prepared image dimensions are invalid.');
  }

  const radii = regions.map((region) => {
    const regionWidth = region.width * width;
    const regionHeight = region.height * height;
    return Math.max(8, Math.min(40, Math.min(regionWidth, regionHeight) * 0.32));
  });
  const blurred = await sharp(original, {
    raw: { width, height, channels: 4 },
    limitInputPixels: MAX_IMAGE_PIXELS
  }).blur(Math.max(...radii)).raw().toBuffer();

  const mask = new Uint8Array(pixelCount);
  regions.forEach((region) => {
    const centerX = region.x * width;
    const centerY = region.y * height;
    const radiusX = Math.max(1, region.width * width / 2);
    const radiusY = Math.max(1, region.height * height / 2);
    const left = Math.max(0, Math.floor(centerX - radiusX));
    const right = Math.min(width - 1, Math.ceil(centerX + radiusX));
    const top = Math.max(0, Math.floor(centerY - radiusY));
    const bottom = Math.min(height - 1, Math.ceil(centerY + radiusY));
    for (let y = top; y <= bottom; y += 1) {
      const dy = (y + 0.5 - centerY) / radiusY;
      for (let x = left; x <= right; x += 1) {
        const dx = (x + 0.5 - centerX) / radiusX;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= 1) continue;
        const edge = Math.max(0, Math.min(1, (1 - distance) / 0.13));
        const feather = edge * edge * (3 - 2 * edge);
        const offset = y * width + x;
        mask[offset] = Math.max(mask[offset], Math.round(feather * 255));
      }
    }
  });

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const blend = mask[pixel] / 255;
    if (!blend) continue;
    const offset = pixel * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      original[offset + channel] = Math.round(
        original[offset + channel] * (1 - blend) + blurred[offset + channel] * blend
      );
    }
  }

  let output;
  try {
    output = await sharp(original, {
      raw: { width, height, channels: 4 },
      limitInputPixels: MAX_IMAGE_PIXELS
    }).png().toBuffer();
  } catch (error) {
    throw createError(422, 'The blurred image could not be encoded.');
  }
  if (output.length > MAX_OUTPUT_BYTES) {
    throw createError(413, 'The blurred image exceeds the 100 MB output limit.');
  }
  return output;
}

function validateRegions(regions) {
  if (!Array.isArray(regions) || regions.length > MAX_BLUR_AREAS) {
    throw createError(400, 'The selected blur areas are invalid.');
  }
  return regions.map((region) => {
    if (!region || !['x', 'y', 'width', 'height'].every((key) =>
      Number.isFinite(region[key]))) {
      throw createError(400, 'The selected blur areas are invalid.');
    }
    const { x, y, width, height } = region;
    if (x < 0 || y < 0 || x > 1 || y > 1 || width <= 0 || height <= 0 ||
        width > 1 || height > 1 || x - width / 2 < 0 || y - height / 2 < 0 ||
        x + width / 2 > 1 || y + height / 2 > 1) {
      throw createError(400, 'A blur area extends outside the image boundaries.');
    }
    return { x, y, width, height };
  });
}

function safeOutputName(inputName) {
  let base = path.basename(String(inputName || 'image'), path.extname(String(inputName || '')));
  base = base.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (base || 'image') + '-blurred.png';
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  MAX_BLUR_AREAS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  blurImage,
  inspectImage,
  renderBlurred,
  validateRegions
};
