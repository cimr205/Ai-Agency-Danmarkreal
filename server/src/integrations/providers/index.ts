import { env } from '../../config/env';
import { apolloProvider } from './apollo';
import { googleProvider } from './google';
import { hubspotProvider } from './hubspot';
import type { OAuthProvider } from './types';

export function getIntegrationProviders() {
  const backendBaseUrl = env.backendBaseUrl || env.publicBaseUrl;
  const providers: OAuthProvider[] = [
    apolloProvider({
      clientId: env.integrationsApolloClientId,
      clientSecret: env.integrationsApolloClientSecret,
      redirectUri: `${backendBaseUrl}/auth/apollo/callback`,
    }),
    googleProvider({
      clientId: env.integrationsGoogleClientId,
      clientSecret: env.integrationsGoogleClientSecret,
      redirectUri: `${backendBaseUrl}/auth/google/callback`,
    }),
    hubspotProvider({
      clientId: env.integrationsHubspotClientId,
      clientSecret: env.integrationsHubspotClientSecret,
      redirectUri: `${backendBaseUrl}/auth/hubspot/callback`,
    }),
  ];
  return providers;
}

export function findIntegrationProvider(providerId: string) {
  return getIntegrationProviders().find((provider) => provider.id === providerId);
}

