import "server-only";
import { z } from "zod";

/**
 * Validation de la configuration serveur au démarrage.
 *
 * Aucune de ces valeurs n'est exposée au client : ce module importe
 * `server-only`, ce qui fait échouer la compilation si un composant client
 * tente de l'importer. Les clés d'API restent donc strictement côté serveur.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  AUTH_SESSION_SECRET: z
    .string()
    .min(32, "AUTH_SESSION_SECRET doit faire au moins 32 caractères"),
  DATA_ENCRYPTION_KEY: z
    .string()
    .min(16, "DATA_ENCRYPTION_KEY est requis (32 octets encodés en base64)"),

  DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  AI_PROVIDER: z.enum(["mock", "anthropic", "openai"]).default("mock"),
  OCR_PROVIDER: z.enum(["mock", "anthropic", "openai", "tesseract"]).default("mock"),
  DRUG_KNOWLEDGE_PROVIDER: z.enum(["local-demo", "bdpm", "custom"]).default("local-demo"),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Envoi de la fiche patient et des suivis. « none » est un choix valide et
  // assumé : l'officine remet alors la fiche par impression ou QR code, et
  // l'application ne prétend jamais avoir envoyé quoi que ce soit.
  EMAIL_PROVIDER: z.enum(["none", "resend", "smtp"]).default("none"),
  SMS_PROVIDER: z.enum(["none", "twilio"]).default("none"),
  /** Expéditeur affiché, ex. « Pharmacie X <contact@pharmacie-x.fr> ». */
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
  /** TLS implicite (port 465). Par défaut STARTTLS, qui reste chiffré. */
  SMTP_SECURE: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuration serveur invalide. Vérifiez votre fichier .env :\n${details}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** `true` lorsque l'application tourne sur le jeu de données de démonstration. */
export function isDemoMode(): boolean {
  return getEnv().DEMO_MODE;
}
