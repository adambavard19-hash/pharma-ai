import "server-only";
import { getEnv } from "@/config/env";
import { NotConfiguredSignatureProvider, YousignSignatureProvider, type SignatureProvider } from "@/core/signature";

/** Le prestataire de signature branché, ou celui qui dit franchement qu'il n'y en a pas. */
export function getSignatureProvider(): SignatureProvider {
  const env = getEnv();
  if (env.SIGNATURE_PROVIDER === "yousign" && env.YOUSIGN_API_KEY) {
    return new YousignSignatureProvider({ apiKey: env.YOUSIGN_API_KEY, environment: env.YOUSIGN_ENVIRONMENT, webhookSecret: env.YOUSIGN_WEBHOOK_SECRET ?? null });
  }
  return new NotConfiguredSignatureProvider();
}
