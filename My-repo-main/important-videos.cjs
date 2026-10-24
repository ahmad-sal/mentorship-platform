const MAX_TITLE_LENGTH = 180;
const MAX_SLUG_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_DETAILS_LENGTH = 20000;
const MAX_CATEGORY_LENGTH = 80;
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

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
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) {
    throw new Error('Display order must be a whole number between 0 and 100000.');
  }

  return {
    title,
    slug,
    description,
    details,
    category: category || null,
    status,
    display_order: displayOrder
  };
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
  slugify,
  normalizeVideoInput,
  hasMp4Signature,
  uploadLargeWithCallback
};
