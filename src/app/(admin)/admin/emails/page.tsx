import { redirect } from "next/navigation";
import { requirePlatformSession } from "@/server/auth/platform-session";

/** « /admin/emails » n'a pas de page propre : elle mène au centre de modèles. */
export default async function AdminEmailsPage() {
  await requirePlatformSession();
  redirect("/admin/emails/modeles");
}
