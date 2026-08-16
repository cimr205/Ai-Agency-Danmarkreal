const backendBaseUrl =
  process.env.BACKEND_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://api.aiagencydanmark.dk';

export const metaConfig = {
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  redirectUri: process.env.META_REDIRECT_URI || `${backendBaseUrl}/api/meta/callback`,
  apiVersion: process.env.META_API_VERSION || 'v18.0',
  tokenEncryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY || '',
  automationEnabled: process.env.META_AUTOMATION_ENABLED === 'true',
  dailySpendLimit: Number(process.env.META_DAILY_SPEND_LIMIT || 0),
  weeklySpendLimit: Number(process.env.META_WEEKLY_SPEND_LIMIT || 0),
};

