import { redirect } from "next/navigation";

/**
 * Ancien écran de détail d'ordonnance, fusionné dans l'écran de vente.
 *
 * L'adresse reste vivante : des liens, des favoris et des notifications déjà
 * envoyées la citent. Elle mène désormais à l'écran de vente.
 */
export default async function LegacyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/vente/${id}`);
}
