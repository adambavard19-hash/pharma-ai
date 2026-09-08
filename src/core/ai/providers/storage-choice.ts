/**
 * Le choix du stockage des ordonnances, décidé par la configuration.
 *
 * Fonction pure, testée : c'est elle qui interdit le dossier local en
 * production. Sur un hébergeur sans disque persistant, ce dossier n'existe
 * pas et chaque dépôt échouait avec un message générique — constaté sur
 * Vercel (« ENOENT: mkdir 'storage' »). Une configuration impossible doit se
 * dire en clair, au démarrage du geste, pas se déguiser en panne passagère.
 */
export type StorageEnv = {
  STORAGE_PROVIDER: "local" | "database" | "s3";
  STORAGE_LOCAL_PATH: string;
  NODE_ENV: "development" | "test" | "production";
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ENDPOINT?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
};

export type StorageChoice =
  | { kind: "local"; basePath: string }
  | { kind: "database" }
  | { kind: "s3"; bucket: string; region: string; endpoint: string | null; accessKeyId: string; secretAccessKey: string }
  | { kind: "misconfigured"; message: string };

export function chooseStorageProvider(env: StorageEnv): StorageChoice {
  switch (env.STORAGE_PROVIDER) {
    case "database":
      return { kind: "database" };
    case "s3": {
      const missing = (["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const).filter((key) => !env[key]);
      if (missing.length > 0) {
        return { kind: "misconfigured", message: `Stockage S3 incomplet : ${missing.join(", ")} manquant(es).` };
      }
      return {
        kind: "s3",
        bucket: env.S3_BUCKET!,
        region: env.S3_REGION!,
        endpoint: env.S3_ENDPOINT ?? null,
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      };
    }
    case "local":
    default:
      if (env.NODE_ENV === "production") {
        return {
          kind: "misconfigured",
          message:
            "Le stockage des ordonnances n'est pas configuré pour la production : STORAGE_PROVIDER vaut « local », or le disque du serveur n'est pas persistant. Choisissez « database » ou « s3 ».",
        };
      }
      return { kind: "local", basePath: env.STORAGE_LOCAL_PATH };
  }
}
