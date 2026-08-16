const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://aiagencydanmark.dk';
const backendBaseUrl =
  process.env.BACKEND_BASE_URL || process.env.PUBLIC_BASE_URL || 'https://api.aiagencydanmark.dk';

const supabaseUrl = process.env.SUPABASE_URL || '';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  publicBaseUrl,
  backendBaseUrl,

  // Core multi-tenant stack
  databaseUrl: process.env.DATABASE_URL || '',
  supabaseUrl,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseJwtIssuer: process.env.SUPABASE_JWT_ISSUER || (supabaseUrl ? `${supabaseUrl}/auth/v1` : ''),
  globalAdminEmails: (process.env.GLOBAL_ADMIN_EMAILS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || `${backendBaseUrl}/api/auth/google/callback`,
  gmailClientId: process.env.GMAIL_CLIENT_ID || '',
  gmailClientSecret: process.env.GMAIL_CLIENT_SECRET || '',
  gmailRedirectUri: process.env.GMAIL_REDIRECT_URI || `${backendBaseUrl}/api/gmail/callback`,
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  campaignRateLimitPerMinute: Number(process.env.CAMPAIGN_RATE_LIMIT_PER_MINUTE || 60),
  metaAppId: process.env.META_APP_ID || '',
  metaAppSecret: process.env.META_APP_SECRET || '',
  metaRedirectUri: process.env.META_REDIRECT_URI || `${backendBaseUrl}/api/meta/callback`,
  metaApiVersion: process.env.META_API_VERSION || 'v18.0',
  metaTokenEncryptionKey: process.env.META_TOKEN_ENCRYPTION_KEY || '',
  metaAutomationEnabled: process.env.META_AUTOMATION_ENABLED === 'true',
  integrationsGoogleClientId: process.env.INTEGRATIONS_GOOGLE_CLIENT_ID || '',
  integrationsGoogleClientSecret: process.env.INTEGRATIONS_GOOGLE_CLIENT_SECRET || '',
  integrationsHubspotClientId: process.env.INTEGRATIONS_HUBSPOT_CLIENT_ID || '',
  integrationsHubspotClientSecret: process.env.INTEGRATIONS_HUBSPOT_CLIENT_SECRET || '',
  integrationsApolloClientId: process.env.INTEGRATIONS_APOLLO_CLIENT_ID || '',
  integrationsApolloClientSecret: process.env.INTEGRATIONS_APOLLO_CLIENT_SECRET || '',
  companiesHouseApiKey: process.env.COMPANIES_HOUSE_API_KEY || '',

  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  // E.164 number enabled for WhatsApp on the Twilio account (sandbox or approved sender), without the "whatsapp:" prefix.
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

