import { z } from "zod";

/**
 * La bulle du site (fondateur, 30 oct. 2026 : « une personne qui reste plus de 3 minutes sur mon site, une question pour savoir
 * qui c'est ») : après un vrai moment sur le site, le robot demande « Vous êtes plutôt… ? ». Le profil choisi d'un clic, puis,
 * si la personne le veut, ce qui l'intéresse et ses coordonnées. Rien n'est gardé que la personne n'ait choisi ou écrit elle-même.
 */
export const NUDGE_SETTING_KEY = "site.interactions";

export const NUDGE_PROFILES = ["PHARMACIEN", "LABORATOIRE", "COMMERCIAL", "DECOUVERTE"] as const;
export type NudgeProfile = (typeof NUDGE_PROFILES)[number];

export const NUDGE_TRIGGERS = ["TEMPS", "TARIF", "VIDEO", "PAGE"] as const;
export type NudgeTrigger = (typeof NUDGE_TRIGGERS)[number];

/** Le libellé de chaque profil, pour la bulle, l'e-mail et la console. */
export const PROFILE_LABEL: Record<NudgeProfile, string> = {
  PHARMACIEN: "Pharmacien ou titulaire",
  LABORATOIRE: "Laboratoire ou marque",
  COMMERCIAL: "Devenir commercial",
  DECOUVERTE: "Je découvre",
};

export const TRIGGER_LABEL: Record<NudgeTrigger, string> = {
  TEMPS: "1 min 30 sur le site",
  TARIF: "a regardé le tarif",
  VIDEO: "a lancé la vidéo",
  PAGE: "page Partenaires ou Affiliation",
};

/** Les intérêts proposés d'un clic, selon le profil (la réponse libre reste possible). */
export const PROFILE_INTERESTS: Record<NudgeProfile, string[]> = {
  PHARMACIEN: ["Voir une démo", "Le prix", "Comment ça marche au comptoir", "Autre chose"],
  LABORATOIRE: ["Mes challenges au comptoir", "Ma marque dans l'appli", "Autre chose"],
  COMMERCIAL: ["Je suis commercial(e) en pharmacie", "Apporteur d'affaires", "Autre chose"],
  DECOUVERTE: [],
};

/** La première étape : le profil choisi d'un clic, et ce que la personne a vu du site. */
export const nudgeChoiceSchema = z.object({
  profile: z.enum(NUDGE_PROFILES),
  trigger: z.enum(NUDGE_TRIGGERS),
  seconds: z.number().int().min(0).max(24 * 3600),
  pages: z.array(z.string().max(80)).max(20),
});

/** La seconde étape, facultative : ce qui l'intéresse, et de quoi la recontacter. */
export const nudgeDetailsSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  interest: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().max(600).optional().default(""),
  name: z.string().trim().max(80).optional().default(""),
  email: z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide.").max(160)]).optional().default(""),
  phone: z.union([z.literal(""), z.string().trim().regex(/^[+0-9 ().-]{6,24}$/, "Numéro invalide.")]).optional().default(""),
  website: z.string().max(0).optional().default(""),
});

export type NudgeItem = {
  id: string;
  at: string;
  profile: NudgeProfile;
  trigger: NudgeTrigger;
  seconds: number;
  pages: string[];
  city: string | null;
  region: string | null;
  country: string | null;
  interest: string;
  message: string;
  name: string;
  email: string;
  phone: string;
  /** PROFIL (un clic), REPONSE (intérêt ou message, sans coordonnées), CONTACT (coordonnées laissées). */
  status: "PROFIL" | "REPONSE" | "CONTACT";
};

export type NudgeStore = { shown: number; closed: number; items: NudgeItem[] };

/** Au plus 2 000 réponses gardées : les plus anciennes s'effacent (les compteurs, eux, continuent). */
export const NUDGE_MAX_ITEMS = 2000;

export function readNudgeStore(value: unknown): NudgeStore {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<NudgeStore>;
  const items = Array.isArray(raw.items) ? raw.items.filter((item): item is NudgeItem => Boolean(item && typeof item === "object" && typeof (item as NudgeItem).id === "string")) : [];
  return { shown: Number(raw.shown) || 0, closed: Number(raw.closed) || 0, items };
}

/** « 2 min 10 » : le temps passé sur le site. */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}
