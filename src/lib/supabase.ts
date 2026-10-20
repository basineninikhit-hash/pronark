import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const supabase = url && key ? createClient(url, key) : null;

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : String(e);
}

export async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Connect a Supabase project first.');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
