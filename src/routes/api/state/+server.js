import { json } from '@sveltejs/kit';
import { getState, saveState } from '$lib/supabase.js';

export async function GET() {
  try {
    const state = await getState();
    return json(state);
  } catch (error) {
    console.error('GET state error:', error);
    return json({ error: 'Failed to fetch state' }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const state = await request.json();
    await saveState(state);
    return json({ success: true });
  } catch (error) {
    console.error('POST state error:', error);
    return json({ error: 'Failed to save state' }, { status: 500 });
  }
}
