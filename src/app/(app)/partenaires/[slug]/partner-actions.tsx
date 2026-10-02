"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare, Search, ShoppingCart } from "lucide-react";
import { openPartnerLinkAction, placePartnerOrderAction, requestPartnerContactAction } from "@/server/actions/partners";
import type { IntegrationMode } from "@/core/partners/status";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export type ActionProduct = { id: string; name: string; code: string | null; packaging: string | null; proPriceCents: number | null; rangeName: string | null };
export type ActionIntegration = { mode: IntegrationMode; linkReady: boolean; canOrder: boolean } | null;
type Source = "COUNTER_CARD" | "CATALOG" | "BRAND_PAGE";

type Ack = { tone: "success" | "info" | "warning"; title: string; code: string; url?: string };

/** Ce que reçoit le laboratoire — et rien d'autre : jamais de patient, d'ordonnance ni de conseil. */
const SHARED_WITH_PARTNER =
  "Le laboratoire reçoit le nom de l'officine, sa ville, son FINESS, son e-mail et son téléphone, et l'identifiant d'attribution PharmaBoost. Jamais de patient, d'ordonnance ni de conseil.";

/** Comment ce partenaire reçoit les demandes, dit du point de vue de l'officine. */
function howItWorks(integration: ActionIntegration): string {
  if (!integration) return "Ce laboratoire n'a pas encore de canal de commande relié à PharmaBoost. Vous pouvez lui demander un contact.";
  switch (integration.mode) {
    case "API":
      return "Commande directe : en attente de l'API du partenaire. En attendant, vous pouvez lui demander un contact.";
    case "B2B_LINK":
      return integration.linkReady
        ? "Commandez sur le portail professionnel du laboratoire. Le lien porte l'identifiant d'attribution PharmaBoost."
        : "Le portail professionnel de ce laboratoire n'est pas encore utilisable depuis PharmaBoost. Vous pouvez lui demander un contact.";
    case "FORM":
      return integration.linkReady
        ? "Le formulaire du laboratoire s'ouvre dans un nouvel onglet. Reportez-y l'identifiant d'attribution affiché ici."
        : "Le formulaire de ce laboratoire n'est pas encore utilisable depuis PharmaBoost. Vous pouvez lui demander un contact.";
    case "EMAIL":
      return integration.canOrder
        ? "Votre commande est envoyée par e-mail au contact commandes du laboratoire, avec l'identifiant d'attribution."
        : "Aucun produit n'est encore publié : la commande n'est pas possible pour l'instant.";
    case "IMPORT_EXPORT":
    case "MANUAL":
      return integration.canOrder
        ? "Votre commande est enregistrée ici, puis transmise au laboratoire par l'équipe PharmaBoost."
        : "Aucun produit n'est encore publié : la commande n'est pas possible pour l'instant.";
  }
}

/**
 * Contacter le laboratoire, ouvrir son portail ou son formulaire, ou lui
 * commander — selon sa première intégration active. Réservé au titulaire : la
 * page ne rend ce composant qu'avec PARTNERS_MANAGE, et chaque action le
 * revérifie côté serveur.
 */
