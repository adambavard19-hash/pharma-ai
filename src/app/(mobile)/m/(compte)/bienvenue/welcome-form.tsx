"use client";

import { ArrowRight } from "lucide-react";
import { completeWelcomeAction } from "@/server/actions/mobile-account";
import { CONSENT_TEXTS, type Profession } from "@/core/mobile/profile";
import { ConsentSwitch, FormError, MField, MInput, MSubmit, ProfessionPicker, useFormAction } from "../../_components/fields";

type Defaults = { firstName: string; lastName: string; profession: Profession | null; rpps: string; pharmacyName: string; news: boolean; partners: boolean };

export function WelcomeForm({ defaults, isClientStaff }: { defaults: Defaults; isClientStaff: boolean }) {
  const { onSubmit, pending, error, fieldErrors: errors } = useFormAction(completeWelcomeAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-3">
        <MField label="Prénom" htmlFor="firstName" error={errors.firstName}>
          <MInput id="firstName" name="firstName" defaultValue={defaults.firstName} autoComplete="given-name" required />
        </MField>
        <MField label="Nom" htmlFor="lastName" error={errors.lastName}>
          <MInput id="lastName" name="lastName" defaultValue={defaults.lastName} autoComplete="family-name" required />
        </MField>
      </div>
      <ProfessionPicker name="profession" defaultValue={defaults.profession} error={errors.profession} />
      <MField label="Numéro RPPS" htmlFor="rpps" optional error={errors.rpps} hint="11 chiffres, déclaratif : affiché « non vérifié ».">
        <MInput id="rpps" name="rpps" defaultValue={defaults.rpps} inputMode="numeric" autoComplete="off" maxLength={14} />
      </MField>
      {/* Un collaborateur d'officine cliente a déjà son officine : le champ libre ne sert qu'aux comptes gratuits. */}
      {!isClientStaff && (
        <MField label="Votre officine" htmlFor="pharmacyName" optional>
          <MInput id="pharmacyName" name="pharmacyName" defaultValue={defaults.pharmacyName} autoComplete="organization" placeholder="Pharmacie du Centre, Lyon" />
        </MField>
      )}
      <div className="space-y-2.5">
        <p className="px-0.5 text-[13.5px] font-semibold text-ink-800">Vos accords <span className="font-medium text-ink-400">— facultatifs</span></p>
        <ConsentSwitch name="consentNews" title={CONSENT_TEXTS.PHARMABOOST_NEWS.title} body={CONSENT_TEXTS.PHARMABOOST_NEWS.body} defaultChecked={defaults.news} />
        <ConsentSwitch name="consentPartners" title={CONSENT_TEXTS.PARTNER_COMMUNICATIONS.title} body={CONSENT_TEXTS.PARTNER_COMMUNICATIONS.body} defaultChecked={defaults.partners} />
      </div>
      <MSubmit pending={pending} iconAfter icon={<ArrowRight className="size-5" aria-hidden="true" />}>C&apos;est parti</MSubmit>
    </form>
  );
}
