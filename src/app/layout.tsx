import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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
    <html lang="fr" className={jakarta.variable} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
