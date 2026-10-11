"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * PharmaBoost Mobile ouvert dans l'application iPhone (coque native, application-mobile/) plutôt que dans un navigateur.
 *
 * Dans l'application, il n'y a ni barre d'adresse ni bouton « retour » : une page hors de /m (le site, la
 * confidentialité, le mot de passe oublié) y serait un cul-de-sac. Elle s'ouvre donc dans Safari. Et l'application
 * ne montre pas l'offre commerciale (règles de l'App Store sur les achats hors application).
 */
type Listener = { remove: () => Promise<void> };
export type PushPlugin = {
  checkPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" }>;
  requestPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" }>;
  register: () => Promise<void>;
  addListener: (event: string, callback: (data: never) => void) => Promise<Listener>;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { StatusBar?: { setStyle?: (options: { style: "DARK" | "LIGHT" }) => Promise<void> }; PushNotifications?: PushPlugin } };

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.()) || /PharmaBoostApp/.test(navigator.userAgent);
}

const subscribe = () => () => undefined;

/** Vrai dans l'application iPhone, faux dans un navigateur ; `null` pendant le rendu serveur (on ne sait pas encore). */
export function useNativeApp(): boolean | null {
  return useSyncExternalStore(subscribe, isNativeApp, () => null);
}

/** Ce qui ne s'affiche que dans un navigateur (l'offre commerciale), jamais dans l'application de l'App Store. */
export function WebOnly({ children }: { children: ReactNode }) {
  return useNativeApp() === false ? <>{children}</> : null;
}

/** Une adresse à ouvrir dans Safari plutôt que dans l'application : tout ce qui sort de /m. */
export function leavesApp(href: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin !== origin) return true;
  return !(url.pathname === "/m" || url.pathname.startsWith("/m/"));
}

/** Dans l'application : les liens qui sortent de /m s'ouvrent dans Safari (la coque iOS ouvre les nouvelles fenêtres dans Safari). */
export function NativeLinkGuard() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.dataset.nativeApp = "";
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !leavesApp(anchor.href, window.location.origin)) return;
      event.preventDefault();
      window.open(anchor.href, "_blank", "noopener");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}

/** Les écrans d'accueil (connexion, inscription, bienvenue) ont un en-tête vert foncé : l'heure et la batterie y passent en clair. */
const DARK_HEADER = ["/m/connexion", "/m/inscription", "/m/bienvenue"];

/** Dans l'application : la couleur du texte de la barre d'état (heure, batterie) suit le haut de l'écran. */
export function NativeStatusBar() {
  const pathname = usePathname();
  useEffect(() => {
    if (!isNativeApp()) return;
    const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    // « DARK » : texte clair, pour un fond foncé (vocabulaire du module StatusBar de Capacitor).
    const style = DARK_HEADER.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ? "DARK" : "LIGHT";
    void capacitor?.Plugins?.StatusBar?.setStyle?.({ style }).catch(() => undefined);
  }, [pathname]);
  return null;
}

/** Le module des notifications push de la coque iPhone, s'il est là (versions de l'application qui l'embarquent). */
export function pushPlugin(): PushPlugin | null {
  if (!isNativeApp()) return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins?.PushNotifications ?? null;
}

/** « Désactiver sur ce téléphone » : retenu ici, pour ne pas réenregistrer le téléphone à la prochaine ouverture. */
export const PUSH_OFF_KEY = "pharmaboost:push-off";
export const PUSH_TOKEN_KEY = "pharmaboost:push-token";

export function pushTurnedOff(): boolean {
  try {
    return window.localStorage.getItem(PUSH_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** Donne le jeton du téléphone au serveur (compte connecté). */
export async function sendPushToken(token: string): Promise<boolean> {
  try {
    window.localStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // stockage indisponible : le jeton part quand même
  }
  const response = await fetch("/api/mobile/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, environment: "production" }) }).catch(() => null);
  return Boolean(response?.ok);
}

/**
 * Dans l'application iPhone : toucher une notification ouvre l'écran qu'elle annonce ; et si la personne a déjà accepté
 * les notifications, le jeton du téléphone est redonné au serveur à chaque ouverture (Apple peut le changer). Ne demande
 * JAMAIS l'autorisation : c'est l'encart « Activer les notifications » de Mon espace qui le fait, à la demande.
 */
export function NativePushListener() {
  useEffect(() => {
    const push = pushPlugin();
    if (!push) return;
    const listeners: Promise<Listener>[] = [
      push.addListener("registration", ((token: { value: string }) => void sendPushToken(token.value)) as (data: never) => void),
      push.addListener("pushNotificationActionPerformed", ((action: { notification?: { data?: { url?: unknown } } }) => {
        const url = action.notification?.data?.url;
        if (typeof url === "string" && /^\/m(\/|$|\?)/.test(url)) window.location.assign(url);
      }) as (data: never) => void),
    ];
    if (!pushTurnedOff()) void push.checkPermissions().then((status) => (status.receive === "granted" ? push.register() : undefined)).catch(() => undefined);
    return () => {
      for (const listener of listeners) void listener.then((handle) => handle.remove()).catch(() => undefined);
    };
  }, []);
  return null;
}
