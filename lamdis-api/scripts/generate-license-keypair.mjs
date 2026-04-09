#!/usr/bin/env node

/**
 * Lamdis License Keypair Generator
 *
 * Generates an RS256 keypair for license signing.
 * - Private key: used to sign licenses (keep secret!)
 * - Public key: embedded in the API to verify licenses (safe to distribute)
 *
 * Usage:
 *   node scripts/generate-license-keypair.mjs [--out-dir ./keys]
 */

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    args[key] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : 'true';
  }
}

const outDir = resolve(args['out-dir'] || './keys');

console.log('Generating RS256 keypair for license signing...');
console.log('');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

mkdirSync(outDir, { recursive: true });

const privatePath = join(outDir, 'license-private.pem');
const publicPath = join(outDir, 'license-public.pem');

writeFileSync(privatePath, privateKey);
writeFileSync(publicPath, publicKey);

console.log(`  Private key: ${privatePath}`);
console.log(`  Public key:  ${publicPath}`);
console.log('');
console.log('IMPORTANT:');
console.log('  - Keep the PRIVATE key secure (vault, KMS, etc.)');
console.log('  - Copy the PUBLIC key content into:');
console.log('    lamdis-api/src/lib/license/publicKey.ts');
console.log('');
console.log('Public key (copy this into publicKey.ts):');
console.log('');
console.log(publicKey);
