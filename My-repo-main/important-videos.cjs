const path = require('node:path');
const crypto = require('node:crypto');

const MAX_TITLE_LENGTH = 180;
const MAX_SLUG_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_DETAILS_LENGTH = 20000;
const MAX_CATEGORY_LENGTH = 80;
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_UPDATE_FILE_BYTES = 50 * 1024 * 1024;
const IMPORTANT_UPDATE_STORAGE_BUCKET = 'important-updates-files';

const UPDATE_FILE_TYPES = Object.freeze({
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword', 'application/vnd.ms-word'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.ppt': ['application/vnd.ms-powerpoint', 'application/mspowerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.xls': ['application/vnd.ms-excel', 'application/msexcel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.txt': ['text/plain'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp']
});

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

function normalizeVideoInput(input) {
  const contentType = input.content_type === undefined || input.content_type === ''
    ? 'video'
    : input.content_type;
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  const status = input.status === 'published' ? 'published' : input.status === 'draft' ? 'draft' : '';
  const displayOrder = input.display_order === undefined || input.display_order === ''
    ? 0
    : Number(input.display_order);
  const slug = slugify(input.slug || title);

  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new Error(`Title is required and must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Short description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  }
  if (details.length > MAX_DETAILS_LENGTH) {
    throw new Error(`Detailed information must be ${MAX_DETAILS_LENGTH} characters or fewer.`);
  }
  if (category.length > MAX_CATEGORY_LENGTH) {
    throw new Error(`Category must be ${MAX_CATEGORY_LENGTH} characters or fewer.`);
  }
  if (!slug) {
    throw new Error('A route identifier could not be generated. Enter a title using letters or numbers.');
  }
  if (!status) {
    throw new Error('Choose Draft or Published as the publication status.');
  }
  if (contentType !== 'video' && contentType !== 'file') {
    throw new Error('Choose Video Update or File Update as the update type.');
  }
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) {
    throw new Error('Display order must be a whole number between 0 and 100000.');
  }

  return {
    content_type: contentType,
    title,
    slug,
    description,
    details,
    category: category || null,
    status,
    display_order: displayOrder
  };
}

function sanitizeOriginalFilename(value) {
  const leaf = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = leaf
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/^\.+/, '');
  return cleaned.slice(0, 180);
}

function validateUpdateFileMetadata(file) {
  const originalFilename = sanitizeOriginalFilename(file && file.originalname);
  const extension = path.extname(originalFilename).toLowerCase();
  const acceptedMimeTypes = UPDATE_FILE_TYPES[extension];
  if (!originalFilename || !acceptedMimeTypes) {
    const detectedExtension = extension || 'no extension';
    const supportedExtensions = Object.keys(UPDATE_FILE_TYPES).join(', ');
    throw new Error(
      `Choose a supported PDF, Office document, ZIP, text, or image file. Received: ${detectedExtension}. Supported extensions: ${supportedExtensions}.`
    );
  }
  if (!acceptedMimeTypes.includes(String(file.mimetype || '').toLowerCase())) {
    throw new Error('The file extension and MIME type do not match a supported format.');
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('The update file must not be empty.');
  if (file.size > MAX_UPDATE_FILE_BYTES) {
    throw new Error(`The update file must be ${MAX_UPDATE_FILE_BYTES / (1024 * 1024)} MiB or smaller.`);
  }
  return {
    originalFilename,
    extension,
    mimeType: String(file.mimetype).toLowerCase()
  };
}

function createImportantUpdateStoragePath(extension, id = crypto.randomUUID()) {
  if (!Object.prototype.hasOwnProperty.call(UPDATE_FILE_TYPES, extension)) {
    throw new Error('The update file extension is not supported.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error('A valid update file identifier is required.');
  }
  return `important-updates/${id}${extension}`;
}

function isValidImportantUpdateStoragePath(value, extension) {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(UPDATE_FILE_TYPES, extension)) {
    return false;
  }
  const filename = path.posix.basename(value, path.posix.extname(value));
  return path.posix.dirname(value) === 'important-updates' &&
    path.posix.extname(value).toLowerCase() === extension &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(filename);
}

function hasExpectedUpdateFileSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer)) return false;
  const startsWith = (signature) => buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
  const isZip = startsWith(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    startsWith(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
    startsWith(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
  if (['.docx', '.pptx', '.xlsx', '.zip'].includes(extension)) return isZip;
  if (['.doc', '.ppt', '.xls'].includes(extension)) {
    return startsWith(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (extension === '.pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === '.png') return startsWith(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (extension === '.jpg' || extension === '.jpeg') return startsWith(Buffer.from([0xff, 0xd8, 0xff]));
  if (extension === '.webp') return buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.txt') {
    if (!buffer.length) return false;
    for (const byte of buffer) {
      if (byte === 0 || byte === 0x7f || byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) return false;
    }
    return true;
  }
  return false;
}

function hasMp4Signature(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
}

function uploadLargeWithCallback(uploader, filePath, options) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(result);
    };

    try {
      const stream = uploader.upload_large(filePath, options, finish);
      if (stream && typeof stream.once === 'function') {
        stream.once('error', (error) => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

module.exports = {
  MAX_TITLE_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DETAILS_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_THUMBNAIL_BYTES,
  MAX_VIDEO_BYTES,
  MAX_UPDATE_FILE_BYTES,
  IMPORTANT_UPDATE_STORAGE_BUCKET,
  UPDATE_FILE_TYPES,
  slugify,
  normalizeVideoInput,
  sanitizeOriginalFilename,
  validateUpdateFileMetadata,
  createImportantUpdateStoragePath,
  isValidImportantUpdateStoragePath,
  hasExpectedUpdateFileSignature,
  hasMp4Signature,
  uploadLargeWithCallback
};
