'use strict';

const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const phoneNumbers = require('libphonenumber-js/max');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const cloudinary = require('./cloudinary.cjs');

const MAX_SHARE_BYTES = 20 * 1024 * 1024;
const MAX_SHARE_CONCURRENCY = 2;
const COUNTRY_CODES = phoneNumbers.getCountries();
const SHARE_TYPES = new Set(['pdf', 'image', 'audio']);

function normalizePhoneNumber(value, country) {
  const normalizedCountry = String(country || '').toUpperCase();
  if (!COUNTRY_CODES.includes(normalizedCountry)) {
    throw createError(400, 'Choose a valid country.');
  }
  const phoneNumber = phoneNumbers.parsePhoneNumberFromString(String(value || '').trim(), normalizedCountry);
  if (!phoneNumber || !phoneNumber.isValid()) {
    throw createError(400, 'Enter a valid phone number for the selected country.');
  }
  return phoneNumber.number;
}

function createShareUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SHARE_BYTES, files: 1, fields: 1, fieldNameSize: 32, fieldSize: 32 }
  }).single('file');
}

function hasMp3Frame(buffer) {
  let offset = 0;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') {
    if (buffer.length < 10 || buffer[3] > 4 || buffer[3] === 255 ||
        buffer.subarray(6, 10).some((byte) => byte & 0x80)) return false;
    const tagSize = (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
    offset = 10 + tagSize + (buffer[3] === 4 && (buffer[5] & 0x10) ? 10 : 0);
  }
  if (offset + 4 > buffer.length) return false;
  const header = buffer.readUInt32BE(offset);
  const version = (header >>> 19) & 3;
  const layer = (header >>> 17) & 3;
  const bitrateIndex = (header >>> 12) & 15;
  const sampleIndex = (header >>> 10) & 3;
  if ((header >>> 21) !== 0x7ff || version === 1 || layer === 0 ||
      bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return false;
  const versionOneBitrates = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
  };
  const lowerVersionBitrates = {
    1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
  };
  const baseSampleRates = [44100, 48000, 32000];
  const sampleRate = baseSampleRates[sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const bitrates = version === 3 ? versionOneBitrates[layer] : lowerVersionBitrates[layer];
  const bitrate = bitrates[bitrateIndex] * 1000;
  const padding = (header >>> 9) & 1;
  const frameLength = layer === 3
    ? Math.floor((12 * bitrate / sampleRate + padding) * 4)
    : Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate + padding);
  return frameLength >= 4 && offset + frameLength <= buffer.length;
}

function readMp4Boxes(buffer, start, end) {
  const boxes = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return null;
      const largeSize = buffer.readBigUInt64BE(offset + 8);
      if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      headerSize = 16;
      size = Number(largeSize);
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) return null;
    boxes.push({
      type,
      start: offset,
      dataStart: offset + headerSize,
      end: offset + size
    });
    offset += size;
  }
  return offset === end ? boxes : null;
}

function isPlayableM4a(buffer) {
  const topLevel = readMp4Boxes(buffer, 0, buffer.length);
  if (!topLevel) return false;
  const fileType = topLevel.find((box) => box.type === 'ftyp');
  const mediaData = topLevel.find((box) => box.type === 'mdat' && box.end > box.dataStart);
  if (!fileType || !mediaData || fileType.end - fileType.dataStart < 8) return false;
  const brands = buffer.toString('ascii', fileType.dataStart, fileType.end);
  if (!/(M4A |M4B |mp4a|isom|iso2|mp42)/.test(brands)) return false;
  for (const movie of topLevel.filter((box) => box.type === 'moov')) {
    const tracks = readMp4Boxes(buffer, movie.dataStart, movie.end);
    if (!tracks) continue;
    for (const track of tracks.filter((box) => box.type === 'trak')) {
      const trackBoxes = readMp4Boxes(buffer, track.dataStart, track.end);
      const media = trackBoxes && trackBoxes.find((box) => box.type === 'mdia');
      if (!media) continue;
      const mediaBoxes = readMp4Boxes(buffer, media.dataStart, media.end);
      if (!mediaBoxes) continue;
      const handler = mediaBoxes.find((box) => box.type === 'hdlr');
      const mediaInfo = mediaBoxes.find((box) => box.type === 'minf');
      if (!handler || handler.end - handler.dataStart < 12 ||
          buffer.toString('ascii', handler.dataStart + 8, handler.dataStart + 12) !== 'soun' ||
          !mediaInfo) continue;
      const infoBoxes = readMp4Boxes(buffer, mediaInfo.dataStart, mediaInfo.end);
      const sampleTable = infoBoxes && infoBoxes.find((box) => box.type === 'stbl');
      const tableBoxes = sampleTable && readMp4Boxes(buffer, sampleTable.dataStart, sampleTable.end);
      const sampleDescription = tableBoxes && tableBoxes.find((box) => box.type === 'stsd');
      if (!sampleDescription || sampleDescription.end - sampleDescription.dataStart < 8) continue;
      const entries = readMp4Boxes(buffer, sampleDescription.dataStart + 8, sampleDescription.end);
      if (entries && entries.some((entry) => ['mp4a', 'alac'].includes(entry.type))) return true;
    }
  }
  return false;
}

