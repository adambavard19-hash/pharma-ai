import { redirect } from "next/navigation";

/**
 * Les impayés sont une vue de la page « Paiements » : les anciens liens (cockpit, journal, relances) mènent toujours ici, et
 * arrivent au bon endroit.
 */
export default function UnpaidPage(): never {
  redirect("/admin/paiements?vue=impayes");
}
