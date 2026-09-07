"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lecture de code-barres par la caméra.
 *
 * Elle s'appuie sur `BarcodeDetector`, l'API du navigateur : aucune
 * bibliothèque embarquée, aucune image envoyée ailleurs — l'analyse a lieu
 * dans l'onglet, sur le flux vidéo, et rien n'en sort.
 *
 * Trois issues possibles, toutes annoncées telles quelles : la caméra lit le
 * code ; le navigateur n'a pas de lecteur de code-barres ; l'accès caméra est
 * refusé ou absent. Dans les deux derniers cas on renvoie vers la douchette,
 * qui reste le matériel réel du comptoir — on ne fait pas semblant de scanner.
 */
type Etat =
  | { kind: "DEMARRAGE" }
  | { kind: "LECTURE" }
  | { kind: "SANS_DETECTEUR" }
  | { kind: "SANS_CAMERA"; detail: string };

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

/** Formats portés par les boîtes de médicament et la parapharmacie. */
const FORMATS = ["ean_13", "ean_8", "code_128", "data_matrix", "upc_a", "upc_e"];

export function BarcodeScanner({
  onDetected,
  onFallback,
  onClose,
}: {
  onDetected: (code: string) => void;
  /** L'utilisateur bascule sur la saisie / douchette. */
  onFallback: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const boucleRef = useRef<number | null>(null);
  const [etat, setEtat] = useState<Etat>({ kind: "DEMARRAGE" });
  const [dernierCode, setDernierCode] = useState<string | null>(null);

  const arreter = useCallback(() => {
    if (boucleRef.current !== null) {
      cancelAnimationFrame(boucleRef.current);
      boucleRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let annule = false;

    const demarrer = async () => {
      const Detector = (
        window as unknown as { BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike }
      ).BarcodeDetector;

      if (!Detector) {
        setEtat({ kind: "SANS_DETECTEUR" });
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (error) {
        setEtat({
          kind: "SANS_CAMERA",
          detail:
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "L'accès à la caméra a été refusé."
              : "Aucune caméra disponible sur ce poste.",
        });
        return;
      }

      if (annule) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setEtat({ kind: "LECTURE" });

      const detecteur = new Detector({ formats: FORMATS });

      const lire = async () => {
        if (annule || !videoRef.current) return;
        try {
          const codes = await detecteur.detect(videoRef.current);
          const code = codes[0]?.rawValue?.trim();
          if (code) {
            setDernierCode(code);
            onDetected(code);
            return; // Un code suffit : le parent referme.
          }
        } catch {
          // Image illisible sur cette frame : on retente à la suivante.
        }
        boucleRef.current = requestAnimationFrame(() => void lire());
      };

      boucleRef.current = requestAnimationFrame(() => void lire());
    };

    void demarrer();

    return () => {
      annule = true;
      arreter();
    };
  }, [arreter, onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[15px] font-medium text-white">Scanner un médicament</p>
        <button
          type="button"
          onClick={() => {
            arreter();
            onClose();
          }}
          aria-label="Fermer le scanner"
          className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="size-full object-cover"
          aria-label="Flux de la caméra"
        />

        {etat.kind === "LECTURE" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-[78%] max-w-sm rounded-2xl border-[3px] border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {etat.kind === "DEMARRAGE" && (
          <p className="absolute flex items-center gap-2 text-[14px] text-white/90">
            <Loader2 className="size-4 animate-spin" />
            Ouverture de la caméra…
          </p>
        )}

        {(etat.kind === "SANS_DETECTEUR" || etat.kind === "SANS_CAMERA") && (
          <div className="absolute inset-x-0 mx-auto max-w-sm px-6 text-center">
            <CameraOff className="mx-auto size-8 text-white/70" />
            <p className="mt-3 text-[15px] font-medium text-white">
              {etat.kind === "SANS_DETECTEUR"
                ? "Ce navigateur ne sait pas lire un code-barres"
                : etat.detail}
            </p>
            <p className="mt-1.5 text-[13px] leading-5 text-white/70">
              Utilisez la douchette du comptoir : elle tape le code puis valide,
              exactement comme un clavier.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                arreter();
                onFallback();
              }}
            >
              Passer à la douchette
            </Button>
          </div>
        )}
      </div>

      <div className="px-4 py-4 text-center">
        <p className="text-[13px] text-white/70">
          {dernierCode ? `Code lu : ${dernierCode}` : "Présentez le code-barres dans le cadre"}
        </p>
        <button
          type="button"
          onClick={() => {
            arreter();
            onFallback();
          }}
          className="mt-2 text-[13px] text-white/80 underline underline-offset-2"
        >
          Saisir à la main
        </button>
      </div>
    </div>
  );
}
