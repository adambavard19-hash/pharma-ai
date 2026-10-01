import "server-only";
import { prisma } from "@/server/db/client";
import { resolvePublicBaseUrl } from "@/server/public-url";
import type { EmailContext } from "@/core/platform/email-layout";

export const PLATFORM_CONTACT_EMAIL = "contact@pharmaboost.app";
/** Le logo servi par le site public : toujours joignable depuis une messagerie, même quand l'e-mail part d'un poste de développement. */
const PUBLIC_LOGO_URL = "https://pharmaboost.app/logo-256.png";

/** Le contexte des e-mails PharmaBoost : adresse publique et identité légale de la société exploitante. */
export async function platformEmailContext(): Promise<EmailContext> {
  const company = await prisma.companyProfile.findUnique({ where: { id: "default" } });
  return {
    baseUrl: resolvePublicBaseUrl().url,
    logoUrl: PUBLIC_LOGO_URL,
    company: {
      legalName: company ? `${company.legalName}${company.legalForm ? ` ${company.legalForm}` : ""}` : "PharmaBoost",
      address: company ? [company.addressLine1, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null : null,
      siren: company?.siren ?? null,
      contactEmail: PLATFORM_CONTACT_EMAIL,
    },
  };
}
