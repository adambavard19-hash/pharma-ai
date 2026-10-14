/**
 * L'onglet « Accueil » de l'île, dans chaque espace : quelques pastilles chiffrées (les « services » de Coucou) et une
 * courte liste de choses à voir, chacune avec son lien. Module pur : chaque espace lit ses VRAIES données côté serveur,
 * puis les met en forme ici (une seule forme pour toutes les îles, testée).
 */

export type IslandTone = "warning" | "todo" | "good" | "info";

export type IslandHomePill = { key: string; label: string; value: string; href?: string; tone?: IslandTone };
export type IslandHomeRow = { key: string; title: string; detail?: string; href?: string; tone?: IslandTone };

export type IslandHome = {
  /** La phrase de la capsule au repos (« 3 choses à voir », « Tout est calme »). */
  headline: string;
  /** Une chose à régler : la capsule prend le liseré ambre. */
  attention: boolean;
  pills: IslandHomePill[];
  rows: IslandHomeRow[];
};

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;
const euros = (cents: number) => `${Math.round(cents / 100).toLocaleString("fr-FR")} €`;

/** La phrase de repos : le nombre de choses à voir, ou le calme. */
export function homeHeadline(rows: IslandHomeRow[], calm: string): string {
  const todo = rows.filter((row) => row.tone === "warning" || row.tone === "todo").length;
  return todo > 0 ? `${plural(todo, "chose", "choses")} à voir` : calm;
}

function finish(pills: IslandHomePill[], rows: IslandHomeRow[], calm: string): IslandHome {
  return { headline: homeHeadline(rows, calm), attention: rows.some((row) => row.tone === "warning"), pills, rows };
}

// ---------------------------------------------------------------- Console Super Admin

export type AdminHomeInput = {
  activePharmacies: number;
  mrrCents: number;
  paymentsLate: number;
  supportToAnswer: number;
  setupsToDo: number;
  demosToday: number;
  demosWeek: number;
  newProspects7d: number;
  postsOffline: number;
  contractsToCountersign: number;
  gapsOpen: number;
  /** Relances commerciales en retard, dossiers sans réponse (facultatifs : 0 par défaut). */
  followUpsLate?: number;
  prospectsNoReply?: number;
  today: { id: string; title: string; when: string; href: string }[];
};

export function adminHome(input: AdminHomeInput): IslandHome {
  const pills: IslandHomePill[] = [
    { key: "mrr", label: "Revenu mensuel", value: euros(input.mrrCents), href: "/admin/abonnements" },
    { key: "officines", label: "Officines actives", value: String(input.activePharmacies), href: "/admin/pharmacies" },
    { key: "demos", label: "Démos aujourd'hui", value: String(input.demosToday), href: "/admin/demonstrations" },
  ];
  const rows: IslandHomeRow[] = [];
  if (input.paymentsLate) rows.push({ key: "impayes", title: plural(input.paymentsLate, "impayé", "impayés"), detail: "Paiements en retard", href: "/admin/paiements", tone: "warning" });
  if (input.postsOffline) rows.push({ key: "postes", title: plural(input.postsOffline, "souci technique", "soucis techniques"), detail: "Connecteurs ou postes muets", href: "/admin/technique", tone: "warning" });
  if (input.supportToAnswer) rows.push({ key: "support", title: plural(input.supportToAnswer, "message de support", "messages de support"), detail: "En attente de réponse", href: "/admin/support", tone: "todo" });
  if (input.setupsToDo) rows.push({ key: "mises-en-service", title: plural(input.setupsToDo, "mise en service", "mises en service"), detail: "À planifier ou à faire", href: "/admin/abonnements", tone: "todo" });
  if (input.contractsToCountersign) rows.push({ key: "contrats", title: plural(input.contractsToCountersign, "contrat à contresigner", "contrats à contresigner"), href: "/admin/contrats", tone: "todo" });
  if (input.followUpsLate) rows.push({ key: "relances", title: plural(input.followUpsLate, "relance en retard", "relances en retard"), href: "/admin/relances-commerciales", tone: "todo" });
  if (input.prospectsNoReply) rows.push({ key: "sans-reponse", title: plural(input.prospectsNoReply, "prospect sans réponse", "prospects sans réponse"), detail: "Depuis 14 jours", href: "/admin/prospects", tone: "info" });
  if (input.gapsOpen) rows.push({ key: "a-connaitre", title: plural(input.gapsOpen, "produit à connaître", "produits à connaître"), detail: "Attendent la pharmacienne", href: "/admin/a-connaitre", tone: "todo" });
  if (input.newProspects7d) rows.push({ key: "dossiers", title: plural(input.newProspects7d, "nouveau dossier", "nouveaux dossiers"), detail: "Ces 7 derniers jours", href: "/admin/prospects", tone: "info" });
  for (const item of input.today.slice(0, 4)) rows.push({ key: `jour-${item.id}`, title: item.title, detail: item.when, href: item.href, tone: "info" });
  return finish(pills, rows.slice(0, 8), input.demosWeek ? `${plural(input.demosWeek, "démo", "démos")} cette semaine` : "Tout est calme");
}

// ---------------------------------------------------------------- Directeur commercial

export type DirectorHomeInput = {
  opened: number;
  demos: number;
  activated: number;
  activeReps: number;
  applicationsToReview: number;
  unassignedProspects: number;
  commissionsToValidate: { count: number; amountCents: number };
  invoicesToValidate: { count: number; amountCents: number };
  periodLabel: string;
};

