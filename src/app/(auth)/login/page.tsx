import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { isDemoMode } from "@/config/env";
import { getInstallState } from "@/server/services/install-state";
import { LoginForm } from "./login-form";
import { PharmaWordmark } from "@/components/app/logo";
import { ShieldCheck, Sparkles, Stethoscope } from "lucide-react";

export const metadata: Metadata = { title: "Connexion" };

const HIGHLIGHTS = [
  {
    icon: Stethoscope,
    title: "Le pharmacien décide",
    body: "Chaque conseil proposé est accepté, modifié, remplacé ou retiré par un professionnel avant d'atteindre le patient.",
  },
  {
    icon: ShieldCheck,
    title: "La sécurité passe avant tout",
    body: "Le moteur écarte une proposition contre-indiquée avant même de regarder le catalogue. La marge n'intervient jamais dans cet arbitrage.",
  },
  {
    icon: Sparkles,
    title: "La valeur créée se mesure",
    body: "Chaque vente issue d'un conseil est rattachée à sa recommandation : le chiffre d'affaires additionnel est constaté, pas estimé.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const params = await searchParams;
  const demo = isDemoMode();
  const install = await getInstallState();

  const demoAccounts =
    demo && install.status === "READY"
      ? await prisma.user
        .findMany({
          where: {
            status: "ACTIVE",
            memberships: { some: { isActive: true, pharmacy: { isDemo: true } } },
          },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            memberships: { select: { role: true }, take: 1 },
          },
          orderBy: { createdAt: "asc" },
          take: 4,
        })
        .catch(() => [])
      : [];

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,52ch)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-800 p-10 text-white lg:flex xl:p-14">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, white 0, transparent 42%), radial-gradient(circle at 82% 78%, white 0, transparent 38%)",
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-[10px] bg-white/15 text-lg font-semibold backdrop-blur">
            ✚
          </span>
          <p className="text-[17px] font-semibold tracking-[-0.01em]">
            Pharma<span className="text-accent-300">.ai</span>
          </p>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] xl:text-[40px]">
              Le copilote intelligent de l&apos;officine.
            </h1>
            <p className="text-[15px] leading-6 text-brand-100">
              De l&apos;ordonnance au conseil personnalisé : Pharma.ai assiste votre
              équipe, structure l&apos;information remise au patient et mesure
              précisément ce que cela apporte à votre officine.
            </p>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map((item) => (
              <li key={item.title} className="flex gap-3.5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/12 backdrop-blur">
                  <item.icon className="size-[17px]" aria-hidden="true" />
                </span>
                <div className="space-y-0.5">
                  <p className="text-[14px] font-medium">{item.title}</p>
                  <p className="text-[13px] leading-5 text-brand-200">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12px] text-brand-300">
          Pharma.ai est un outil d&apos;assistance. Il ne prescrit pas et ne se
          substitue à aucun avis médical ou pharmaceutique.
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-12">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-6 lg:hidden">
            <PharmaWordmark size={36} />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-text-primary">
              Connexion à votre officine
            </h2>
            <p className="text-[13.5px] text-text-secondary">
              Accédez au comptoir, au catalogue et au pilotage de votre pharmacie.
            </p>
          </div>

          <LoginForm
            demoAccounts={demoAccounts.map((account) => ({
              email: account.email,
              name: `${account.firstName} ${account.lastName}`,
              role: account.memberships[0]?.role ?? "VIEWER",
            }))}
            install={install}
            initialError={
              params.erreur === "demo-indisponible"
                ? "Le compte de démonstration n'est pas disponible. Lancez `npm run db:seed`."
                : null
            }
          />
        </div>
      </section>
    </main>
  );
}
