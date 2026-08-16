import type { OAuthProvider } from './types';

export function apolloProvider(config: {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
}): OAuthProvider {
  return {
    id: 'apollo',
    label: 'Apollo',
    supportsOAuth: Boolean(config.clientId && config.clientSecret),
    authorizeUrl: 'https://app.apollo.io/oauth/authorize',
    tokenUrl: 'https://app.apollo.io/oauth/token',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scopes: [],
    extraParams: {
      redirect_uri: config.redirectUri,
    },
  };
}

