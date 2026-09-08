import "server-only";
import { prisma } from "@/server/db/client";

/** Identifiant d'URL stable, dérivé du nom. Unicité garantie par suffixe. */
export async function uniqueSlug(base: string, kind: "pharmacy" | "organization"): Promise<string> {
  const root =
    base
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || kind;

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`;
    const taken =
      kind === "pharmacy"
        ? await prisma.pharmacy.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await prisma.organization.findUnique({
            where: { slug: candidate },
            select: { id: true },
          });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
