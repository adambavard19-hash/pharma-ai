"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Loader2, Paperclip, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/**
 * Ajouter une ordonnance : deux choix, rien d'autre.
 *
 * Le champ de fichier ne vit PAS dans cette fenêtre. Il est monté en
 * permanence par l'écran parent et n'est jamais démonté : c'est la seule
 * façon d'être certain que le `change` du navigateur trouvera encore un
 * gestionnaire vivant quand l'utilisateur revient du sélecteur macOS, quoi
 * qu'il soit arrivé à la fenêtre entre-temps. On ne fait ici qu'appuyer
 * dessus.
 */
export function PrescriptionSourceModal({
  open,
  onClose,
  onOpenFilePicker,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  /** Déclenche le champ permanent tenu par l'écran parent. */
  onOpenFilePicker: () => void;
  onFile: (file: File) => void;
}) {
  const [camera, setCamera] = useState(false);

  if (camera) {
    return (
      <PhotoCapture
        onCancel={() => setCamera(false)}
        onCapture={(file) => {
          setCamera(false);
          onClose();
          onFile(file);
        }}
        onFallback={() => {
          setCamera(false);
          onOpenFilePicker();
        }}
      />
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Ajouter une ordonnance">
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setCamera(true)} className={choiceClasses}>
          <ChoiceBody
            icon={<Camera className="size-7" />}
            title="Prendre une photo"
            hint="Avec la caméra"
          />
        </button>

        <button type="button" onClick={onOpenFilePicker} className={choiceClasses}>
          <ChoiceBody
            icon={<Paperclip className="size-7" />}
            title="Choisir un fichier"
            hint="PDF, JPG, PNG, WEBP"
          />
        </button>
      </div>

      <p className="mt-3 text-center text-[12px] text-text-tertiary">
        PDF, JPG, PNG ou WEBP · 12 Mo maximum
      </p>
    </Modal>
  );
}

const choiceClasses = cn(
  "flex w-full cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-border-default bg-surface-card px-4 py-8",
  "transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-500 hover:shadow-md active:translate-y-0",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
);

function ChoiceBody({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <>
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
        {icon}
      </span>
      <span className="text-center">
        <span className="block text-[16px] leading-6 font-semibold text-text-primary">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] text-text-tertiary">{hint}</span>
      </span>
    </>
  );
}

/**
 * Prise de vue de l'ordonnance.
 *
 * Flux caméra, déclencheur, aperçu, puis « utiliser » ou « reprendre » — une
 * ordonnance mal cadrée est illisible, et s'en apercevoir plus tard fait
 * recommencer la délivrance. Sans caméra accessible, on bascule sur le
 * sélecteur de fichier plutôt que de laisser un écran noir.
 */
function PhotoCapture({
  onCapture,
  onCancel,
  onFallback,
}: {
  onCapture: (file: File) => void;
  onCancel: () => void;
  onFallback: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [etat, setEtat] = useState<"DEMARRAGE" | "PRET" | "SANS_CAMERA">("DEMARRAGE");
  const [detail, setDetail] = useState<string | null>(null);
  const [apercu, setApercu] = useState<{ url: string; file: File } | null>(null);

  const arreter = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const ouvrirFlux = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setEtat("SANS_CAMERA");
      setDetail("Ce navigateur ne donne pas accès à la caméra.");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setEtat("PRET");
      return stream;
    } catch (error) {
      setEtat("SANS_CAMERA");
      setDetail(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "L'accès à la caméra a été refusé."
          : "Aucune caméra disponible sur ce poste.",
      );
      return null;
    }
  }, []);

  useEffect(() => {
    let annule = false;
    // Différé d'un tick : l'ouverture du flux met à jour l'état, et le faire
    // dans le corps de l'effet déclencherait un rendu en cascade.
    const timer = setTimeout(() => {
      void ouvrirFlux().then((stream) => {
        if (annule && stream) stream.getTracks().forEach((track) => track.stop());
      });
    }, 0);
    return () => {
      annule = true;
      clearTimeout(timer);
      arreter();
    };
  }, [arreter, ouvrirFlux]);

  useEffect(() => {
    return () => {
      if (apercu) URL.revokeObjectURL(apercu.url);
    };
  }, [apercu]);

  const declencher = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `ordonnance-${Date.now()}.jpg`, { type: "image/jpeg" });
        setApercu({ url: URL.createObjectURL(file), file });
        arreter();
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[15px] font-medium text-white">Photographier l&apos;ordonnance</p>
        <button
          type="button"
          onClick={() => {
            arreter();
            onCancel();
          }}
          aria-label="Fermer la caméra"
          className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu.url} alt="Aperçu de l'ordonnance" className="size-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="size-full object-cover"
            aria-label="Flux de la caméra"
          />
        )}

        {etat === "DEMARRAGE" && !apercu && (
          <p className="absolute flex items-center gap-2 text-[14px] text-white/90">
            <Loader2 className="size-4 animate-spin" />
            Ouverture de la caméra…
          </p>
        )}

        {etat === "SANS_CAMERA" && !apercu && (
          <div className="absolute inset-x-0 mx-auto max-w-sm px-6 text-center">
            <CameraOff className="mx-auto size-8 text-white/70" />
            <p className="mt-3 text-[15px] font-medium text-white">{detail}</p>
            <Button className="mt-4" onClick={onFallback}>
              Choisir une photo sur cet appareil
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-5">
        {apercu ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                URL.revokeObjectURL(apercu.url);
                setApercu(null);
                setEtat("DEMARRAGE");
                void ouvrirFlux();
              }}
              leadingIcon={<RotateCcw className="size-4" />}
            >
              Reprendre
            </Button>
            <Button size="lg" onClick={() => onCapture(apercu.file)}>
              Utiliser cette photo
            </Button>
          </>
        ) : (
          etat === "PRET" && (
            <button
              type="button"
              onClick={declencher}
              aria-label="Prendre la photo"
              className="size-16 rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95"
            />
          )
        )}
      </div>
    </div>
  );
}
