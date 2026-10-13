import type { Metadata, Viewport } from "next";
import { Google_Sans_Flex, Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import { APP_NAME, APP_TAGLINE } from "@/config/constants";
import "./globals.css";

/**
 * Plus Jakarta Sans, auto-hébergée par Next.js : aucune requête vers Google au moment de la visite. Police
 * variable (graisses 200 à 800) : un seul fichier pour les 400, 500, 600 et 700 du design. Elle est exposée
 * en variable CSS et branchée sur `--font-sans` dans `globals.css`.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Google Sans Flex : la police de l'espace pharmacie seulement (src/app/(app), habillage « ESPACE PHARMACIE » de
 * globals.css). Déclarée ici pour que sa variable vaille aussi dans ce qui s'ouvre hors de l'arbre (fenêtres, île) ;
 * sans préchargement, le fichier n'est téléchargé que là où la police sert — jamais sur le site ni dans la console.
 * Police variable : un fichier pour les graisses 300 (titres), 400 (texte), 500 (surtitres, noms) et 600.
 */
const googleSans = Google_Sans_Flex({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  preload: false,
  variable: "--font-gsans",
});

export const metadata: Metadata = {
  // L'adresse publique : les images de partage et les liens absolus des métadonnées en partent (sans elle, une URL relative).
  metadataBase: new URL("https://pharmaboost.app"),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "PharmaBoost transforme chaque délivrance en parcours de conseil : au scan, le conseil qui accompagne le traitement, des recommandations justifiées et la mesure de la valeur créée. Le pharmacien reste décisionnaire.",
  applicationName: APP_NAME,
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1214" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${googleSans.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
