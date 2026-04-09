export type ProviderTemplate = {
  key: string;
  name: string;
  authorize_url: string;
  token_url: string;
  scopes: string;
  docs_url?: string;
};

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    key: 'calendly',
    name: 'Calendly',
    authorize_url: 'https://auth.calendly.com/oauth/authorize',
    token_url: 'https://auth.calendly.com/oauth/token',
    scopes: 'openid profile',
    docs_url: 'https://developer.calendly.com/'
  },
  {
    key: 'doordash',
    name: 'DoorDash',
    authorize_url: 'https://identity.doordash.com/oauth/authorize',
    token_url: 'https://identity.doordash.com/oauth/token',
    scopes: 'openid profile',
    docs_url: 'https://developer.doordash.com/'
  },
  {
    key: 'gmail',
    name: 'Google (Gmail)',
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    scopes: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
    docs_url: 'https://developers.google.com/identity'
  }
];

export function findProviderTemplate(key: string) {
  return PROVIDER_TEMPLATES.find(p => p.key === key);
}