'use strict';

const path = require('path');
const sharp = require('sharp');
const { XMLValidator } = require('fast-xml-parser');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40000000;
const MAX_IMAGE_SIDE = 8192;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const IMAGE_FORMATS = {
  '.jpg': { format: 'jpeg', label: 'JPEG', mime: 'image/jpeg' },
  '.jpeg': { format: 'jpeg', label: 'JPEG', mime: 'image/jpeg' },
  '.png': { format: 'png', label: 'PNG', mime: 'image/png' },
  '.webp': { format: 'webp', label: 'WebP', mime: 'image/webp' },
  '.gif': { format: 'gif', label: 'GIF', mime: 'image/gif' },
  '.svg': { format: 'svg', label: 'SVG', mime: 'image/svg+xml' },
  '.tif': { format: 'tiff', label: 'TIFF', mime: 'image/tiff' },
  '.tiff': { format: 'tiff', label: 'TIFF', mime: 'image/tiff' },
  '.avif': { format: 'heif', label: 'AVIF', mime: 'image/avif' }
};
const PRESETS = {
  extreme: { label: 'Extreme Compression', quality: 55, pngQuality: 65, pngCompression: 9, effort: 9 },
  recommended: { label: 'Recommended Compression', quality: 76, pngQuality: 82, pngCompression: 8, effort: 6 },
  less: { label: 'Less Compression', quality: 91, pngQuality: 100, pngCompression: 6, effort: 3 }
};
const SUPPORTED_FORMATS = 'JPEG, PNG, WebP, GIF, SVG, TIFF, and AVIF';

async function inspectImage(file) {
  const { buffer, format } = validateFile(file);
  if (format.format === 'svg') {
    const svg = validateSvg(buffer);
    const dimensions = getSvgDimensions(svg);
    validateDimensions(dimensions.width, dimensions.height, 1);
    return {
      format: 'svg',
      label: format.label,
      mime: format.mime,
      width: dimensions.width,
      height: dimensions.height,
      pages: 1,
      animated: false,
      previewSafe: true
    };
  }

  let metadata;
  try {
    metadata = await createSharp(buffer).metadata();
  } catch (error) {
    throw createError(400, 'This image is damaged or is not a supported ' + format.label + ' file.');
  }
  if (metadata.format !== format.format) {
    throw createError(400, 'The image contents do not match the selected ' + format.label + ' format.');
  }
  const width = metadata.width || 0;
  const pages = metadata.pages || 1;
  const height = pages > 1 && metadata.pageHeight ? metadata.pageHeight : metadata.height || 0;
  validateDimensions(width, height, pages);
  return {
    format: format.format,
    label: format.label,
    mime: format.mime,
    width,
    height,
    pages,
    animated: format.format === 'gif' && pages > 1,
    loop: metadata.loop,
    delay: metadata.delay,
    previewSafe: true
  };
}

function getSafeSvgPreview(file) {
  const { buffer, format } = validateFile(file);
  if (format.format !== 'svg') throw createError(400, 'A safe vector preview is only available for SVG images.');
  return Buffer.from(validateSvg(buffer), 'utf8');
}

async function compressImage(file, level) {
  const preset = PRESETS[level];
  if (!preset) throw createError(400, 'Choose a compression level to continue.');
  const { buffer, format, extension } = validateFile(file);
  const inspected = await inspectImage(file);
  let output;

  try {
    if (format.format === 'svg') {
      output = compressSvg(buffer, level);
    } else {
      let pipeline = createSharp(buffer).keepMetadata();
      switch (format.format) {
        case 'jpeg':
          pipeline = pipeline.jpeg({ quality: preset.quality, mozjpeg: true, progressive: true });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: preset.pngCompression,
            adaptiveFiltering: true,
            palette: level !== 'less',
            quality: preset.pngQuality
          });
          break;
        case 'webp':
          pipeline = pipeline.webp({ quality: preset.quality, effort: Math.round(preset.effort * 0.6) });
          break;
        case 'gif':
          pipeline = pipeline.gif({
            effort: preset.effort,
            dither: level === 'extreme' ? 0.7 : level === 'recommended' ? 0.4 : 0
          });
          break;
        case 'tiff':
          pipeline = pipeline.tiff({ compression: 'deflate', predictor: 'horizontal', effort: preset.effort });
          break;
        case 'heif':
          pipeline = pipeline.avif({ quality: preset.quality, effort: preset.effort });
          break;
        default:
          throw createError(400, 'This image format cannot be compressed by the available image processor.');
      }
      output = await pipeline.timeout({ seconds: 60 }).toBuffer();
    }
  } catch (error) {
    if (Number.isInteger(error.statusCode)) throw error;
    if (/timeout/i.test(String(error && error.message))) {
      throw createError(504, 'Image compression took too long. Try a smaller image.');
    }
    throw createError(422, 'The image could not be compressed while preserving its format. Try another supported image.');
  }

  if (!Buffer.isBuffer(output) || !output.length || output.length > MAX_OUTPUT_BYTES) {
    throw createError(422, 'The compressed image is empty or exceeds the output limit.');
  }

  if (format.format !== 'svg') {
    let outputMetadata;
    try {
      outputMetadata = await createSharp(output).metadata();
    } catch (error) {
      throw createError(422, 'The image processor did not produce a valid output image.');
    }
    const outputPages = outputMetadata.pages || 1;
    const outputHeight = outputPages > 1 && outputMetadata.pageHeight ?
      outputMetadata.pageHeight : outputMetadata.height;
    if (outputMetadata.format !== format.format ||
        outputMetadata.width !== inspected.width ||
        outputHeight !== inspected.height ||
        outputPages !== inspected.pages ||
        (inspected.animated && (outputMetadata.loop !== inspected.loop ||
          JSON.stringify(outputMetadata.delay) !== JSON.stringify(inspected.delay)))) {
      throw createError(422, 'The image processor could not preserve the original format, dimensions, or frames.');
    }
  } else {
    const outputSvg = validateSvg(output);
    const outputDimensions = getSvgDimensions(outputSvg);
    if (outputDimensions.width !== inspected.width || outputDimensions.height !== inspected.height) {
      throw createError(422, 'The image processor could not preserve the original SVG dimensions.');
    }
  }

  const baseName = path.basename(String(file.originalname), path.extname(String(file.originalname)))
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
  return {
    bytes: output,
    filename: baseName + extension,
    mime: format.mime,
    format: format.label,
    width: inspected.width,
    height: inspected.height,
    pages: inspected.pages,
    animated: inspected.animated
  };
}

function validateFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw createError(400, 'Choose a non-empty image to continue.');
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw createError(413, 'Images must be 20 MB or smaller.');
  }
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const format = IMAGE_FORMATS[extension];
  if (!format) {
    throw createError(400, 'Unsupported image format. This tool supports ' + SUPPORTED_FORMATS + '. BMP and ICO are not supported by the available image processor.');
  }
  return { buffer: file.buffer, extension, format };
}

function createSharp(buffer) {
  return sharp(buffer, {
    limitInputPixels: MAX_IMAGE_PIXELS,
    failOn: 'error',
    animated: true,
    sequentialRead: true
  });
}

function validateDimensions(width, height, pages) {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE ||
      width * height * pages > MAX_IMAGE_PIXELS) {
    throw createError(413, 'This image exceeds the 40-megapixel processing limit.');
  }
}

function validateSvg(buffer) {
  const svg = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(svg) ||
      /<\s*(?:script|foreignObject)\b/i.test(svg) ||
      /<\s*style(?:\s|>)/i.test(svg) ||
      /\son[a-z]+\s*=/i.test(svg) ||
      /\b(?:xlink:)?(?:href|src)\s*=\s*(['"])(?!#)/i.test(svg) ||
      /\bstyle\s*=\s*(['"])[^'"]*\\/i.test(svg) ||
      /url\(\s*(['"]?)(?!#)/i.test(svg) ||
      /@import\b/i.test(svg) ||
      /<\?xml-stylesheet\b/i.test(svg) ||
      !/^\s*(?:<\?xml\b[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(svg)) {
    throw createError(400, 'This SVG contains active content, embedded styles, or external references and cannot be safely processed.');
  }
  const validation = XMLValidator.validate(svg);
  if (validation !== true) throw createError(400, 'This SVG is damaged or is not valid XML.');
  return svg;
}

function getSvgDimensions(svg) {
  const openingTag = svg.match(/<svg\b[^>]*>/i);
  const attributes = openingTag ? openingTag[0] : '';
  const viewBox = attributes.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  const width = readSvgLength(attributes, 'width') || (viewBox ? Number(viewBox[1]) : 300);
  const height = readSvgLength(attributes, 'height') || (viewBox ? Number(viewBox[2]) : 150);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw createError(400, 'The SVG does not have usable dimensions.');
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

function readSvgLength(attributes, name) {
  const match = attributes.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(\\d+(?:\\.\\d+)?)(?:px)?\\1", 'i'));
  return match ? Number(match[2]) : 0;
}

function compressSvg(buffer, level) {
  let svg = validateSvg(buffer);
  const compactMarkup = level !== 'less';
  svg = svg.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map((part) => {
    if (part.startsWith('<![CDATA[')) return part;
    let markup = part.replace(/<!--[\s\S]*?-->/g, '');
    if (compactMarkup) markup = markup.replace(/>\s+</g, '><');
    return markup;
  }).join('');
  if (level === 'extreme') svg = svg.replace(/^\s*<\?xml\b[^?]*\?>\s*/i, '');
  return Buffer.from(svg.trim(), 'utf8');
}

function calculateResults(originalSize, compressedSize) {
  const original = Number(originalSize);
  const compressed = Number(compressedSize);
  if (!Number.isFinite(original) || original <= 0 ||
      !Number.isFinite(compressed) || compressed < 0) {
    throw createError(400, 'The original and compressed image sizes could not be measured.');
  }
  const savedBytes = original - compressed;
  return {
    originalSize: original,
    compressedSize: compressed,
    savedBytes,
    percentSaved: savedBytes / original * 100,
    hasSavings: savedBytes > 0,
    isLarger: savedBytes < 0
  };
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  MAX_IMAGE_BYTES,
  calculateResults,
  compressImage,
  getSafeSvgPreview,
  inspectImage
};
