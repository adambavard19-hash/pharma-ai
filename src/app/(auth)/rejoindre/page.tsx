import type { Metadata } from "next";
import { PharmaWordmark } from "@/components/app/logo";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Rejoindre mon officine" };

/**
 * « Rejoindre mon officine » : un collaborateur dont le titulaire n'a pas (encore) envoyé d'invitation cherche sa pharmacie et demande à la
 * rejoindre. Rien n'est ouvert tant que le titulaire n'a pas approuvé.
 */
export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-12">
      <div className="space-y-6 rounded-2xl border border-border-subtle bg-surface-card p-7">
        <div className="space-y-3">
          <PharmaWordmark />
          <h1 className="text-[22px] leading-7 font-bold tracking-[-0.025em] text-text-primary">Rejoindre mon officine</h1>
          <p className="text-[13.5px] leading-5 text-text-secondary">Retrouvez votre pharmacie et envoyez une demande. Le titulaire la reçoit et doit l&apos;approuver : tant qu&apos;il ne l&apos;a pas fait, vous n&apos;avez accès à rien.</p>
        </div>
        <JoinForm />
      </div>
    </main>
  );
}
