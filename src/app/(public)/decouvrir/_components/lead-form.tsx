"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp, ClipboardList, FileText, MessageCircleQuestion, PackageSearch, PanelTop, ScanLine, Trophy } from "lucide-react";
import { submitSiteLeadAction } from "@/server/actions/site-leads";
import { siteLeadSchema } from "@/core/site/lead-form";
import { formatDemoSlot, type DemoDay } from "@/core/site/demo-slots";
import { cn } from "@/lib/utils";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { ChoiceCards, CountAnswer, LiveCard, LiveRow, LongTextAnswer, MultiCards, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";

const LGOS = ["LGPI (Pharmagest)", "Winpharma", "Smart Rx (Cegedim)", "Léo (Isipharm)", "Périphar", "Alliance+", "Pharmaland", "Autre logiciel"];
/** « Aucun créneau ne me convient » : l'équipe rappelle pour en fixer un. */
const CALL_ME = "__rappel";
const slotLabel = (value: string) => (value === CALL_ME ? "À fixer ensemble (nous vous rappelons)" : value ? formatDemoSlot(new Date(value)) : null);
const INTERESTS = [
  { value: "banniere", label: "La bannière au comptoir", icon: <PanelTop className="size-[18px]" /> },
  { value: "scan", label: "Le conseil au scan d'un produit", icon: <ScanLine className="size-[18px]" /> },
  { value: "questions", label: "Les questions avant le conseil", icon: <CircleHelp className="size-[18px]" /> },
  { value: "ordonnance", label: "L'analyse d'une ordonnance", icon: <FileText className="size-[18px]" /> },
  { value: "stock", label: "Stock et marge", icon: <PackageSearch className="size-[18px]" /> },
  { value: "equipe", label: "Mon équipe et les challenges", icon: <Trophy className="size-[18px]" /> },
  { value: "sans-ordonnance", label: "La demande sans ordonnance", icon: <MessageCircleQuestion className="size-[18px]" /> },
  { value: "plan", label: "Le plan conseil patient", icon: <ClipboardList className="size-[18px]" /> },
];
/**
 * Le message libre est plafonné pour que, toutes les priorités cochées, « Priorités : … » plus le message tiennent dans les
 * 1 000 caractères que le serveur accepte (siteLeadSchema) : le visiteur ne bute jamais sur une erreur qu'il ne voit pas venir.
 */
const MESSAGE_MAX = 760;
const interestLabel = (value: string) => INTERESTS.find((i) => i.value === value)?.label ?? value;

type Values = {
  contactName: string;
  pharmacyName: string;
  city: string;
  lgo: string;
  postCount: string;
  interests: string[];
  message: string;
  /** L'instant ISO du créneau réservé, ou CALL_ME. */
  demoAt: string;
  email: string;
  phone: string;
  website: string;
};

/** Les priorités cochées rejoignent le message : le serveur ne reçoit que du texte libre, comme avant. */
function composeMessage(v: Values): string {
  const priorities = v.interests.length ? `Priorités : ${v.interests.map(interestLabel).join(", ")}.` : "";
  return [priorities, v.message.trim()].filter(Boolean).join("\n\n");
}

function toPayload(v: Values, salesRepCode = "") {
  const posts = Number(v.postCount);
  return {
    kind: "DEMO" as const,
    pharmacyName: v.pharmacyName,
    contactName: v.contactName,
    email: v.email,
    phone: v.phone,
    city: v.city,
    lgo: v.lgo,
    postCount: v.postCount && Number.isFinite(posts) && posts > 0 ? Math.round(posts) : null,
    message: composeMessage(v),
    preferredSlot: "",
    demoAt: v.demoAt === CALL_ME ? "" : v.demoAt,
    referralCode: "",
    salesRepCode,
    website: v.website,
  };
}

/** Les règles du serveur (siteLeadSchema), appliquées aux seuls champs de la question. */
function validate(v: Values, fields: string[]): FlowErrors {
  const parsed = siteLeadSchema.safeParse(toPayload(v));
  if (parsed.success) return {};
  const errors: FlowErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (fields.includes(key)) errors[key] ??= issue.path[0] === "postCount" ? "Indiquez un nombre entre 1 et 50." : issue.message;
  }
  return errors;
}

