import { createClient } from '@supabase/supabase-js'

let client = null

export function getSupabase() {
  if (!client) {
    // Accept either name — the Netlify var was originally saved as
    // SUPABASE_SERVICE_KEY (no "_ROLE"); SUPABASE_SERVICE_ROLE_KEY is the
    // preferred name if it's ever added, but this avoids a mismatch either way.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    client = createClient(process.env.SUPABASE_URL, serviceKey, {
      auth: { persistSession: false },
    })
  }
  return client
}
