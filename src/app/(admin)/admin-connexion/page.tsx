import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPlatformSession } from "@/server/auth/platform-session";
import { PlatformLoginForm } from "./form";

export const metadata: Metadata = { title: "Administration Pharma.ai" };

export default async function PlatformLoginPage() {
  const session = await getPlatformSession();
  if (session) redirect("/admin");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-950 px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-semibold text-white">
            ✚
          </span>
          <h1 className="text-[19px] font-semibold text-ink-50">
            Administration Pharma.ai
          </h1>
          <p className="text-[13px] leading-5 text-ink-400">
            Espace réservé à l&apos;éditeur du logiciel. Aucun accès aux données médicales des
            patients des officines clientes.
          </p>
        </div>

        <PlatformLoginForm />
      </div>
    </main>
  );
}
