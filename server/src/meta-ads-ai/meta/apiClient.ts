import { metaConfig } from '../config';

export async function metaGet<T>(path: string, accessToken: string, params?: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${metaConfig.apiVersion}/${path}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Meta API error: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function metaPost<T>(
  path: string,
  accessToken: string,
  body: Record<string, string | number>
) {
  const url = new URL(`https://graph.facebook.com/${metaConfig.apiVersion}/${path}`);
  const payload = new URLSearchParams({ access_token: accessToken });
  Object.entries(body).forEach(([key, value]) => payload.set(key, String(value)));
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  });
  if (!response.ok) {
    throw new Error(`Meta API error: ${response.status}`);
  }
  return (await response.json()) as T;
}

