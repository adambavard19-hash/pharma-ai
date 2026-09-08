import { formatDate, formatDateLong } from "@/lib/format";
import { MOMENT_LABELS } from "@/core/posology";
import { displayName, doseLabel, passageDate, planRows, unscheduledTreatment } from "@/core/documents/compose";
import type { DocumentContent, DocumentTreatmentItem } from "@/core/documents/types";
import { QrCode } from "./qr-code";
import { MomentIcon } from "./moment-icon";

/**
 * Le plan personnalisé du patient.
 *
 * Un seul rendu sert à trois usages : l'aperçu par le pharmacien, la page
 * sécurisée consultée par le patient sur son téléphone, et le PDF / l'impression
 * A4. Le contenu vient d'un instantané figé : ni le catalogue ni le stock ne
 * peuvent le modifier après remise au patient.
 *
 * Ce que le patient ne voit jamais : score, code ATC, moteur, marge, vente
 * additionnelle, conseils refusés, source technique.
 *
 * Ce que le document n'invente jamais : un horaire, une quantité ou un dosage
 * absents de l'instantané sont dits « À confirmer avec votre pharmacien », pas
 * déduits. Le dosage du médicament (« 150 mg ») et la quantité à prendre
 * (« 1 comprimé ») sont toujours deux informations distinctes.
 */
