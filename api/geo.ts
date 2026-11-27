// Returns the visitor's country as Vercel's edge sees it (from the request IP).
// Used only to pick the display/checkout currency. No IP is stored or returned.
export function GET(request: Request) {
  const country = request.headers.get('x-vercel-ip-country');
  return Response.json(
    { country: country ? country.toUpperCase() : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
