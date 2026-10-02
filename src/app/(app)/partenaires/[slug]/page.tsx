import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgePercent, ExternalLink, FileText, GraduationCap, Package } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { brandTrainings, partnerBrandPage, pharmacyIdentity, type BrandPageRange } from "@/server/services/partners/pharmacy-partners";
import { partnerActivity } from "@/server/services/partners/orders";
import { isUniverseKey, universeLabel } from "@/config/universes";
import { formatCents, formatDate, formatNumber } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TrainingCard } from "../../formation/_components/training-card";
import { BrandLogo } from "../_components/brand-logo";
import { PreferenceActions } from "../_components/preference-actions";
import { PartnerActions, type ActionProduct } from "./partner-actions";
import { ViewTracker } from "./view-tracker";

export const metadata: Metadata = { title: "Gamme partenaire" };

/**
 * La page d'une marque partenaire, pour l'officine.
 *
 * Présentation, gammes et produits publiés pour cette officine, ce qu'elle a
 * déjà en stock, conditions professionnelles, documentation et formations ;
 * pour le titulaire, la prise de contact et la commande selon l'intégration
 * du partenaire. La marque n'existe pour l'officine que si
 * `visibleBrandBySlug` la lui montre : sinon, 404.
 *
 * Ce que reçoit le partenaire : le nom de l'officine, sa ville, son FINESS,
 * son e-mail et son téléphone, les lignes, le montant, l'identifiant
 * d'attribution et la note. JAMAIS de patient, d'ordonnance ni de conseil.
 */
