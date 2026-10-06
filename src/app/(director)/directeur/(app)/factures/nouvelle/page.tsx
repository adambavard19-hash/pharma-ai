import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listInvoiceableCommissions, listRepOptions } from "@/server/services/sales/director-money";
import { TIME_ZONE } from "@/config/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page";
import { InvoiceForm } from "./invoice-form";

export const metadata: Metadata = { title: "Enregistrer une facture" };

/** La date du jour à Paris, `AAAA-MM-JJ` : celle que propose le formulaire. */
const todayInParis = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TIME_ZONE }).format(new Date());

/**
 * Enregistrer une facture reçue d'un commercial. `?commercial=` choisit le
 * commercial d'avance (depuis sa fiche, par exemple).
 */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const params = await searchParams;
  const requested = Array.isArray(params.commercial) ? params.commercial[0] : params.commercial;

  const [reps, commissions] = await Promise.all([listRepOptions(), listInvoiceableCommissions()]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        breadcrumb={
          <Link href="/directeur/factures" className="inline-flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-primary">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Factures
          </Link>
        }
        title="Enregistrer une facture"
        description="Une facture reçue d'un commercial. Vous la validez ensuite, puis vous la payez : les commissions qu'elle réclame suivent."
      />

      {reps.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title="Aucun commercial pour l'instant"
            description="Une facture est toujours celle d'un commercial. Ajoutez d'abord un commercial à l'équipe."
            action={
              <Button asChild size="sm">
                <Link href="/directeur/commerciaux/nouveau">Ajouter un commercial</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <InvoiceForm
              reps={reps}
              commissions={commissions.map((commission) => ({ id: commission.id, salesRepId: commission.salesRepId, amountCents: commission.amountCents, status: commission.status, createdAt: commission.createdAt.toISOString(), prospectName: commission.prospectName, city: commission.city }))}
              defaultRepId={requested ?? null}
              today={todayInParis()}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
