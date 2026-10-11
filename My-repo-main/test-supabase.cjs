const supabase = require('./supabase.cjs');

async function test() {
  const { data, error } = await supabase.from('courses').select('*').limit(1);
  console.log('Courses test:', data || error);
}

test();