export function directorHome(input: DirectorHomeInput): IslandHome {
  const pills: IslandHomePill[] = [
    { key: "dossiers", label: `Dossiers · ${input.periodLabel.toLowerCase()}`, value: String(input.opened), href: "/directeur" },
    { key: "demos", label: "Démos", value: String(input.demos), href: "/directeur" },
    { key: "activations", label: "Activées", value: String(input.activated), href: "/directeur" },
  ];
  const rows: IslandHomeRow[] = [];
  if (input.commissionsToValidate.count) rows.push({ key: "commissions", title: plural(input.commissionsToValidate.count, "commission à valider", "commissions à valider"), detail: euros(input.commissionsToValidate.amountCents), href: "/directeur/commissions", tone: "todo" });
  if (input.invoicesToValidate.count) rows.push({ key: "factures", title: plural(input.invoicesToValidate.count, "facture reçue", "factures reçues"), detail: `${euros(input.invoicesToValidate.amountCents)} à valider`, href: "/directeur/factures", tone: "todo" });
  if (input.applicationsToReview) rows.push({ key: "candidatures", title: plural(input.applicationsToReview, "candidature", "candidatures"), detail: "À étudier", href: "/directeur/candidatures", tone: "todo" });
  if (input.unassignedProspects) rows.push({ key: "sans-commercial", title: plural(input.unassignedProspects, "dossier sans commercial", "dossiers sans commercial"), href: "/directeur/commerciaux", tone: "warning" });
  return finish(pills, rows, `${plural(input.activeReps, "commercial actif", "commerciaux actifs")}`);
}

// ---------------------------------------------------------------- Extranet commercial

export type SalesHomeInput = {
  openProspects: number;
  activated: number;
  commissionEarnedCents: number;
  commissionPendingCents: number;
  demosUpcoming: { id: string; name: string; when: string }[];
  tasksDue: { id: string; title: string; when: string; prospectId: string | null }[];
};

export function salesHome(input: SalesHomeInput): IslandHome {
  const pills: IslandHomePill[] = [
    { key: "dossiers", label: "Dossiers en cours", value: String(input.openProspects), href: "/extranet/dossiers" },
    { key: "activees", label: "Officines activées", value: String(input.activated), href: "/extranet/dossiers" },
    { key: "commissions", label: "Commissions acquises", value: euros(input.commissionEarnedCents), href: "/extranet/commissions" },
  ];
  const rows: IslandHomeRow[] = [];
  for (const task of input.tasksDue.slice(0, 4)) rows.push({ key: `tache-${task.id}`, title: task.title, detail: task.when, href: task.prospectId ? `/extranet/dossiers/${task.prospectId}` : "/extranet/taches", tone: "todo" });
  for (const demo of input.demosUpcoming.slice(0, 3)) rows.push({ key: `demo-${demo.id}`, title: `Démo · ${demo.name}`, detail: demo.when, href: `/extranet/dossiers/${demo.id}`, tone: "info" });
  if (input.commissionPendingCents) rows.push({ key: "previsionnel", title: `${euros(input.commissionPendingCents)} en prévisionnel`, detail: "Deviennent acquises à la signature", href: "/extranet/commissions", tone: "info" });
  return finish(pills, rows, "Belle journée de prospection");
}

// ---------------------------------------------------------------- Logiciel officine

export type OfficineHomeInput = {
  scanned: number;
  accepted: number;
  salesCount: number;
  attributedCents: number;
  counter: { label: string; online: boolean } | null;
  challenge: { title: string; teamUnits: number; target: number | null; toNext: number | null } | null;
  shortDates: number | null;
  lastSale: { title: string; when: string; stage: string; href: string } | null;
};

export function officineHome(input: OfficineHomeInput): IslandHome {
  const pills: IslandHomePill[] = [
    { key: "jour", label: "Aujourd'hui", value: `${input.accepted} conseil${input.accepted > 1 ? "s" : ""} · ${input.salesCount} vente${input.salesCount > 1 ? "s" : ""}`, href: "/resultats" },
  ];
  if (input.challenge) pills.push({ key: "challenge", label: "Challenge", value: input.challenge.target ? `${input.challenge.teamUnits} / ${input.challenge.target}` : String(input.challenge.teamUnits), href: "/equipe", tone: input.challenge.toNext !== null && input.challenge.toNext <= 3 ? "good" : undefined });
  if (input.counter) pills.push({ key: "poste", label: input.counter.label, value: input.counter.online ? "Connecté" : "Hors ligne", href: "/", tone: input.counter.online ? "good" : "warning" });
  else if (input.shortDates !== null) pills.push({ key: "dates", label: "Dates courtes", value: String(input.shortDates), href: "/stock/dates-courtes", tone: input.shortDates > 0 ? "todo" : undefined });
  const rows: IslandHomeRow[] = [];
  if (input.lastSale) rows.push({ key: "derniere-vente", title: input.lastSale.title, detail: `${input.lastSale.stage} · ${input.lastSale.when}`, href: input.lastSale.href, tone: "info" });
  return { headline: input.scanned > 0 ? `${plural(input.scanned, "vente", "ventes")} aujourd'hui` : "En attente de scan…", attention: input.counter !== null && !input.counter.online, pills: pills.slice(0, 3), rows };
}
