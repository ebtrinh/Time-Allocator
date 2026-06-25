import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

function getSupabase() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
}

export const DB_ID = 'default';

export async function getState() {
  const { data, error } = await getSupabase()
    .from('time_allocator')
    .select('data')
    .eq('id', DB_ID)
    .single();

  if (error && error.code === 'PGRST116') {
    // No row exists, return default
    return { activities: [], log: [], lastDate: null, yesterday: null, portions: 6 };
  }

  if (error) throw error;
  return data?.data || { activities: [], log: [], lastDate: null, yesterday: null, portions: 6 };
}

export async function saveState(state) {
  const { error } = await getSupabase()
    .from('time_allocator')
    .upsert({ id: DB_ID, data: state, updated_at: new Date().toISOString() });

  if (error) throw error;
  return true;
}
