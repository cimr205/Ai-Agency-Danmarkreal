import type { OAuthProvider } from './types';

export function hubspotProvider(config: {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
}): OAuthProvider {
  return {
    id: 'hubspot',
    label: 'HubSpot',
    supportsOAuth: Boolean(config.clientId && config.clientSecret),
    authorizeUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scopes: ['crm.objects.contacts.read', 'oauth'],
    extraParams: {
      redirect_uri: config.redirectUri,
    },
  };
}

