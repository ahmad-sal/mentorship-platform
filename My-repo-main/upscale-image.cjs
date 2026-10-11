'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_PIXELS = 10 * 1000 * 1000;
const MAX_AI_UPSCALE_PIXELS = 2048 * 2048 - 1;
const MAX_AI_UPSCALE_SIDE = 2048;
const MAX_OUTPUT_PIXELS = 40 * 1000 * 1000;
const MAX_OUTPUT_SIDE = 8192;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_PROCESSING_MS = 120000;
const MAX_RESULT_FETCH_RETRIES = 8;
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

function createUpscaleImageProcessor(cloudinary, fetchImage) {
  if (!cloudinary || !cloudinary.uploader) {
    throw new Error('Cloudinary is required for image upscaling.');
  }

  return { upscaleImage, createRasterPreview, inspectImage };

  async function upscaleImage(file) {
    const input = await inspectImage(file);
    const targetWidth = input.width * 2;
    const targetHeight = input.height * 2;
    if (targetWidth > MAX_OUTPUT_SIDE || targetHeight > MAX_OUTPUT_SIDE ||
        targetWidth * targetHeight > MAX_OUTPUT_PIXELS) {
      throw createError(413, 'This image is too large to safely upscale to 2×. Choose a smaller image.');
    }
    if (input.width > MAX_AI_UPSCALE_SIDE || input.height > MAX_AI_UPSCALE_SIDE ||
        input.width * input.height > MAX_AI_UPSCALE_PIXELS) {
      throw createError(
        413,
        'Cloudinary AI upscaling supports images smaller than 4.2 megapixels and no larger than 2048 pixels on either side. Choose a smaller image.'
      );
    }

    if (!isConfigured(cloudinary)) {
      throw createError(503, 'AI image upscaling is temporarily unavailable. Try again later.');
    }

    const publicId = 'upscale-tool-temporary/' + randomUUID();
    let operationError = null;
    let result = null;
    let uploadAttempted = false;
    try {
      const eagerTransformation = [
        'a_auto_right',
        'e_auto_enhance',
        'e_upscale',
        'c_scale,w_' + targetWidth + ',h_' + targetHeight,
        'e_sharpen:80',
        'f_png'
      ].join('/');
      uploadAttempted = true;
      const uploaded = await uploadToCloudinary(
        cloudinary,
        file.buffer,
        publicId,
        eagerTransformation
      );
      const eager = uploaded && Array.isArray(uploaded.eager) && uploaded.eager[0];
      if (!eager || eager.error || !eager.secure_url) {
        throw createError(422, 'The AI image processor could not enhance this image. Try a supported still image.');
      }

      const fetcher = fetchImage || globalThis.fetch;
      if (typeof fetcher !== 'function') {
        throw createError(503, 'The AI image processor is unavailable in this server environment.');
      }
      let deliveryUrl;
      try {
        deliveryUrl = new URL(eager.secure_url);
      } catch (error) {
        throw createError(502, 'The AI image processor returned an invalid result URL.');
      }
      if (deliveryUrl.protocol !== 'https:' ||
          !/(^|\.)res\.cloudinary\.com$/i.test(deliveryUrl.hostname)) {
        throw createError(502, 'The AI image processor returned an invalid result URL.');
      }
      let outputBytes = await retrieveEnhancedImage(deliveryUrl.toString(), fetcher);

      let outputMetadata;
      try {
        outputMetadata = await sharp(outputBytes, { limitInputPixels: MAX_OUTPUT_PIXELS }).metadata();
      } catch (error) {
        throw createError(422, 'The AI processor did not return a valid image.');
      }
      if (outputMetadata.format !== 'png' ||
          outputMetadata.width !== targetWidth ||
          outputMetadata.height !== targetHeight ||
          (outputMetadata.pages || 1) !== 1) {
        throw createError(422, 'The AI processor did not return a valid 2× PNG image.');
      }

      if (input.hasAlpha) {
        outputBytes = await restoreTransparency(file.buffer, outputBytes, targetWidth, targetHeight);
        outputMetadata = await sharp(outputBytes, { limitInputPixels: MAX_OUTPUT_PIXELS }).metadata();
        if (outputMetadata.format !== 'png' || !outputMetadata.hasAlpha ||
            outputMetadata.width !== targetWidth || outputMetadata.height !== targetHeight) {
          throw createError(422, 'The AI processor could not preserve this image’s transparency.');
        }
      } else if (outputMetadata.hasAlpha) {
        outputBytes = await sharp(outputBytes, { limitInputPixels: MAX_OUTPUT_PIXELS })
          .removeAlpha()
          .png()
          .toBuffer();
        outputMetadata = await sharp(outputBytes, { limitInputPixels: MAX_OUTPUT_PIXELS }).metadata();
      }

      const outputName = safeOutputName(file.originalname);
      result = {
        bytes: outputBytes,
        filename: outputName,
        mime: 'image/png',
        width: targetWidth,
        height: targetHeight,
        originalWidth: input.width,
        originalHeight: input.height,
        originalFormat: input.format,
        hasAlpha: Boolean(outputMetadata.hasAlpha)
      };
    } catch (error) {
      operationError = Number.isInteger(error && error.statusCode)
        ? error
        : createError(422, 'The image could not be enhanced. Try another supported image.');
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
          console.error('Temporary AI image cleanup failed.', {
            code: error && (error.http_code || error.code) || 'CLEANUP_FAILED'
          });
          if (!operationError) {
            operationError = createError(
              502,
              'The image was processed, but temporary cleanup could not be confirmed. No download was prepared; please try again later.'
            );
          }
        }
      }
    }

    if (operationError) throw operationError;
    return result;
  }

  async function createRasterPreview(file) {
    const input = await inspectImage(file);
    let bytes;
    try {
      bytes = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
        .rotate()
        .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (error) {
      throw createError(422, 'This image cannot be previewed by the current image processor.');
    }
    const previewMetadata = await sharp(bytes).metadata();
    return {
      bytes,
      width: input.width,
      height: input.height,
      previewWidth: previewMetadata.width,
      previewHeight: previewMetadata.height
    };
  }
}

