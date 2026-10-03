"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, FileText, MessageCircleQuestion, PackageSearch, ScanLine } from "lucide-react";
import { submitSiteLeadAction } from "@/server/actions/site-leads";
import { siteLeadSchema } from "@/core/site/lead-form";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { ChoiceCards, CountAnswer, LiveCard, LiveRow, LongTextAnswer, MultiCards, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";

const LGOS = ["LGPI (Pharmagest)", "Winpharma", "Smart Rx (Cegedim)", "Léo (Isipharm)", "Périphar", "Alliance+", "Pharmaland", "Autre logiciel"];
const SLOTS = [
  { value: "Matin (9 h – 12 h)", label: "Le matin", description: "9 h – 12 h" },
  { value: "Début d'après-midi (14 h – 16 h)", label: "Début d'après-midi", description: "14 h – 16 h" },
  { value: "Fin d'après-midi (16 h – 19 h)", label: "Fin d'après-midi", description: "16 h – 19 h" },
];
const ANY_SLOT = "__indifferent";
const INTERESTS = [
  { value: "scan", label: "Le conseil au scan d'un produit", icon: <ScanLine className="size-[18px]" /> },
  { value: "ordonnance", label: "L'analyse d'une ordonnance", icon: <FileText className="size-[18px]" /> },
  { value: "stock", label: "Stock et marge", icon: <PackageSearch className="size-[18px]" /> },
  { value: "sans-ordonnance", label: "La demande sans ordonnance", icon: <MessageCircleQuestion className="size-[18px]" /> },
  { value: "plan", label: "Le plan conseil patient", icon: <ClipboardList className="size-[18px]" /> },
];
const interestLabel = (value: string) => INTERESTS.find((i) => i.value === value)?.label ?? value;

type Values = {
  contactName: string;
  pharmacyName: string;
  city: string;
  lgo: string;
  postCount: string;
  interests: string[];
  message: string;
  preferredSlot: string;
  email: string;
  phone: string;
  website: string;
};

/** Les priorités cochées rejoignent le message : le serveur ne reçoit que du texte libre, comme avant. */
function composeMessage(v: Values): string {
  const priorities = v.interests.length ? `Priorités : ${v.interests.map(interestLabel).join(", ")}.` : "";
  return [priorities, v.message.trim()].filter(Boolean).join("\n\n");
}

function toPayload(v: Values) {
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
    preferredSlot: v.preferredSlot === ANY_SLOT ? "" : v.preferredSlot,
    referralCode: "",
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
export function LeadForm() {
  const router = useRouter();
  const initialValues = useMemo<Values>(() => ({ contactName: "", pharmacyName: "", city: "", lgo: "", postCount: "", interests: [], message: "", preferredSlot: "", email: "", phone: "", website: "" }), []);

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
            <TextAnswer label="Ville" value={values.city} onValueChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" hint="Facultatif." />
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
            <LongTextAnswer srLabel="Autre chose" value={values.message} onValueChange={(v) => set("message", v)} error={errors.message} rows={3} maxLength={800} placeholder="Autre chose ? Une question, un contexte particulier…" className="[&_textarea]:min-h-24" />
          </div>
        ),
        recap: { label: "Priorités", value: (v) => [v.interests.map(interestLabel).join(", "), v.message.trim()].filter(Boolean).join(" · ") || null },
      },
      {
        id: "creneau",
        section: "Votre démo",
        question: "Quel moment vous arrange pour l'appel ?",
        fields: ["preferredSlot"],
        optional: true,
        seconds: 5,
        render: ({ values, choose }) => <ChoiceCards label="Créneau" options={[...SLOTS, { value: ANY_SLOT, label: "Indifférent", description: "Quand vous voulez" }]} value={values.preferredSlot} onChoose={(v) => choose("preferredSlot", v)} />,
        recap: { label: "Créneau", value: (v) => (v.preferredSlot === ANY_SLOT ? "Indifférent" : v.preferredSlot || null) },
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
            <TextAnswer label="Téléphone" type="tel" value={values.phone} onValueChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" placeholder="06 …" hint="Facultatif." />
          </div>
        ),
        recap: { label: "Contact", value: (v) => [v.email.trim(), v.phone.trim()].filter(Boolean).join(" · ") || null },
      },
    ],
    [],
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
      submitHint="En visio ou par téléphone, sur votre poste. Nous vous rappelons sous un jour ouvré."
      onSubmit={async (v) => {
        const result = await submitSiteLeadAction(toPayload(v));
        if (!result.ok) return { ok: false, error: result.error };
        router.push("/decouvrir/merci?type=demo");
        return { ok: true };
      }}
    />
  );
}

function DemoAside({ values }: { values: Values }) {
  return (
    <LiveCard title="Votre démo" footer="En visio ou par téléphone, sur votre poste. Nous vous rappelons sous un jour ouvré.">
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
        <LiveRow label="Créneau" value={values.preferredSlot === ANY_SLOT ? "Indifférent" : values.preferredSlot} />
      </div>
    </LiveCard>
  );
}
