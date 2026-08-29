"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";
type Toast = { id: number; tone: ToastTone; title: string; description?: string };

const ToastContext = createContext<{
  push: (toast: Omit<Toast, "id">) => void;
} | null>(null);

/**
 * Durée d'affichage. Assez longue pour être lue, assez courte pour ne pas
 * s'attarder devant un patient qui attend.
 */
const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { ...toast, id }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  const icons = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
  } as const;

  const tones = {
    success: "text-success-600 dark:text-success-500",
    error: "text-danger-600 dark:text-danger-500",
    warning: "text-warning-700 dark:text-warning-500",
    info: "text-info-600 dark:text-info-500",
  } as const;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        `bottom-24` dégage la barre d'action collante des écrans de vente : une
        confirmation ne doit jamais recouvrir le bouton suivant. Et le conteneur
        ne capte aucun clic — seule la croix de fermeture le fait — pour qu'un
        clic mal placé atteigne quand même ce qu'il visait.
      */}
      <div
        className="pointer-events-none fixed right-4 bottom-24 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = icons[toast.tone];
          return (
            <div
              key={toast.id}
              className={cn(
                "flex gap-3 rounded-lg border border-border-subtle",
                "bg-surface-card p-3.5 shadow-lg animate-[slide-up_0.25s_cubic-bezier(0.16,1,0.3,1)]",
              )}
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", tones[toast.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-text-primary">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-[12.5px] text-text-secondary">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="pointer-events-auto -mt-1 -mr-1 h-fit rounded p-1 text-text-tertiary hover:text-text-primary"
                aria-label="Fermer la notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast doit être utilisé dans un ToastProvider");
  return context;
}
