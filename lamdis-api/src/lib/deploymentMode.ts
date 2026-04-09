import { env } from './env.js';

export type DeploymentMode = 'cloud' | 'self_hosted';
export type AuthMode = 'auth0' | 'oidc' | 'saml' | 'disabled';
export type EntitlementsMode = 'stripe' | 'license_file' | 'open';

export const deploymentMode: DeploymentMode = env.LAMDIS_DEPLOYMENT_MODE;
export const authMode: AuthMode = env.LAMDIS_AUTH_MODE;
export const entitlementsMode: EntitlementsMode = env.LAMDIS_ENTITLEMENTS_MODE;

export function isCloud(): boolean {
  return deploymentMode === 'cloud';
}

export function isSelfHosted(): boolean {
  return deploymentMode === 'self_hosted';
}

export function isAuth0(): boolean {
  return authMode === 'auth0';
}

export function isOidc(): boolean {
  return authMode === 'oidc';
}

export function isStripeEnabled(): boolean {
  return entitlementsMode === 'stripe';
}

export function isLicenseMode(): boolean {
  return entitlementsMode === 'license_file';
}

export function isOpenMode(): boolean {
  return entitlementsMode === 'open';
}
