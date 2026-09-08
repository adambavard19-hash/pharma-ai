import "server-only";
import { prisma } from "@/server/db/client";
import type { ProviderInfo, StorageProvider } from "@/core/ai/ports";

/**
 * Stockage des ordonnances dans PostgreSQL.
 *
 * Sans disque persistant ni stockage objet, la base est le seul endroit
 * durable dont dispose l'application — et elle contient déjà les données du
 * patient : l'image n'y est pas plus exposée que le reste. Les photos sont
 * réduites côté navigateur avant envoi (quelques centaines de kilo-octets).
 * La clé commence par l'identifiant de l'officine ; la lecture le vérifie.
 */
export class DatabaseStorageProvider implements StorageProvider {
  readonly info: ProviderInfo = {
    id: "database",
    label: "Base de données",
    capability: "LIVE",
    description: "Les ordonnances sont enregistrées dans la base PostgreSQL de l'application, avec les autres données de l'officine.",
  };

  private pharmacyOf(key: string): string {
    return key.split("/")[0] ?? "";
  }

  async put(key: string, data: Uint8Array, mimeType: string): Promise<{ key: string }> {
    const buffer = Buffer.from(data);
    await prisma.storedFile.upsert({
      where: { key },
      update: { data: buffer, mimeType, size: buffer.length },
      create: { key, pharmacyId: this.pharmacyOf(key), data: buffer, mimeType, size: buffer.length },
    });
    return { key };
  }

  async read(key: string): Promise<Uint8Array | null> {
    const row = await prisma.storedFile.findUnique({ where: { key }, select: { data: true } });
    return row ? new Uint8Array(row.data) : null;
  }

  async getUrl(key: string): Promise<string | null> {
    const exists = await prisma.storedFile.findUnique({ where: { key }, select: { key: true } });
    return exists ? `/api/files/${encodeURIComponent(key)}` : null;
  }

  async delete(key: string): Promise<void> {
    await prisma.storedFile.delete({ where: { key } }).catch(() => undefined);
  }
}
