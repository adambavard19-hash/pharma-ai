import type { StatusLabel } from "./statuses";

/**
 * La version courante de PharmaBoost Connect (l'agent installé en officine),
 * pour dire d'un coup d'œil quel connecteur ou quel poste est en retard.
 *
 * Doit rester égale à la constante `VERSION` de `agent/src/index.ts` : un test
 * relit le fichier de l'agent et échoue si les deux divergent.
 */
export const LATEST_AGENT_VERSION = "0.9.0";

type ParsedVersion = { core: number[]; prerelease: string | null };

function parseVersion(value: string): ParsedVersion | null {
  const cleaned = value.trim().replace(/^v/i, "");
  if (!cleaned) return null;
  const [corePart, ...rest] = cleaned.split("-");
  const parts = corePart.split(".");
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  return { core: parts.map((part) => Number.parseInt(part, 10)), prerelease: rest.length > 0 ? rest.join("-") : null };
}

/**
 * Compare deux versions « 0.4.1 » : -1 si `a` est plus ancienne, 1 si elle est
 * plus récente, 0 si identiques. Les segments manquants valent 0 (« 0.4 » =
 * « 0.4.0 ») ; une préversion (« 0.4.1-beta ») précède la version finale.
 * Une version illisible est considérée comme plus ancienne que toute autre.
 */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): -1 | 0 | 1 {
  const left = a ? parseVersion(a) : null;
  const right = b ? parseVersion(b) : null;
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  const length = Math.max(left.core.length, right.core.length);
  for (let i = 0; i < length; i += 1) {
    const x = left.core[i] ?? 0;
    const y = right.core[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

export type AgentVersionState = "UNKNOWN" | "UP_TO_DATE" | "OUTDATED" | "AHEAD";

/** Où en est une installation par rapport à la dernière version publiée. */
export function agentVersionState(version: string | null | undefined, latest: string = LATEST_AGENT_VERSION): { state: AgentVersionState } & StatusLabel {
  if (!version || !parseVersion(version)) return { state: "UNKNOWN", label: "Version inconnue", tone: "neutral" };
  const order = compareVersions(version, latest);
  if (order === 0) return { state: "UP_TO_DATE", label: `${version} · à jour`, tone: "success" };
  if (order < 0) return { state: "OUTDATED", label: `${version} · mise à jour ${latest} disponible`, tone: "warning" };
  return { state: "AHEAD", label: `${version} · préversion`, tone: "info" };
}
