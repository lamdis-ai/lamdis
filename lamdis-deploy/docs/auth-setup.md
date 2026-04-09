# Auth Setup (OIDC)

Lamdis self-hosted uses OpenID Connect (OIDC) for authentication. Any standards-compliant OIDC provider works. This guide covers setup for the most common providers.

---

## General Requirements

Your OIDC provider must support:

- **Authorization Code Flow** (with PKCE preferred)
- **JWKS endpoint** for token verification
- **Standard claims**: `sub`, `email`, `name`
- **Group/role claims** (optional, for role mapping)

You'll need:

1. An **Application/Client** configured for Lamdis
2. The **Issuer URL**, **Client ID**, and **Client Secret**
3. **Redirect URI**: `http(s)://YOUR_LAMDIS_DOMAIN/api/auth/callback`
4. **Logout URI**: `http(s)://YOUR_LAMDIS_DOMAIN/api/auth/logout`

---

## Okta

### 1. Create an Application

1. Go to **Applications > Create App Integration**
2. Select **OIDC - OpenID Connect** and **Web Application**
3. Configure:
   - **App name**: Lamdis
   - **Sign-in redirect URIs**: `https://lamdis.yourcompany.com/api/auth/callback`
   - **Sign-out redirect URIs**: `https://lamdis.yourcompany.com/api/auth/logout`
   - **Assignments**: Assign to the appropriate groups

### 2. Get credentials

- **Client ID**: On the General tab
- **Client Secret**: On the General tab
- **Issuer URL**: `https://your-org.okta.com` (or `https://your-org.okta.com/oauth2/default` for the default authorization server)

### 3. Configure groups claim

1. Go to **Security > API > Authorization Servers > default**
2. Go to **Claims > Add Claim**:
   - **Name**: `groups`
   - **Include in token type**: ID Token, Always
   - **Value type**: Groups
   - **Filter**: Matches regex `.*`

### 4. Lamdis configuration

```env
OIDC_ISSUER=https://your-org.okta.com/oauth2/default
OIDC_CLIENT_ID=0oa1234567890abcdef
OIDC_CLIENT_SECRET=your-client-secret
OIDC_AUDIENCE=api://lamdis
OIDC_GROUP_CLAIM=groups
OIDC_ROLE_MAP={"lamdis-admins":"admin","engineering":"member"}
```

---

## Azure AD (Entra ID)

### 1. Register an Application

1. Go to **Azure Portal > App registrations > New registration**
2. Configure:
   - **Name**: Lamdis
   - **Redirect URI**: Web — `https://lamdis.yourcompany.com/api/auth/callback`
3. Note the **Application (client) ID** and **Directory (tenant) ID**

### 2. Create a client secret

1. Go to **Certificates & secrets > New client secret**
2. Copy the secret value

### 3. Configure token claims

1. Go to **Token configuration > Add groups claim**
2. Select **Security groups** and/or **Groups assigned to the application**
3. For token type, check **ID** and **Access**

### 4. API permissions

1. Go to **API permissions > Add a permission > Microsoft Graph**
2. Add: `openid`, `profile`, `email`

### 5. Lamdis configuration

```env
OIDC_ISSUER=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0
OIDC_CLIENT_ID=your-application-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_AUDIENCE=api://lamdis
OIDC_GROUP_CLAIM=groups
OIDC_ROLE_MAP={"GROUP_OBJECT_ID_FOR_ADMINS":"admin","GROUP_OBJECT_ID_FOR_MEMBERS":"member"}
```

> **Note:** Azure AD returns group Object IDs, not names. Use the group Object ID in your role map.

---

## Keycloak

### 1. Create a Client

1. Go to **Clients > Create client**
2. Configure:
   - **Client ID**: `lamdis`
   - **Client Protocol**: `openid-connect`
   - **Root URL**: `https://lamdis.yourcompany.com`
3. On the **Settings** tab:
   - **Access Type**: confidential
   - **Valid Redirect URIs**: `https://lamdis.yourcompany.com/api/auth/callback`
4. On the **Credentials** tab, copy the **Secret**

### 2. Configure group mapper

1. Go to **Clients > lamdis > Client scopes > lamdis-dedicated**
2. **Add mapper > By configuration > Group Membership**:
   - **Name**: `groups`
   - **Token Claim Name**: `groups`
   - **Full group path**: OFF

### 3. Lamdis configuration

```env
OIDC_ISSUER=https://keycloak.yourcompany.com/realms/your-realm
OIDC_CLIENT_ID=lamdis
OIDC_CLIENT_SECRET=your-client-secret
OIDC_GROUP_CLAIM=groups
OIDC_ROLE_MAP={"platform-admins":"admin","developers":"member","qa":"member"}
```

---

## Google Workspace

### 1. Create OAuth 2.0 credentials

1. Go to **Google Cloud Console > APIs & Services > Credentials**
2. **Create Credentials > OAuth client ID**
3. Configure:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `https://lamdis.yourcompany.com/api/auth/callback`

### 2. Lamdis configuration

```env
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com
OIDC_CLIENT_SECRET=your-client-secret
```

> **Note:** Google Workspace doesn't include group claims in ID tokens by default. Role mapping via groups is not available without additional configuration (Directory API).

---

## Testing Your Configuration

After configuring your IdP, verify the setup:

```bash
# Check the setup status
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" \
  http://localhost:3001/setup/status

# Test OIDC discovery
curl https://YOUR_OIDC_ISSUER/.well-known/openid-configuration
```

The setup status endpoint returns:

```json
{
  "bootstrapNeeded": true,
  "oidcConfigured": true,
  "licenseLoaded": true,
  "deploymentMode": "self_hosted",
  "authMode": "oidc"
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "OIDC issuer is required" on API start | Set `OIDC_ISSUER` in your env |
| "JWKS discovery failed" | Verify `OIDC_ISSUER` is correct and accessible from the API container |
| Login redirects but never completes | Check redirect URI matches exactly (including trailing slash) |
| User logs in but has no org access | Run bootstrap or check `OIDC_ROLE_MAP` configuration |
| Groups not appearing in token | Configure group claim in your IdP (see provider-specific steps above) |
