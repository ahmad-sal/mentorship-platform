const MAX_AD_CODE_LENGTH = 100000;
const AD_UNITS = require('./public/ad-catalog.js');

const AD_UNITS_BY_ID = new Map(AD_UNITS.map((unit) => [unit.id, unit]));

function getAdUnit(unitId) {
  return AD_UNITS_BY_ID.get(unitId) || null;
}

function validateAdCode(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Ad code must be a text value.');
  }
  if (value.length > MAX_AD_CODE_LENGTH) {
    throw new RangeError(`Ad code must be ${MAX_AD_CODE_LENGTH} characters or fewer.`);
  }
  return value.trim() ? value : null;
}

function getAdStatus(record) {
  if (!record.enabled) return 'Disabled';
  if (record.published_code) return 'Published';
  if (record.draft_code) return 'Draft';
  return 'Unpublished';
}

function getAdDatabaseFailure(error) {
  const code = error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
  if (code === 'PGRST205' || code === '42P01') {
    return {
      status: 503,
      code,
      error: 'PostgREST cannot find public.ad_unit_configurations or public.published_ad_units in its schema cache. Verify both relations exist in public and that public is exposed by the Data API; apply migrations/003_advertising_schema_repair.sql if either relation is missing, then reload the schema cache.'
    };
  }
  if (code === 'PGRST204' || code === '42703') {
    return {
      status: 503,
      code,
      error: 'The advertising table is missing a required column. Apply migrations/003_advertising_schema_repair.sql and reload the PostgREST schema cache.'
    };
  }
  if (code === '42501') {
    return {
      status: 503,
      code,
      error: 'Supabase denied access to the advertising table. Verify the server service-role key, table grants, and RLS policy.'
    };
  }
  return {
    status: 503,
    code,
    error: 'The advertising database operation failed. Check the server log for its operation and database error code.'
  };
}

module.exports = {
  AD_UNITS,
  MAX_AD_CODE_LENGTH,
  getAdUnit,
  getAdStatus,
  getAdDatabaseFailure,
  validateAdCode
};
