import { findIntegrationProvider } from '../integrations/providers';
import { createIntegrationLog } from '../repositories/integrationLogRepository';
import { getIntegration, upsertIntegrationConnection } from '../repositories/integrationRepository';

export async function getValidAccessToken(userId: string, providerId: string) {
  const tokens = getIntegration(userId, providerId);
  if (!tokens?.accessToken) return null;

  const now = Date.now();
  const expiresAt = tokens.expiresAt || 0;
  const needsRefresh = expiresAt !== 0 && expiresAt < now + 60_000;
  if (!needsRefresh) {
    return tokens.accessToken;
  }

  const provider = findIntegrationProvider(providerId);
  if (!provider?.tokenUrl || !provider.clientId || !provider.clientSecret || !tokens.refreshToken) {
    createIntegrationLog({
      userId,
      provider: providerId,
      status: 'error',
      message: 'Missing refresh token or provider config',
    });
    return tokens.accessToken;
  }

  try {
    const payload = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
    });
    const response = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });
    if (!response.ok) {
      createIntegrationLog({
        userId,
        provider: providerId,
        status: 'error',
        message: `Refresh failed (${response.status})`,
      });
      return tokens.accessToken;
    }
    const data = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const updatedAccess = data.access_token || tokens.accessToken;
    const updatedRefresh = data.refresh_token || tokens.refreshToken;
    const updatedExpires = data.expires_in ? Date.now() + data.expires_in * 1000 : tokens.expiresAt;
    upsertIntegrationConnection({
      userId,
      provider: providerId,
      tokens: {
        accessToken: updatedAccess,
        refreshToken: updatedRefresh,
        expiresAt: updatedExpires,
      },
    });
    createIntegrationLog({
      userId,
      provider: providerId,
      status: 'ok',
      message: 'Token refreshed',
    });
    return updatedAccess;
  } catch (error) {
    createIntegrationLog({
      userId,
      provider: providerId,
      status: 'error',
      message: (error as Error).message,
    });
    return tokens.accessToken;
  }
}

