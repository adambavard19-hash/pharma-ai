import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Prise en main" };

const FILMS = {
  titulaire: { src: "/video/prise-en-main-titulaire.mp4", poster: "/video/prise-en-main-titulaire.jpg", title: "Votre espace titulaire", text: "Installer les postes, suivre l'équipe, les résultats et les conseils de la pharmacie. 2 min 40." },
  pharmacien: { src: "/video/prise-en-main-pharmacien.mp4", poster: "/video/prise-en-main-pharmacien.jpg", title: "Au comptoir, avec la bannière", text: "Scanner, lire les conseils, poser les questions, terminer la vente et envoyer le bilan. 2 min." },
} as const;

/**
 * Les vidéos de prise en main (fondateur, 18 oct. 2026 : « mets la vidéo de présentation des titulaires et des pharmaciens dans leur
 * espace »). Le titulaire voit d'abord la sienne, puis celle de son équipe ; pharmaciens et préparateurs, celle du comptoir.
 */
export default async function PriseEnMainPage() {
  const session = await requirePermission(PERMISSIONS.TRAINING_VIEW);
  const films = session.role === "OWNER" ? [FILMS.titulaire, FILMS.pharmacien] : [FILMS.pharmacien];
  return (
    <div className="space-y-6">
      <PageHeader title="Prise en main" description="PharmaBoost en quelques minutes : regardez la vidéo, puis faites votre première vente au comptoir." />
      <div className="grid gap-6 xl:grid-cols-2">
        {films.map((film) => (
          <Card key={film.src}>
            <CardContent className="space-y-3 p-4">
              <video controls preload="metadata" playsInline poster={film.poster} className="aspect-video w-full rounded-lg bg-black">
                <source src={film.src} type="video/mp4" />
              </video>
              <div>
                <h2 className="text-base font-bold">{film.title}</h2>
                <p className="text-sm text-muted-foreground">{film.text}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
