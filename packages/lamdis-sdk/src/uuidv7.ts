/**
 * UUIDv7 generator — time-sortable, globally unique IDs.
 *
 * Format: tttttttt-tttt-7sss-vrrr-rrrrrrrrrrrr
 *   t = 48-bit Unix timestamp in milliseconds
 *   7 = version nibble
 *   s = 12-bit sub-millisecond random
 *   v = variant bits (10xx)
 *   r = 62 bits of random
 */

const HEX = '0123456789abcdef';

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without Web Crypto (e.g., older Node)
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < length; i++) {
    result += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  }
  return result;
}

/**
 * Generate a UUIDv7 string.
 */
export function uuidv7(): string {
  const now = Date.now();

  // 48-bit timestamp → 12 hex chars
  const tsHex = now.toString(16).padStart(12, '0');

  // 12 bits random for sub-ms uniqueness
  const randA = randomHex(1); // 2 hex chars, we use 3 hex (12 bits)
  const randAExtra = HEX[Math.floor(Math.random() * 16)];

  // 62 bits random
  const randB = randomHex(8); // 16 hex chars

  // Build UUID string
  // tttttttt-tttt-7RRR-vRRR-RRRRRRRRRRRR
  const timeLow = tsHex.slice(0, 8);
  const timeMid = tsHex.slice(8, 12);
  const verRandA = '7' + randA + randAExtra; // version 7 + 12 bits random
  const varRandB = HEX[(parseInt(randB[0], 16) & 0x3) | 0x8] + randB.slice(1, 4); // variant 10xx + 12 bits
  const randC = randB.slice(4, 16); // remaining 48 bits

  return `${timeLow}-${timeMid}-${verRandA}-${varRandB}-${randC}`;
}