export function PartnerActions({
  brandId,
  brandName,
  partnerName,
  source,
  universe,
  integration,
  products,
  contactDefaults,
}: {
  brandId: string;
  brandName: string;
  partnerName: string;
  source: Source;
  universe: string | null;
  integration: ActionIntegration;
  products: ActionProduct[];
  contactDefaults: { name: string; email: string; phone: string };
}) {
  const [contactOpen, setContactOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [ack, setAck] = useState<Ack | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const mode = integration?.mode ?? null;
  const canOpenLink = (mode === "B2B_LINK" || mode === "FORM") && integration?.linkReady === true;
  const canOrder = (mode === "EMAIL" || mode === "IMPORT_EXPORT" || mode === "MANUAL") && integration?.canOrder === true;

  const openLink = () => {
    // L'onglet s'ouvre dans le geste de l'utilisateur (sinon le navigateur le bloque), puis reçoit le lien attribué.
    const popup = window.open("", "_blank");
    start(async () => {
      const result = await openPartnerLinkAction({ brandId, source, universe });
      if (!result.ok) {
        popup?.close();
        push({ tone: "error", title: result.error });
        return;
      }
      if (popup) {
        popup.opener = null;
        popup.location.href = result.data.url;
      }
      setAck({
        tone: "info",
        title: result.data.kind === "FORM_OPENED" ? "Formulaire ouvert dans un nouvel onglet. Reportez-y cet identifiant :" : "Portail ouvert dans un nouvel onglet, avec cet identifiant :",
        code: result.data.code,
        url: result.data.url,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-text-secondary">{howItWorks(integration)}</p>

      <div className="flex flex-col gap-2">
        {canOrder && (
          <Button leadingIcon={<ShoppingCart className="size-4" />} onClick={() => setOrderOpen(true)}>
            Commander
          </Button>
        )}
        {canOpenLink && (
          <Button leadingIcon={<ExternalLink className="size-4" />} loading={pending} onClick={openLink}>
            {mode === "FORM" ? "Ouvrir le formulaire" : "Ouvrir le portail B2B"}
          </Button>
        )}
        <Button variant={canOrder || canOpenLink ? "outline" : "primary"} leadingIcon={<MessageSquare className="size-4" />} onClick={() => setContactOpen(true)}>
          Demander un contact
        </Button>
      </div>

      {ack && (
        <Alert tone={ack.tone} title={ack.title}>
          <p className="font-mono text-[14px] font-semibold tracking-wide text-text-primary">{ack.code}</p>
          {ack.url && (
            <a href={ack.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
              L&apos;onglet ne s&apos;est pas ouvert ? Ouvrir le lien
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </Alert>
      )}

      {contactOpen && (
        <ContactModal
          brandId={brandId}
          brandName={brandName}
          partnerName={partnerName}
          source={source}
          universe={universe}
          defaults={contactDefaults}
          onClose={() => setContactOpen(false)}
          onDone={(next) => {
            setContactOpen(false);
            setAck(next);
            router.refresh();
          }}
        />
      )}

      {orderOpen && mode && canOrder && (
        <OrderModal
          brandId={brandId}
          brandName={brandName}
          partnerName={partnerName}
          mode={mode}
          source={source}
          universe={universe}
          products={products}
          onClose={() => setOrderOpen(false)}
          onDone={(next) => {
            setOrderOpen(false);
            setAck(next);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ContactModal({
  brandId,
  brandName,
  partnerName,
  source,
  universe,
  defaults,
  onClose,
  onDone,
}: {
  brandId: string;
  brandName: string;
  partnerName: string;
  source: Source;
  universe: string | null;
  defaults: { name: string; email: string; phone: string };
  onClose: () => void;
  onDone: (ack: Ack) => void;
}) {
  const [name, setName] = useState(defaults.name);
  const [email, setEmail] = useState(defaults.email);
  const [phone, setPhone] = useState(defaults.phone);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const { push } = useToast();

  const submit = () => {
    start(async () => {
      const result = await requestPartnerContactAction({ brandId, source, universe, contactName: name, contactEmail: email, contactPhone: phone, message });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: "success", title: result.message ?? "Demande enregistrée." });
      onDone({ tone: result.data.transmitted ? "success" : "info", title: `${result.message ?? "Demande enregistrée."} Identifiant d'attribution :`, code: result.data.code });
    });
  };

  return (
    <Modal
      open
      onClose={() => (pending ? undefined : onClose())}
      title={`Demander un contact — ${brandName}`}
      description={`${partnerName} vous recontacte par e-mail ou par téléphone.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button loading={pending} onClick={submit}>
            Envoyer la demande
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Personne à contacter" htmlFor="contact-nom" required error={errors.contactName}>
          <Input id="contact-nom" value={name} maxLength={120} autoComplete="name" onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(errors.contactName)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="E-mail" htmlFor="contact-email" error={errors.contactEmail}>
            <Input id="contact-email" type="email" value={email} maxLength={160} autoComplete="email" onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(errors.contactEmail)} />
          </Field>
          <Field label="Téléphone" htmlFor="contact-tel" error={errors.contactPhone}>
            <Input id="contact-tel" type="tel" value={phone} maxLength={30} autoComplete="tel" onChange={(event) => setPhone(event.target.value)} aria-invalid={Boolean(errors.contactPhone)} />
          </Field>
        </div>
        <Field label="Message (facultatif)" htmlFor="contact-message" hint="Sans aucune information patient. 1 000 caractères au plus." error={errors.message}>
          <Textarea
            id="contact-message"
            value={message}
            maxLength={1000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Par exemple : nous souhaitons une présentation de la gamme et les conditions d'ouverture de compte."
          />
        </Field>
        <p className="text-[12.5px] leading-5 text-text-tertiary">{SHARED_WITH_PARTNER} Il reçoit aussi la personne à contacter et votre message.</p>
      </form>
    </Modal>
  );
}

function OrderModal({
  brandId,
  brandName,
  partnerName,
  mode,
  source,
  universe,
  products,
  onClose,
  onDone,
}: {
  brandId: string;
  brandName: string;
  partnerName: string;
  mode: IntegrationMode;
  source: Source;
  universe: string | null;
  products: ActionProduct[];
  onClose: () => void;
  onDone: (ack: Ack) => void;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const { push } = useToast();

  const lines = useMemo(
    () =>
      products
        .map((product) => ({ product, quantity: Number.parseInt(quantities[product.id] ?? "", 10) }))
        .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0),
    [products, quantities],
  );
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  // Le montant n'est donné que si chaque prix professionnel est connu : jamais un total partiel présenté comme complet.
  const total = lines.length > 0 && lines.every((line) => line.product.proPriceCents !== null) ? lines.reduce((sum, line) => sum + (line.product.proPriceCents ?? 0) * line.quantity, 0) : null;

  const needle = query.trim().toLowerCase();
  const shown = needle ? products.filter((product) => `${product.name} ${product.code ?? ""} ${product.rangeName ?? ""}`.toLowerCase().includes(needle)) : products;

  const submit = () => {
    if (lines.length === 0) {
      push({ tone: "error", title: "Indiquez au moins une quantité." });
      return;
    }
    start(async () => {
      const result = await placePartnerOrderAction({
        brandId,
        source,
        universe,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        note,
      });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        return;
      }
      const status = result.data.status;
      push({ tone: status === "FAILED" ? "warning" : "success", title: result.message ?? "Commande enregistrée." });
      onDone({
        tone: status === "FAILED" ? "warning" : status === "SUBMITTED" ? "info" : "success",
        title: `${result.message ?? "Commande enregistrée."} Identifiant d'attribution :`,
        code: result.data.code,
      });
    });
  };

  return (
    <Modal
      open
      size="lg"
      onClose={() => (pending ? undefined : onClose())}
      title={`Commander — ${brandName}`}
      description={mode === "EMAIL" ? `Envoyée par e-mail à ${partnerName}.` : `Enregistrée ici, transmise à ${partnerName} par l'équipe PharmaBoost.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button loading={pending} disabled={lines.length === 0} onClick={submit}>
            {mode === "EMAIL" ? "Envoyer la commande" : "Enregistrer la commande"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {products.length > 10 && (
          <Input leadingIcon={<Search className="size-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un produit…" aria-label="Rechercher un produit" />
        )}

        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {shown.map((product) => {
            const quantity = Number.parseInt(quantities[product.id] ?? "", 10);
            const lineTotal = Number.isInteger(quantity) && quantity > 0 && product.proPriceCents !== null ? product.proPriceCents * quantity : null;
            return (
              <li key={product.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-5 font-medium break-words text-text-primary">{product.name}</p>
                  <p className="truncate text-[12px] text-text-tertiary">
                    {[product.rangeName, product.packaging, product.code, product.proPriceCents !== null ? `${formatCents(product.proPriceCents)} HT` : "prix pro à confirmer"].filter(Boolean).join(" · ")}
                  </p>
                  {lineTotal !== null && <p className="text-[12px] text-text-secondary tabular">= {formatCents(lineTotal)} HT</p>}
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={9999}
                  step={1}
                  value={quantities[product.id] ?? ""}
                  onChange={(event) => setQuantities((current) => ({ ...current, [product.id]: event.target.value.replace(/[^\d]/g, "").slice(0, 4) }))}
                  placeholder="0"
                  className="w-20 shrink-0 text-right tabular"
                  aria-label={`Quantité — ${product.name}`}
                />
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-text-secondary">Aucun produit ne correspond.</li>}
        </ul>

        <div className="rounded-lg bg-surface-sunken px-3.5 py-2.5 text-[13px] text-text-primary">
          {lines.length === 0 ? (
            <span className="text-text-secondary">Aucune quantité saisie.</span>
          ) : (
            <span className="tabular">
              {lines.length} produit{lines.length > 1 ? "s" : ""} · {units} unité{units > 1 ? "s" : ""} ·{" "}
              {total !== null ? <strong>{formatCents(total)} HT</strong> : <span className="text-text-secondary">montant à confirmer par le laboratoire (prix professionnel manquant)</span>}
            </span>
          )}
        </div>

        <Field label="Note pour le laboratoire (facultatif)" htmlFor="commande-note" hint="Livraison, conditionnement… Sans aucune information patient. 1 000 caractères au plus.">
          <Textarea id="commande-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} />
        </Field>

        <p className="text-[12.5px] leading-5 text-text-tertiary">{SHARED_WITH_PARTNER} Il reçoit aussi les lignes, le montant et votre note.</p>
      </div>
    </Modal>
  );
}
