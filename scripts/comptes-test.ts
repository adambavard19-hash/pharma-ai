/**
 * Comptes de TEST locaux.
 *
 * Ce script n'existe que pour l'environnement de développement : il refuse de
 * s'exécuter en production. Le mot de passe vient de `TEST_PASSWORD` et retombe
 * sur une valeur de développement, volontairement banale — ce n'est pas un
 * secret et elle n'a rien à faire ailleurs que sur un poste de développement.
 *
 *   npm run comptes:test
 */
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/security/password";

const PASSWORD = process.env.TEST_PASSWORD ?? "Pharma2026!Test";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refus : ce script ne s'exécute pas en production.");
  }

  const pharmacy = await prisma.pharmacy.findFirst({
    where: { name: "Pharmacie Saint-Michel" },
    select: { id: true, organizationId: true, name: true },
  });
  if (!pharmacy) throw new Error("Officine de test introuvable. Lancez `npm run db:seed`.");

  const passwordHash = await hashPassword(PASSWORD);

  const accounts = [
    {
      email: "titulaire@pharma.ai",
      firstName: "Claire",
      lastName: "Dumont",
      role: "OWNER" as const,
    },
    {
      email: "collaborateur@pharma.ai",
      firstName: "Léa",
      lastName: "Bernard",
      role: "PHARMACIST" as const,
    },
  ];

  for (const account of accounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        firstName: account.firstName,
        lastName: account.lastName,
        passwordHash,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        organizationId: pharmacy.organizationId,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
        passwordHash,
        status: "ACTIVE",
      },
    });

    await prisma.membership.upsert({
      where: { userId_pharmacyId: { userId: user.id, pharmacyId: pharmacy.id } },
      update: { role: account.role, isActive: true },
      create: {
        userId: user.id,
        pharmacyId: pharmacy.id,
        role: account.role,
        isActive: true,
      },
    });

    console.log(`  ${account.role.padEnd(11)} ${account.email}`);
  }

  const admin = await prisma.platformAdmin.findFirst({ select: { id: true, email: true } });
  if (admin) {
    await prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { passwordHash, isActive: true },
    });
    console.log(`  SUPER ADMIN ${admin.email}`);
  }

  console.log(`\n  Mot de passe : ${PASSWORD}`);
  console.log(`  Officine     : ${pharmacy.name}\n`);
}

main().finally(() => prisma.$disconnect());
