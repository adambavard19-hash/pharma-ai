import { describe, expect, it } from "vitest";
import { chooseStorageProvider, type StorageEnv } from "../storage-choice";

const base: StorageEnv = { STORAGE_PROVIDER: "local", STORAGE_LOCAL_PATH: "./storage", NODE_ENV: "development" };

describe("choix du stockage des ordonnances", () => {
  it("accepte le dossier local en développement", () => {
    expect(chooseStorageProvider(base)).toEqual({ kind: "local", basePath: "./storage" });
  });

  it("refuse le dossier local en production, avec le motif exact", () => {
    const choice = chooseStorageProvider({ ...base, NODE_ENV: "production" });
    expect(choice.kind).toBe("misconfigured");
    if (choice.kind === "misconfigured") expect(choice.message).toContain("STORAGE_PROVIDER");
  });

  it("retient la base de données quand elle est demandée, quel que soit l'environnement", () => {
    expect(chooseStorageProvider({ ...base, STORAGE_PROVIDER: "database", NODE_ENV: "production" })).toEqual({ kind: "database" });
  });

  it("exige les quatre variables S3 et nomme celles qui manquent", () => {
    const choice = chooseStorageProvider({ ...base, STORAGE_PROVIDER: "s3", S3_BUCKET: "ordonnances" });
    expect(choice.kind).toBe("misconfigured");
    if (choice.kind === "misconfigured") expect(choice.message).toContain("S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    expect(
      chooseStorageProvider({ ...base, STORAGE_PROVIDER: "s3", S3_BUCKET: "b", S3_REGION: "fr-par", S3_ENDPOINT: "https://s3.fr-par.scw.cloud", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" }),
    ).toEqual({ kind: "s3", bucket: "b", region: "fr-par", endpoint: "https://s3.fr-par.scw.cloud", accessKeyId: "k", secretAccessKey: "s" });
  });
});
