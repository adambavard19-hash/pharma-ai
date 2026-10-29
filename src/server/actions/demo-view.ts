"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEMO_VIEW_COOKIE, requireSession } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "./types";

/**
 * La bascule de la démonstration (fondateur, 29 oct. 2026) : « Espace titulaire » ou « Espace pharmacien ». Seul le titulaire
 * de l'officine de démonstration la voit et s'en sert (session.demoView) ; ailleurs, le geste est refusé.
 */
export async function setDemoViewAction(view: "titulaire" | "pharmacien"): Promise<ActionResult<null>> {
  const session = await requireSession();
  if (!session.demoView) return fail("Réservé à la démonstration.");
  const store = await cookies();
  if (view === "pharmacien") store.set(DEMO_VIEW_COOKIE, "pharmacien", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  else store.delete(DEMO_VIEW_COOKIE);
  revalidatePath("/", "layout");
  return ok(null);
}
