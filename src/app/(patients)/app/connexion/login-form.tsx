"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { requestAppLoginAction, verifyAppLoginCodeAction } from "@/server/actions/app-members";
import { Card, GRAD } from "../_components/ui";

/**
 * L'adresse e-mail, puis le code à 6 chiffres reçu par e-mail, tapé ici : la session s'ouvre dans l'appli même (sur iPhone, le
 * lien de l'e-mail s'ouvre dans Safari). Dans l'aperçu, le code et le lien s'affichent aussi ici.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const [state, setState] = useState<{ sent: boolean; previewUrl: string | null; previewCode: string | null; error: string | null }>({ sent: false, previewUrl: null, previewCode: null, error: null });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const result = await requestAppLoginAction(email);
      setCode("");
      setCodeError(null);
      setState(result.ok ? { sent: true, previewUrl: result.data.previewUrl, previewCode: result.data.previewCode, error: null } : { sent: false, previewUrl: null, previewCode: null, error: result.error });
    });
  const verify = (value: string) =>
    start(async () => {
      const result = await verifyAppLoginCodeAction(email, value);
      if (!result.ok) {
        setCodeError(result.error);
        return;
      }
      router.replace("/app/ma-pharmacie?bienvenue=1");
      router.refresh();
    });
  if (state.sent) {
    return (
      <Card className="mt-5 text-center">
        <Mail className="mx-auto size-8 text-[#0E8A7B]" aria-hidden="true" />
        <p className="mt-2 text-[17px] font-extrabold">Regardez vos e-mails</p>
        <p className="mt-1 text-[14px] leading-6 text-[#4B6A62]">Un code à 6 chiffres vient de partir vers {email}. Tapez-le ici :</p>
        <input
          aria-label="Code à 6 chiffres"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(event) => {
            const value = event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(value);
            setCodeError(null);
            if (value.length === 6) verify(value);
          }}
          placeholder="••••••"
          className="mx-auto mt-3 block h-14 w-52 rounded-2xl border border-[#E3ECE9] bg-[#F7FBFA] text-center text-[26px] font-extrabold tracking-[0.35em] outline-none focus:border-[#0E8A7B]"
        />
        {codeError && <p className="mt-2 text-[13px] text-[#B42318]">{codeError}</p>}
        <button type="button" disabled={code.length !== 6 || pending} onClick={() => verify(code)} className="mt-3 h-12 w-full rounded-2xl text-[15px] font-bold text-white disabled:opacity-50" style={{ background: GRAD }}>
          {pending ? "Vérification…" : "Ouvrir mon espace"}
        </button>
        <p className="mt-3 text-[12.5px] leading-5 text-[#94A3A0]">Le code reste valable 30 minutes.</p>
        <div className="mt-2 flex justify-center gap-4 text-[13px] font-bold text-[#0E8A7B]">
          <button type="button" disabled={pending} onClick={submit}>Renvoyer un code</button>
          <button type="button" onClick={() => setState({ sent: false, previewUrl: null, previewCode: null, error: null })}>Changer d&apos;adresse</button>
        </div>
        {(state.previewCode || state.previewUrl) && (
          <p className="mt-4 rounded-2xl bg-[#F3F8F6] px-3 py-2 text-[12px] text-[#4B6A62]" data-app-lien-apercu="">
            Aperçu : {state.previewCode ? <>code <b>{state.previewCode}</b></> : null}
            {state.previewUrl && <> · <a href={state.previewUrl} className="underline">ouvrir le lien</a></>}
          </p>
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
        {pending ? "Envoi…" : "Recevoir mon code"}
      </button>
      <p className="mt-3 text-[12px] leading-4 text-[#94A3A0]">Votre adresse sert à vous connecter et, si vous l&apos;acceptez, à recevoir les offres de votre pharmacie. Elle n&apos;est jamais transmise.</p>
    </Card>
  );
}
