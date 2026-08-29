import { redirect } from "next/navigation";

/** Ancienne fiche produit, déplacée sous /stock. */
export default async function LegacyProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stock/${id}`);
}
