import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { patientDataEnabled } from "@/config/env";

/** Mode sans patient : cet écran n'existe pas, il n'y a rien à y voir. */
export default function PatientDataLayout({ children }: { children: ReactNode }) {
  if (!patientDataEnabled()) redirect("/");
  return <>{children}</>;
}