async function retrieveEnhancedImage(url, fetcher) {
  const signal = AbortSignal.timeout(MAX_PROCESSING_MS);
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RESULT_FETCH_RETRIES; attempt += 1) {
    let response;
    try {
      response = await fetcher(url, { signal });
    } catch (error) {
      if (signal.aborted || error && error.name === 'TimeoutError') {
        throw createError(504, 'AI image enhancement took too long while retrieving the result. Retry the enhancement.');
      }
      lastError = createError(502, 'The enhanced image could not be retrieved from Cloudinary.');
      if (attempt === MAX_RESULT_FETCH_RETRIES) break;
      await waitForRetry(attempt, null, signal);
      continue;
    }

    if (!response.ok) {
      const status = response.status;
      if (!isRetryableDeliveryStatus(status)) {
        const error = createError(502, 'Cloudinary returned HTTP ' + status + ' while retrieving the enhanced image.', 'DELIVERY_HTTP_' + status);
        error.providerStatus = status;
        throw error;
      }
      await cancelResponseBody(response);
      lastError = createError(
        status === 423 ? 504 : 502,
        status === 423
          ? 'Cloudinary is still generating the enhanced image. Retry the enhancement in a moment.'
          : 'Cloudinary temporarily could not deliver the enhanced image (HTTP ' + status + ').'
      );
      lastError.providerStatus = status;
      lastError.code = 'DELIVERY_HTTP_' + status;
      if (attempt === MAX_RESULT_FETCH_RETRIES) break;
      await waitForRetry(attempt, response.headers && response.headers.get('retry-after'), signal);
      continue;
    }

    const contentLength = Number(response.headers && response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_OUTPUT_BYTES) {
      await cancelResponseBody(response);
      throw createError(413, 'The enhanced image exceeds the 100 MB output limit.');
    }
    try {
      const bytes = await readResponseLimited(response, MAX_OUTPUT_BYTES);
      if (!bytes.length) throw createError(502, 'Cloudinary returned an empty enhanced image.');
      return bytes;
    } catch (error) {
      if (Number.isInteger(error && error.statusCode) && error.statusCode !== 502) throw error;
      lastError = error;
      if (attempt === MAX_RESULT_FETCH_RETRIES) break;
      await waitForRetry(attempt, null, signal);
    }
  }

  if (signal.aborted) {
    throw createError(504, 'AI image enhancement took too long while retrieving the result. Retry the enhancement.');
  }
  throw lastError || createError(502, 'The enhanced image could not be retrieved from Cloudinary.');
}

function isRetryableDeliveryStatus(status) {
  return status === 408 || status === 423 || status === 425 || status === 429 ||
    status >= 500 && status <= 599;
}

