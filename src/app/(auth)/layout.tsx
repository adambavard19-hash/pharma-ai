import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session) redirect("/tableau-de-bord");
  return <>{children}</>;
}
