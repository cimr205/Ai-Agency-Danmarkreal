export type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export type OAuthProvider = {
  id: string;
  label: string;
  supportsOAuth: boolean;
  authorizeUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  extraParams?: Record<string, string>;
};


