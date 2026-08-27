import "server-only";
import { prisma } from "@/server/db/client";
import type { InstallState } from "@/core/install/types";

/**
 * Sonde l'état d'installation, à l'affichage de l'écran de connexion.
 *
 * Sans ce diagnostic, une base vide ou injoignable se traduisait par un
 * laconique « Identifiants incorrects » : rien n'indiquait que le problème
 * n'était pas le mot de passe. On distingue donc les trois situations, et
 * chacune porte la commande qui la corrige.
 *
 * Aucune information sensible n'est divulguée : une base sans aucun compte n'a
 * rien à protéger, et l'existence d'un compte précis n'est jamais révélée.
 */
export async function getInstallState(): Promise<InstallState> {
  try {
    const userCount = await prisma.user.count({ where: { deletedAt: null } });
    return userCount > 0 ? { status: "READY", userCount } : { status: "NO_ACCOUNTS" };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const cause =
      error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
    const haystack = `${raw}\n${cause}`;

    // Tables absentes : le schéma n'a jamais été appliqué.
    if (
      /relation .* does not exist|P2021|does not exist in the current database/i.test(
        haystack,
      )
    ) {
      return { status: "NO_SCHEMA" };
    }

    const lines = haystack
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !/^Invalid `/.test(line));
    const SIGNIFICANT =
      /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|authentication|password|does not exist|Can't reach|timeout/i;
    const detail =
      lines.find((line) => SIGNIFICANT.test(line)) ??
      lines[lines.length - 1] ??
      "PostgreSQL ne répond pas";

    return { status: "NO_DATABASE", detail };
  }
}

export type { InstallState };