function isPcmWave(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
      buffer.toString('ascii', 8, 12) !== 'WAVE') return false;
  const riffEnd = buffer.readUInt32LE(4) + 8;
  if (riffEnd > buffer.length || riffEnd < 44) return false;
  let format = null;
  let hasAudio = false;
  let offset = 12;
  while (offset + 8 <= riffEnd) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > riffEnd) return false;
    if (type === 'fmt ') {
      if (size < 16) return false;
      format = {
        code: buffer.readUInt16LE(dataStart),
        channels: buffer.readUInt16LE(dataStart + 2),
        sampleRate: buffer.readUInt32LE(dataStart + 4),
        byteRate: buffer.readUInt32LE(dataStart + 8),
        blockAlign: buffer.readUInt16LE(dataStart + 12),
        bitsPerSample: buffer.readUInt16LE(dataStart + 14)
      };
    } else if (type === 'data' && size > 0) {
      hasAudio = true;
    }
    offset = dataEnd + (size % 2);
  }
  if (!format || !hasAudio || ![1, 3].includes(format.code) ||
      !format.channels || format.channels > 32 || !format.sampleRate ||
      (format.code === 1 && ![8, 16, 24, 32].includes(format.bitsPerSample)) ||
      (format.code === 3 && ![32, 64].includes(format.bitsPerSample))) return false;
  const expectedAlign = format.channels * format.bitsPerSample / 8;
  return format.blockAlign === expectedAlign &&
    format.byteRate === format.sampleRate * format.blockAlign;
}

async function inspectShareFile(file, category) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
    throw createError(400, 'Choose a non-empty file to continue.');
  }
  if (!SHARE_TYPES.has(category)) {
    throw createError(400, 'Choose a supported file QR category.');
  }
  if (file.buffer.length > MAX_SHARE_BYTES) {
    throw createError(413, 'Files must be 20 MB or smaller.');
  }

  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (category === 'pdf') {
    const ending = file.buffer.subarray(Math.max(0, file.buffer.length - 2048));
    if (extension !== '.pdf' || !file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')) ||
        !ending.includes(Buffer.from('%%EOF'))) {
      throw createError(400, 'Choose a valid PDF file whose content matches its .pdf extension.');
    }
    try {
      const document = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
      if (!document.getPageCount()) throw new Error('The PDF has no pages.');
    } catch (error) {
      throw createError(400, 'This PDF is corrupted, encrypted, or could not be decoded.');
    }
    return { resourceType: 'raw', format: 'pdf' };
  }
  if (category === 'image') {
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      throw createError(400, 'Images for QR links must be PNG, JPG/JPEG, or WebP.');
    }
    let metadata;
    try {
      metadata = await sharp(file.buffer, { limitInputPixels: 40000000, failOn: 'error' }).metadata();
    } catch (error) {
      throw createError(400, 'This image is corrupted or could not be decoded.');
    }
    const expected = extension === '.jpg' || extension === '.jpeg' ? 'jpeg' : extension.slice(1);
    if (metadata.format !== expected || !metadata.width || !metadata.height) {
      throw createError(400, 'The image contents do not match the selected file format.');
    }
    return { resourceType: 'image', format: expected };
  }

  const isMp3 = extension === '.mp3' && hasMp3Frame(file.buffer);
  const isWav = extension === '.wav' && isPcmWave(file.buffer);
  const isM4a = extension === '.m4a' && isPlayableM4a(file.buffer);
  if (!isMp3 && !isWav && !isM4a) {
    throw createError(400, 'Choose a valid MP3, WAV, or M4A audio file whose content matches its extension.');
  }
  return { resourceType: 'raw', format: extension.slice(1) };
}

