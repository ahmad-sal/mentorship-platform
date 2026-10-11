'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 10 * 1000 * 1000;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_PROCESSING_MS = 120000;
const INPUT_FORMATS = {
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.png': 'png',
  '.webp': 'webp',
  '.gif': 'gif',
  '.tif': 'tiff',
  '.tiff': 'tiff',
  '.avif': 'avif'
};

function createRemoveBackgroundProcessor(cloudinary, fetchImage) {
  if (!cloudinary || !cloudinary.uploader) {
    throw new Error('Cloudinary is required for background removal.');
  }

  return { removeBackground, createRasterPreview, inspectImage };

  async function removeBackground(file) {
    const input = await inspectImage(file);
    if (!isConfigured(cloudinary)) {
      throw createError(503, 'AI background removal is temporarily unavailable. Try again later.');
    }

    const publicId = 'remove-background-temporary/' + randomUUID();
    let processingError = null;
    let result = null;
    let uploadAttempted = false;
    try {
      const eagerTransformation = 'e_background_removal/f_png';
      uploadAttempted = true;
      const uploaded = await uploadToCloudinary(
        cloudinary,
        input.normalizedBytes,
        publicId,
        eagerTransformation
      );
      const eager = uploaded && Array.isArray(uploaded.eager) && uploaded.eager[0];
      if (!eager || eager.error || !eager.secure_url) {
        throw createError(422, 'The AI processor could not remove this image’s background. Try another supported image.');
      }

      let transformedUrl;
      try {
        transformedUrl = new URL(eager.secure_url);
      } catch (error) {
        throw createError(502, 'The AI-processed image could not be retrieved.');
      }
      if (transformedUrl.protocol !== 'https:' ||
          !/(^|\.)res\.cloudinary\.com$/i.test(transformedUrl.hostname)) {
        throw createError(502, 'The AI-processed image could not be retrieved.');
      }

      const fetcher = fetchImage || globalThis.fetch;
      if (typeof fetcher !== 'function') {
        throw createError(503, 'The AI image processor is unavailable in this server environment.');
      }
      let response;
      try {
        response = await fetcher(transformedUrl.toString(), {
          signal: AbortSignal.timeout(MAX_PROCESSING_MS)
        });
      } catch (error) {
        throw createError(
          error && error.name === 'TimeoutError' ? 504 : 502,
          error && error.name === 'TimeoutError'
            ? 'AI background removal took too long. Try a smaller image.'
            : 'The AI-processed image could not be retrieved. Please try again.'
        );
      }
      if (!response.ok) {
        throw createError(502, 'The AI-processed image could not be retrieved. Please try again.');
      }
      const contentLength = Number(response.headers && response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > MAX_OUTPUT_BYTES) {
        throw createError(413, 'The processed image exceeds the 100 MB output limit.');
      }
      const transformedBytes = await readResponseLimited(response, MAX_OUTPUT_BYTES);

      let transformedMetadata;
      try {
        transformedMetadata = await sharp(transformedBytes, {
          limitInputPixels: MAX_IMAGE_PIXELS,
          failOn: 'error'
        }).metadata();
      } catch (error) {
        throw createError(422, 'The AI processor did not return a valid image.');
      }
      if (transformedMetadata.format !== 'png' ||
          transformedMetadata.width !== input.width ||
          transformedMetadata.height !== input.height ||
          (transformedMetadata.pages || 1) !== 1 ||
          !transformedMetadata.hasAlpha) {
        throw createError(422, 'The AI processor did not return a transparent image at the original dimensions.');
      }

      const baseAlpha = await sharp(transformedBytes, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        failOn: 'error'
      }).extractChannel(3).raw().toBuffer();
      const sourcePixels = await sharp(input.normalizedBytes, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        failOn: 'error'
      }).ensureAlpha().raw().toBuffer();
      for (let pixel = 0; pixel < baseAlpha.length; pixel += 1) {
        const sourceAlpha = sourcePixels[pixel * 4 + 3];
        sourcePixels[pixel * 4 + 3] = Math.round(baseAlpha[pixel] * sourceAlpha / 255);
      }

      const outputBytes = await sharp(sourcePixels, {
        raw: { width: input.width, height: input.height, channels: 4 },
        limitInputPixels: MAX_IMAGE_PIXELS
      }).png().toBuffer();
      if (!outputBytes.length || outputBytes.length > MAX_OUTPUT_BYTES) {
        throw createError(413, 'The transparent PNG exceeds the 100 MB output limit.');
      }
      const outputMetadata = await sharp(outputBytes, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        failOn: 'error'
      }).metadata();
      const outputAlphaStats = await sharp(outputBytes, {
        limitInputPixels: MAX_IMAGE_PIXELS,
        failOn: 'error'
      }).extractChannel(3).stats();
      if (outputMetadata.format !== 'png' || !outputMetadata.hasAlpha ||
          outputMetadata.width !== input.width || outputMetadata.height !== input.height ||
          outputAlphaStats.min === 255 || outputAlphaStats.max === 0) {
        throw createError(422, 'A valid transparent image could not be created.');
      }

      result = {
        bytes: outputBytes,
        filename: safeOutputName(file.originalname),
        mime: 'image/png',
        width: input.width,
        height: input.height,
        originalWidth: input.width,
        originalHeight: input.height,
        format: input.format,
        hasAlpha: true
      };
    } catch (error) {
      processingError = Number.isInteger(error && error.statusCode)
        ? error
        : createError(422, 'The image background could not be removed. Try another supported image.');
    } finally {
      if (uploadAttempted) {
        try {
          const destroyed = await cloudinary.uploader.destroy(publicId, {
            resource_type: 'image',
            type: 'authenticated',
            invalidate: true
          });
          if (!destroyed || !['ok', 'not found'].includes(String(destroyed.result || '').toLowerCase())) {
            throw new Error('Cloudinary did not confirm deletion.');
          }
        } catch (error) {
          console.error('Temporary background-removal image cleanup failed.', {
            code: error && (error.http_code || error.code) || 'CLEANUP_FAILED'
          });
          if (!processingError) {
            processingError = createError(
              502,
              'The image was processed, but temporary cleanup could not be confirmed. No download was prepared; please try again later.'
            );
          }
        }
      }
    }

    if (processingError) throw processingError;
    return result;
  }

  async function createRasterPreview(file) {
    const input = await inspectImage(file);
    return {
      bytes: input.normalizedBytes,
      width: input.width,
      height: input.height
    };
  }
}

