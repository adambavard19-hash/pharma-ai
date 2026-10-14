import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CounterDashboardData } from "@/core/counter/dashboard";
import type { FinishedSale, LiveSale } from "@/core/counter/board";

/**
 * « Au comptoir » (demande du fondateur, 13 oct. 2026) : plus de carte « Bonjour … », plus de nom de robot, plus de
 * « Au prochain scan… », plus de liste d'ordonnances. Dans l'ordre : Délivrances en cours, Terminées aujourd'hui, puis
 * la saisie à la main, repliée.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../counter-reset-button", () => ({ CounterResetButton: () => createElement("button", null, "Nouveau patient") }));

const { CounterDashboard } = await import("../counter-dashboard");

const DIR = join(process.cwd(), "src/app/(app)/vente/nouvelle");
const STATUS: CounterDashboardData = {
  status: { state: "READY", title: "Votre comptoir est prêt", subtitle: "", pill: { label: "Connecté", tone: "success" }, posts: [{ id: "post_1", label: "Comptoir 1", owner: "Léa Martin", online: true }], awaitingFirstScan: false } as unknown as CounterDashboardData["status"],
  stats: { detected: 3, accepted: 1, declined: 0, salesCount: 0, attributedCents: 0 },
  activity: [{ id: "old", when: "08:00", patient: null, lines: [{ name: "ANCIENNE ORDONNANCE", quantity: 1 }], moreLines: 0, comptoir: null, stage: { label: "terminée", tone: "success" }, reference: "ORD-0001" }],
};
const LIVE: LiveSale[] = [
  { id: "rx1", reference: "ORD-0042", status: "ANALYZED", comptoir: "Comptoir 1 · Léa Martin", updatedAt: "2026-10-13T08:30:00.000Z", lines: [{ drugName: "AMOXICILLINE 1 g", quantity: 1 }], advice: [{ name: "Probiotique", outcome: "SOLD" }, { name: "Spray nasal", outcome: "NOT_SOLD" }, { name: "Crème", outcome: "PROPOSED" }], recommendations: 3 },
];
const FINISHED: FinishedSale[] = [{ id: "rx0", reference: "ORD-0041", finishedAt: "2026-10-13T08:05:00.000Z", comptoir: "Comptoir 1 · Léa Martin", lines: [{ drugName: "DOLIPRANE 1000", quantity: 1 }], soldCount: 1, adviceCount: 2 }];

function render(props: Partial<Parameters<typeof CounterDashboard>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(CounterDashboard, { dateLabel: "mardi 13 octobre", initial: STATUS, initialSales: LIVE, initialFinished: FINISHED, canConfigure: true, manualOpen: false, ...props }, createElement("form", null, "FORMULAIRE-DE-SAISIE")),
  );
}

describe("la page « Au comptoir »", () => {
  it("s'appelle « Au comptoir » et montre, dans l'ordre, les délivrances en cours, les terminées du jour, la saisie à la main", () => {
    const html = render();
    expect(html).toContain(">Au comptoir</h1>");
    const order = ["Ventes en cours", "Terminées aujourd&#x27;hui", "Saisie à la main"].map((label) => html.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("Connecté");
  });

  it("chaque délivrance dit son comptoir, ses médicaments, ses conseils et leur état, et mène à la vente", () => {
    const html = render();
    expect(html).toContain("Comptoir 1 · Léa Martin");
    expect(html).toContain("AMOXICILLINE 1 g");
    expect(html).toMatch(/Probiotique<\/span><span[^>]*>Vendu/);
    expect(html).toMatch(/Spray nasal<\/span><span[^>]*>Non vendu/);
    expect(html).toMatch(/Crème<\/span><span[^>]*>Proposé/);
    expect(html).toContain('href="/vente/rx1"');
  });

  it("les ventes terminées : l'heure, les médicaments, les conseils vendus, le lien", () => {
    const html = render();
    expect(html).toContain("DOLIPRANE 1000");
    expect(html).toContain("1 conseil vendu sur 2");
    expect(html).toContain('href="/vente/rx0"');
  });

  it("la saisie à la main est repliée par défaut, ouverte quand un patient ou une demande arrive déjà choisi", () => {
    expect(render()).toMatch(/<div id="saisie-manuelle"[^>]*hidden/);
    expect(render()).toContain('aria-expanded="false"');
    expect(render({ manualOpen: true })).not.toMatch(/<div id="saisie-manuelle"[^>]*hidden/);
  });

  it("plus de carte d'accueil, de nom de robot, de « Au prochain scan », ni de liste d'ordonnances", () => {
    const html = render();
    for (const gone of ["Bonjour", "Bonsoir", "La petite comète", "Au prochain scan", "Votre journée", "Activité récente", "Toutes les ordonnances", "ANCIENNE ORDONNANCE"]) expect(html, gone).not.toContain(gone);
    const sources = ["page.tsx", "counter-dashboard.tsx"].map((file) => readFileSync(join(DIR, file), "utf8")).join("\n");
    expect(sources).not.toMatch(/CounterRobot|robotGreeting|loadCounterRobotTips|robotLook|counterMoodLine/);
    expect(existsSync(join(DIR, "counter-robot.tsx"))).toBe(false);
  });

  it("rien en cours : une phrase sobre, sans robot", () => {
    const html = render({ initialSales: [], initialFinished: [] });
    expect(html).toContain("Aucune vente en cours.");
    expect(html).toContain("Aucune vente terminée aujourd&#x27;hui.");
  });

  it("aucun objectif commercial ni challenge n'apparaît sur la page", () => {
    expect(render()).not.toMatch(/challenge|palier|objectif|prime/i);
  });
});
