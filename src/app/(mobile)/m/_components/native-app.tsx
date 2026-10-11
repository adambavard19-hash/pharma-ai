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
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { StatusBar?: { setStyle?: (options: { style: "DARK" | "LIGHT" }) => Promise<void> } } };

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
