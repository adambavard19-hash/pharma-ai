"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { PUSH_OFF_KEY, PUSH_TOKEN_KEY, pushPlugin } from "../../../_components/native-app";

type State = "loading" | "prompt" | "on" | "off" | "denied" | "error";

/**
 * « Activer les notifications », dans l'application iPhone seulement (rien dans un navigateur). L'autorisation n'est
 * demandée qu'ici, quand la personne la veut, après avoir lu ce qu'elle recevra. Elle peut l'arrêter sur ce téléphone.
 */
export function PushPanel() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const push = pushPlugin();
    if (!push) return;
    void push
      .checkPermissions()
      .then(({ receive }) => {
        let off = false;
        try {
          off = window.localStorage.getItem(PUSH_OFF_KEY) === "1";
        } catch {
          // stockage indisponible
        }
        setState(receive === "granted" ? (off ? "off" : "on") : receive === "denied" ? "denied" : "prompt");
      })
      .catch(() => setState("error"));
  }, []);

  const enable = async () => {
    const push = pushPlugin();
    if (!push) return;
    setState("loading");
    try {
      const { receive } = await push.requestPermissions();
      if (receive !== "granted") {
        setState("denied");
        return;
      }
      try {
        window.localStorage.removeItem(PUSH_OFF_KEY);
      } catch {
        // stockage indisponible
      }
      await push.register(); // le jeton arrive par l'écoute « registration » (NativePushListener) et part au serveur
      setState("on");
    } catch {
      setState("error");
    }
  };

  const disable = async () => {
    setState("loading");
    let token: string | null = null;
    try {
      window.localStorage.setItem(PUSH_OFF_KEY, "1");
      token = window.localStorage.getItem(PUSH_TOKEN_KEY);
    } catch {
      // stockage indisponible
    }
    if (token) await fetch("/api/mobile/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    setState("off");
  };

  if (state === null) return null;

  const on = state === "on";
  return (
    <section className="space-y-2.5">
      <h2 className="px-1 text-[13px] font-semibold tracking-wide text-ink-500 uppercase">Notifications</h2>
      <div className="space-y-3 rounded-[20px] bg-white p-4 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)] sm:p-5">
        <div className="flex items-start gap-3">
          <span className={on ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white" : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700"}>
            {on ? <Bell className="size-5" aria-hidden="true" /> : <BellOff className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-[15px] font-semibold text-ink-900">{on ? "Notifications activées sur ce téléphone" : "Activer les notifications"}</p>
            <p className="text-[13px] leading-5 text-text-secondary">
              Une prime validée, un nouveau challenge, du stock à surveiller dans votre officine : un message court, jamais de nom de patient ni de médicament. Au plus un message de chaque sorte par demi-heure.
            </p>
          </div>
        </div>
        {state === "denied" && (
          <p role="status" className="rounded-2xl bg-ink-50 px-4 py-3 text-[13px] leading-5 text-ink-700">
            Les notifications sont refusées pour PharmaBoost. Pour les autoriser : Réglages de l&apos;iPhone › PharmaBoost › Notifications.
          </p>
        )}
        {state === "error" && <p role="alert" className="rounded-2xl bg-danger-50 px-4 py-3 text-[13px] text-danger-700">Les notifications n&apos;ont pas pu être activées. Réessayez dans un instant.</p>}
        {(state === "prompt" || state === "off" || state === "error") && (
          <button type="button" onClick={enable} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-brand-gradient px-4 text-[15px] font-semibold text-white transition-transform active:scale-[0.985]">
            <Bell className="size-5" aria-hidden="true" /> Activer les notifications
          </button>
        )}
        {on && (
          <button type="button" onClick={disable} className="min-h-11 w-full rounded-[14px] text-[14.5px] font-medium text-ink-700 active:bg-ink-50">
            Ne plus recevoir de notifications sur ce téléphone
          </button>
        )}
        {state === "loading" && <p className="text-center text-[13px] text-text-tertiary">Un instant…</p>}
      </div>
    </section>
  );
}
