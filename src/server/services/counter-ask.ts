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
import { readCounterNotice } from "@/server/services/counter-notice";
import { counterTeamFor } from "@/server/services/counter-served";
import { getEnv } from "@/config/env";
import { ASK_JUSTIFICATION } from "@/core/counter/ask-sale";
import { createWithReference } from "@/server/services/references";
import { recordIsDemo } from "@/server/db/demo-scope";

/**
 * « Demander un conseil » sur la bannière du poste, sans scan (fondateur, 22 oct. 2026) : le pharmacien écrit ce que le
 * patient demande (« mal de gorge, adulte »), et les conseils arrivent comme après un bip. Le moteur est celui de la demande
 * spontanée de « Nouvelle vente » (compréhension, règles, stock du jour, sécurité) ; ce module ne fait que présenter sa
 * réponse dans la forme qu'attend la bannière (la même que celle d'une vente bipée, relue par l'agent).
 *
 * Depuis le 23 oct. 2026 (fondateur : « c'est exactement comme le scan »), une demande qui trouve des conseils ouvre une VRAIE
 * vente sur le comptoir (`openAskSale`) : les conseils y sont enregistrés, le produit bipé ensuite passe en « Vendu », la vente
 * validée dans LGPI, « Qui a servi ce patient ? » et l'e-mail du bilan suivent comme après un scan. Sans conseil (ou hors d'un
 * poste de caisse), la réponse reste une simple demande (`demande-…`), sans vente.
 */

export const ASK_PREFIX = "demande-";
export const ASK_MAX_CHARS = 300;
export type AskPost = { id: string; label: string; ownerId: string | null };

/**
 * La vente du comptoir ouverte par une demande : sans boîte, déjà analysée, ses conseils enregistrés comme ceux d'une vente
 * bipée (origine MANUAL : une nouvelle analyse, après une boîte bipée, ne les efface pas). La personne attribuée au comptoir
 * la reçoit, comme une vente bipée.
 */
export async function openAskSale(params: { scope: TenantScope; pharmacyIsDemo: boolean; post: AskPost; text: string; answer: CounterRequestAnswer }): Promise<string> {
  const { scope, post, text, answer } = params;
  const proposals = answer.proposals.slice(0, 3);
  const sale = await createWithReference("prescription", scope.pharmacyId, (candidate) =>
    prisma.prescription.create({
      data: {
        pharmacyId: scope.pharmacyId,
        reference: candidate,
        status: "ANALYZED",
        source: "COUNTER_SCAN",
        counterPost: post.label.slice(0, 60) || "poste",
        counterPostId: post.id,
        handledByUserId: post.ownerId,
        createdByUserId: scope.userId,
        isDemo: recordIsDemo(params.pharmacyIsDemo),
        recommendations: {
          create: proposals.map((proposal, index) => ({
            pharmacyId: scope.pharmacyId,
            productId: proposal.productId,
            origin: "MANUAL" as const,
            status: "PROPOSED" as const,
            totalScore: proposals.length - index,
            justification: `${ASK_JUSTIFICATION}${text}`,
            shortReason: proposal.shortReason || null,
            patientReason: proposal.patientReason || null,
            counterScript: proposal.counterScript || null,
            precautions: proposal.precautions,
            vigilances: (proposal.vigilances ?? []) as never,
            unitPriceCents: Math.max(0, proposal.salePriceCents),
          })),
        },
      },
      select: { id: true },
    }),
  );
  return sale.id;
}

export async function askAtCounter(params: { scope: TenantScope; pharmacyIsDemo: boolean; text: string; post?: AskPost }): Promise<{ id: string; body: NoticeBody; sale: boolean }> {
  const text = params.text.replace(/\s+/g, " ").trim().slice(0, ASK_MAX_CHARS);
  const answer = await adviseCounterRequest({ scope: params.scope, pharmacyIsDemo: params.pharmacyIsDemo, input: { text, ageYears: null, isPregnant: false, isBreastfeeding: false, treatments: [] } });
  if (params.post && answer.proposals.length > 0) {
    const id = await openAskSale({ scope: params.scope, pharmacyIsDemo: params.pharmacyIsDemo, post: params.post, text, answer });
    const body = await counterSaleBody(params.scope.pharmacyId, id);
    if (body) return { id, body, sale: true };
  }
  const products = answer.proposals.length
    ? await prisma.product.findMany({
        where: { pharmacyId: params.scope.pharmacyId, id: { in: answer.proposals.map((proposal) => proposal.productId) } },
        select: { id: true, ean: true, salePriceCents: true, purchasePriceCents: true, vatRate: true, stockItem: { select: { quantity: true, alertThreshold: true } } },
      })
    : [];
  return { id: `${ASK_PREFIX}${answer.id}`, body: askNoticeBody(text, answer, products), sale: false };
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

/** La vente telle que le poste la lit après un bip (`/api/agent/conseil`) : l'avis, l'e-mail, l'équipe pour « Qui a servi ». */
export async function counterSaleBody(pharmacyId: string, id: string): Promise<NoticeBody | null> {
  const read = await readCounterNotice(pharmacyId, id);
  if (!read || read.notice.state !== "READY") return null;
  const served = await counterTeamFor(pharmacyId, id).catch(() => ({ team: [], servedBy: null }));
  return { ok: true, ...read.notice, followUp: read.followUp, ...served, url: `${getEnv().APP_URL}/vente/${id}` } as unknown as NoticeBody;
}
