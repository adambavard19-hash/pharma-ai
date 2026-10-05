import { fail, type ActionResult } from "@/server/actions/types";

type Saved = { ok: true; id: string } | { ok: false; error: string };

type Confirmation = { id: string; confirmedCount: number; confirmation: string };

/**
 * Le geste qui part vraiment : « envoyer » ou « programmer ». Séparé de la
 * fenêtre pour pouvoir être testé, et pour que ce qui compte soit écrit une
 * seule fois : le brouillon est enregistré d'abord (un échec arrête tout, son
 * message est celui de l'action), le nombre confirmé est celui que l'écran a
 * recalculé (jamais un nombre inventé), et le mot retapé voyage jusqu'au
 * serveur, qui le revérifie.
 */
export async function submitCampaign(
  input: {
    mode: "send" | "schedule";
    campaignId: string | null;
    /** Depuis l'assistant : enregistre le brouillon, et rend son identifiant. */
    ensureSaved?: () => Promise<Saved>;
    /** Le nombre de destinataires affiché, ou `null` s'il n'a pas pu être calculé. */
    count: number | null;
    /** « AAAA-MM-JJ » : le jour d'une programmation. */
    day: string;
    typed: string;
  },
  actions: {
    start: (payload: Confirmation) => Promise<ActionResult<unknown>>;
    schedule: (payload: Confirmation & { date: string }) => Promise<ActionResult<unknown>>;
  },
): Promise<{ result: ActionResult<unknown>; id: string | null }> {
  const saved: Saved = input.ensureSaved ? await input.ensureSaved() : input.campaignId ? { ok: true, id: input.campaignId } : { ok: false, error: "Campagne introuvable." };
  if (!saved.ok) return { result: fail(saved.error), id: null };
  if (input.count === null) return { result: fail("Le nombre de destinataires n'est pas calculé : rouvrez la fenêtre pour le recalculer."), id: saved.id };
  const confirmation = { id: saved.id, confirmedCount: input.count, confirmation: input.typed };
  const result = input.mode === "send" ? await actions.start(confirmation) : await actions.schedule({ ...confirmation, date: input.day });
  return { result, id: saved.id };
}
