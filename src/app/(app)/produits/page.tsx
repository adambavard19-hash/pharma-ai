import { redirect } from "next/navigation";

/** Le catalogue est devenu un onglet de l'écran Stock : deux vues du même objet. */
export default function LegacyProductsPage() {
  redirect("/stock?onglet=catalogue");
}
