import type { OAuthProvider } from './types';

export function googleProvider(config: {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
}): OAuthProvider {
  return {
    id: 'google',
    label: 'Google',
    supportsOAuth: Boolean(config.clientId && config.clientSecret),
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    scopes: ['openid', 'email', 'profile'],
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
      redirect_uri: config.redirectUri,
    },
  };
}

