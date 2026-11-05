/**
 * La prime unique du directeur commercial (précision du fondateur, 18 oct. 2026) : 50 € HT pour une pharmacie signée par
 * son équipe, due seulement une fois la mise en service RÉELLEMENT réglée, une seule fois par pharmacie. En centimes HT.
 *
 * Visible SEULEMENT dans l'espace du directeur et la console du fondateur : jamais sur le site public, l'extranet d'un
 * affilié, ses e-mails, ses contrats ou ses documents. C'est pourquoi elle vit hors de `terms.ts`, que ces écrans lisent.
 */
export const DIRECTOR_SIGNUP_BONUS_CENTS = 5000;

/**
 * La prime du directeur pour une démonstration qu'il a menée lui-même et qui va au bout (fondateur, 5 nov. 2026) : 100 € HT,
 * due une fois la mise en service réglée. Elle remplace, pour cette pharmacie, la prime de 50 € (une seule prime par pharmacie).
 */
export const DIRECTOR_DEMO_BONUS_CENTS = 10_000;