export function PatientDocument({
  content,
  variant = "screen",
  qrUrl = null,
}: {
  content: DocumentContent;
  variant?: "screen" | "print";
  /** Lien sécurisé à encoder en QR code dans le pied du document (papier, PDF). */
  qrUrl?: string | null;
}) {
  const color = content.pharmacy.brandColor || "#0F766E";
  const passage = passageDate(content);
  const { rows, moments } = planRows(content.treatment);
  const toConfirm = unscheduledTreatment(content.treatment);
  const keyPoints = content.keyPoints ?? [];
  const firstName = content.patient?.firstName;
  const patientName = content.patient ? `${content.patient.firstName} ${content.patient.lastName.toUpperCase()}` : null;
  const address = [content.pharmacy.addressLine1, [content.pharmacy.postalCode, content.pharmacy.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      className={"plan-document mx-auto w-full text-[#111827] " + (variant === "print" ? "max-w-[190mm]" : "max-w-[760px]")}
      style={{ ["--plan-accent" as string]: color }}
    >
      {/* ---- En-tête compact ------------------------------------------- */}
      <header className="print-avoid-break flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b-2 pb-4" style={{ borderColor: color }}>
        <div className="min-w-0">
          <p className="text-[17px] leading-6 font-bold tracking-[-0.01em]" style={{ color }}>
            {content.pharmacy.name}
          </p>
          {(address || content.pharmacy.phone) && (
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-[#4b5563]">
              {address}
              {address && content.pharmacy.phone ? " · " : ""}
              {content.pharmacy.phone}
            </p>
          )}
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-bold tracking-[0.12em] uppercase" style={{ color }}>
            Plan personnalisé
          </p>
          {patientName && <p className="text-[15px] leading-5 font-semibold">{patientName}</p>}
          <p className="text-[12.5px] text-[#4b5563]">Passage du {formatDateLong(passage)}</p>
        </div>
      </header>

      {content.isDemo && (
        <p className="mt-3 inline-block rounded-md border border-[#f59e0b] px-2.5 py-1 text-[11.5px] font-semibold text-[#92400e]">
          Document de démonstration — patient fictif
        </p>
      )}

      {/* ---- Salutation --------------------------------------------------- */}
      <section className="print-avoid-break mt-6">
        <h1 className="text-[24px] leading-[1.2] font-bold tracking-[-0.02em] sm:text-[26px]">
          Bonjour{firstName ? ` ${firstName}` : ""},
        </h1>
        <p className="mt-2 max-w-[60ch] text-[15.5px] leading-[1.6] text-[#374151]">
          Voici le récapitulatif préparé avec votre pharmacien à la suite de votre passage du {formatDateLong(passage)}.
          Gardez-le à portée de main : il vous dit quoi prendre, quand, et pendant combien de temps.
        </p>
      </section>

      {/* ---- Planning ----------------------------------------------------- */}
      {rows.length > 0 && (
        <section className="mt-7">
          <SectionTitle color={color}>Votre traitement au quotidien</SectionTitle>

          {/* Tableau : écran large, papier, PDF. */}
          <div className={"mt-3 overflow-hidden rounded-xl border border-[#d1d5db] " + (variant === "print" ? "block" : "hidden sm:block")}>
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-[#374151]" style={{ backgroundColor: tint(color, 0.9) }}>
                  <th scope="col" className="px-3.5 py-2.5 text-left text-[12px] font-bold tracking-[0.06em] uppercase">
                    Médicament
                  </th>
                  {moments.map((moment) => (
                    <th key={moment} scope="col" className="px-2 py-2.5 text-center text-[12px] font-bold tracking-[0.06em] uppercase">
                      <span className="inline-flex items-center gap-1.5">
                        <MomentIcon moment={moment} className="size-4" color={color} />
                        {MOMENT_LABELS[moment]}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5 text-right text-[12px] font-bold tracking-[0.06em] uppercase">
                    Durée
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { name, strength } = displayName(row.item);
                  return (
                    <tr key={row.item.drugName} className="print-avoid-break border-t border-[#e5e7eb] align-top">
                      <th scope="row" className="px-3.5 py-3 text-left font-normal">
                        <span className="block text-[15px] leading-5 font-semibold">{name}</span>
                        {strength && <span className="block text-[12.5px] leading-4 text-[#4b5563]">{strength}</span>}
                        {row.note && <span className="mt-0.5 block text-[12.5px] leading-4 text-[#6b7280]">{row.note}</span>}
                      </th>
                      {moments.map((moment) => (
                        <td key={moment} className="px-2 py-3 text-center">
                          {row.doses[moment] > 0 ? (
                            <span className="inline-block rounded-lg px-2 py-1 text-[13.5px] leading-5 font-semibold" style={{ backgroundColor: tint(color, 0.9), color: "#111827" }}>
                              {doseLabel(row.doses[moment], row.item.unit)}
                            </span>
                          ) : (
                            <span className="text-[#9ca3af]" aria-label="Pas de prise">
                              —
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right text-[13.5px] whitespace-nowrap text-[#374151]">
                        {row.item.durationDays ? `${row.item.durationDays} jour${row.item.durationDays > 1 ? "s" : ""}` : "selon l'ordonnance"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cartes : téléphone. */}
          {variant !== "print" && (
            <ul className="mt-3 space-y-2.5 sm:hidden">
              {rows.map((row) => {
                const { name, strength } = displayName(row.item);
                return (
                  <li key={row.item.drugName} className="rounded-xl border border-[#d1d5db] px-4 py-3.5">
                    <p className="text-[16px] leading-5 font-semibold">
                      {name}
                      {strength && <span className="ml-1.5 text-[13px] font-normal text-[#4b5563]">{strength}</span>}
                    </p>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {moments
                        .filter((moment) => row.doses[moment] > 0)
                        .map((moment) => (
                          <li key={moment} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium" style={{ backgroundColor: tint(color, 0.9) }}>
                            <MomentIcon moment={moment} className="size-4" color={color} />
                            {MOMENT_LABELS[moment]} · {doseLabel(row.doses[moment], row.item.unit)}
                          </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[13px] leading-5 text-[#4b5563]">
                      {row.item.durationDays ? `Pendant ${row.item.durationDays} jour${row.item.durationDays > 1 ? "s" : ""}` : "Durée : selon l'ordonnance"}
                      {row.note ? ` · ${row.note}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ---- À confirmer / À retenir : côte à côte quand les deux existent — */}
      <div className={toConfirm.length > 0 && keyPoints.length > 0 ? "grid gap-4 sm:grid-cols-2 print:grid-cols-2" : ""}>
      {toConfirm.length > 0 && (
        <section className="print-avoid-break mt-5 rounded-xl border border-dashed border-[#9ca3af] px-4 py-3.5">
          <p className="text-[12px] font-bold tracking-[0.08em] text-[#4b5563] uppercase">À confirmer avec votre pharmacien</p>
          <ul className="mt-1.5 space-y-1.5">
            {toConfirm.map((item) => {
              const { name, strength } = displayName(item);
              return (
                <li key={item.drugName} className="text-[15px] leading-6">
                  <span className="font-semibold">{name}</span>
                  {strength && <span className="text-[#4b5563]"> {strength}</span>}
                  {item.posology && <span className="block text-[13.5px] leading-5 text-[#6b7280]">Sur l&apos;ordonnance : {item.posology}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---- À retenir ---------------------------------------------------- */}
      {keyPoints.length > 0 && (
        <section className="print-avoid-break mt-5 rounded-xl px-5 py-4" style={{ backgroundColor: tint(color, 0.92) }}>
          <SectionTitle color={color}>À retenir</SectionTitle>
          <ul className="mt-2.5 space-y-2">
            {keyPoints.map((point) => (
              <li key={point} className="flex gap-2.5 text-[15px] leading-6">
                <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>

      {/* ---- Détails utiles (uniquement ce qui est validé) ----------------- */}
      {content.treatment.some((item) => item.purpose || item.precautions.length > 0 || item.tips.length > 0 || item.instructions) && (
        <section className="mt-7">
          <SectionTitle color={color}>Bon à savoir sur vos médicaments</SectionTitle>
          <ul className="mt-3 divide-y divide-[#e5e7eb]">
            {content.treatment
              .filter((item) => item.purpose || item.precautions.length > 0 || item.tips.length > 0 || item.instructions)
              .map((item) => (
                <TreatmentNote key={item.drugName} item={item} />
              ))}
          </ul>
        </section>
      )}

      {/* ---- Conseils du pharmacien -------------------------------------- */}
      {(content.advice.length > 0 || content.pharmacistNote) && (
        <section className="mt-7">
          <SectionTitle color={color}>Les conseils de votre pharmacien</SectionTitle>
          {content.pharmacistNote && (
            <p className="mt-3 border-l-[3px] pl-4 text-[15px] leading-[1.6] text-[#374151] italic" style={{ borderColor: color }}>
              {content.pharmacistNote}
            </p>
          )}
          {content.advice.length > 0 && (
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 print:grid-cols-1">
              {content.advice.map((advice) => (
                <li key={advice.productName} className="print-avoid-break rounded-xl border border-[#d1d5db] px-4 py-3.5">
                  <p className="text-[15.5px] leading-5 font-semibold">{advice.productName}</p>
                  <p className="mt-1.5 text-[14px] leading-[1.55] text-[#374151]">{advice.personalReason}</p>
                  {advice.usage && (
                    <p className="mt-1.5 text-[13px] leading-5 text-[#4b5563]">
                      <span className="font-semibold">Comment l&apos;utiliser :</span> {advice.usage}
                    </p>
                  )}
                  {advice.precautions.length > 0 && (
                    <p className="mt-1 text-[13px] leading-5 text-[#4b5563]">
                      <span className="font-semibold">À savoir :</span> {advice.precautions.join(" ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- Suivi ---------------------------------------------------------- */}
      {content.followUp && (
        <section className="print-avoid-break mt-7 flex items-start gap-3 rounded-xl border border-[#d1d5db] px-4 py-3.5">
          <MomentIcon moment="followup" className="mt-0.5 size-5 shrink-0" color={color} />
          <p className="text-[14.5px] leading-6 text-[#374151]">
            <span className="font-semibold text-[#111827]">Votre suivi.</span> La {content.pharmacy.name} prendra de vos nouvelles vers le{" "}
            {formatDate(content.followUp.dueAt)}. D&apos;ici là, n&apos;hésitez pas à passer ou à appeler si quelque chose vous gêne.
          </p>
        </section>
      )}

      {/* ---- Pied ------------------------------------------------------------ */}
      <footer className="print-avoid-break mt-8 border-t border-[#d1d5db] pt-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold" style={{ color }}>
              {content.pharmacy.name}
            </p>
            {address && <p className="text-[13px] leading-5 text-[#374151]">{address}</p>}
            {content.pharmacy.phone && (
              <p className="mt-1 text-[15px] leading-6 font-semibold">
                Une question ? {content.pharmacy.phone}
              </p>
            )}
            {content.pharmacy.email && <p className="text-[13px] leading-5 text-[#374151]">{content.pharmacy.email}</p>}
            <p className="mt-2 text-[12.5px] leading-5 text-[#6b7280]">
              Plan préparé avec {content.pharmacist.fullName}, {content.pharmacist.roleLabel.toLowerCase()}.
            </p>
          </div>
          {qrUrl && (
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <QrCode value={qrUrl} size={112} label="QR code : retrouvez ce plan sur votre téléphone" />
              <p className="max-w-[140px] text-center text-[11px] leading-4 text-[#6b7280]">Ce plan sur votre téléphone</p>
            </div>
          )}
        </div>
        <ul className="mt-4 space-y-0.5 text-[11.5px] leading-[1.5] text-[#6b7280]">
          {content.disclaimers.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

function SectionTitle({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <h2 className="text-[12.5px] font-bold tracking-[0.1em] uppercase" style={{ color }}>
      {children}
    </h2>
  );
}

function TreatmentNote({ item }: { item: DocumentTreatmentItem }) {
  const { name, strength } = displayName(item);
  return (
    <li className="print-avoid-break py-3">
      <p className="text-[15px] leading-5 font-semibold">
        {name}
        {strength && <span className="font-normal text-[#4b5563]"> {strength}</span>}
      </p>
      {item.purpose && <p className="mt-1 text-[14px] leading-[1.55] text-[#374151]">{item.purpose}</p>}
      {item.instructions && (
        <p className="mt-1 text-[13.5px] leading-5 text-[#374151]">
          <span className="font-semibold">Consigne :</span> {item.instructions}
        </p>
      )}
      {item.tips.length > 0 && <p className="mt-1 text-[13.5px] leading-5 text-[#4b5563]">{item.tips.join(" ")}</p>}
      {item.precautions.length > 0 && (
        <p className="mt-1 text-[13.5px] leading-5 text-[#4b5563]">
          <span className="font-semibold">Précaution :</span> {item.precautions.join(" ")}
        </p>
      )}
    </li>
  );
}

/** Teinte claire de la couleur d'officine — lisible aussi en noir et blanc. */
function tint(hex: string, amount: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "#f3f4f6";
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number.parseInt(part, 16));
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
