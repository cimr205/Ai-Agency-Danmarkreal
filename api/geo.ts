// Visitor's country + local currency + DKK→local exchange rate.
// Country comes from Vercel's own x-vercel-ip-country header (no IP stored or
// returned). Rates: ExchangeRate-API open endpoint (166 currencies, daily),
// cached in memory per function instance.
import countryToCurrency from 'country-to-currency';

const RATES_URL = 'https://open.er-api.com/v6/latest/DKK';
const RATES_TTL_MS = 6 * 60 * 60 * 1000;

let ratesCache: { at: number; rates: Record<string, number> } | null = null;

async function dkkRates(): Promise<Record<string, number> | null> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.rates;
  try {
    const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return ratesCache?.rates ?? null;
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== 'success' || !body.rates) return ratesCache?.rates ?? null;
    ratesCache = { at: Date.now(), rates: body.rates };
    return body.rates;
  } catch {
    return ratesCache?.rates ?? null; // stale beats nothing; null → client shows DKK
  }
}

export async function GET(request: Request) {
  // ?country=XX lets QA preview another country; it only changes what that
  // visitor is shown (checkout currency is still enforced by Stripe).
  const qa = new URL(request.url).searchParams.get('country');
  const raw = qa && /^[a-z]{2}$/i.test(qa) ? qa : request.headers.get('x-vercel-ip-country');
  const country = raw ? raw.toUpperCase() : null;
  const currency = country ? (countryToCurrency as Record<string, string>)[country] ?? null : null;
  let rate: number | null = null;
  if (currency === 'DKK') rate = 1;
  else if (currency) rate = (await dkkRates())?.[currency] ?? null;
  return Response.json(
    { country, currency: rate ? currency : null, rate },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
