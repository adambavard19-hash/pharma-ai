import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { adviseCounterRequest, type CounterRequestAnswer } from "@/server/services/counter-request";
import { counterSheetOf } from "@/core/counter/advice-sheet";
import { rangeOf } from "@/core/catalog/product-ranges";
import { unitMarginHt } from "@/core/catalog/margin";
import { studioPhotoUrl } from "@/core/catalog/studio-photo";
import { availabilityOf } from "@/core/counter/notice";
import type { NoticeBody } from "../../../agent/src/notice-center";

/**
 * « Demander un conseil » sur la bannière du poste, sans scan (fondateur, 22 oct. 2026) : le pharmacien écrit ce que le
 * patient demande (« mal de gorge, adulte »), et les conseils arrivent comme après un bip. Le moteur est celui de la demande
 * spontanée de « Nouvelle vente » (compréhension, règles, stock du jour, sécurité) ; ce module ne fait que présenter sa
 * réponse dans la forme qu'attend la bannière (la même que celle d'une vente bipée, relue par l'agent).
 *
 * La vente n'existe pas encore : l'identifiant est celui de la demande (`demande-…`). La bannière n'envoie ni Vendu ni
 * Non vendu pour elle ; le produit choisi, une fois bipé, ouvre une vraie vente comme d'habitude.
 */

export const ASK_PREFIX = "demande-";
export const ASK_MAX_CHARS = 300;

export async function askAtCounter(params: { scope: TenantScope; pharmacyIsDemo: boolean; text: string }): Promise<{ id: string; body: NoticeBody }> {
  const text = params.text.replace(/\s+/g, " ").trim().slice(0, ASK_MAX_CHARS);
  const answer = await adviseCounterRequest({ scope: params.scope, pharmacyIsDemo: params.pharmacyIsDemo, input: { text, ageYears: null, isPregnant: false, isBreastfeeding: false, treatments: [] } });
  const products = answer.proposals.length
    ? await prisma.product.findMany({
        where: { pharmacyId: params.scope.pharmacyId, id: { in: answer.proposals.map((proposal) => proposal.productId) } },
        select: { id: true, ean: true, salePriceCents: true, purchasePriceCents: true, vatRate: true, stockItem: { select: { quantity: true, alertThreshold: true } } },
      })
    : [];
  return { id: `${ASK_PREFIX}${answer.id}`, body: askNoticeBody(text, answer, products) };
}

type ProductRow = { id: string; ean: string | null; salePriceCents: number; purchasePriceCents: number; vatRate: number | null; stockItem: { quantity: number; alertThreshold: number | null } | null };

/** La réponse du moteur, dans la forme d'une vente bipée : trois conseils au plus, leur fiche, les questions à poser. */
export function askNoticeBody(text: string, answer: CounterRequestAnswer, products: ProductRow[]): NoticeBody {
  const byId = new Map(products.map((product) => [product.id, product]));
  const items = answer.proposals.slice(0, 3).map((proposal) => {
    const row = byId.get(proposal.productId);
    const range = rangeOf(proposal.name);
    const margin = row ? unitMarginHt(row) : null;
    // Un prix sous le prix d'achat est un fichier mal lu : ni prix ni marge plutôt qu'un chiffre faux.
    const priceTrusted = !margin || margin.marginCents >= 0;
    const name = range?.name ?? proposal.name;
    const sheet = counterSheetOf(
      { shortReason: proposal.shortReason, counterScript: proposal.counterScript, patientReason: proposal.patientReason, precautions: proposal.precautions, vigilances: proposal.vigilances ?? [], routine: null, opportunity: null, product: null },
      name,
    );
    const ask = [...new Set([proposal.question, ...answer.questions].filter((question): question is string => Boolean(question)))].slice(0, 2);
    return {
      id: proposal.productId,
      drug: null,
      challenge: null,
      shortDateOn: proposal.shortDate?.expiresOn ?? null,
      outcome: "NONE",
      name,
      priceCents: priceTrusted && proposal.salePriceCents > 0 ? proposal.salePriceCents : null,
      marginCents: priceTrusted && margin && margin.marginCents > 0 ? margin.marginCents : null,
      reason: proposal.shortReason || null,
      availability: availabilityOf(row?.stockItem?.quantity ?? proposal.stockQuantity, row?.stockItem?.alertThreshold ?? null, true),
      quantity: row?.stockItem?.quantity ?? proposal.stockQuantity ?? null,
      imageUrl: studioPhotoUrl(row?.ean ?? null),
      sheet: { ...sheet, ...(range ? { name: range.name, description: range.posology.join(" ") } : {}), ...(ask.length ? { ask } : {}), ...(proposal.counterScript ? { pitch: proposal.counterScript } : {}) },
    };
  });
  const alerts = answer.referToDoctor ? [`Orienter vers le médecin${answer.referReason ? ` : ${answer.referReason}` : "."}`] : [];
  return {
    ok: true,
    state: "READY",
    title: "Demande du comptoir",
    subject: text,
    alerts,
    advice: items.length === 0 && alerts.length === 0 ? ["Aucun produit conseil du stock ne répond à cette demande."] : [],
    signature: `${answer.id}:${items.length}`,
    detectedLabel: "Demande",
    items,
  };
}