async function inspectImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw createError(400, 'Choose a non-empty image file.');
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw createError(413, 'Images must be 20 MB or smaller.');
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (extension === '.svg') {
    throw createError(400, 'SVG is a vector format and cannot be sent safely to this AI image processor. Choose a raster image.');
  }
  if (extension === '.bmp' || extension === '.ico') {
    throw createError(400, 'BMP and ICO are not supported by the installed image engine. Choose PNG, JPEG, WebP, still GIF/TIFF, or AVIF.');
  }
  const expectedFormat = INPUT_FORMATS[extension];
  if (!expectedFormat) {
    throw createError(400, 'Unsupported format. Choose PNG, JPG/JPEG, WebP, a still GIF or TIFF, or AVIF.');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
      animated: true,
      sequentialRead: true
    }).metadata();
  } catch (error) {
    throw createError(400, 'This file is damaged or is not a supported image.');
  }
  const actualFormat = expectedFormat === 'avif' && metadata.format === 'heif' &&
    metadata.compression === 'av1' ? 'avif' : metadata.format;
  if (actualFormat !== expectedFormat) {
    throw createError(400, 'The image contents do not match the selected file format.');
  }
  const pages = metadata.pages || 1;
  if (expectedFormat === 'gif' && pages > 1) {
    throw createError(400, 'Animated GIFs cannot be processed without losing animation. Choose a still image.');
  }
  if (expectedFormat === 'tiff' && pages > 1) {
    throw createError(400, 'Multi-page TIFF files cannot be processed without losing pages. Choose a single-page image.');
  }
  if (pages > 1) {
    throw createError(400, 'Animated or multi-page images cannot be processed without losing frames. Choose a still image.');
  }

  let normalizedBytes;
  try {
    normalizedBytes = await sharp(file.buffer, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error',
      sequentialRead: true
    }).rotate().png().toBuffer();
  } catch (error) {
    throw createError(400, 'This image could not be safely prepared for background removal.');
  }
  if (normalizedBytes.length > MAX_OUTPUT_BYTES) {
    throw createError(413, 'This image is too large to safely prepare for background removal.');
  }
  let normalizedMetadata;
  try {
    normalizedMetadata = await sharp(normalizedBytes, {
      limitInputPixels: MAX_IMAGE_PIXELS,
      failOn: 'error'
    }).metadata();
  } catch (error) {
    throw createError(400, 'This image could not be safely prepared for background removal.');
  }
  const width = normalizedMetadata.width;
  const height = normalizedMetadata.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > MAX_IMAGE_PIXELS) {
    throw createError(413, 'This image exceeds the 10-megapixel processing limit.');
  }

  return {
    format: expectedFormat,
    width,
    height,
    hasAlpha: Boolean(normalizedMetadata.hasAlpha),
    normalizedBytes
  };
}

async function readResponseLimited(response, maximumBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw createError(502, 'The AI-processed image could not be read.');
    }
    if (!bytes.length || bytes.length > maximumBytes) {
      throw createError(413, 'The processed image is empty or exceeds the 100 MB output limit.');
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      totalBytes += item.value.length;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw createError(413, 'The processed image exceeds the 100 MB output limit.');
      }
      chunks.push(Buffer.from(item.value));
    }
  } catch (error) {
    if (Number.isInteger(error && error.statusCode)) throw error;
    throw createError(502, 'The AI-processed image could not be read.');
  }
  if (!totalBytes) throw createError(422, 'The AI processor returned an empty image.');
  return Buffer.concat(chunks, totalBytes);
}

function uploadToCloudinary(cloudinary, buffer, publicId, eagerTransformation) {
  return new Promise((resolve, reject) => {
    try {
      cloudinary.uploader.upload_stream({
        resource_type: 'image',
        type: 'authenticated',
        public_id: publicId,
        overwrite: false,
        eager: [eagerTransformation],
        eager_async: false,
        timeout: MAX_PROCESSING_MS
      }, (error, result) => {
        if (error) reject(createError(502, 'The AI background-removal service could not process this image.'));
        else resolve(result);
      }).end(buffer);
    } catch (error) {
      reject(createError(502, 'The AI background-removal service could not process this image.'));
    }
  });
}

function isConfigured(cloudinary) {
  const config = cloudinary.config();
  return Boolean(config && config.cloud_name && config.api_key && config.api_secret);
}

function safeOutputName(inputName) {
  let base = path.basename(String(inputName || 'image'), path.extname(String(inputName || '')));
  base = base.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return (base || 'image') + '-no-background.png';
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  MAX_OUTPUT_BYTES,
  createRemoveBackgroundProcessor,
  inspectImage
};
