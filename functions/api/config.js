// Exposes browser-safe config (Supabase URL + anon key) to the frontend.

import { pickEnv } from '../_shared/env.js';

export async function onRequestGet({ env }) {
  const cfg = pickEnv(env);
  return new Response(
    JSON.stringify({
      supabase_url: cfg.SUPABASE_URL,
      supabase_anon_key: cfg.SUPABASE_ANON_KEY,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