const firstName = (v: Values) => v.contactName.trim().split(/\s+/)[0] ?? "";

/**
 * La demande de démonstration, une question à la fois. Les coordonnées de
 * l'officine et ce qu'elle veut voir : aucune donnée de santé, aucune donnée
 * patient.
 */
export function LeadForm({ days, salesRepCode = "" }: { days: DemoDay[]; /** Le lien d'un commercial (17 oct. 2026) : la demande lui est attribuée. */ salesRepCode?: string }) {
  const router = useRouter();
  const initialValues = useMemo<Values>(() => ({ contactName: "", pharmacyName: "", city: "", lgo: "", postCount: "", interests: [], message: "", demoAt: "", email: "", phone: "", website: "" }), []);

  const steps = useMemo<FlowStep<Values>[]>(
    () => [
      {
        id: "nom",
        section: "Vous",
        question: "Bonjour ! Comment vous appelez-vous ?",
        help: "Pour que la personne qui vous appelle sache à qui elle parle.",
        fields: ["contactName"],
        seconds: 6,
        validate: (v) => validate(v, ["contactName"]),
        render: ({ values, errors, set }) => <TextAnswer srLabel="Prénom et nom" value={values.contactName} onValueChange={(v) => set("contactName", v)} error={errors.contactName} placeholder="Prénom Nom" autoComplete="name" />,
        recap: { label: "Nom", value: (v) => v.contactName.trim() || null },
      },
      {
        id: "officine",
        section: "Votre officine",
        question: (v) => (firstName(v) ? `Merci ${firstName(v)}. Dans quelle officine exercez-vous ?` : "Dans quelle officine exercez-vous ?"),
        fields: ["pharmacyName", "city"],
        seconds: 10,
        validate: (v) => validate(v, ["pharmacyName", "city"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <TextAnswer label="Officine" value={values.pharmacyName} onValueChange={(v) => set("pharmacyName", v)} error={errors.pharmacyName} placeholder="Pharmacie du Centre" autoComplete="organization" />
            <TextAnswer label="Ville" value={values.city} onValueChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" hint={values.demoAt && values.demoAt !== CALL_ME ? "Nous vous appelons à ce numéro." : "Facultatif."} />
          </div>
        ),
        recap: { label: "Officine", value: (v) => [v.pharmacyName.trim(), v.city.trim()].filter(Boolean).join(", ") || null },
      },
      {
        id: "logiciel",
        section: "Votre officine",
        question: "Quel logiciel utilisez-vous au comptoir ?",
        help: "La démonstration se fait sur votre logiciel de gestion.",
        fields: ["lgo"],
        optional: true,
        seconds: 5,
        render: ({ values, choose }) => <ChoiceCards label="Logiciel de gestion" options={LGOS.map((l) => ({ value: l, label: l }))} value={values.lgo} onChoose={(v) => choose("lgo", v)} />,
        recap: { label: "Logiciel", value: (v) => v.lgo || null },
      },
      {
        id: "postes",
        section: "Votre officine",
        question: "Combien de postes de comptoir ?",
        fields: ["postCount"],
        optional: true,
        seconds: 5,
        validate: (v) => validate(v, ["postCount"]),
        render: ({ values, errors, set, choose }) => <CountAnswer label="Postes de comptoir" value={values.postCount} onValueChange={(v) => set("postCount", v)} onChoose={(v) => choose("postCount", v)} quick={[1, 2, 3, 4]} max={50} error={errors.postCount} />,
        recap: { label: "Postes", value: (v) => v.postCount || null },
      },
      {
        id: "priorites",
        section: "Votre démo",
        question: "Que voulez-vous voir en priorité ?",
        help: "Plusieurs réponses possibles. Nous préparons la démonstration en conséquence.",
        fields: ["interests", "message"],
        optional: true,
        isEmpty: (v) => v.interests.length === 0 && !v.message.trim(),
        seconds: 12,
        validate: (v) => validate(v, ["message"]),
        render: ({ values, errors, set }) => (
          <div className="space-y-5">
            <MultiCards label="Priorités" options={INTERESTS} values={values.interests} onToggle={(value) => set("interests", values.interests.includes(value) ? values.interests.filter((i) => i !== value) : [...values.interests, value])} />
            <LongTextAnswer srLabel="Autre chose" value={values.message} onValueChange={(v) => set("message", v)} error={errors.message} rows={3} maxLength={MESSAGE_MAX} placeholder="Autre chose ? Une question, un contexte particulier…" className="[&_textarea]:min-h-24" />
          </div>
        ),
        recap: { label: "Priorités", value: (v) => [v.interests.map(interestLabel).join(", "), v.message.trim()].filter(Boolean).join(" · ") || null },
      },
      {
        id: "creneau",
        section: "Votre démo",
        question: "Choisissez le jour et l'heure de votre démo.",
        help: "Un appel de 20 minutes, heure de Paris. Le créneau vous est confirmé aussitôt par e-mail.",
        fields: ["demoAt"],
        seconds: 10,
        validate: (v) => (v.demoAt ? {} : { demoAt: "Choisissez un créneau, ou demandez à être rappelé." }),
        render: ({ values, errors, set, choose }) => <DemoSlotPicker days={days} value={values.demoAt} error={errors.demoAt} onPick={(at) => set("demoAt", at)} onCallMe={() => choose("demoAt", CALL_ME)} />,
        recap: { label: "Créneau", value: (v) => slotLabel(v.demoAt) },
      },
      {
        id: "contact",
        section: "Vous",
        question: (v) => (firstName(v) ? `Où pouvons-nous vous joindre, ${firstName(v)} ?` : "Où pouvons-nous vous joindre ?"),
        help: "Un accusé de réception part aussitôt à cette adresse.",
        fields: ["email", "phone"],
        seconds: 12,
        validate: (v) => validate(v, ["email", "phone"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <EmailAnswer label="E-mail" value={values.email} onValueChange={(v) => set("email", v)} error={errors.email} placeholder="vous@officine.fr" />
            <TextAnswer label="Téléphone" type="tel" value={values.phone} onValueChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" placeholder="06 …" hint={values.demoAt && values.demoAt !== CALL_ME ? "Nous vous appelons à ce numéro." : "Facultatif."} />
          </div>
        ),
        recap: { label: "Contact", value: (v) => [v.email.trim(), v.phone.trim()].filter(Boolean).join(" · ") || null },
      },
    ],
    [days],
  );

  return (
    <Flow<Values>
      name="demo"
      steps={steps}
      initialValues={initialValues}
      honeypot="website"
      autoFocus
      recapTitle="Tout est prêt pour votre démo."
      aside={(v) => <DemoAside values={v} />}
      final={() => (
        <p className="text-[13px] leading-5 text-text-tertiary">
          Vos coordonnées servent uniquement à organiser la démonstration.{" "}
          <Link href="/decouvrir/confidentialite" target="_blank" rel="noopener" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
            Confidentialité
          </Link>
        </p>
      )}
      submitLabel="Réserver ma démo"
      submitHint="Le créneau vous est confirmé aussitôt par e-mail."
      onSubmit={async (v) => {
        const result = await submitSiteLeadAction(toPayload(v, salesRepCode));
        if (!result.ok) return { ok: false, error: result.error };
        router.push(v.demoAt && v.demoAt !== CALL_ME ? `/decouvrir/merci?type=demo&creneau=${encodeURIComponent(v.demoAt)}` : "/decouvrir/merci?type=demo");
        return { ok: true };
      }}
    />
  );
}

function DemoAside({ values }: { values: Values }) {
  return (
    <LiveCard title="Votre démo" footer="Un appel de 20 minutes, sur votre poste de comptoir. Confirmé aussitôt par e-mail.">
      <div className="divide-y divide-border-subtle/70">
        <LiveRow label="Avec" value={values.contactName.trim()} />
        <LiveRow label="Officine" value={[values.pharmacyName.trim(), values.city.trim()].filter(Boolean).join(", ")} />
        <LiveRow label="Logiciel" value={values.lgo} />
        <LiveRow label="Postes de comptoir" value={values.postCount} />
        <LiveRow
          label="À voir en priorité"
          value={
            values.interests.length ? (
              <ul className="mt-0.5 space-y-0.5">
                {values.interests.map((i) => (
                  <li key={i}>{interestLabel(i)}</li>
                ))}
              </ul>
            ) : null
          }
        />
        <LiveRow label="Créneau" value={slotLabel(values.demoAt)} />
      </div>
    </LiveCard>
  );
}

/**
 * Le jour puis l'heure : les jours ouvrés à venir qui ont encore un créneau libre, et leurs heures. Un créneau pris par
 * une autre officine n'apparaît pas ; s'il est pris entre-temps, l'envoi le dit et la personne en choisit un autre.
 */
function DemoSlotPicker({ days, value, error, onPick, onCallMe }: { days: DemoDay[]; value: string; error?: string; onPick: (at: string) => void; onCallMe: () => void }) {
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex((day) => day.slots.some((slot) => slot.at === value))));
  const day = days[dayIndex];
  return (
    <div className="space-y-5">
      {days.length > 0 ? (
        <>
          <div role="radiogroup" aria-label="Jour" className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d, i) => {
              const [weekday, ...rest] = d.label.split(" ");
              return (
                <button
                  key={d.date}
                  type="button"
                  role="radio"
                  aria-checked={i === dayIndex}
                  onClick={() => setDayIndex(i)}
                  className={cn(
                    "flex min-w-[88px] shrink-0 snap-start flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                    i === dayIndex ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-primary hover:border-brand-300",
                  )}
                >
                  <span className={cn("text-[12.5px] font-medium", i === dayIndex ? "text-white/85" : "text-text-secondary")}>{weekday}</span>
                  <span className="text-[15px] leading-6 font-semibold">{rest.join(" ")}</span>
                </button>
              );
            })}
          </div>
          {day && (
            <div role="radiogroup" aria-label={`Heure, ${day.label}`} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {day.slots.map((slot) => (
                <button
                  key={slot.at}
                  type="button"
                  role="radio"
                  aria-checked={value === slot.at}
                  onClick={() => onPick(slot.at)}
                  className={cn(
                    "h-11 rounded-xl border text-[15px] font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                    value === slot.at ? "border-brand-600 bg-brand-600 text-white" : "border-border-default bg-surface-card text-text-primary hover:border-brand-300",
                  )}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
          {value && value !== CALL_ME && <p className="text-[14.5px] font-medium text-brand-800">Votre démo : {slotLabel(value)}.</p>}
        </>
      ) : (
        <p className="text-[14.5px] text-text-secondary">Aucun créneau libre en ce moment : nous vous rappelons pour en fixer un.</p>
      )}
      <button type="button" onClick={onCallMe} className={cn("text-[14px] font-medium underline underline-offset-2", value === CALL_ME ? "text-brand-800" : "text-text-secondary hover:text-text-primary")}>
        {value === CALL_ME ? "Nous vous rappelons pour fixer le créneau ✓" : "Aucun créneau ne me convient : rappelez-moi"}
      </button>
      {error && <p className="text-[13.5px] text-danger-600" role="alert">{error}</p>}
    </div>
  );
}
