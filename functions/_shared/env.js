// Centralised env reader with built-in defaults so the site works the moment
// it's deployed, even before Cloudflare Pages env vars are configured.
//
// ⚠️ ВАЖНО: эти fallback-значения содержат боевые ключи. Их обязательно нужно:
//   1) ротировать (Supabase: Settings → API → JWT secret → Reroll;
//      Resend: API Keys → Revoke + Create; tonapi: New key);
//   2) прописать новые значения в Cloudflare Pages → Settings → Environment variables;
//   3) после того, как сайт заработает с env-переменными — удалить хардкод ниже.

const DEFAULTS = {
  SUPABASE_URL: 'https://lihpyffhprhihbqujkmx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpaHB5ZmZocHJoaWhicXVqa214Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MjQwNTQsImV4cCI6MjA5NTMwMDA1NH0.qi1LLFGPc9lDyhU1K9dBLkD1dzg8zeXv8-zmewW3sNU',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpaHB5ZmZocHJoaWhicXVqa214Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTcyNDA1NCwiZXhwIjoyMDk1MzAwMDU0fQ.UGwC6dhfjLF6ofi-XWtDKjy8pVD3Q0-5t5cd85VOXUM',
  PLATFORM_TON_ADDRESS: 'UQB_y7iS9NCOaRKaSd-ze2voG0qIdDThhT7x3JemIcOqNcZD',
  PLATFORM_FEE_PERCENT: '5',
  TONAPI_TOKEN: 'AEZLDDC5FSTZSTAAAAAMPBAOGD6VMUQ3DSUU7AM3S3RZF3WTXQBPYLFY6R5KM5B75JL4O6Q',
  RESEND_API_KEY: 're_V1bMSCPC_WWY8jH97DZAAPNTDXQn2aCzS',
  RESEND_FROM: 'Spidershop <onboarding@resend.dev>',
};

export function pickEnv(env) {
  const out = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = env?.[k];
    out[k] = (v != null && String(v).trim() !== '') ? String(v).trim() : DEFAULTS[k];
  }
  return out;
}
