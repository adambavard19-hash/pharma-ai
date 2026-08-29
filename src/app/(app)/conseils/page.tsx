import { redirect } from "next/navigation";

/** Les règles de conseil se règlent par trimestre, pas par patient. */
export default function LegacyAdvicePage() {
  redirect("/parametres/regles");
}
