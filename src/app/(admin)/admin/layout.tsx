import type { ReactNode } from "react";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { platformLogoutAction } from "@/server/actions/platform";
import { Button } from "@/components/ui/button";
import { AdminNav } from "./admin-nav";

/**
 * La console éditeur.
 *
 * Volontairement dépouillée et distincte de l'application officine : quand on
 * bascule d'un espace à l'autre, on doit voir immédiatement qu'on a changé de
 * monde. Ici on administre des clients, pas des patients.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatformSession();

  return (
    <div className="min-h-dvh bg-surface-app">
      <header className="border-b border-border-subtle bg-surface-card">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-ink-900 text-[15px] font-semibold text-white dark:bg-white dark:text-ink-900">
              ✚
            </span>
            <span>
              <span className="block text-[14px] leading-4 font-semibold text-text-primary">
                Pharma.ai
              </span>
              <span className="block text-[11.5px] text-text-tertiary">Console éditeur</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-[13px] text-text-secondary">{session.admin.fullName}</span>
            <form action={platformLogoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] px-6">
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-6 px-6 py-8">{children}</main>
    </div>
  );
}