async function waitForRetry(attempt, retryAfter, signal) {
  if (signal.aborted) {
    throw createError(504, 'AI image enhancement took too long while retrieving the result. Retry the enhancement.');
  }
  let delay = Math.min(5000, 250 * Math.pow(2, attempt));
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryDate = Date.parse(retryAfter);
    const requestedDelay = Number.isFinite(seconds)
      ? seconds * 1000
      : Number.isFinite(retryDate) ? retryDate - Date.now() : NaN;
    if (Number.isFinite(requestedDelay) && requestedDelay > 0) {
      delay = Math.min(5000, requestedDelay);
    }
  }
  await new Promise((resolve, reject) => {
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(createError(504, 'AI image enhancement took too long while retrieving the result. Retry the enhancement.'));
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function cancelResponseBody(response) {
  if (!response.body || typeof response.body.cancel !== 'function') return;
  try {
    await response.body.cancel();
  } catch (error) {
    console.warn('Cloudinary result response could not be cancelled before retrying.', {
      code: error && error.code || 'RESPONSE_CANCEL_FAILED'
    });
  }
}

async function readResponseLimited(response, maximumBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    let bytes;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw createError(502, 'The enhanced image response was interrupted.');
    }
    if (!bytes.length) throw createError(502, 'Cloudinary returned an empty enhanced image.');
    if (bytes.length > maximumBytes) throw createError(413, 'The enhanced image exceeds the 100 MB output limit.');
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
        throw createError(413, 'The enhanced image exceeds the 100 MB output limit.');
      }
      chunks.push(Buffer.from(item.value));
    }
  } catch (error) {
    if (Number.isInteger(error && error.statusCode)) throw error;
    throw createError(502, 'The enhanced image response was interrupted.');
  }
  if (!totalBytes) throw createError(502, 'Cloudinary returned an empty enhanced image.');
  return Buffer.concat(chunks, totalBytes);
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
    throw createError(400, 'SVG is a vector format and cannot be preserved by AI upscaling. Choose a raster image instead.');
  }
  if (extension === '.bmp' || extension === '.ico') {
    throw createError(400, 'BMP and ICO cannot be validated by the installed image engine. Choose PNG, JPEG, WebP, GIF, TIFF, or AVIF.');
  }
  const expectedFormat = INPUT_FORMATS[extension];
  if (!expectedFormat) {
    throw createError(400, 'Unsupported format. Choose PNG, JPG/JPEG, WebP, a single-frame GIF or TIFF, or AVIF.');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
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
    throw createError(400, 'Animated GIFs cannot be upscaled without losing animation. Choose a still image instead.');
  }
  if (expectedFormat === 'tiff' && pages > 1) {
    throw createError(400, 'Multi-page TIFF files cannot be upscaled without losing pages. Choose a single-page image instead.');
  }
  const orientation = metadata.orientation || 1;
  const swapsDimensions = orientation >= 5 && orientation <= 8;
  const width = swapsDimensions ? metadata.height : metadata.width;
  const height = swapsDimensions ? metadata.width : metadata.height;
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > MAX_INPUT_PIXELS) {
    throw createError(413, 'This image exceeds the 10-megapixel input limit.');
  }

  return {
    format: expectedFormat,
    width,
    height,
    hasAlpha: Boolean(metadata.hasAlpha),
    orientation
  };
}

async function restoreTransparency(source, upscaled, width, height) {
  try {
    const alpha = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .ensureAlpha()
      .extractChannel(3)
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    const rgb = await sharp(upscaled, { limitInputPixels: MAX_OUTPUT_PIXELS })
      .removeAlpha()
      .raw()
      .toBuffer();
    return await sharp(rgb, {
      raw: { width, height, channels: 3 },
      limitInputPixels: MAX_OUTPUT_PIXELS
    })
      .joinChannel(alpha, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  } catch (error) {
    throw createError(422, 'The AI processor could not preserve this image’s transparency.');
  }
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
        if (error) reject(createError(502, 'The AI image processor could not process this image. Please try again.'));
        else resolve(result);
      }).end(buffer);
    } catch (error) {
      reject(createError(502, 'The AI image processor could not process this image. Please try again.'));
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
  return (base || 'image') + '-upscaled.png';
}

function createError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_AI_UPSCALE_PIXELS,
  MAX_AI_UPSCALE_SIDE,
  MAX_INPUT_PIXELS,
  MAX_OUTPUT_PIXELS,
  MAX_OUTPUT_SIDE,
  createUpscaleImageProcessor,
  inspectImage
};
