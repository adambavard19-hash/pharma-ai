/**
 * L'ouverture d'un document scellé dans le navigateur du patient (plan, bilan par QR code) : la clé est lue après le dièse de
 * l'adresse et ne quitte jamais l'appareil ; le serveur n'a servi que le chiffré.
 */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Charge le chiffré et l'ouvre. Erreur « missing » : le document n'existe plus (expiré ou retiré). */
export async function unsealJson(id: string, key: string): Promise<unknown> {
  const response = await fetch(`/api/plan/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (response.status === 404) throw new Error("missing");
  if (!response.ok) throw new Error("Le document n'a pas pu être chargé.");
  const body = (await response.json()) as { ciphertext: string; iv: string; tag: string };
  const cryptoKey = await crypto.subtle.importKey("raw", fromBase64Url(key), { name: "AES-GCM" }, false, ["decrypt"]);
  const ciphertext = fromBase64Url(body.ciphertext);
  const tag = fromBase64Url(body.tag);
  const joined = new Uint8Array(new ArrayBuffer(ciphertext.length + tag.length));
  joined.set(ciphertext);
  joined.set(tag, ciphertext.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(body.iv), tagLength: 128 }, cryptoKey, joined);
  return JSON.parse(new TextDecoder().decode(plain));
}
