import "server-only";
import { prisma } from "@/server/db/client";
import type { ProspectEventType } from "@/generated/prisma";

/** Qui agit sur un dossier. */
export type SalesActor =
  | { type: "SALES"; id: string; label: string }
  | { type: "ADMIN"; id: string; label: string }
  | { type: "SYSTEM"; id?: null; label: string }
  | { type: "SIGNER"; id?: null; label: string };

export async function recordProspectEvent(params: { prospectId: string; type: ProspectEventType; summary: string; actor: SalesActor; metadata?: Record<string, unknown> }): Promise<void> {
  await prisma.prospectEvent.create({
    data: {
      prospectId: params.prospectId,
      type: params.type,
      summary: params.summary,
      actorType: params.actor.type,
      actorId: params.actor.id ?? null,
      actorLabel: params.actor.label,
      metadata: (params.metadata ?? {}) as never,
    },
  });
}
