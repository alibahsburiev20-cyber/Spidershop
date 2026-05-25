// tonapi.io v2 client — read-only blockchain helpers.

const TONAPI = 'https://tonapi.io/v2';

function authHeaders(env) {
  return env.TONAPI_TOKEN ? { Authorization: `Bearer ${env.TONAPI_TOKEN}` } : {};
}

export async function tonUsdRate(env) {
  // /rates?tokens=ton&currencies=usd
  const res = await fetch(`${TONAPI}/rates?tokens=ton&currencies=usd`, {
    headers: authHeaders(env),
  });
  if (!res.ok) throw new Error(`tonapi rates: HTTP ${res.status}`);
  const data = await res.json();
  const r = data?.rates?.TON?.prices?.USD;
  if (!r || r <= 0) throw new Error('TON/USD rate unavailable');
  return Number(r);
}

// Return latest incoming transactions for an address.
export async function incomingTransactions(env, address, limit = 50) {
  const res = await fetch(`${TONAPI}/blockchain/accounts/${address}/transactions?limit=${limit}`, {
    headers: authHeaders(env),
  });
  if (!res.ok) throw new Error(`tonapi transactions: HTTP ${res.status}`);
  const data = await res.json();
  return data.transactions || [];
}

// Find an incoming TX whose comment matches memo and value covers expectedTon (±tolerance fraction).
// Returns { hash, valueTon } or null.
export async function findIncomingByMemo(env, address, memo, expectedTon, tolerance = 0.01) {
  const txs = await incomingTransactions(env, address, 100);
  for (const tx of txs) {
    const inMsg = tx.in_msg;
    if (!inMsg) continue;
    // value is in nanoTON
    const valueNano = Number(inMsg.value || 0);
    if (!valueNano) continue;
    const valueTon = valueNano / 1e9;
    const comment = inMsg.decoded_body?.text ?? inMsg.message ?? inMsg.comment ?? '';
    if (!comment) continue;
    if (String(comment).trim() !== memo) continue;
    // tolerance ±1%
    const lo = expectedTon * (1 - tolerance);
    if (valueTon + 1e-6 < lo) continue;  // under-paid → ignore
    return { hash: tx.hash, valueTon };
  }
  return null;
}

// Generate a short, URL-safe unique memo.
export function generateMemo() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = 'sp-';
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