function uploadShareFile(file, category, uploader) {
  const activeCloudinary = uploader || cloudinary;
  if (!activeCloudinary || !activeCloudinary.uploader ||
      typeof activeCloudinary.uploader.upload_stream !== 'function') {
    throw createError(503, 'Public file hosting is unavailable. Configure Cloudinary before creating file QR codes.');
  }
  const config = activeCloudinary.config();
  if (!config || !config.cloud_name || !config.api_key || !config.api_secret) {
    throw createError(503, 'Public file hosting is not configured. Configure the existing Cloudinary credentials before creating PDF, image, or audio QR codes.');
  }

  return inspectShareFile(file, category).then((inspection) => new Promise((resolve, reject) => {
    const publicId = 'qr-code-shares/' + category + '/' + randomUUID();
    try {
      activeCloudinary.uploader.upload_stream({
        resource_type: inspection.resourceType,
        type: 'upload',
        public_id: publicId,
        overwrite: false,
        unique_filename: false,
        use_filename: false,
        ...(inspection.resourceType === 'image' ? {} : { format: inspection.format }),
        timeout: 120000
      }, (error, result) => {
        if (error) {
          reject(createError(502, 'The file could not be published to Cloudinary. Check storage quota and upload permissions, then try again.'));
          return;
        }
        let publicUrl;
        try {
          publicUrl = new URL(result && result.secure_url);
        } catch (invalidUrl) {
          removeUnreachableShare({
            publicId: result && result.public_id || publicId,
            resourceType: inspection.resourceType
          }, activeCloudinary).then(() => {
            reject(createError(502, 'Cloudinary did not return an accessible HTTPS file URL.'));
          });
          return;
        }
        if (publicUrl.protocol !== 'https:' ||
            !/(^|\.)res\.cloudinary\.com$/i.test(publicUrl.hostname)) {
          removeUnreachableShare({
            publicId: result && result.public_id || publicId,
            resourceType: inspection.resourceType
          }, activeCloudinary).then(() => {
            reject(createError(502, 'Cloudinary did not return an accessible HTTPS file URL.'));
          });
          return;
        }
        resolve({
          url: publicUrl.toString(),
          format: inspection.format,
          resourceType: inspection.resourceType,
          publicId: result.public_id || publicId,
          bytes: file.buffer.length
        });
      }).end(file.buffer);
    } catch (error) {
      reject(createError(502, 'The file could not be published to Cloudinary. Check storage quota and upload permissions, then try again.'));
    }
  })).then(async (result) => {
    let response;
    try {
      response = await fetch(result.url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      await removeUnreachableShare(result, activeCloudinary);
      throw createError(502, 'The hosted file URL could not be verified as publicly accessible. The upload completed, but no QR code was created; check the Cloudinary delivery settings.');
    }
    if (!response.ok) {
      await removeUnreachableShare(result, activeCloudinary);
      throw createError(502, 'The hosted file URL returned HTTP ' + response.status + '. No QR code was created because the file is not publicly accessible.');
    }
    return result;
  });
}

async function removeUnreachableShare(result, activeCloudinary) {
  if (!result.publicId || !activeCloudinary.uploader ||
      typeof activeCloudinary.uploader.destroy !== 'function') return;
  try {
    const deletion = await activeCloudinary.uploader.destroy(result.publicId, {
      resource_type: result.resourceType,
      type: 'upload',
      invalidate: true
    });
    if (deletion && deletion.result !== 'ok' && deletion.result !== 'not found') {
      throw new Error('Cloudinary did not confirm deletion.');
    }
  } catch (error) {
    console.error('QR Code Generator could not remove an inaccessible hosted file.', {
      code: error.code || 'PUBLIC_FILE_CLEANUP_FAILED',
      resourceType: result.resourceType
    });
  }
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  COUNTRY_CODES,
  MAX_SHARE_BYTES,
  MAX_SHARE_CONCURRENCY,
  createError,
  createShareUploadMiddleware,
  inspectShareFile,
  normalizePhoneNumber,
  uploadShareFile
};
