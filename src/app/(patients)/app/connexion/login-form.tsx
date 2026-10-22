"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { requestAppLoginAction } from "@/server/actions/app-members";
import { Card, GRAD } from "../_components/ui";

/** L'adresse e-mail, puis « Lien envoyé ». Dans l'aperçu, le lien s'affiche aussi ici (pas de boîte e-mail à ouvrir). */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ sent: boolean; previewUrl: string | null; error: string | null }>({ sent: false, previewUrl: null, error: null });
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const result = await requestAppLoginAction(email);
      setState(result.ok ? { sent: true, previewUrl: result.data.previewUrl, error: null } : { sent: false, previewUrl: null, error: result.error });
    });
  if (state.sent) {
    return (
      <Card className="mt-5 text-center">
        <Mail className="mx-auto size-8 text-[#0E8A7B]" aria-hidden="true" />
        <p className="mt-2 text-[17px] font-extrabold">Regardez vos e-mails</p>
        <p className="mt-1 text-[14px] leading-6 text-[#4B6A62]">Un lien vient de partir vers {email}. Ouvrez-le sur ce téléphone : il reste valable 30 minutes.</p>
        {state.previewUrl && (
          <a href={state.previewUrl} data-app-lien-apercu="" className="mt-4 inline-block rounded-2xl px-4 py-3 text-[14px] font-bold text-white" style={{ background: GRAD }}>
            Aperçu : ouvrir le lien
          </a>
        )}
      </Card>
    );
  }
  return (
    <Card className="mt-5">
      <label htmlFor="app-email" className="text-[13px] font-bold">Votre adresse e-mail</label>
      <input
        id="app-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && email) submit(); }}
        placeholder="prenom@exemple.fr"
        className="mt-1.5 h-12 w-full rounded-2xl border border-[#E3ECE9] bg-[#F7FBFA] px-4 text-[15px] outline-none focus:border-[#0E8A7B]"
      />
      {state.error && <p className="mt-2 text-[13px] text-[#B42318]">{state.error}</p>}
      <button type="button" disabled={!email || pending} onClick={submit} className="mt-3 h-12 w-full rounded-2xl text-[15px] font-bold text-white disabled:opacity-50" style={{ background: GRAD }}>
        {pending ? "Envoi…" : "Recevoir mon lien"}
      </button>
      <p className="mt-3 text-[12px] leading-4 text-[#94A3A0]">Votre adresse sert à vous connecter et, si vous l&apos;acceptez, à recevoir les offres de votre pharmacie. Elle n&apos;est jamais transmise.</p>
    </Card>
  );
}
