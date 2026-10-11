window.createRecoverySupabaseClient = async function () {
  const response = await fetch('/api/auth/public-config');
  const config = await response.json();
  if (!response.ok || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Password recovery is temporarily unavailable. Please try again later.');
  }

  return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};
