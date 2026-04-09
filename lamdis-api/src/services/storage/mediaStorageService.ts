/**
 * Media Storage Service
 *
 * Abstracted file storage with two backends:
 * - local: writes to LOCAL_STORAGE_PATH (default for Docker Compose / self-hosted)
 * - s3: uses S3-compatible storage (Minio locally, AWS S3 in cloud)
 *
 * Used by: workspace files, media evidence, communication attachments,
 * credential request attachments, tool artifacts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { env } from '../../lib/env.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  key: string;
  sizeBytes: number;
  contentHash: string;
}

export interface DownloadResult {
  data: Buffer;
  contentType?: string;
}

// ---------------------------------------------------------------------------
// Backend interface
// ---------------------------------------------------------------------------

interface StorageBackend {
  upload(key: string, data: Buffer, contentType?: string): Promise<UploadResult>;
  download(key: string): Promise<DownloadResult>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, ttlSeconds: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// Local filesystem backend
// ---------------------------------------------------------------------------

class LocalStorageBackend implements StorageBackend {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
    fs.mkdirSync(this.basePath, { recursive: true });
  }

  private fullPath(key: string): string {
    // Prevent directory traversal
    const resolved = path.resolve(this.basePath, key);
    if (!resolved.startsWith(this.basePath)) {
      throw new Error('Invalid storage key: path traversal detected');
    }
    return resolved;
  }

  async upload(key: string, data: Buffer, _contentType?: string): Promise<UploadResult> {
    const filePath = this.fullPath(key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, data);
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return { key, sizeBytes: data.length, contentHash: hash };
  }

  async download(key: string): Promise<DownloadResult> {
    const filePath = this.fullPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    const data = fs.readFileSync(filePath);
    return { data };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.fullPath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.fullPath(key));
  }

  async getSignedUrl(key: string, _ttlSeconds: number): Promise<string> {
    // Local mode: return a relative path (frontend serves via API proxy)
    return `/api/storage/${key}`;
  }
}

// ---------------------------------------------------------------------------
// S3-compatible backend
// ---------------------------------------------------------------------------

class S3StorageBackend implements StorageBackend {
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private client: any; // lazy loaded

  constructor(bucket: string, region: string, endpoint?: string) {
    this.bucket = bucket;
    this.region = region;
    this.endpoint = endpoint;
  }

  private async getClient() {
    if (!this.client) {
      // Dynamic import to avoid requiring @aws-sdk/client-s3 when in local mode
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: this.region,
        ...(this.endpoint ? {
          endpoint: this.endpoint,
          forcePathStyle: true, // needed for Minio
        } : {}),
      });
    }
    return this.client;
  }

  async upload(key: string, data: Buffer, contentType?: string): Promise<UploadResult> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType || 'application/octet-stream',
    }));
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return { key, sizeBytes: data.length, contentHash: hash };
  }

  async download(key: string): Promise<DownloadResult> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const response = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return {
      data: Buffer.concat(chunks),
      contentType: response.ContentType,
    };
  }

  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, ttlSeconds: number): Promise<string> {
    const client = await this.getClient();
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl: awsGetSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    return awsGetSignedUrl(client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }), { expiresIn: ttlSeconds });
  }
}

// ---------------------------------------------------------------------------
// Singleton storage instance
// ---------------------------------------------------------------------------

let _storage: StorageBackend | null = null;

function getStorage(): StorageBackend {
  if (!_storage) {
    if (env.STORAGE_MODE === 's3') {
      if (!env.S3_BUCKET) throw new Error('S3_BUCKET is required when STORAGE_MODE=s3');
      _storage = new S3StorageBackend(
        env.S3_BUCKET,
        env.S3_REGION || 'us-east-1',
        env.S3_ENDPOINT,
      );
    } else {
      _storage = new LocalStorageBackend(env.LOCAL_STORAGE_PATH);
    }
  }
  return _storage;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload a file to storage.
 * @param key Storage key (e.g., "orgs/abc/evidence/img-123.jpg")
 * @param data File content as Buffer
 * @param contentType MIME type
 */
export async function uploadFile(key: string, data: Buffer, contentType?: string): Promise<UploadResult> {
  return getStorage().upload(key, data, contentType);
}

/**
 * Download a file from storage.
 */
export async function downloadFile(key: string): Promise<DownloadResult> {
  return getStorage().download(key);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<void> {
  return getStorage().delete(key);
}

/**
 * Check if a file exists in storage.
 */
export async function fileExists(key: string): Promise<boolean> {
  return getStorage().exists(key);
}

/**
 * Get a time-limited signed URL for direct download.
 * @param ttlSeconds URL expiry time in seconds (default 3600 = 1 hour)
 */
export async function getSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  return getStorage().getSignedUrl(key, ttlSeconds);
}

/**
 * Generate a storage key for a given resource.
 */
export function storageKey(orgId: string, ...segments: string[]): string {
  return ['orgs', orgId, ...segments].join('/');
}
