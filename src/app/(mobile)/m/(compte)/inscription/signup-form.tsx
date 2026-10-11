"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { mobileSignupAction } from "@/server/actions/mobile-auth";
import { CONSENT_TEXTS } from "@/core/mobile/profile";
import { ConsentSwitch, FormError, MField, MInput, MPasswordInput, MSubmit, ProfessionPicker, useFormAction } from "../../_components/fields";

/**
 * L'inscription gratuite. Les deux accords (nouveautés PharmaBoost, communications des partenaires) sont des cases
 * DÉCOCHÉES : l'inscription aboutit sans elles, et la personne peut y revenir dans « Mon espace ».
 */
export function MobileSignupForm() {
  const { onSubmit, pending, error, fieldErrors: errors } = useFormAction(mobileSignupAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormError message={error} />

      <div className="grid grid-cols-2 gap-3">
        <MField label="Prénom" htmlFor="firstName" error={errors.firstName}>
          <MInput id="firstName" name="firstName" autoComplete="given-name" required aria-invalid={Boolean(errors.firstName)} />
        </MField>
        <MField label="Nom" htmlFor="lastName" error={errors.lastName}>
          <MInput id="lastName" name="lastName" autoComplete="family-name" required aria-invalid={Boolean(errors.lastName)} />
        </MField>
      </div>

      <MField label="Adresse e-mail" htmlFor="email" error={errors.email}>
        <MInput id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="prenom.nom@exemple.fr" required aria-invalid={Boolean(errors.email)} />
      </MField>

      <MField label="Mot de passe" htmlFor="password" error={errors.password} hint="12 caractères au moins, avec une majuscule, une minuscule et un chiffre.">
        <MPasswordInput id="password" name="password" autoComplete="new-password" required aria-invalid={Boolean(errors.password)} />
      </MField>

      <ProfessionPicker name="profession" error={errors.profession} />

      <MField label="Numéro RPPS" htmlFor="rpps" optional error={errors.rpps} hint="11 chiffres. Déclaratif : PharmaBoost ne le vérifie pas, il s'affiche « non vérifié ».">
        <MInput id="rpps" name="rpps" inputMode="numeric" autoComplete="off" pattern="[0-9 ]*" maxLength={14} placeholder="10101234567" aria-invalid={Boolean(errors.rpps)} />
      </MField>

      <MField label="Votre officine" htmlFor="pharmacyName" optional error={errors.pharmacyName}>
        <MInput id="pharmacyName" name="pharmacyName" autoComplete="organization" placeholder="Pharmacie du Centre, Lyon" />
      </MField>

      <div className="space-y-2.5">
        <p className="px-0.5 text-[13.5px] font-semibold text-ink-800">Vos accords <span className="font-medium text-ink-400">— facultatifs</span></p>
        <ConsentSwitch name="consentNews" title={CONSENT_TEXTS.PHARMABOOST_NEWS.title} body={CONSENT_TEXTS.PHARMABOOST_NEWS.body} />
        <ConsentSwitch name="consentPartners" title={CONSENT_TEXTS.PARTNER_COMMUNICATIONS.title} body={CONSENT_TEXTS.PARTNER_COMMUNICATIONS.body} />
      </div>

      <MSubmit pending={pending} icon={<UserPlus className="size-5" aria-hidden="true" />}>Créer mon compte gratuit</MSubmit>
      <p className="text-center text-[12px] leading-5 text-text-tertiary">
        Vos données servent à votre compte et à vos formations. Détails dans la{" "}
        <Link href="/decouvrir/confidentialite" className="underline underline-offset-2">politique de confidentialité</Link>.
      </p>
    </form>
  );
}
