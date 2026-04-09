"use client";

import { useState, useEffect } from 'react';
import { useOrg } from '@/lib/orgContext';
import Card from '@/components/base/Card';
import { Input } from '@/components/base/Input';
import { 
  FiShield, FiExternalLink, FiCopy, FiCheck, FiAlertCircle, 
  FiInfo, FiChevronRight, FiMail, FiLink
} from 'react-icons/fi';

interface SSOConfig {
  enabled: boolean;
  provider?: 'okta' | 'azure' | 'google' | 'saml' | 'oidc';
  connectionName?: string;
  domain?: string;
  status?: 'active' | 'pending' | 'disabled';
}

export default function SSOPage() {
  const { currentOrg } = useOrg();
  const [ssoConfig, setSsoConfig] = useState<SSOConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  // Auth0 domain - Lamdis's Auth0 tenant domain (hardcoded since it's our own domain)
  const auth0Domain = 'lamdis.us.auth0.com';
  const orgId = currentOrg?.orgId || '';

  useEffect(() => {
    // In a real implementation, fetch SSO configuration from backend
    setLoading(false);
    setSsoConfig({ enabled: false });
  }, [currentOrg?.orgId]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const configValues = {
    acsUrl: `https://${auth0Domain}/login/callback?connection=okta-${orgId}`,
    entityId: `urn:auth0:lamdis:okta-${orgId}`,
    audience: `https://${auth0Domain}`,
    callbackUrl: `https://${auth0Domain}/login/callback`,
    signOnUrl: `https://${auth0Domain}/authorize`,
    logoutUrl: `https://${auth0Domain}/logout`,
    metadataUrl: `https://${auth0Domain}/samlp/metadata?connection=okta-${orgId}`,
  };

  const providers = [
    { 
      id: 'okta', 
      name: 'Okta', 
      logo: '🔒',
      description: 'Enterprise identity management',
      docsUrl: 'https://developer.okta.com/docs/guides/build-sso-integration/saml2/main/'
    },
    { 
      id: 'azure', 
      name: 'Azure AD', 
      logo: '☁️',
      description: 'Microsoft Entra ID',
      docsUrl: 'https://learn.microsoft.com/en-us/azure/active-directory/saas-apps/tutorial-list'
    },
    { 
      id: 'google', 
      name: 'Google Workspace', 
      logo: '🌐',
      description: 'Google Cloud Identity',
      docsUrl: 'https://support.google.com/a/answer/6087519'
    },
    { 
      id: 'onelogin', 
      name: 'OneLogin', 
      logo: '🔑',
      description: 'Unified access management',
      docsUrl: 'https://developers.onelogin.com/saml'
    },
  ];

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copyToClipboard(text, id)}
      className="p-1.5 rounded hover:bg-slate-700/50 transition text-slate-400 hover:text-slate-200"
      title="Copy to clipboard"
    >
      {copied === id ? <FiCheck className="text-green-400" /> : <FiCopy />}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FiShield className="text-fuchsia-400" />
            Single Sign-On (SSO)
          </h1>
          <p className="text-slate-400 mt-1">
            Enable SSO to let your team sign in with your corporate identity provider
          </p>
        </div>

        {/* Current Status */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${ssoConfig?.enabled ? 'bg-green-900/30' : 'bg-slate-800'}`}>
                <FiShield className={`text-2xl ${ssoConfig?.enabled ? 'text-green-400' : 'text-slate-500'}`} />
              </div>
              <div>
                <div className="font-semibold">SSO Status</div>
                <div className={`text-sm ${ssoConfig?.enabled ? 'text-green-400' : 'text-slate-500'}`}>
                  {ssoConfig?.enabled ? `Connected via ${ssoConfig.provider}` : 'Not configured'}
                </div>
              </div>
            </div>
            
            {ssoConfig?.enabled && (
              <span className="px-3 py-1 rounded-full bg-green-900/30 text-green-400 text-xs font-medium">
                Active
              </span>
            )}
          </div>
        </Card>

        {/* Info Box */}
        <div className="p-4 rounded-xl bg-blue-900/20 border border-blue-500/30 text-blue-300 flex items-start gap-3">
          <FiInfo className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium mb-1">Enterprise Feature</p>
            <p className="text-blue-200/70">
              SSO setup requires coordination between Lamdis and your IT team. After selecting your provider below,
              you'll need to share configuration values with your IT admin, and they'll need to provide values back.
              For assistance, contact <a href="mailto:support@lamdis.ai" className="underline">support@lamdis.ai</a>.
            </p>
          </div>
        </div>

        {/* Provider Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-4">1. Choose Your Identity Provider</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setSelectedProvider(provider.id)}
                className={`p-4 rounded-xl border transition text-left ${
                  selectedProvider === provider.id
                    ? 'border-fuchsia-500/50 bg-fuchsia-900/20'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-900/50'
                }`}
              >
                <div className="text-2xl mb-2">{provider.logo}</div>
                <div className="font-medium">{provider.name}</div>
                <div className="text-xs text-slate-500 mt-1">{provider.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Configuration Steps */}
        {selectedProvider && (
          <>
            {/* Step 2: Values for IT Admin */}
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                2. Share These Values With Your IT Admin
                <span className="text-xs font-normal text-slate-500">(for {providers.find(p => p.id === selectedProvider)?.name})</span>
              </h2>
              
              <p className="text-sm text-slate-400 mb-4">
                Your IT admin will need these values to configure the SAML application in your identity provider:
              </p>

              <div className="space-y-3">
                {selectedProvider === 'okta' && (
                  <>
                    <ConfigRow 
                      label="Single Sign-On URL (ACS URL)" 
                      value={configValues.acsUrl}
                      copyButton={<CopyButton text={configValues.acsUrl} id="acs" />}
                    />
                    <ConfigRow 
                      label="Audience URI (SP Entity ID)" 
                      value={configValues.entityId}
                      copyButton={<CopyButton text={configValues.entityId} id="entity" />}
                    />
                    <ConfigRow 
                      label="Name ID Format" 
                      value="EmailAddress"
                      copyButton={<CopyButton text="EmailAddress" id="nameid" />}
                    />
                    <ConfigRow 
                      label="Application Username" 
                      value="Email"
                      copyButton={<CopyButton text="Email" id="appuser" />}
                    />
                  </>
                )}
                
                {selectedProvider === 'azure' && (
                  <>
                    <ConfigRow 
                      label="Identifier (Entity ID)" 
                      value={configValues.entityId}
                      copyButton={<CopyButton text={configValues.entityId} id="entity" />}
                    />
                    <ConfigRow 
                      label="Reply URL (ACS URL)" 
                      value={configValues.acsUrl}
                      copyButton={<CopyButton text={configValues.acsUrl} id="acs" />}
                    />
                    <ConfigRow 
                      label="Sign-on URL" 
                      value={configValues.signOnUrl}
                      copyButton={<CopyButton text={configValues.signOnUrl} id="signon" />}
                    />
                    <ConfigRow 
                      label="Logout URL" 
                      value={configValues.logoutUrl}
                      copyButton={<CopyButton text={configValues.logoutUrl} id="logout" />}
                    />
                  </>
                )}

                {selectedProvider === 'google' && (
                  <>
                    <ConfigRow 
                      label="ACS URL" 
                      value={configValues.acsUrl}
                      copyButton={<CopyButton text={configValues.acsUrl} id="acs" />}
                    />
                    <ConfigRow 
                      label="Entity ID" 
                      value={configValues.entityId}
                      copyButton={<CopyButton text={configValues.entityId} id="entity" />}
                    />
                    <ConfigRow 
                      label="Start URL" 
                      value="https://app.lamdis.ai/dashboard"
                      copyButton={<CopyButton text="https://app.lamdis.ai/dashboard" id="start" />}
                    />
                  </>
                )}

                {selectedProvider === 'onelogin' && (
                  <>
                    <ConfigRow 
                      label="ACS (Consumer) URL" 
                      value={configValues.acsUrl}
                      copyButton={<CopyButton text={configValues.acsUrl} id="acs" />}
                    />
                    <ConfigRow 
                      label="Audience (EntityID)" 
                      value={configValues.entityId}
                      copyButton={<CopyButton text={configValues.entityId} id="entity" />}
                    />
                    <ConfigRow 
                      label="SAML nameID format" 
                      value="Email"
                      copyButton={<CopyButton text="Email" id="nameid" />}
                    />
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <a 
                  href={providers.find(p => p.id === selectedProvider)?.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1"
                >
                  View {providers.find(p => p.id === selectedProvider)?.name} SAML setup documentation
                  <FiExternalLink size={14} />
                </a>
              </div>
            </Card>

            {/* Step 3: Values from IT Admin */}
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-4">3. Values Needed From Your IT Admin</h2>
              
              <p className="text-sm text-slate-400 mb-4">
                After your IT admin creates the SAML application, they'll need to provide you with these values.
                You can send them to <a href="mailto:support@lamdis.ai" className="text-fuchsia-400 hover:underline">support@lamdis.ai</a> to complete the setup:
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Identity Provider Single Sign-On URL</label>
                  <Input placeholder="https://yourcompany.okta.com/app/.../sso/saml" disabled />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Identity Provider Issuer</label>
                  <Input placeholder="http://www.okta.com/exk..." disabled />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">X.509 Certificate</label>
                  <textarea 
                    className="w-full h-24 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-300 text-sm font-mono resize-none"
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                    disabled
                  />
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-amber-300 text-sm flex items-start gap-2">
                <FiAlertCircle className="mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Important:</strong> Never share these credentials publicly. Email them directly to our support team
                  or use a secure file sharing method.
                </div>
              </div>
            </Card>

            {/* Step 4: Contact Support */}
            <Card className="p-5 bg-gradient-to-br from-fuchsia-900/20 to-slate-900/50">
              <h2 className="text-lg font-semibold mb-2">4. Complete Setup</h2>
              <p className="text-sm text-slate-400 mb-4">
                Once you have the values from your IT admin, contact our support team to complete the SSO configuration.
                We typically complete setup within 1 business day.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <a
                  href={`mailto:support@lamdis.ai?subject=SSO%20Setup%20Request%20-%20${encodeURIComponent(orgId)}&body=Org%20ID:%20${encodeURIComponent(orgId)}%0AIdentity%20Provider:%20${encodeURIComponent(providers.find(p => p.id === selectedProvider)?.name || '')}%0A%0APlease%20attach%20the%20following%20values%20from%20your%20IT%20admin:%0A-%20Identity%20Provider%20SSO%20URL%0A-%20Identity%20Provider%20Issuer%0A-%20X.509%20Certificate`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-medium transition"
                >
                  <FiMail />
                  Email Support Team
                </a>
                <a
                  href="https://calendly.com/lamdis/sso-setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-600 hover:border-slate-500 text-slate-200 font-medium transition"
                >
                  <FiLink />
                  Schedule Setup Call
                </a>
              </div>
            </Card>

            {/* Quick Reference */}
            <Card className="p-5">
              <h2 className="text-lg font-semibold mb-3">Quick Reference</h2>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-slate-400 mb-1">Organization ID</div>
                  <div className="font-mono text-slate-100 flex items-center gap-2">
                    {orgId || 'Loading...'}
                    {orgId && <CopyButton text={orgId} id="orgid" />}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 mb-1">Auth0 Domain</div>
                  <div className="font-mono text-slate-100 flex items-center gap-2">
                    {auth0Domain}
                    <CopyButton text={auth0Domain} id="domain" />
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Not selected provider yet */}
        {!selectedProvider && (
          <div className="text-center py-12 text-slate-500">
            <FiChevronRight className="mx-auto text-4xl mb-3 opacity-50" />
            <p>Select an identity provider above to see setup instructions</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigRow({ label, value, copyButton }: { label: string; value: string; copyButton: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-xs text-slate-400 mb-0.5">{label}</div>
        <div className="font-mono text-sm text-slate-100 truncate">{value}</div>
      </div>
      {copyButton}
    </div>
  );
}