/**
 * RSA public key used to verify license file signatures.
 *
 * This key is safe to distribute — only the corresponding private key
 * (held securely by Lamdis in a key vault) can sign valid licenses.
 *
 * TODO: Replace this placeholder with the actual production public key
 * before the first self-hosted release.
 */
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
REPLACE_WITH_ACTUAL_PUBLIC_KEY
-----END PUBLIC KEY-----`;
