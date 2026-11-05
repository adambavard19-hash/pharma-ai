import "server-only";
import { getEnv } from "@/config/env";

/**
 * Les démonstrations sur Zoom (fondateur, 5 nov. 2026) : chaque démo réservée sur le site crée sa réunion Zoom, avec la salle
 * d'attente (où Zoom peut passer une vidéo de présentation, réglée une fois dans le compte Zoom). Le lien part dans les e-mails
 * de confirmation, l'invitation d'agenda et l'espace du directeur commercial.
 *
 * Application « Server-to-Server OAuth » du compte Zoom (marketplace.zoom.us), droits « meeting:write » : ZOOM_ACCOUNT_ID,
 * ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET. Sans elles, rien ne change : la démo reste un appel, comme avant.
 */
export function zoomConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.ZOOM_ACCOUNT_ID && env.ZOOM_CLIENT_ID && env.ZOOM_CLIENT_SECRET);
}

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const env = getEnv();
  const basic = Buffer.from(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env.ZOOM_ACCOUNT_ID ?? "")}`, { method: "POST", headers: { Authorization: `Basic ${basic}` } });
  if (!response.ok) throw new Error(`Zoom a refusé la connexion (HTTP ${response.status}).`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

export type ZoomMeeting = { id: string; joinUrl: string };

/** Crée la réunion d'une démonstration : salle d'attente ouverte, personne n'entre avant l'hôte. */
export async function createZoomMeeting(input: { topic: string; start: Date; durationMin: number; agenda?: string }): Promise<ZoomMeeting> {
  const token = await accessToken();
  const response = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: input.start.toISOString(),
      duration: input.durationMin,
      timezone: "Europe/Paris",
      agenda: input.agenda?.slice(0, 2000),
      settings: { waiting_room: true, join_before_host: false, host_video: true, participant_video: true, mute_upon_entry: false, auto_recording: "none" },
    }),
  });
  if (!response.ok) throw new Error(`Zoom n'a pas créé la réunion (HTTP ${response.status}).`);
  const body = (await response.json()) as { id: number | string; join_url: string };
  return { id: String(body.id), joinUrl: body.join_url };
}

/** Une démo reprogrammée : la réunion suit la nouvelle heure (même lien). */
export async function moveZoomMeeting(id: string, start: Date, durationMin: number): Promise<void> {
  const token = await accessToken();
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ start_time: start.toISOString(), duration: durationMin, timezone: "Europe/Paris" }),
  });
  if (!response.ok && response.status !== 204) throw new Error(`Zoom n'a pas déplacé la réunion (HTTP ${response.status}).`);
}
