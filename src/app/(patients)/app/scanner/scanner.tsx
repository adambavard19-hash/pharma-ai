"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Search } from "lucide-react";
import { ACCENT, Card, GRAD, PageTitle } from "../_components/ui";

type CameraState = "starting" | "on" | "denied" | "unavailable";

/**
 * Le scan : la caméra arrière lit le code-barres (EAN, CIP) ou le Datamatrix de la boîte (ZXing, qui marche dans Safari et
 * dans la coque iPhone, là où BarcodeDetector n'existe pas). Le code lu ouvre la fiche ; rien n'est gardé. En secours, la
 * saisie : un code tapé, ou un nom (recherche).
 */
export function Scanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [text, setText] = useState("");

  useEffect(() => {
    let stop: (() => void) | null = null;
    let done = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !video.current) {
        setState("unavailable");
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX]]]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (result) => {
          if (!result || done) return;
          done = true;
          navigator.vibrate?.(60);
          router.push(`/app/fiche?code=${encodeURIComponent(result.getText())}`);
        });
        stop = () => controls.stop();
        setState("on");
      } catch (error) {
        setState(error instanceof Error && /denied|NotAllowed|Permission/i.test(`${error.name} ${error.message}`) ? "denied" : "unavailable");
      }
    })();
    return () => {
      done = true;
      stop?.();
    };
  }, [router]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    router.push(/^[\d\s]{7,}$/.test(value) ? `/app/fiche?code=${encodeURIComponent(value.replace(/\s/g, ""))}` : `/app/recherche?q=${encodeURIComponent(value)}`);
  };

  return (
    <div className="px-5 pt-4">
      <PageTitle sub="Placez le code-barres de la boîte dans le cadre.">Scanner</PageTitle>
      <style>{`@keyframes pb-scan{0%,100%{top:12%}50%{top:84%}}`}</style>
      <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-[28px] bg-[#0B1513]">
        <video ref={video} className="size-full object-cover" muted playsInline aria-label="Caméra" />
        {state === "on" && <span className="absolute inset-x-8 h-[3px] rounded-full bg-[#5EEAD4] shadow-[0_0_18px_#5EEAD4]" style={{ animation: "pb-scan 1.6s ease-in-out infinite" }} />}
        {state !== "on" && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-white/80">
            <span>
              <Camera className="mx-auto mb-2 size-7" aria-hidden="true" />
              {state === "starting" ? "Ouverture de la caméra…" : state === "denied" ? "La caméra n'est pas autorisée : autorisez-la dans les réglages, ou tapez le code ci-dessous." : "Pas de caméra disponible ici : tapez le code ou le nom ci-dessous."}
            </span>
          </div>
        )}
      </div>

      <Card className="mt-5" >
        <label htmlFor="saisie" className="text-[13px] font-bold">Ou tapez le code-barres, ou le nom</label>
        <div className="mt-2 flex gap-2">
          <input
            id="saisie"
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 80))}
            onKeyDown={(event) => event.key === "Enter" && submit()}
            placeholder="3400935332639 ou doxycycline"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#D5E3DF] bg-white px-3 text-[15px] outline-none focus:border-[#0E8A7B]"
            autoComplete="off"
            inputMode="search"
          />
          <button type="button" onClick={submit} aria-label="Chercher" className="grid size-11 place-items-center rounded-xl text-white" style={{ background: GRAD }}>
            <Search className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: ACCENT }}>Rien n&apos;est enregistré.</p>
      </Card>
    </div>
  );
}
