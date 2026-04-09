import * as fs from 'fs';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import { LICENSE_PUBLIC_KEY } from './publicKey.js';
import {
  type LicensePayload,
  COMMUNITY_LICENSE,
} from './licenseTypes.js';

/** Grace period after license expiry before downgrading (14 days in ms) */
const GRACE_PERIOD_MS = 14 * 24 * 60 * 60 * 1000;
/** How often to re-read the license file from disk (5 minutes) */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export class LicenseVerifier {
  private cached: LicensePayload | null = null;
  private lastReadAt = 0;
  private lastError: string | null = null;

  /**
   * Get the current effective license.
   * Re-reads from disk if the cache is stale.
   * Returns COMMUNITY_LICENSE as fallback if anything goes wrong.
   */
  getLicense(): LicensePayload {
    const now = Date.now();
    if (this.cached && now - this.lastReadAt < RECHECK_INTERVAL_MS) {
      return this.cached;
    }
    this.reload();
    return this.cached ?? COMMUNITY_LICENSE;
  }

  /** Whether the license is expired (ignoring grace period) */
  isExpired(): boolean {
    const license = this.getLicense();
    if (license.exp === 0) return true; // community fallback
    return Date.now() > license.exp * 1000;
  }

  /** Whether we are in the grace period after expiry */
  isGracePeriod(): boolean {
    const license = this.getLicense();
    if (license.exp === 0) return false;
    const now = Date.now();
    const expiryMs = license.exp * 1000;
    return now > expiryMs && now <= expiryMs + GRACE_PERIOD_MS;
  }

  /** Days until expiry (negative if expired) */
  daysUntilExpiry(): number {
    const license = this.getLicense();
    if (license.exp === 0) return -Infinity;
    return Math.floor((license.exp * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
  }

  /**
   * Get effective limits — if license is expired beyond grace period,
   * fall back to community limits.
   */
  getEffectiveLicense(): LicensePayload {
    const license = this.getLicense();
    if (this.isExpired() && !this.isGracePeriod()) {
      return COMMUNITY_LICENSE;
    }
    return license;
  }

  /** Last verification error, if any */
  getLastError(): string | null {
    return this.lastError;
  }

  /** Force a re-read from disk */
  reload(): void {
    this.lastReadAt = Date.now();
    const path = env.LAMDIS_LICENSE_PATH;

    if (!path) {
      this.cached = null;
      this.lastError = 'No license path configured';
      return;
    }

    let raw: string;
    try {
      raw = fs.readFileSync(path, 'utf-8').trim();
    } catch (e: any) {
      this.cached = null;
      this.lastError = `Cannot read license file: ${e.message}`;
      console.warn(`[License] ${this.lastError}`);
      return;
    }

    try {
      // Verify the JWT signature using the embedded public key
      const decoded = jwt.verify(raw, LICENSE_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'lamdis.ai',
      }) as LicensePayload;

      this.cached = decoded;
      this.lastError = null;

      // Log warnings for approaching expiry
      const days = this.daysUntilExpiry();
      if (days < 0) {
        console.warn(`[License] License expired ${Math.abs(days)} days ago. Grace period active.`);
      } else if (days <= 30) {
        console.warn(`[License] License expires in ${days} days.`);
      }
    } catch (e: any) {
      this.cached = null;
      this.lastError = `License verification failed: ${e.message}`;
      console.warn(`[License] ${this.lastError}`);
    }
  }
}

/** Singleton license verifier instance */
export const licenseVerifier = new LicenseVerifier();
