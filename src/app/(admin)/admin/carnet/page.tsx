import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadCarnet } from "@/server/services/admin-carnet";
import { dayKey } from "@/core/admin/carnet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { CarnetBoard } from "./carnet-board";

export const metadata: Metadata = { title: "Mon carnet" };

/**
 * Le carnet de l'équipe PharmaBoost (fondateur, 29 oct. 2026) : tout ce qu'il y a à faire, les rendez-vous à une heure, les
 * clients à voir, les réunions, les idées et ce qui est à corriger — ce qui est fait, ce qui ne l'est pas. Claude y ajoute aussi
 * ce que le fondateur lui demande de noter.
 */
export default async function CarnetPage() {
  await requirePlatformSession();
  const items = await loadCarnet();
  return (
    <>
      <AdminPageHeader title="Mon carnet" description="Tout ce qu'il y a à faire, les rendez-vous, les clients à voir, les réunions et les idées : on note, on coche, on n'oublie rien." />
      <CarnetBoard initial={items} today={dayKey(new Date())} />
    </>
  );
}
