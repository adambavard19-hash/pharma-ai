import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ProviderInfo, StorageProvider } from "../ports";

/**
 * Stockage objet compatible S3 : AWS S3, Scaleway Object Storage, OVHcloud,
 * Cloudflare R2… Le choix recommandé pour des ordonnances de vrais patients :
 * un bucket privé chez un hébergeur agréé HDS, en France.
 *
 * Aucun objet n'est public : la lecture passe toujours par l'application
 * (`/api/files/…`), qui vérifie la session et l'officine avant de servir.
 */
export class S3StorageProvider implements StorageProvider {
  readonly info: ProviderInfo;
  private readonly client: S3Client;

  constructor(
    private readonly config: { bucket: string; region: string; endpoint: string | null; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.info = {
      id: "s3",
      label: `Stockage objet (${config.endpoint ? new URL(config.endpoint).host : "AWS S3"})`,
      capability: "LIVE",
      description: `Les ordonnances sont écrites dans le bucket privé « ${config.bucket} », région ${config.region}.`,
    };
  }

  private safe(key: string): string {
    return key.replace(/\.\./g, "").replace(/^\/+/, "");
  }

  async put(key: string, data: Uint8Array, mimeType: string): Promise<{ key: string }> {
    await this.client.send(new PutObjectCommand({ Bucket: this.config.bucket, Key: this.safe(key), Body: data, ContentType: mimeType }));
    return { key };
  }

  async read(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: this.safe(key) }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ?? null;
    } catch {
      return null;
    }
  }

  async getUrl(key: string): Promise<string | null> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.safe(key) }));
      return `/api/files/${encodeURIComponent(key)}`;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.safe(key) })).catch(() => undefined);
  }
}
