import { describe, expect, it } from "vitest";
import { ONLINE_WITHIN_SECONDS, buildConnectionOverview, connectionMethods, type OverviewConnection, type OverviewInput, type OverviewPost } from "../connection-overview";

/**
 * Les trois questions de la connexion — connexion, stock reçu, ventes — ne se mélangent jamais.
 * Chaque cas ci-dessous est une contradiction que les anciens écrans affichaient.
 */

const NOW = new Date("2026-10-08T10:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const MIN = 60;
const HOUR = 3600;
const DAY = 86_400;

const connection = (overrides: Partial<OverviewConnection> = {}): OverviewConnection => ({
  status: "CONNECTED",
  pairedAt: ago(10 * DAY),
  lastSeenAt: ago(MIN),
  lastSyncAt: ago(2 * HOUR),
  lastSyncLines: 4200,
  lastError: null,
  hostname: "SRV-PHARMA",
  agentVersion: "0.5.1",
  pairingExpiresAt: null,
  ...overrides,
});

const post = (overrides: Partial<OverviewPost> = {}): OverviewPost => ({
  id: "post_1",
  label: "Caisse 1",
  hostname: "CAISSE1",
  pairedAt: ago(3 * DAY),
  lastSeenAt: ago(MIN),
  lastScanAt: ago(5 * MIN),
  scanCount: 42,
  version: "0.5.1",
  pairingExpiresAt: null,
  ...overrides,
});

const overview = (overrides: Partial<OverviewInput> = {}) =>
  buildConnectionOverview({ now: NOW, lgo: "lgpi", connection: null, posts: [], stockSyncedAt: null, stockLines: null, stockProblem: null, ...overrides });

describe("le départ : rien n'est fait", () => {
  it("sans logiciel choisi ni stock : on commence par choisir le logiciel", () => {
    const result = overview({ lgo: null });
    expect(result.headline).toMatchObject({ step: 1, action: "Choisir mon logiciel", tone: "neutral" });
    expect(result.agent.state).toBe("NOT_INSTALLED");
    expect(result.stock.state).toBe("NONE");
    expect(result.sales.state).toBe("NO_POST");
  });

  it("logiciel choisi, aucun stock : il manque le stock — étape 2", () => {
    expect(overview().headline).toMatchObject({ step: 2, action: "Envoyer mon stock", tone: "warning" });
  });

  it("l'agent n'est dit « facultatif » que quand rien n'est installé : un fichier suffit pour démarrer", () => {
    expect(overview().agent.detail).toMatch(/facultatif/);
  });
});

describe("le stock est indépendant de la connexion", () => {
  it("un stock reçu par fichier est « à jour » sans aucun programme installé — et la page ne se plaint pas d'un agent absent", () => {
    const result = overview({ stockSyncedAt: ago(2 * HOUR), stockLines: 4200 });
    expect(result.stock).toMatchObject({ state: "FRESH", tone: "success", title: "Stock à jour" });
    expect(result.agent.state).toBe("NOT_INSTALLED");
    expect(result.headline).toMatchObject({ title: "Tout fonctionne", tone: "success", action: null });
  });

  it("un agent injoignable depuis trois jours N'ANNULE PAS un stock arrivé ce matin : deux états, deux phrases", () => {
    const result = overview({ connection: connection({ lastSeenAt: ago(3 * DAY) }), stockSyncedAt: ago(2 * HOUR), stockLines: 4200 });
    expect(result.agent).toMatchObject({ state: "OFFLINE", tone: "warning", title: "Ne répond plus" });
    expect(result.agent.title).not.toMatch(/connecté/i);
    expect(result.stock).toMatchObject({ state: "FRESH", tone: "success" });
    // La phrase de dix secondes nomme la panne ET rappelle que le stock, lui, est à jour.
    expect(result.headline.title).toBe("PharmaBoost Connect ne répond plus");
    expect(result.headline.detail).toMatch(/stock reste à jour/);
  });

  it("un agent en ligne avec un stock de dix jours : l'agent est « connecté », le stock est « ancien » — jamais « à jour »", () => {
    const result = overview({ connection: connection(), stockSyncedAt: ago(10 * DAY) });
    expect(result.agent.state).toBe("ONLINE");
    expect(result.stock).toMatchObject({ state: "OLD", tone: "warning", title: "Stock ancien : 10 jours" });
    expect(result.headline).toMatchObject({ title: "Votre stock date de 10 jours", step: 2 });
  });

  it("un stock de deux jours reste « à jour » : le seuil du rappel est de trois jours", () => {
    expect(overview({ stockSyncedAt: ago(2 * DAY) }).stock.state).toBe("FRESH");
    expect(overview({ stockSyncedAt: ago(3 * DAY) }).stock.state).toBe("OLD");
  });

  it("un fichier non appliqué est dit, et le stock affiché est celui d'avant", () => {
    const held = overview({ stockSyncedAt: ago(HOUR), stockProblem: "HELD" });
    expect(held.stock.problem).toMatch(/en vérification/);
    expect(held.stock.problem).toMatch(/le stock n'a pas changé/);
    expect(held.stock.tone).toBe("warning");
    expect(held.headline.title).toBe("Stock à jour, mais un fichier est à revoir");
    expect(overview({ stockProblem: "FAILED" }).stock.detail).toMatch(/n'a pas pu être lu/);
  });

  it("dit « aujourd'hui », « hier », puis la date", () => {
    expect(overview({ stockSyncedAt: ago(HOUR) }).stock.detail).toMatch(/^Reçu aujourd'hui à /);
    expect(overview({ stockSyncedAt: ago(DAY + HOUR) }).stock.detail).toMatch(/^Reçu hier à /);
    expect(overview({ stockSyncedAt: ago(2 * DAY + HOUR), stockLines: 1 }).stock.detail).toMatch(/^Reçu le 06\/10\/2026 à .* · 1 ligne$/);
  });
});

describe("la connexion : seul un signe de vie récent est « connecté »", () => {
  it("le seuil est de dix minutes", () => {
    expect(ONLINE_WITHIN_SECONDS).toBe(600);
    expect(overview({ connection: connection({ lastSeenAt: ago(9 * MIN) }) }).agent.state).toBe("ONLINE");
    expect(overview({ connection: connection({ lastSeenAt: ago(11 * MIN) }) }).agent.state).toBe("OFFLINE");
  });

  it("un serveur appairé mais jamais vu n'est pas « connecté »", () => {
    expect(overview({ connection: connection({ lastSeenAt: null }) }).agent.state).toBe("OFFLINE");
  });

  it("un logiciel choisi sans installation (ligne en attente, sans code) n'est ni connecté ni injoignable : rien n'est installé", () => {
    const result = overview({ connection: connection({ status: "PENDING", pairedAt: null, lastSeenAt: null, lastSyncAt: null, lastSyncLines: null, hostname: null, agentVersion: null }) });
    expect(result.agent.state).toBe("NOT_INSTALLED");
    expect(result.agent.items).toEqual([]);
  });

  it("un code d'appairage encore valable : l'installation est attendue", () => {
    const result = overview({ connection: connection({ status: "PENDING", pairedAt: null, lastSeenAt: null, pairingExpiresAt: new Date(NOW.getTime() + HOUR * 1000) }) });
    expect(result.agent).toMatchObject({ state: "WAITING", title: "En attente de l'installation" });
  });

  it("un code expiré n'attend plus rien", () => {
    expect(overview({ connection: connection({ status: "PENDING", pairedAt: null, lastSeenAt: null, pairingExpiresAt: ago(HOUR) }) }).agent.state).toBe("NOT_INSTALLED");
  });

  it("un serveur déconnecté (clé révoquée) n'est plus un appareil", () => {
    expect(overview({ connection: connection({ status: "DISCONNECTED" }) }).agent.state).toBe("NOT_INSTALLED");
  });

  it("le serveur ET un poste : « 2 appareils en ligne », ou « 1 hors ligne » quand l'un se tait", () => {
    const both = overview({ connection: connection(), posts: [post()] });
    expect(both.agent).toMatchObject({ state: "ONLINE", detail: "2 appareils en ligne" });
    const mixed = overview({ connection: connection(), posts: [post({ lastSeenAt: ago(2 * HOUR) })] });
    expect(mixed.agent).toMatchObject({ state: "ONLINE", detail: "1 appareil en ligne · 1 hors ligne" });
  });

  it("un message de l'agent est montré tel quel, en orange", () => {
    const result = overview({ connection: connection({ lastError: "Dossier d'export introuvable" }) });
    expect(result.agent).toMatchObject({ state: "ONLINE", tone: "warning", notice: "Dossier d'export introuvable" });
    expect(result.agent.detail).toContain("Dossier d'export introuvable");
  });
});

describe("les ventes : suivies au bip, pas par le logiciel de l'officine", () => {
  it("sans poste : ventes non suivies, et la lecture directe du logiciel est dite indisponible", () => {
    const result = overview({ connection: connection(), stockSyncedAt: ago(HOUR) });
    expect(result.sales).toMatchObject({ state: "NO_POST", tone: "neutral", title: "Ventes non suivies" });
    expect(result.sales.detail).toMatch(/n'est pas disponible/);
  });

  it("un serveur en ligne ne suffit pas à « suivre les ventes » : il faut un poste", () => {
    expect(overview({ connection: connection() }).sales.state).toBe("NO_POST");
  });

  it("un poste en ligne : ventes suivies, avec le dernier bip", () => {
    const result = overview({ posts: [post()] });
    expect(result.sales).toMatchObject({ state: "FOLLOWED", tone: "success", title: "Ventes suivies au bip", scanCount: 42 });
    expect(result.sales.detail).toMatch(/1 poste en ligne · dernier bip il y a 5 min/);
  });

  it("un poste qui se tait : le dit, en orange", () => {
    const result = overview({ posts: [post({ lastSeenAt: ago(DAY) })] });
    expect(result.sales).toMatchObject({ state: "POST_OFFLINE", tone: "warning", title: "Poste hors ligne" });
  });

  it("un poste jamais appairé (lien d'installation en attente) n'est pas un poste en ligne", () => {
    const result = overview({ posts: [post({ pairedAt: null, lastSeenAt: null, pairingExpiresAt: new Date(NOW.getTime() + DAY * 1000) })] });
    expect(result.sales.state).toBe("NO_POST");
    expect(result.agent.state).toBe("WAITING");
  });
});

describe("les méthodes réellement disponibles : jamais de promesse qui n'est pas tenue", () => {
  it("l'envoi d'un fichier est toujours possible", () => {
    for (const lgo of ["lgpi", "winpharma", "smart-rx", "pharmaland", "leo", "autre", null]) expect(connectionMethods(lgo).file.available).toBe(true);
  });

  it("LGPI : la procédure a été essayée sur un vrai export, et la carte dit que le stock ne part pas tout seul", () => {
    const methods = connectionMethods("lgpi");
    expect(methods.connect).toMatchObject({ tested: true, badge: "Essayé avec un vrai export" });
    expect(methods.connect.note).toMatch(/n'envoie pas son stock tout seul/);
  });

  it("les autres logiciels : export à programmer, non essayé — aucune synchronisation annoncée", () => {
    for (const lgo of ["winpharma", "smart-rx", "pharmaland", "leo", "autre"]) {
      const methods = connectionMethods(lgo);
      expect(methods.connect.tested, lgo).toBe(false);
      expect(methods.connect.badge, lgo).toBe("Export à programmer");
      expect(methods.connect.note, lgo).toMatch(/Non essayé/);
    }
  });

  it("la lecture directe du logiciel n'est disponible pour aucun, et la raison est donnée", () => {
    for (const lgo of ["lgpi", "winpharma", null]) {
      expect(connectionMethods(lgo).direct).toMatchObject({ available: false, badge: "Pas disponible" });
      expect(connectionMethods(lgo).direct.reason).toMatch(/accord/);
    }
  });

  it("aucun texte ne parle de « synchronisation automatique » ni de « temps réel »", () => {
    const text = JSON.stringify([overview().headline, connectionMethods("lgpi"), connectionMethods("winpharma")]);
    expect(text).not.toMatch(/synchronisation automatique|temps réel|en continu/i);
  });
});

describe("les comptoirs : « Connecté » demande un appairage ET un signe de vie", () => {
  it("un poste appairé qui répond : connecté", () => {
    const [row] = overview({ posts: [post()] }).counters;
    expect(row).toMatchObject({ id: "post_1", label: "Caisse 1", state: "CONNECTED", title: "Connecté" });
  });

  it("un poste appairé sans signe de vie récent : « ne répond plus », jamais connecté", () => {
    const [row] = overview({ posts: [post({ lastSeenAt: ago(2 * HOUR) })] }).counters;
    expect(row).toMatchObject({ state: "OFFLINE", title: "Ne répond plus" });
    expect(row.detail).toMatch(/Dernier signe de vie/);
  });

  it("un poste appairé qui n'a jamais donné signe de vie : « ne répond plus »", () => {
    expect(overview({ posts: [post({ lastSeenAt: null })] }).counters[0].state).toBe("OFFLINE");
  });

  it("un lien envoyé et valable : à installer, avec sa date limite — pas connecté", () => {
    const [row] = overview({ posts: [post({ pairedAt: null, lastSeenAt: null, pairingExpiresAt: new Date(NOW.getTime() + 3 * DAY * 1000) })] }).counters;
    expect(row).toMatchObject({ state: "TO_INSTALL", title: "À installer" });
    expect(row.detail).toMatch(/valable jusqu'au 11\/10/);
  });

  it("un lien expiré : à renouveler", () => {
    const [row] = overview({ posts: [post({ pairedAt: null, lastSeenAt: null, pairingExpiresAt: ago(HOUR) })] }).counters;
    expect(row).toMatchObject({ state: "EXPIRED", title: "Lien expiré" });
  });

  it("garde l'ordre de création et nomme un poste sans libellé par son numéro", () => {
    const rows = overview({ posts: [post({ id: "a", label: "Comptoir 1" }), post({ id: "b", label: null, hostname: "", pairedAt: null, lastSeenAt: null, pairingExpiresAt: new Date(NOW.getTime() + DAY * 1000) })] }).counters;
    expect(rows.map((row) => [row.id, row.label])).toEqual([["a", "Comptoir 1"], ["b", "Comptoir 2"]]);
  });

  it("aucun poste : aucun comptoir listé", () => {
    expect(overview().counters).toEqual([]);
  });
});

describe("l'envoi automatique n'est « actif » que s'il a eu lieu", () => {
  it("rien d'installé : non utilisé", () => {
    expect(overview().autoSync.state).toBe("NONE");
  });

  it("un serveur relié qui n'a encore rien lu : en attente, jamais actif", () => {
    expect(overview({ connection: connection({ lastSyncAt: null }) }).autoSync.state).toBe("WAITING");
  });

  it("un export lu il y a deux heures : actif", () => {
    const sync = overview({ connection: connection({ lastSyncAt: ago(2 * HOUR) }) }).autoSync;
    expect(sync.state).toBe("ACTIVE");
    expect(sync.detail).toMatch(/Dernier export lu il y a 2 h/);
  });

  it("un serveur en ligne mais sans export depuis dix jours : périmé, pas actif", () => {
    expect(overview({ connection: connection({ lastSyncAt: ago(10 * DAY) }) }).autoSync.state).toBe("STALE");
  });

  it("un poste qui relit un dossier d'export compte, un poste sans dossier non", () => {
    expect(overview({ posts: [post({ exportPath: "\\\\SRV\\PharmaBoost", lastExportAt: ago(HOUR) })] }).autoSync.state).toBe("ACTIVE");
    expect(overview({ posts: [post()] }).autoSync.state).toBe("NONE");
  });
});

describe("le stock se dit comme on le dirait : une date et un nombre de produits", () => {
  it("sans stock reçu : ni date ni nombre", () => {
    expect(overview().stock).toMatchObject({ receivedLabel: null, productCount: null });
  });

  it("le nombre de produits est celui du dernier fichier, à défaut les références en rayon", () => {
    expect(overview({ stockSyncedAt: ago(HOUR), stockLines: 4200, stockReferences: 3980 }).stock.productCount).toBe(4200);
    expect(overview({ stockSyncedAt: ago(HOUR), stockReferences: 3980 }).stock.productCount).toBe(3980);
    expect(overview({ stockSyncedAt: ago(HOUR) }).stock.productCount).toBeNull();
  });

  it("la date est dite « aujourd'hui à… », « hier à… » ou en toutes lettres", () => {
    expect(overview({ stockSyncedAt: ago(HOUR) }).stock.receivedLabel).toMatch(/^aujourd'hui à \d\d:\d\d$/);
    expect(overview({ stockSyncedAt: ago(DAY + HOUR) }).stock.receivedLabel).toMatch(/^hier à \d\d:\d\d$/);
    expect(overview({ stockSyncedAt: ago(5 * DAY) }).stock.receivedLabel).toMatch(/^le \d\d\/\d\d\/2026 à \d\d:\d\d$/);
  });
});

describe("les ventes ne sont « suivies » qu'après un vrai bip", () => {
  it("un poste en ligne qui n'a jamais reçu de bip : en attente du premier bip, pas « suivies »", () => {
    const sales = overview({ posts: [post({ scanCount: 0, lastScanAt: null })] }).sales;
    expect(sales).toMatchObject({ state: "WAITING_SCAN", tone: "neutral", title: "En attente du premier bip", scanCount: 0 });
    expect(sales.detail).toMatch(/Bipez une boîte/);
  });

  it("dès qu'un bip est arrivé : suivies", () => {
    expect(overview({ posts: [post({ scanCount: 1 })] }).sales.state).toBe("FOLLOWED");
  });
});
