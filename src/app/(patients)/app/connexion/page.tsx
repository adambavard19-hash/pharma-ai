import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dna, PageTitle } from "../_components/ui";
import { getAppMember } from "../_components/member";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

/** Se connecter : une adresse e-mail, un lien reçu, aucun mot de passe. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expire?: string }> }) {
  if (await getAppMember()) redirect("/app/ma-pharmacie");
  const { expire } = await searchParams;
  return (
    <div className="relative px-5 pt-4">
      <Dna />
      <div className="relative">
        <PageTitle sub="Votre adresse e-mail suffit : nous vous envoyons un lien pour ouvrir votre espace, sans mot de passe.">Mon espace</PageTitle>
        {expire && <p className="mt-4 rounded-2xl bg-[#FFF4E5] px-4 py-3 text-[13.5px] text-[#8A5300]">Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.</p>}
        <LoginForm />
      </div>
    </div>
  );
}
