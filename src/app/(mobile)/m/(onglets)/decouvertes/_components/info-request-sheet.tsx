"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, MessageSquareText, ShieldCheck, X } from "lucide-react";
import { requestInfoAction } from "@/server/actions/mobile-discover";
import { infoRequestConsentText, INFO_REQUEST_MESSAGE_MAX, sharedLines, type InfoRequestShared } from "@/core/discover/content";
import type { SponsoredPlacement } from "@/core/sponsoring/campaign";
import { cn } from "@/lib/utils";

const SHEET_KEYFRAMES = "@keyframes pbd-fade{from{opacity:0}to{opacity:1}}@keyframes pbd-sheet{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}";

/**
 * « Demander des informations » : une feuille qui dit EXACTEMENT ce qui sera transmis à la marque, avec une case
 * d'accord jamais cochée d'avance. Le texte affiché à côté de la case est celui que le serveur enregistre comme preuve.
 */
export function InfoRequestSheet({
  brand,
  person,
  pharmacyNameAvailable,
  launchId = null,
  campaign = null,
  triggerClassName,
  triggerLabel = "Demander des informations",
}: {
  brand: { id: string; name: string; partnerName: string };
  person: Omit<InfoRequestShared, "pharmacyName">;
  pharmacyNameAvailable: string | null;
  launchId?: string | null;
  campaign?: { campaignId: string; placement: SponsoredPlacement } | null;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includePharmacy, setIncludePharmacy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleId = useId();
  const consentId = useId();
  const messageId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const shared: InfoRequestShared = { ...person, pharmacyName: includePharmacy ? pharmacyNameAvailable : null };
  const hasMessage = message.trim().length > 0;
  const consentText = infoRequestConsentText({ brandName: brand.name, partnerName: brand.partnerName, shared, hasMessage });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Changer ce qui est transmis change le texte de l'accord : on demande de cocher à nouveau.
  const changeShared = (apply: () => void) => {
    apply();
    setConsent(false);
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const submit = () => {
    setError(null);
    setConsentError(null);
    if (!consent) {
      setConsentError("Cochez la case pour accepter la transmission : sans cet accord, rien n'est envoyé.");
      return;
    }
    start(async () => {
      const result = await requestInfoAction({
        brandId: brand.id,
        launchId,
        message: hasMessage ? message : null,
        includePharmacy,
        consent,
        consentText,
        campaignId: campaign?.campaignId ?? null,
        placement: campaign?.placement ?? null,
      });
      if (!result.ok) {
        if (result.fieldErrors?.consent) {
          setConsent(false);
          setConsentError(result.fieldErrors.consent);
        } else setError(result.error);
        return;
      }
      setDone(result.message ?? "Demande envoyée.");
    });
  };

  const reset = () => {
    setMessage("");
    setConsent(false);
    setIncludePharmacy(false);
    setDone(null);
    setError(null);
    setConsentError(null);
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-brand-gradient px-5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-12px_oklch(0.42_0.08_180/0.9)] transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
          triggerClassName,
        )}
      >
        <MessageSquareText className="size-[18px]" aria-hidden="true" />
        {triggerLabel}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <style>{SHEET_KEYFRAMES}</style>
          <button type="button" aria-label="Fermer" tabIndex={-1} className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] motion-safe:animate-[pbd-fade_0.2s_ease-out]" onClick={close} />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-2xl outline-none motion-safe:animate-[pbd-sheet_0.32s_cubic-bezier(0.16,1,0.3,1)] sm:max-w-lg sm:rounded-[28px] sm:p-7"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-200 sm:hidden" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[12.5px] font-semibold text-brand-700">{brand.partnerName}</p>
                <h2 id={titleId} className="text-[21px] leading-tight font-bold tracking-[-0.02em] text-ink-950">
                  {done ? "C'est envoyé" : `Demander des informations à ${brand.name}`}
                </h2>
              </div>
              <button type="button" onClick={close} className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 active:bg-ink-50" aria-label="Fermer">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div aria-live="polite">
              {done ? (
                <div className="space-y-5 pt-4">
                  <div className="flex items-start gap-3 rounded-2xl bg-success-50 p-4 text-success-800">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    <p className="text-[14.5px] leading-6">{done}</p>
                  </div>
                  <p className="text-[13px] leading-5 text-text-secondary">La marque vous répondra directement par e-mail. Seules les informations listées ont été transmises.</p>
                  <button type="button" onClick={close} className="min-h-12 w-full rounded-full bg-ink-900 text-[15px] font-semibold text-white active:scale-[0.99]">
                    Fermer
                  </button>
                </div>
              ) : (
                <div className="space-y-5 pt-4">
                  <section className="space-y-2 rounded-2xl bg-ink-50 p-4">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-ink-800">
                      <ShieldCheck className="size-4 text-brand-700" aria-hidden="true" />
                      Ce qui sera transmis à {brand.name}
                    </p>
                    <ul className="space-y-1 text-[14px] text-ink-800">
                      {sharedLines(shared, hasMessage).map((line) => (
                        <li key={line} className="flex gap-2">
                          <span aria-hidden="true" className="text-brand-600">•</span>
                          <span className="min-w-0 break-words">{line}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[12px] leading-[1.45] text-text-tertiary">Rien d&apos;autre : ni votre activité dans l&apos;application, ni les données de votre officine.</p>
                  </section>

                  {pharmacyNameAvailable && (
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-ink-200 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={includePharmacy}
                        onChange={(event) => changeShared(() => setIncludePharmacy(event.target.checked))}
                        className="size-5 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span className="text-[14px] text-ink-800">
                        Joindre le nom de mon officine <span className="text-text-tertiary">(« {pharmacyNameAvailable} »)</span>
                      </span>
                    </label>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor={messageId} className="flex items-baseline justify-between px-0.5 text-[13.5px] font-semibold text-ink-800">
                      Votre message
                      <span className="text-[12px] font-medium text-ink-400">facultatif</span>
                    </label>
                    <textarea
                      id={messageId}
                      value={message}
                      maxLength={INFO_REQUEST_MESSAGE_MAX}
                      rows={3}
                      onChange={(event) => {
                        const wasEmpty = message.trim().length === 0;
                        const nowEmpty = event.target.value.trim().length === 0;
                        setMessage(event.target.value);
                        if (wasEmpty !== nowEmpty) setConsent(false);
                      }}
                      placeholder="Ex. : je souhaite recevoir la documentation de la gamme."
                      className="block w-full rounded-[14px] border border-ink-200 bg-white px-4 py-3 text-[16px] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
                    />
                    <p className="px-0.5 text-[12px] text-text-tertiary">N&apos;indiquez aucune information sur un patient.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor={consentId} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4", consentError ? "border-danger-300 bg-danger-50/40" : "border-brand-200 bg-brand-50/40")}>
                      <input
                        id={consentId}
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => {
                          setConsent(event.target.checked);
                          setConsentError(null);
                        }}
                        aria-invalid={consentError ? true : undefined}
                        aria-describedby={consentError ? `${consentId}-error` : undefined}
                        className="mt-0.5 size-5 shrink-0 accent-[var(--color-brand-600)]"
                      />
                      <span className="text-[13.5px] leading-[1.5] text-ink-800">{consentText}</span>
                    </label>
                    {consentError && (
                      <p id={`${consentId}-error`} role="alert" className="px-1 text-[12.5px] font-medium text-danger-700">
                        {consentError}
                      </p>
                    )}
                  </div>

                  {error && (
                    <p role="alert" className="rounded-2xl bg-danger-50 px-4 py-3 text-[13.5px] font-medium text-danger-700">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand-gradient text-[15.5px] font-semibold text-white shadow-[0_10px_24px_-12px_oklch(0.42_0.08_180/0.9)] transition-transform active:scale-[0.99] disabled:opacity-70"
                  >
                    {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    Envoyer ma demande
                  </button>
                  <p className="text-center text-[12px] leading-[1.45] text-text-tertiary">
                    Une question sur vos données : contact@pharmaboost.app
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
