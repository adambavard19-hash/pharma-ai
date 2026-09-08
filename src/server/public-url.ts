import "server-only";
import { networkInterfaces } from "node:os";
import { getEnv } from "@/config/env";

/**
 * L'adresse publique de l'application — celle que le PATIENT ouvre.
 *
 * Un QR code qui contient « http://localhost:3000 » ne mène nulle part depuis
 * un téléphone : c'est ce qui a été constaté au comptoir. La règle, dans
 * l'ordre :
 *
 *   1. `PUBLIC_APP_URL` si elle est renseignée — en production, une adresse
 *      HTTPS publique ; c'est la seule configuration correcte.
 *   2. `APP_URL` si elle n'est pas locale.
 *   3. En développement seulement : l'adresse du poste sur le réseau local
 *      (« http://192.168.x.x:3000 »), qu'un téléphone connecté au même Wi-Fi
 *      peut ouvrir. Elle est signalée comme provisoire à l'écran.
 */
export type PublicBaseUrl = {
  url: string;
  /** `PUBLIC` = configurée · `LAN` = réseau local, provisoire · `LOCAL` = injoignable depuis un téléphone. */
  reach: "PUBLIC" | "LAN" | "LOCAL";
  secure: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function resolvePublicBaseUrl(): PublicBaseUrl {
  const env = getEnv();
  const configured = env.PUBLIC_APP_URL ?? null;
  const candidate = (configured ?? env.APP_URL).replace(/\/$/, "");
  const host = safeHost(candidate);

  if (host && !LOCAL_HOSTS.has(host)) {
    return { url: candidate, reach: configured ? "PUBLIC" : isPrivateIp(host) ? "LAN" : "PUBLIC", secure: candidate.startsWith("https://") };
  }

  if (process.env.NODE_ENV !== "production") {
    const lan = firstLanAddress();
    const port = safePort(candidate) ?? "3000";
    if (lan) return { url: `http://${lan}:${port}`, reach: "LAN", secure: false };
  }

  return { url: candidate, reach: "LOCAL", secure: candidate.startsWith("https://") };
}

/** Préfixe une route de l'application avec l'adresse publique. */
export function publicUrl(path: string): string {
  return `${resolvePublicBaseUrl().url}${path.startsWith("/") ? path : `/${path}`}`;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function safePort(url: string): string | null {
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
}

function isPrivateIp(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

function firstLanAddress(): string | null {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && isPrivateIp(entry.address)) return entry.address;
    }
  }
  return null;
}
