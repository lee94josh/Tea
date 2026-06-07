import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../env';
import type { Storage } from './index';

/** Cloudflare R2 via the S3-compatible API. */
export class R2Storage implements Storage {
  private client: S3Client;
  private bucket = env.storage.r2.bucket;

  constructor() {
    const { accountId, accessKeyId, secretAccessKey } = env.storage.r2;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const bytes = await out.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async url(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
