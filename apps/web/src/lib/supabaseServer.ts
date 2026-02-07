import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// In Next.js (React 18), `react.cache` isn't available. A module-level singleton is enough for the MVP.
let cached: ReturnType<typeof createClient> | null = null;

export function getSupabaseServer() {
  if (!cached) {
    cached = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
  }
  return cached;
}