export default async function PartnerBrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const session = await requirePermission(PERMISSIONS.PARTNERS_VIEW);
  const page = await partnerBrandPage(session.scope, decodeURIComponent(slug));
  if (!page) notFound();

  // Un paramètre répété (?from=a&from=b) arrive en tableau : on garde le premier.
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const from = one(raw.from);
  const universeParam = one(raw.univers) ?? null;
  const universe = universeParam && isUniverseKey(universeParam) ? universeParam : null;
  const viewSource = from === "comptoir" ? "COUNTER_CARD" : from === "catalogue" ? "CATALOG" : null;
  const source = viewSource ?? "BRAND_PAGE";

  const canManage = session.permissions.has(PERMISSIONS.PARTNERS_MANAGE);
  const canSeeTrainings = session.permissions.has(PERMISSIONS.TRAINING_VIEW);
  const canSeeStock = session.permissions.has(PERMISSIONS.STOCK_VIEW);

  const [trainings, activity, pharmacy] = await Promise.all([
    canSeeTrainings ? brandTrainings(session.scope, page.brand.brandKey) : Promise.resolve([]),
    canManage ? partnerActivity(session.scope, page.partner.id) : Promise.resolve([]),
    canManage ? pharmacyIdentity(session.scope.pharmacyId) : Promise.resolve(null),
  ]);

  const { brand, partner } = page;
  const orderProducts: ActionProduct[] = page.ranges.flatMap((range) =>
    range.products.map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      packaging: product.packaging,
      proPriceCents: product.proPriceCents,
      rangeName: range.id ? range.name : null,
    })),
  );

  return (
    <div className="space-y-6">
      {viewSource && <ViewTracker brandId={brand.id} source={viewSource} universe={universe} />}

      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/partenaires">Gammes partenaires</Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <BrandLogo name={brand.name} logoUrl={brand.logoUrl} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <PageHeader
            title={brand.name}
            description={`Proposée par ${partner.name}, laboratoire partenaire de PharmaBoost.`}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">Gamme partenaire</Badge>
            {brand.preference === "HIDDEN" && <Badge tone="neutral">Masquée au comptoir</Badge>}
            {brand.universes.map((key) => (
              <Badge key={key} tone="brand">
                {universeLabel(key)}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <Alert tone="neutral">
        Gamme proposée par un laboratoire partenaire de PharmaBoost. Elle ne modifie jamais les conseils du moteur : elle apparaît à part, signalée comme telle.
        {from === "comptoir" && universe && <> Vous venez du comptoir, univers {universeLabel(universe).toLowerCase()}.</>}
      </Alert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {(brand.description || partner.description || partner.website) && (
            <Card>
              <CardHeader title="Présentation" />
              <CardContent className="space-y-3 text-[13.5px] leading-6 text-text-secondary">
                {brand.description && <p className="whitespace-pre-line">{brand.description}</p>}
                {partner.description && (
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium tracking-wide text-text-tertiary uppercase">{partner.name}</p>
                    <p className="whitespace-pre-line">{partner.description}</p>
                  </div>
                )}
                {partner.website && (
                  <a href={partner.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
                    Site du laboratoire
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          <section className="space-y-3">
            <SectionHeader
              title="Gammes et produits"
              description={page.productCount > 0 ? `${formatNumber(page.productCount)} produit${page.productCount > 1 ? "s" : ""} publié${page.productCount > 1 ? "s" : ""} pour votre officine.` : undefined}
            />
            {page.ranges.length === 0 ? (
              <Card>
                <p className="px-5 py-8 text-center text-[13.5px] text-text-secondary">Aucun produit n&apos;est encore publié pour cette marque.</p>
              </Card>
            ) : (
              page.ranges.map((range) => <RangeCard key={range.id ?? "sans-gamme"} range={range} />)
            )}
          </section>

          <Card>
            <CardHeader
              title="Déjà dans votre stock"
              description="Produits de votre stock reconnus comme de cette marque, ou dont le code correspond à un produit de la gamme."
            />
            <CardContent>
              {page.inStock.total === 0 ? (
                <p className="text-[13.5px] text-text-secondary">Aucun produit de cette marque n&apos;a été reconnu dans votre stock.</p>
              ) : (
                <div className="space-y-2">
                  <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                    {page.inStock.products.map((product) => (
                      <li key={product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        {canSeeStock ? (
                          <Link href={`/stock/${product.id}`} className="min-w-0 truncate text-[13.5px] text-text-primary hover:text-brand-700 hover:underline">
                            {product.name}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate text-[13.5px] text-text-primary">{product.name}</span>
                        )}
                        <span className={product.quantity && product.quantity > 0 ? "shrink-0 text-[13px] text-text-primary tabular" : "shrink-0 text-[13px] text-text-tertiary tabular"}>
                          {product.quantity === null ? "—" : `${formatNumber(product.quantity)} en stock`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {page.inStock.total > page.inStock.products.length && (
                    <p className="text-[12.5px] text-text-tertiary">
                      {page.inStock.products.length} premiers produits affichés sur {formatNumber(page.inStock.total)}.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Conditions professionnelles" description="Offres publiées par le laboratoire, en cours de validité." />
            <CardContent>
              {page.offers.length === 0 ? (
                <p className="text-[13.5px] text-text-secondary">Aucune condition professionnelle publiée en ce moment.</p>
              ) : (
                <ul className="space-y-3">
                  {page.offers.map((offer) => (
                    <li key={offer.id} className="flex gap-3 rounded-lg border border-border-subtle p-3.5">
                      <BadgePercent className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-[14px] font-medium break-words text-text-primary">{offer.title}</p>
                        <p className="text-[13px] leading-5 whitespace-pre-line text-text-secondary">{offer.conditions}</p>
                        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-text-tertiary">
                          {offer.discountPercent !== null && <span>Remise : {formatNumber(offer.discountPercent)} %</span>}
                          {offer.minimumOrderCents !== null && <span>Minimum de commande : {formatCents(offer.minimumOrderCents)} HT</span>}
                          {offer.rangeName && <span>Gamme {offer.rangeName}</span>}
                          <span>{offer.validTo ? `Jusqu'au ${formatDate(offer.validTo)}` : "Sans date de fin"}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Documentation professionnelle" description="Documents publiés par le laboratoire, ouverts chez leur source." />
            <CardContent>
              {page.documents.length === 0 ? (
                <p className="text-[13.5px] text-text-secondary">Aucun document publié pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {page.documents.map((document) => (
                    <li key={document.id}>
                      <a href={document.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-sunken">
                        <FileText className="size-4 shrink-0 text-text-tertiary" />
                        <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">{document.title}</span>
                        <ExternalLink className="size-3.5 shrink-0 text-text-tertiary" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {canSeeTrainings && (
            <section className="space-y-3">
              <SectionHeader title="Formations" description="Les contenus du centre de formation reliés à cette marque." />
              {trainings.length === 0 ? (
                <Card>
                  <div className="flex flex-col items-start gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-[13.5px] text-text-secondary">
                      <GraduationCap className="size-4 shrink-0 text-text-tertiary" />
                      Aucune formation sur cette marque pour l&apos;instant.
                    </p>
                    <Link href="/formation" className="text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-400">
                      Centre de formation
                    </Link>
                  </div>
                </Card>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {trainings.map((training) => (
                    <li key={training.id}>
                      <TrainingCard training={training} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {canManage && activity.length > 0 && (
            <Card>
              <CardHeader title={`Vos demandes auprès de ${partner.name}`} description="Les dernières prises de contact et commandes de votre officine, avec leur identifiant d'attribution." />
              <CardContent>
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {activity.map((item) => (
                    <li key={`${item.type}-${item.id}`} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-text-primary">{item.label}</p>
                        <p className="text-[12px] text-text-tertiary tabular">
                          {formatDate(item.createdAt)} · <span className="font-mono">{item.code}</span>
                          {item.totalCents !== null && ` · ${formatCents(item.totalCents)} HT`}
                        </p>
                      </div>
                      <Badge tone={item.status === "Échec de transmission" ? "warning" : item.status === "Transmise" || item.status === "Confirmée" ? "success" : "neutral"} className="self-start sm:self-auto">
                        {item.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="Contacter ou commander" />
            <CardContent>
              {canManage && pharmacy ? (
                <PartnerActions
                  brandId={brand.id}
                  brandName={brand.name}
                  partnerName={partner.name}
                  source={source}
                  universe={universe}
                  integration={page.integration}
                  products={orderProducts}
                  contactDefaults={{ name: session.user.fullName, email: session.user.email, phone: pharmacy.phone ?? "" }}
                />
              ) : (
                <p className="text-[13px] leading-5 text-text-secondary">La prise de contact et la commande auprès du laboratoire sont réservées au titulaire.</p>
              )}
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader
                title="Au comptoir"
                description={
                  brand.preference === "HIDDEN"
                    ? "Masquée : cette marque n'apparaît plus en carte au comptoir."
                    : "Cette marque peut apparaître à part, en carte « gamme partenaire », sous les conseils du comptoir."
                }
              />
              <CardContent className="px-3">
                <PreferenceActions brandId={brand.id} brandName={brand.name} preference={brand.preference} layout="stack" />
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Une gamme et ses produits publiés : liste sur mobile, tableau à partir de md. */
function RangeCard({ range }: { range: BrandPageRange }) {
  const withPublicPrice = range.products.some((product) => product.publicPriceCents !== null);
  return (
    <Card>
      <CardHeader
        title={range.name}
        description={range.description ?? undefined}
        action={range.universe ? <Badge tone="brand">{universeLabel(range.universe)}</Badge> : undefined}
      />
      {range.products.length === 0 ? (
        <CardContent>
          <p className="text-[13.5px] text-text-secondary">Aucun produit publié dans cette gamme pour l&apos;instant.</p>
        </CardContent>
      ) : (
        <>
          <ul className="divide-y divide-border-subtle border-t border-border-subtle md:hidden">
            {range.products.map((product) => (
              <li key={product.id} className="flex items-start gap-3 px-5 py-3">
                <Package className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-[13.5px] leading-5 font-medium break-words text-text-primary">{product.name}</p>
                  <p className="text-[12px] break-words text-text-tertiary">{[product.packaging, product.code].filter(Boolean).join(" · ") || "—"}</p>
                  {product.description && <p className="line-clamp-2 text-[12.5px] text-text-secondary">{product.description}</p>}
                  <p className="text-[12.5px] text-text-primary tabular">
                    {product.proPriceCents !== null ? `${formatCents(product.proPriceCents)} HT (prix pro)` : "Prix pro non communiqué"}
                    {product.publicPriceCents !== null && <span className="text-text-tertiary"> · public conseillé {formatCents(product.publicPriceCents)}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden px-5 pb-5 md:block">
            <TableWrapper>
              {/* Les libellés longs passent à la ligne au lieu d'élargir le tableau. */}
              <Table className="min-w-full">
                <THead>
                  <TR>
                    <TH>Produit</TH>
                    <TH>Code</TH>
                    <TH numeric>Prix pro HT</TH>
                    {withPublicPrice && <TH numeric>Prix public conseillé</TH>}
                  </TR>
                </THead>
                <TBody>
                  {range.products.map((product) => (
                    <TR key={product.id}>
                      <TD>
                        <p className="text-[13.5px] font-medium break-words text-text-primary">{product.name}</p>
                        {(product.packaging || product.description) && (
                          <p className="line-clamp-2 text-[12px] text-text-tertiary">{[product.packaging, product.description].filter(Boolean).join(" · ")}</p>
                        )}
                      </TD>
                      <TD className="font-mono text-[12.5px] whitespace-nowrap text-text-secondary">{product.code ?? "—"}</TD>
                      <TD numeric className="whitespace-nowrap">{product.proPriceCents !== null ? formatCents(product.proPriceCents) : "—"}</TD>
                      {withPublicPrice && <TD numeric className="whitespace-nowrap">{product.publicPriceCents !== null ? formatCents(product.publicPriceCents) : "—"}</TD>}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </div>
        </>
      )}
    </Card>
  );
}
