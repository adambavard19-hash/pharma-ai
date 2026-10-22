import "server-only";
import { cookies } from "next/headers";
import { APP_SESSION_COOKIE, memberFromSession, type AppMemberView } from "@/server/services/app-members";

/** L'inscrit de l'appli, lu dans son cookie scellé ; rien s'il n'est pas connecté. */
export async function getAppMember(): Promise<AppMemberView | null> {
  return memberFromSession((await cookies()).get(APP_SESSION_COOKIE)?.value);
}
