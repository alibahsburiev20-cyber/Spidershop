// Exposes browser-safe config (Supabase URL + anon key) read from Pages env vars.

export async function onRequestGet({ env }) {
  return new Response(
    JSON.stringify({
      supabase_url: env.SUPABASE_URL || '',
      supabase_anon_key: env.SUPABASE_ANON_KEY || '',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    },
  );
}
