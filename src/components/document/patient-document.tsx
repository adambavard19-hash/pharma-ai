import Image from "next/image";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { formatCents, formatDateLong } from "@/lib/format";
import type { DocumentContent } from "@/core/documents/types";

/**
 * Fiche patient.
 *
 * Un seul rendu sert à trois usages : la prévisualisation par le pharmacien, la
 * page sécurisée consultée par le patient, et l'impression A4 — les règles
 * `@media print` du système de design font le reste. Le contenu vient d'un
 * instantané figé : ni le catalogue ni le stock ne peuvent le modifier après
 * remise au patient.
 */
export function PatientDocument({
  content,
  variant = "screen",
}: {
  content: DocumentContent;
  variant?: "screen" | "print";
}) {
  const generatedAt = new Date(content.generatedAt);

  return (
    <article
      className={
        variant === "print"
          ? "mx-auto w-full max-w-[210mm] bg-white text-ink-900"
          : "mx-auto w-full max-w-[860px]"
      }
    >
      {content.isDemo && (
        <div className="mb-6 rounded-xl border border-accent-300 bg-accent-50 px-4 py-3 print-avoid-break">
          <p className="text-[12px] leading-5 font-semibold text-accent-900">
            DOCUMENT DE DÉMONSTRATION
          </p>
          <p className="mt-0.5 text-[11.5px] leading-4 text-accent-800">
            Patient, ordonnance, produits et prix sont entièrement fictifs. Ce document ne
            constitue en aucun cas un conseil médical ou pharmaceutique.
          </p>
        </div>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 pb-6 print-avoid-break"
        style={{ borderColor: content.pharmacy.brandColor }}
      >
        <div className="space-y-1">
          <p
            className="text-[19px] leading-6 font-semibold tracking-[-0.01em]"
            style={{ color: content.pharmacy.brandColor }}
          >
            {content.pharmacy.name}
          </p>
          <p className="text-[12px] leading-5 text-ink-500 dark:text-ink-400">
            {[
              content.pharmacy.addressLine1,
              [content.pharmacy.postalCode, content.pharmacy.city].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(" · ")}
            {content.pharmacy.phone && (
              <>
                <br />
                {content.pharmacy.phone}
              </>
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-[12px] text-ink-500 dark:text-ink-400">
            Fiche d&apos;accompagnement
          </p>
          <p className="text-[12px] text-ink-500 dark:text-ink-400">
            {formatDateLong(generatedAt)}
          </p>
          <p className="mt-1 font-mono text-[11px] text-ink-400">
            {content.prescription.reference}
          </p>
        </div>
      </header>

      <section className="mt-7 print-avoid-break">
        <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink-900 dark:text-ink-50">
          {content.patient
            ? `Bonjour ${content.patient.firstName},`
            : "Votre accompagnement"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-6 text-ink-600 dark:text-ink-300">
          Voici les informations sur votre traitement et les conseils que{" "}
          {content.pharmacist.fullName} a retenus pour vous. Ce document complète votre
          ordonnance : il ne la remplace pas.
        </p>
      </section>

      {content.treatment.length > 0 && (
        <section className="mt-9">
          <SectionTitle
            color={content.pharmacy.brandColor}
            eyebrow="Votre traitement"
            title="Ce que vous a prescrit votre médecin"
          />

          <div className="mt-4 space-y-3">
            {content.treatment.map((item, index) => (
              <div
                key={`${item.drugName}-${index}`}
                className="rounded-xl border border-ink-200 p-4 print-avoid-break dark:border-ink-800"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="text-[16px] font-semibold text-ink-900 dark:text-ink-50">
                    {item.drugName}
                    {item.dosage && (
                      <span className="font-normal text-ink-600 dark:text-ink-300">
                        {" "}
                        {item.dosage}
                      </span>
                    )}
                  </h3>
                  {item.form && (
                    <span className="text-[12px] text-ink-500 dark:text-ink-400">
                      {item.form}
                    </span>
                  )}
                </div>

                {item.purpose ? (
                  <p className="mt-2 text-[13.5px] leading-6 text-ink-700 dark:text-ink-200">
                    {item.purpose}
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-5 text-ink-500 dark:text-ink-400">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    Aucune explication vérifiée n&apos;est disponible pour ce médicament.
                    Demandez à votre pharmacien.
                  </p>
                )}

                {(item.posology || item.instructions || item.durationDays) && (
                  <div
                    className="mt-3 rounded-lg px-3.5 py-2.5"
                    style={{ backgroundColor: `${content.pharmacy.brandColor}0f` }}
                  >
                    <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase dark:text-ink-400">
                      Comment le prendre
                    </p>
                    <p className="mt-0.5 text-[13.5px] leading-6 text-ink-800 dark:text-ink-100">
                      {joinSentences([
                        item.posology,
                        item.durationDays ? `Pendant ${item.durationDays} jours` : null,
                        item.instructions,
                      ])}
                    </p>
                  </div>
                )}

                {item.tips.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {item.tips.map((tip) => (
                      <li
                        key={tip}
                        className="flex gap-2 text-[13px] leading-5 text-ink-700 dark:text-ink-200"
                      >
                        <span aria-hidden="true">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}

                {item.precautions.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-lg bg-warning-50 px-3.5 py-2.5 dark:bg-warning-700/10">
                    {item.precautions.map((precaution) => (
                      <li
                        key={precaution}
                        className="flex gap-2 text-[12.5px] leading-5 text-warning-700 dark:text-warning-500"
                      >
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {precaution}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {content.advice.length > 0 && (
        <section className="mt-10">
          <SectionTitle
            color={content.pharmacy.brandColor}
            eyebrow="Les conseils de votre pharmacien"
            title={`${content.pharmacist.fullName} vous recommande`}
          />

          {content.pharmacistNote && (
            <p className="mt-3 max-w-2xl text-[13.5px] leading-6 text-ink-600 italic dark:text-ink-300">
              « {content.pharmacistNote} »
            </p>
          )}

          <div className="mt-4 space-y-3">
            {content.advice.map((item, index) => (
              <div
                key={`${item.productName}-${index}`}
                className="flex flex-wrap gap-5 rounded-xl border border-ink-200 p-4 print-avoid-break dark:border-ink-800"
              >
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt=""
                    width={104}
                    height={104}
                    className="size-26 shrink-0 rounded-lg object-cover"
                    style={{ width: 104, height: 104 }}
                  />
                ) : (
                  <span
                    className="flex size-26 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      width: 104,
                      height: 104,
                      backgroundColor: `${content.pharmacy.brandColor}14`,
                    }}
                  >
                    <Sparkles
                      className="size-6"
                      style={{ color: content.pharmacy.brandColor }}
                      aria-hidden="true"
                    />
                  </span>
                )}

                <div className="min-w-[240px] flex-1 space-y-2">
                  <div>
                    {item.brand && (
                      <p className="text-[11.5px] font-medium tracking-wide text-ink-500 uppercase dark:text-ink-400">
                        {item.brand}
                      </p>
                    )}
                    <h3 className="text-[16px] font-semibold text-ink-900 dark:text-ink-50">
                      {item.productName}
                    </h3>
                  </div>

                  <div
                    className="rounded-lg px-3.5 py-2.5"
                    style={{ backgroundColor: `${content.pharmacy.brandColor}0f` }}
                  >
                    <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase dark:text-ink-400">
                      Pourquoi votre pharmacien vous le conseille
                    </p>
                    <p className="mt-0.5 text-[13.5px] leading-6 text-ink-800 dark:text-ink-100">
                      {item.personalReason}
                    </p>
                  </div>

                  {item.benefit && !item.personalReason.includes(item.benefit) && (
                    <p className="text-[13px] leading-5 text-ink-600 dark:text-ink-300">
                      {item.benefit}
                    </p>
                  )}

                  {item.usage && (
                    <p className="text-[12.5px] leading-5 text-ink-500 dark:text-ink-400">
                      {item.usage}
                    </p>
                  )}

                  {item.precautions.length > 0 && (
                    <ul className="space-y-0.5">
                      {item.precautions.map((precaution) => (
                        <li
                          key={precaution}
                          className="text-[12px] leading-4 text-warning-700 dark:text-warning-500"
                        >
                          ⚠ {precaution}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end justify-between gap-2 text-right">
                  <p className="text-[18px] font-semibold tabular text-ink-900 dark:text-ink-50">
                    {formatCents(item.priceCents)}
                  </p>
                  <p className="text-[11.5px] text-ink-500 dark:text-ink-400">
                    {item.availability === "IN_STOCK"
                      ? "Disponible en officine"
                      : item.availability === "LOW_STOCK"
                        ? "Derniers exemplaires"
                        : "Sur commande"}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-4 text-[12px] leading-5 text-ink-500 dark:text-ink-400">
            Ces conseils sont facultatifs. Ils ne sont pas prescrits par votre médecin et ne
            remplacent aucun traitement. Parlez-en avec votre pharmacien.
          </p>
        </section>
      )}

      <footer className="mt-10 border-t border-ink-200 pt-5 print-avoid-break dark:border-ink-800">
        <ul className="space-y-1.5">
          {content.disclaimers.map((disclaimer) => (
            <li
              key={disclaimer}
              className="text-[11.5px] leading-4 text-ink-500 dark:text-ink-400"
            >
              {disclaimer}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-ink-400">
          Document établi par {content.pharmacy.name} le {formatDateLong(generatedAt)} · Fiche
          générée avec Pharma.ai, outil d&apos;assistance au conseil officinal.
        </p>
      </footer>
    </article>
  );
}

/**
 * Assemble des fragments en phrases correctement ponctuées.
 * Les données saisies au comptoir se terminent rarement par un point ; les
 * concaténer brutalement produirait « 1 application le soir Pendant 10 jours ».
 */
function joinSentences(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(" ");
}

function SectionTitle({
  eyebrow,
  title,
  color,
}: {
  eyebrow: string;
  title: string;
  color: string;
}) {
  return (
    <div className="space-y-1">
      <p
        className="text-[11.5px] font-semibold tracking-[0.08em] uppercase"
        style={{ color }}
      >
        {eyebrow}
      </p>
      <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-ink-900 dark:text-ink-50">
        {title}
      </h2>
    </div>
  );
}
