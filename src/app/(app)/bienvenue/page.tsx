import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Check, Circle, FileSpreadsheet, ShieldCheck, Sparkles, Users } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requireSession } from "@/server/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PharmacyInfoForm } from "./pharmacy-info-form";
import { FinishButton, VerifyStockButton } from "./buttons";

export const metadata: Metadata = { title: "Bienvenue sur PharmaBoost" };

/**
 * L'accueil du titulaire, en cinq étapes.
 *
 * L'essentiel est l'étape 2 : sans son stock, PharmaBoost ne peut rien
 * proposer de son rayon. On ne demande jamais de saisir des milliers de
 * produits à la main : on importe l'export du logiciel, on vérifie ce qui n'a
 * pas été reconnu, et c'est tout.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ etape?: string }> }) {
  const session = await requireSession();
  if (session.role !== "OWNER") redirect("/");
  const params = await searchParams;

  const [pharmacy, productCount, drugCount, unclassified, outOfStock, teamCount, lastImport] = await Promise.all([
    prisma.pharmacy.findUniqueOrThrow({
      where: { id: session.scope.pharmacyId },
      select: { name: true, addressLine1: true, postalCode: true, city: true, phone: true, email: true, finessNumber: true, stockSyncedAt: true, onboardingCompletedAt: true },
    }),
    prisma.product.count({ where: { pharmacyId: session.scope.pharmacyId, deletedAt: null } }),
    prisma.pharmacyDrugStock.count({ where: { pharmacyId: session.scope.pharmacyId } }),
    prisma.product.count({ where: { pharmacyId: session.scope.pharmacyId, deletedAt: null, classifiedAt: null } }),
    prisma.stockItem.count({ where: { pharmacyId: session.scope.pharmacyId, quantity: { lte: 0 } } }),
    prisma.membership.count({ where: { pharmacyId: session.scope.pharmacyId, isActive: true } }),
    prisma.importJob.findFirst({ where: { pharmacyId: session.scope.pharmacyId, kind: "STOCK", status: "COMPLETED" }, orderBy: { finishedAt: "desc" }, select: { summary: true, fileName: true } }),
  ]);

  const infoDone = Boolean(pharmacy.addressLine1 && pharmacy.city && pharmacy.postalCode);
  const stockDone = Boolean(pharmacy.stockSyncedAt);
  const references = productCount + drugCount;
  const verifyDone = stockDone && unclassified === 0;
  const teamDone = teamCount > 1;
  const summary = (lastImport?.summary ?? null) as { outcome?: { productsCreated?: number; drugsUpserted?: number; productsUpdated?: number; invalid?: number; ignored?: number } } | null;

  const steps = [
    { n: 1, label: "Informations officine", done: infoDone, icon: Building2 },
    { n: 2, label: "Importer mon stock", done: stockDone, icon: FileSpreadsheet },
    { n: 3, label: "Vérification", done: verifyDone, icon: ShieldCheck },
    { n: 4, label: "Inviter mon équipe", done: teamDone, icon: Users },
    { n: 5, label: "PharmaBoost est prêt", done: Boolean(pharmacy.onboardingCompletedAt), icon: Sparkles },
  ];
  const firstOpen = steps.find((step) => !step.done)?.n ?? 5;
  const current = Math.min(5, Math.max(1, Number.parseInt(params.etape ?? "", 10) || firstOpen));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.08em] text-brand-700 uppercase dark:text-brand-400">Bienvenue sur PharmaBoost</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.015em] text-text-primary">Bonjour {session.user.firstName}, préparons {pharmacy.name}.</h1>
        <p className="mt-1 text-[14px] text-text-secondary">Cinq étapes, dix minutes. La plus importante : votre stock. Sans lui, le comptoir ne peut rien proposer de votre rayon.</p>
      </div>

      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((step) => (
          <li key={step.n}>
            <Link
              href={`/bienvenue?etape=${step.n}`}
              className={cn(
                "flex h-full flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors",
                step.n === current ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40" : "border-border-subtle bg-surface-card hover:border-border-strong",
              )}
            >
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", step.done ? "bg-success-600 text-white" : "bg-surface-sunken text-text-secondary")}>
                {step.done ? <Check className="size-3.5" strokeWidth={3} /> : step.n}
              </span>
              <span className="text-[12.5px] font-medium leading-4 text-text-primary">{step.label}</span>
            </Link>
          </li>
        ))}
      </ol>

      {current === 1 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <StepTitle icon={Building2} title="1. Informations officine" description="Ce qui figure sur vos documents patients et vos contrats." />
            <PharmacyInfoForm
              initial={{
                name: pharmacy.name,
                addressLine1: pharmacy.addressLine1 ?? "",
                postalCode: pharmacy.postalCode ?? "",
                city: pharmacy.city ?? "",
                phone: pharmacy.phone ?? "",
                email: pharmacy.email ?? "",
                finessNumber: pharmacy.finessNumber ?? "",
              }}
            />
          </CardContent>
        </Card>
      )}

      {current === 2 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <StepTitle icon={FileSpreadsheet} title="2. Importer mon stock" description="Exportez votre stock depuis votre logiciel (CSV ou Excel) et déposez-le. PharmaBoost reconnaît les colonnes et rattache chaque ligne au catalogue national par son CIP." />
            {stockDone ? (
              <div className="rounded-xl border border-success-300 bg-success-50/40 px-4 py-3 text-[13.5px] dark:border-success-800 dark:bg-success-950/20">
                <p className="font-medium text-text-primary">Stock importé le {formatDateTime(pharmacy.stockSyncedAt!)} — {references} référence{references > 1 ? "s" : ""}.</p>
                {summary?.outcome && (
                  <p className="mt-0.5 text-text-secondary">
                    {summary.outcome.drugsUpserted ?? 0} médicament(s), {(summary.outcome.productsCreated ?? 0) + (summary.outcome.productsUpdated ?? 0)} produit(s), {summary.outcome.invalid ?? 0} ligne(s) invalide(s).
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border-default px-4 py-3 text-[13.5px] text-text-secondary">
                Vous ne saisirez rien à la main : quelques milliers de lignes s&apos;importent en une minute. CIP13 ou EAN + quantité suffisent ; le nom, les prix et la TVA sont lus s&apos;ils sont présents.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild leadingIcon={<FileSpreadsheet className="size-[18px]" />}>
                <Link href="/stock/import?retour=bienvenue">{stockDone ? "Importer une mise à jour" : "Importer mon stock"}</Link>
              </Button>
              {stockDone && (
                <Button asChild variant="outline">
                  <Link href="/bienvenue?etape=3">Continuer <ArrowRight className="ml-1 size-4" /></Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {current === 3 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <StepTitle icon={ShieldCheck} title="3. Vérification" description="Ce que PharmaBoost a compris de votre rayon. Seules les anomalies demandent un regard : les milliers de lignes reconnues n'ont pas besoin de vous." />
            {!stockDone ? (
              <p className="text-[13.5px] text-text-secondary">Importez d&apos;abord votre stock (étape 2).</p>
            ) : (
              <>
                <dl className="grid gap-3 sm:grid-cols-4">
                  <Stat label="Références" value={references} />
                  <Stat label="Comprises par le moteur" value={references - unclassified} tone="success" />
                  <Stat label="À comprendre" value={unclassified} tone={unclassified > 0 ? "warning" : "success"} />
                  <Stat label="En rupture" value={outOfStock} />
                </dl>
                <p className="text-[13px] text-text-secondary">
                  « Comprises » : le moteur sait à quel besoin de conseil chaque référence peut répondre (probiotique, hygiène nasale, thermomètre…). Un produit « à comprendre » reste en stock mais ne sera pas proposé tant qu&apos;il n&apos;est pas classé.
                </p>
                <div className="flex flex-wrap gap-2">
                  {unclassified > 0 && <VerifyStockButton pending={unclassified} />}
                  <Button asChild variant="outline">
                    <Link href="/stock?etat=rupture">Corriger les anomalies</Link>
                  </Button>
                  <Button asChild variant={unclassified > 0 ? "outline" : "primary"}>
                    <Link href="/bienvenue?etape=4">Valider mon stock <ArrowRight className="ml-1 size-4" /></Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {current === 4 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <StepTitle icon={Users} title="4. Inviter mon équipe" description="Pharmaciens adjoints et préparateurs reçoivent un accès nominatif. Chaque décision au comptoir est signée." />
            <p className="text-[13.5px] text-text-secondary">{teamCount > 1 ? `${teamCount} personnes ont accès à ${pharmacy.name}.` : "Vous êtes pour l'instant seul(e) sur cet espace."}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild leadingIcon={<Users className="size-[18px]" />}>
                <Link href="/equipe">Inviter un collaborateur</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/bienvenue?etape=5">{teamDone ? "Continuer" : "Plus tard"} <ArrowRight className="ml-1 size-4" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {current === 5 && (
        <Card>
          <CardContent className="space-y-4 py-6">
            <StepTitle icon={Sparkles} title="5. PharmaBoost est prêt" description="Au comptoir : scannez l'ordonnance, PharmaBoost comprend, propose ce que vous avez en rayon, vous acceptez ou refusez, la fiche patient se prépare." />
            <ul className="space-y-1.5 text-[13.5px]">
              {steps.slice(0, 4).map((step) => (
                <li key={step.n} className="flex items-center gap-2">
                  {step.done ? <Check className="size-4 text-success-600" /> : <Circle className="size-4 text-text-tertiary" />}
                  <span className={step.done ? "text-text-primary" : "text-text-secondary"}>{step.label}</span>
                  {!step.done && <Link href={`/bienvenue?etape=${step.n}`} className="text-[12.5px] text-brand-700 underline underline-offset-2 dark:text-brand-400">compléter</Link>}
                </li>
              ))}
            </ul>
            {!stockDone && (
              <p className="rounded-xl border border-warning-300 bg-warning-50/50 px-4 py-3 text-[13px] text-text-primary dark:border-warning-800 dark:bg-warning-950/20">
                Sans stock importé, le comptoir vous le rappellera à chaque ordonnance : il ne peut proposer que ce qu&apos;il connaît de votre rayon.
              </p>
            )}
            <FinishButton />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepTitle({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"><Icon className="size-[18px]" /></span>
      <div>
        <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        <p className="mt-0.5 text-[13.5px] leading-5 text-text-secondary">{description}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  return (
    <div className="rounded-xl border border-border-subtle px-3.5 py-3">
      <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">{label}</dt>
      <dd className={cn("mt-0.5 text-[22px] font-semibold tabular", tone === "success" ? "text-success-700" : tone === "warning" ? "text-warning-700" : "text-text-primary")}>{value}</dd>
    </div>
  );
}
