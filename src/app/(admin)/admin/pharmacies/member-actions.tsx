"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Power, Trash2 } from "lucide-react";
import { deletePharmacyMemberAction, resendPharmacyMemberAccessAction, setPharmacyMemberAccessAction } from "@/server/actions/platform-pharmacies";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Les gestes de la console sur un compte d'officine : renvoyer l'accès, suspendre, supprimer. */
export function MemberActions({ pharmacyId, membershipId, isActive, name }: { pharmacyId: string; membershipId: string; isActive: boolean; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await fn();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : (result.error ?? "Erreur") });
      router.refresh();
    });
  return (
    <span className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Mail className="size-3.5" />} onClick={() => run(() => resendPharmacyMemberAccessAction({ pharmacyId, membershipId }))}>Renvoyer l&apos;accès</Button>
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Power className="size-3.5" />} onClick={() => run(() => setPharmacyMemberAccessAction({ pharmacyId, membershipId, isActive: !isActive }))}>{isActive ? "Suspendre" : "Réactiver"}</Button>
      <Button size="sm" variant="ghost" loading={pending} leadingIcon={<Trash2 className="size-3.5" />} onClick={() => { if (window.confirm(`Supprimer le compte de ${name} ? Il ne pourra plus se connecter.`)) run(() => deletePharmacyMemberAction({ pharmacyId, membershipId })); }}>Supprimer</Button>
    </span>
  );
}
