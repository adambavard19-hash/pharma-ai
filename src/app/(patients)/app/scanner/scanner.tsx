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
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let done = false;
    const found = (code: string) => {
      if (done || !code) return;
      done = true;
      navigator.vibrate?.(60);
      setOpening(true);
      router.push(`/app/fiche?code=${encodeURIComponent(code)}`);
    };
    // Haute définition et mise au point continue : un code-barres de boîte est petit, la définition par défaut (640 × 480)
    // le rend illisible tant que le téléphone n'est pas collé à la boîte.
    const constraints: MediaStreamConstraints = {
      video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] },
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !video.current) {
        setState("unavailable");
        return;
      }
      try {
        // Le lecteur natif du téléphone quand il existe (Android, Chrome) : bien plus rapide que la lecture en JavaScript.
        const Native = (window as unknown as { BarcodeDetector?: { new (options: { formats: string[] }): { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        const nativeFormats = Native?.getSupportedFormats ? await Native.getSupportedFormats().catch(() => []) : [];
        if (Native && nativeFormats.includes("ean_13")) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          const element = video.current;
          element.srcObject = stream;
          await element.play();
          const detector = new Native({ formats: ["ean_13", "ean_8", "code_128", "data_matrix"].filter((format) => nativeFormats.includes(format)) });
          let timer: ReturnType<typeof setTimeout> | null = null;
          const tick = async () => {
            if (done) return;
            const codes = await detector.detect(element).catch(() => []);
            if (codes[0]?.rawValue) return found(codes[0].rawValue);
            timer = setTimeout(tick, 60);
          };
          stop = () => {
            if (timer) clearTimeout(timer);
            stream.getTracks().forEach((track) => track.stop());
          };
          setState("on");
          void tick();
          return;
        }
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.DATA_MATRIX, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128]]]);
        // Une tentative toutes les 60 ms au lieu de 500 (réglage par défaut) : c'était l'essentiel de l'attente.
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 60, delayBetweenScanSuccess: 300 });
        const controls = await reader.decodeFromConstraints(constraints, video.current, (result) => {
          if (result) found(result.getText());
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
        {opening && <div className="absolute inset-0 z-10 grid place-items-center bg-[#0B1513]/70 text-[15px] font-bold text-white">Code lu · ouverture de la fiche…</div>}
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
