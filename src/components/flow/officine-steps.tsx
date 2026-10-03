"use client";

import { digitsOnly, formatSiret } from "@/core/contracts/identity";
import type { FlowErrors, FlowStep } from "./flow";
import { SourceBadge, TextAnswer } from "./controls";
import { AddressAnswer, applyCompany, revertCompany, SiretAnswer, type Prefill } from "./registry-answers";

/**
 * Les questions sur l'officine, communes à la souscription du site et à
 * l'inscription par lien : le SIRET d'abord (il retrouve tout le reste), puis
 * le nom, la raison sociale, l'adresse et les compléments facultatifs.
 */
export type OfficineKeys = {
  siret: string;
  name: string;
  legalName: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  finessNumber: string;
  phone: string;
  /** L'e-mail de l'officine, demandé à l'inscription par lien seulement. */
  contactEmail?: string;
};

type Values = Record<string, unknown> & { prefill: Prefill };

const text = (values: Values, key: string) => String(values[key] ?? "");

export function officineSteps<V extends Values>({ keys, validate, section = "L'officine" }: { keys: OfficineKeys; validate: (values: V, fields: string[]) => FlowErrors; section?: string }): FlowStep<V>[] {
  const fromRegistry = (values: V, key: string) => {
    const value = text(values, key).trim();
    return Boolean(value) && values.prefill?._siret === digitsOnly(text(values, keys.siret)) && values.prefill?.[key] === value;
  };
  const badge = (values: V, key: string) => (fromRegistry(values, key) ? <SourceBadge>Repris de l&apos;annuaire des entreprises</SourceBadge> : null);
  const extras = [keys.finessNumber, keys.phone, ...(keys.contactEmail ? [keys.contactEmail] : [])];

  return [
    {
      id: "siret",
      section,
      question: "Commençons par le SIRET de votre officine.",
      help: "Nous retrouvons votre officine dans l'annuaire public des entreprises : moins de choses à saisir.",
      fields: [keys.siret],
      seconds: 15,
      validate: (v) => validate(v, [keys.siret]),
      render: ({ values, errors, set, patch }) => (
        <SiretAnswer
          value={text(values, keys.siret)}
          onValueChange={(value) => set(keys.siret as keyof V, value as V[keyof V])}
          error={errors[keys.siret]}
          prefill={values.prefill ?? {}}
          onApply={(company) => {
            const result = applyCompany(values, company, { name: keys.name, legalName: keys.legalName, addressLine1: keys.addressLine1, postalCode: keys.postalCode, city: keys.city, finessNumber: keys.finessNumber }, values.prefill ?? {});
            patch({ ...result.patch, prefill: result.prefill } as Partial<V>);
          }}
          onReject={(siret) => {
            const result = revertCompany(values, values.prefill ?? {}, siret);
            patch({ ...result.patch, prefill: result.prefill } as Partial<V>);
          }}
        />
      ),
      recap: { label: "SIRET", value: (v) => (text(v, keys.siret) ? formatSiret(text(v, keys.siret)) : null) },
    },
    {
      id: "nom",
      section,
      question: "Comment s'appelle votre pharmacie ?",
      help: "Le nom que voient vos patients, sur la vitrine et sur leur plan conseil.",
      fields: [keys.name],
      seconds: 8,
      validate: (v) => validate(v, [keys.name]),
      render: ({ values, errors, set }) => (
        <TextAnswer srLabel="Nom de la pharmacie" value={text(values, keys.name)} onValueChange={(value) => set(keys.name as keyof V, value as V[keyof V])} error={errors[keys.name]} placeholder="Pharmacie du Centre" autoComplete="organization" badge={badge(values, keys.name)} label={fromRegistry(values, keys.name) ? "Nom de la pharmacie" : undefined} />
      ),
      recap: { label: "Pharmacie", value: (v) => text(v, keys.name) || null },
    },
    {
      id: "raison-sociale",
      section,
      question: "Et sa raison sociale ?",
      help: "Telle qu'inscrite au registre du commerce : SELARL, SELAS, EURL… Elle figure au contrat.",
      fields: [keys.legalName],
      seconds: 8,
      validate: (v) => validate(v, [keys.legalName]),
      render: ({ values, errors, set }) => (
        <TextAnswer srLabel="Raison sociale" value={text(values, keys.legalName)} onValueChange={(value) => set(keys.legalName as keyof V, value as V[keyof V])} error={errors[keys.legalName]} placeholder="SELARL Pharmacie du Centre" badge={badge(values, keys.legalName)} label={fromRegistry(values, keys.legalName) ? "Raison sociale" : undefined} />
      ),
      recap: { label: "Raison sociale", value: (v) => text(v, keys.legalName) || null },
    },
    {
      id: "adresse",
      section,
      question: "Où se trouve l'officine ?",
      fields: [keys.addressLine1, keys.postalCode, keys.city],
      seconds: 15,
      validate: (v) => validate(v, [keys.addressLine1, keys.postalCode, keys.city]),
      render: ({ values, errors, patch }) => (
        <AddressAnswer
          line={text(values, keys.addressLine1)}
          postalCode={text(values, keys.postalCode)}
          city={text(values, keys.city)}
          onChange={(partial) => {
            const next: Record<string, string> = {};
            if (partial.addressLine1 !== undefined) next[keys.addressLine1] = partial.addressLine1;
            if (partial.postalCode !== undefined) next[keys.postalCode] = partial.postalCode;
            if (partial.city !== undefined) next[keys.city] = partial.city;
            patch(next as Partial<V>);
          }}
          errors={{ addressLine1: errors[keys.addressLine1], postalCode: errors[keys.postalCode], city: errors[keys.city] }}
          badge={badge(values, keys.addressLine1)}
        />
      ),
      recap: {
        label: "Adresse",
        value: (v) => {
          const line = text(v, keys.addressLine1);
          const place = [text(v, keys.postalCode), text(v, keys.city)].filter(Boolean).join(" ");
          return [line, place].filter(Boolean).join(", ") || null;
        },
      },
    },
    {
      id: "complements",
      section,
      question: keys.contactEmail ? "Quelques coordonnées, si vous le souhaitez." : "Deux précisions, si vous les avez sous la main.",
      help: "Facultatif : vous pouvez passer cette question.",
      fields: extras,
      optional: true,
      seconds: 12,
      validate: (v) => validate(v, extras),
      render: ({ values, errors, set }) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextAnswer label="N° FINESS" value={text(values, keys.finessNumber)} onValueChange={(value) => set(keys.finessNumber as keyof V, digitsOnly(value).slice(0, 9) as V[keyof V])} error={errors[keys.finessNumber]} inputMode="numeric" autoComplete="off" placeholder="9 chiffres" hint={fromRegistry(values, keys.finessNumber) ? "Repris de l'annuaire des entreprises." : undefined} />
          <TextAnswer label="Téléphone de l'officine" type="tel" value={text(values, keys.phone)} onValueChange={(value) => set(keys.phone as keyof V, value as V[keyof V])} error={errors[keys.phone]} autoComplete="tel" placeholder="04 78 00 00 00" />
          {keys.contactEmail && (
            <TextAnswer label="E-mail de l'officine" type="email" className="sm:col-span-2" value={text(values, keys.contactEmail)} onValueChange={(value) => set(keys.contactEmail as keyof V, value as V[keyof V])} error={errors[keys.contactEmail]} autoComplete="email" placeholder="contact@pharmacie.fr" />
          )}
        </div>
      ),
      recap: {
        label: "Coordonnées",
        value: (v) => [text(v, keys.finessNumber) && `FINESS ${text(v, keys.finessNumber)}`, text(v, keys.phone), keys.contactEmail ? text(v, keys.contactEmail) : ""].filter(Boolean).join(" · ") || null,
      },
    },
  ];
}
