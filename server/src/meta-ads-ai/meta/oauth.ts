import { URLSearchParams } from 'url';
import { metaConfig } from '../config';

export const META_SCOPES = ['ads_management', 'ads_read', 'business_management', 'leads_retrieval'];

export function buildMetaAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: metaConfig.appId,
    redirect_uri: metaConfig.redirectUri,
    scope: META_SCOPES.join(','),
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/${metaConfig.apiVersion}/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaCode(code: string) {
  const params = new URLSearchParams({
    client_id: metaConfig.appId,
    client_secret: metaConfig.appSecret,
    redirect_uri: metaConfig.redirectUri,
    code,
  });
  const response = await fetch(`https://graph.facebook.com/${metaConfig.apiVersion}/oauth/access_token?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Meta token exchange failed');
  }
  return (await response.json()) as { access_token: string; expires_in: number };
}

export async function exchangeLongLivedToken(shortLivedToken: string) {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: metaConfig.appId,
    client_secret: metaConfig.appSecret,
    fb_exchange_token: shortLivedToken,
  });
  const response = await fetch(`https://graph.facebook.com/${metaConfig.apiVersion}/oauth/access_token?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Meta long-lived token exchange failed');
  }
  return (await response.json()) as { access_token: string; expires_in: number };
}

