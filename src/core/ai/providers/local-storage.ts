import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderInfo, StorageProvider } from "../ports";

/**
 * Stockage local — DÉVELOPPEMENT UNIQUEMENT.
 *
 * Les ordonnances importées sont des données de santé : en production, elles
 * doivent être stockées chez un hébergeur agréé HDS, chiffrées, avec une durée
 * de conservation définie (voir docs/RGPD.md). Ce fournisseur écrit dans un
 * dossier local exclu du dépôt Git.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly info: ProviderInfo = {
    id: "local",
    label: "Stockage local (développement)",
    capability: "LIVE",
    description:
      "Écrit les fichiers dans un dossier local. À remplacer par un hébergement agréé HDS avant toute utilisation avec des données réelles.",
  };

  constructor(private readonly basePath: string) {}

  private resolve(key: string): string {
    // Empêche toute remontée de répertoire via une clé forgée.
    const safeKey = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return path.join(this.basePath, safeKey);
  }

  // Le type MIME fait partie du contrat du port : il est requis par les
  // implémentations distantes (S3, HDS) mais inutile pour un écrit local.
  async put(key: string, data: Uint8Array, mimeType: string): Promise<{ key: string }> {
    void mimeType;
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return { key };
  }

  async getUrl(key: string): Promise<string | null> {
    try {
      await readFile(this.resolve(key));
      return `/api/files/${encodeURIComponent(key)}`;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}
