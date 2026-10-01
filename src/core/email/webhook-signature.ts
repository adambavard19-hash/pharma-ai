import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification d'un webhook signé au format Svix (celui de Resend) :
 * signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${corps}`)),
 * en-tête « v1,<signature> » (plusieurs possibles, séparées par des espaces).
 * Un horodatage de plus de cinq minutes est refusé (rejeu).
 */
export function verifySvixSignature(input: { secret: string; id: string | null; timestamp: string | null; signature: string | null; body: string; now?: Date }): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const now = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(now - sentAt) > 300) return false;
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
