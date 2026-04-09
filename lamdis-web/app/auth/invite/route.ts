import { NextResponse } from 'next/server';

/**
 * Auth0 Organization Invitation Handler
 * 
 * This route receives invitation links from Auth0.
 * Auth0 sends users here when they click an invitation link.
 * 
 * Query params from Auth0:
 * - invitation: The Auth0 invitation ID
 * - organization: The Auth0 organization ID
 * - organization_name: (optional) The organization name
 * 
 * We forward these params to /api/auth/login so the user
 * authenticates with the correct organization context.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  
  const invitation = url.searchParams.get('invitation');
  const organization = url.searchParams.get('organization');
  const organizationName = url.searchParams.get('organization_name');
  
  if (!invitation || !organization) {
    // Missing required params - redirect to home
    return NextResponse.redirect(new URL('/', url.origin));
  }
  
  // Build the login URL with org context + invitation
  const loginUrl = new URL('/api/auth/login', url.origin);
  loginUrl.searchParams.set('invitation', invitation);
  loginUrl.searchParams.set('organization', organization);
  
  if (organizationName) {
    loginUrl.searchParams.set('organization_name', organizationName);
  }
  
  // Show signup screen first since this is an invitation
  loginUrl.searchParams.set('screen_hint', 'signup');
  
  // After auth, redirect to dashboard
  loginUrl.searchParams.set('returnTo', '/dashboard');
  
  return NextResponse.redirect(loginUrl);
}
