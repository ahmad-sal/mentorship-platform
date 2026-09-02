const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;

const hasServiceRoleKey = Boolean(supabaseServiceRoleKey);

if (!hasServiceRoleKey) {
  console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured. Database delete operations are disabled to avoid fake success responses.');
}

module.exports = Object.assign(supabase, {
  supabaseAdmin,
  admin: supabaseAdmin,
  hasServiceRoleKey
});