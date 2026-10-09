import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeCenter, buildDoneInfo, buildHostEntry, cachedImage, encodeCommand, euros, fetchImage, frenchDate, imageSource, legacyContentOf, ordinalFr, type HostAction, type HostEntry, type HostProcess, type NoticeBody } from "../notice-center";

/**
 * Le centre d'avis du poste : ce qu'il envoie à la fenêtre, comment il va chercher une photo, et ce qu'il fait quand
 * la nouvelle fenêtre ne démarre pas. Aucun essai ne lance Windows : le processus de la fenêtre est simulé.
 */

const body = (over: Partial<NoticeBody> = {}): NoticeBody => ({
  ok: true,
  state: "READY",
  title: "PharmaBoost · ORD-0100",
  subject: "QUETIAPINE VIATRIS LP 50 mg",
  alerts: [],
  advice: ["ELUDAY GENCIVE 500 ml · 7,90 € · Sécheresse buccale"],
  signature: "sig-1",
  detectedLabel: "Médicament détecté",
  items: [{ id: "rec_1", drug: "QUETIAPINE VIATRIS LP 50 mg", challenge: null, shortDateOn: null, outcome: "NONE", name: "ELUDAY GENCIVE 500 ml", priceCents: 790, reason: "Sécheresse buccale : effet fréquent de QUETIAPINE.", availability: "IN_STOCK", quantity: 6, imageUrl: "https://images.openbeautyfacts.org/images/products/1/front.jpg" }],
  ...over,
});

describe("ce que la fenêtre reçoit pour une vente", () => {
  const build = (over: Partial<NoticeBody> = {}, images?: Map<string, string>) => buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app/", body: body(over), images });

  it("porte la vente, ce qui a été détecté, et le conseil complet : nom, prix, raison, disponibilité, photo", () => {
    const photos = new Map([["https://images.openbeautyfacts.org/images/products/1/front.jpg", "C:\\x\\a.jpg"]]);
    const entry = build({}, photos);
    expect(entry).toMatchObject({ id: "rx_1", reference: "ORD-0100", label: "Médicament détecté", subject: "QUETIAPINE VIATRIS LP 50 mg", url: "https://pharmaboost.app/vente/rx_1", signature: "sig-1", quiet: false, alerts: [], notes: [], emailSaved: false, emailError: "" });
    expect(entry.items).toEqual([{ id: "rec_1", drug: "QUETIAPINE VIATRIS LP 50 mg", challenge: "", shortDate: "", outcome: "NONE", name: "ELUDAY GENCIVE 500 ml", price: "7,90 €", reason: "Sécheresse buccale : effet fréquent de QUETIAPINE.", availability: "IN_STOCK", image: "C:\\x\\a.jpg" }]);
  });

  it("n'invente rien : sans prix fiable, sans photo, sans stock connu, la fenêtre s'en passe", () => {
    const entry = build({ items: [{ name: "X", priceCents: null, reason: null, availability: "UNKNOWN", quantity: null, imageUrl: null }] });
    expect(entry.items[0]).toEqual({ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE", name: "X", price: "", reason: "", availability: "UNKNOWN", image: "" });
    expect(build({ items: [{ name: "X", priceCents: 100, reason: null, availability: "N'IMPORTE QUOI", quantity: 1, imageUrl: null }] }).items[0].availability).toBe("UNKNOWN");
  });

  it("garde les alertes avant les conseils, sur une ligne chacune", () => {
    expect(build({ alerts: ["Interaction\navec le millepertuis"] }).alerts).toEqual(["Interaction avec le millepertuis"]);
  });

  it("est « silencieuse » quand il n'y a rien à conseiller : un mot de huit secondes, jamais compté en attente", () => {
    const entry = build({ items: [], advice: ["Rien à ajouter pour cette délivrance."] });
    expect(entry).toMatchObject({ quiet: true, items: [], notes: ["Rien à ajouter pour cette délivrance."] });
    expect(build({ items: [], advice: ["x"], alerts: ["Une alerte"] }).quiet).toBe(false);
  });

  it("lit encore un serveur plus ancien, qui n'envoie que des lignes de texte", () => {
    const old = build({ items: undefined, detectedLabel: undefined, advice: ["PROBIOTIQUE · 14,90 € · Antibiotique"] });
    expect(old.label).toBe("Détecté");
    expect(old.items).toEqual([{ id: "", drug: "", challenge: "", shortDate: "", outcome: "NONE", name: "PROBIOTIQUE · 14,90 € · Antibiotique", price: "", reason: "", availability: "UNKNOWN", image: "" }]);
    expect(old.quiet).toBe(false);
  });

  it("porte le médicament concerné, le challenge actif et la vraie date courte, jamais inventés", () => {
    const entry = build({ items: [{ id: "rec_2", drug: "AMOXICILLINE 1 g", challenge: "Challenge probiotiques", shortDateOn: "2026-11-30", outcome: "SOLD", name: "PROBIOTIQUE", priceCents: 1490, reason: null, availability: "IN_STOCK", quantity: 3, imageUrl: null }] });
    expect(entry.items[0]).toMatchObject({ id: "rec_2", drug: "AMOXICILLINE 1 g", challenge: "Challenge probiotiques", shortDate: "30/11/2026", outcome: "SOLD" });
    expect(frenchDate("2026-11-30")).toBe("30/11/2026");
    for (const bad of ["", "30/11/2026", "2026-13", "demain", null, undefined]) expect(frenchDate(bad as string)).toBe("");
  });

  it("garde l'état de l'e-mail et dit un problème dans la fenêtre, sans le cacher", () => {
    const entry = buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: body({ followUp: { emailSaved: true, closed: false } }), emailError: "Adresse refusée", problem: "La réponse n'a pas pu être enregistrée." });
    expect(entry).toMatchObject({ emailSaved: true, emailError: "Adresse refusée" });
    expect(entry.alerts).toEqual(["La réponse n'a pas pu être enregistrée."]);
    expect(entry.quiet).toBe(false);
  });

  it("met les prix à la française, et rien quand il n'y en a pas", () => {
    expect(euros(790)).toBe("7,90 €");
    expect(euros(1490)).toBe("14,90 €");
    expect(euros(0)).toBe("");
    expect(euros(null)).toBe("");
  });

  it("sait se redire en texte pour l'ancienne fenêtre", () => {
    const content = legacyContentOf(build(), 15);
    expect(content).toEqual({ title: "PharmaBoost · ORD-0100", subject: "QUETIAPINE VIATRIS LP 50 mg", alerts: [], advice: ["ELUDAY GENCIVE 500 ml · 7,90 € · Sécheresse buccale : effet fréquent de QUETIAPINE."], url: "https://pharmaboost.app/vente/rx_1", seconds: 15 });
  });

  it("une commande est UNE ligne de JSON, sans séparateur de ligne exotique", () => {
    const line = encodeCommand({ op: "show", text: "a\u2028b\nc" });
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toMatch(/[\n\r\u2028\u2029]/);
    expect(JSON.parse(line).op).toBe("show");
  });
});

describe("d'où une photo peut venir", () => {
  const own = "https://pharmaboost.app";
  it("accepte les bases ouvertes du catalogue et PharmaBoost, en https, en jpeg ou png", () => {
    expect(imageSource("https://images.openbeautyfacts.org/a/b.jpg", own)).toBe("https://images.openbeautyfacts.org/a/b.jpg");
    expect(imageSource("https://images.openfoodfacts.org/a.png", own)).toBe("https://images.openfoodfacts.org/a.png");
    expect(imageSource("/produits/spray.jpg", own)).toBe("https://pharmaboost.app/produits/spray.jpg");
  });
  it("refuse tout le reste : autre site, http, image vectorielle ou webp, adresse illisible, absence", () => {
    for (const raw of ["https://exemple.fr/a.jpg", "http://images.openbeautyfacts.org/a.jpg", "https://images.openbeautyfacts.org/a.svg", "/produits/spray.svg", "https://images.openfoodfacts.org/a.webp", "https://evil.test/https://images.openbeautyfacts.org/a.jpg", "", null, undefined]) {
      expect(imageSource(raw as string, own), String(raw)).toBeNull();
    }
    expect(imageSource("/produits/a.jpg", "pas une adresse")).toBeNull();
  });
});

describe("le téléchargement d'une photo", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pb-images-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  const SOURCE = "https://images.openbeautyfacts.org/a.jpg";
  const reply = (bytes: number[], init: { ok?: boolean; url?: string; length?: string } = {}) =>
    vi.fn(async () => ({ ok: init.ok ?? true, url: init.url ?? SOURCE, headers: { get: (name: string) => (name === "content-length" ? (init.length ?? null) : null) }, arrayBuffer: async () => new Uint8Array(bytes).buffer }) as unknown as Response) as unknown as typeof fetch;

  it("garde un jpeg ou un png, reconnu à ses premiers octets, et le retrouve sans retélécharger", async () => {
    const path = await fetchImage(SOURCE, "https://pharmaboost.app", dir, reply([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));
    expect(path).toMatch(/\.jpg$/);
    expect(readFileSync(path as string)[0]).toBe(0xff);
    expect(cachedImage(dir, SOURCE)).toBe(path);
    const again = reply([0]);
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, again)).toBe(path);
    expect(again).not.toHaveBeenCalled();
    const png = await fetchImage("https://images.openbeautyfacts.org/b.png", "https://pharmaboost.app", dir, reply([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]));
    expect(png).toMatch(/\.png$/);
  });

  it("refuse ce qui n'est pas une image (même annoncée comme telle), ce qui est trop gros, et une redirection hors des sites autorisés", async () => {
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, reply([...Buffer.from("<html>pas une image</html>")]))).toBeNull();
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, reply([0xff, 0xd8, 0xff], { length: "900000" }))).toBeNull();
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, reply([0xff, 0xd8, 0xff, 1], { url: "https://evil.test/a.jpg" }))).toBeNull();
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, reply([0xff, 0xd8, 0xff, 1], { ok: false }))).toBeNull();
    expect(await fetchImage(SOURCE, "https://pharmaboost.app", dir, vi.fn(async () => { throw new Error("hors ligne"); }) as unknown as typeof fetch)).toBeNull();
    expect(readdirSync(dir)).toEqual([]);
  });

  it("ne garde que les soixante photos les plus récentes", async () => {
    for (let i = 0; i < 65; i += 1) writeFileSync(join(dir, `ancienne-${String(i).padStart(2, "0")}.jpg`), "x");
    await fetchImage("https://images.openfoodfacts.org/neuve.jpg", "https://pharmaboost.app", dir, reply([0xff, 0xd8, 0xff, 1], { url: "https://images.openfoodfacts.org/neuve.jpg" }));
    expect(readdirSync(dir).length).toBeLessThanOrEqual(60);
  });
});

type FakeHost = HostProcess & { written: string[]; stdout: EventEmitter; stderr: EventEmitter; emitter: EventEmitter; killed: boolean };

function fakeHost(): FakeHost {
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = new EventEmitter() as EventEmitter & { write(chunk: string): boolean };
  const written: string[] = [];
  stdin.write = (chunk: string) => { written.push(chunk); return true; };
  const host = { stdin, stdout, stderr, written, emitter, killed: false, on: (event: string, listener: (...args: unknown[]) => void) => { emitter.on(event, listener); return host; }, kill: () => { host.killed = true; emitter.emit("exit"); } };
  return host as unknown as FakeHost;
}

describe("la fenêtre et son processus", () => {
  let dir: string;
  let hosts: FakeHost[];
  let legacy: unknown[];
  let logs: string[];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pb-avis-"));
    hosts = [];
    legacy = [];
    logs = [];
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  let actions: HostAction[];
  beforeEach(() => { actions = []; });
  const center = (over: { platform?: NodeJS.Platform; startTimeoutMs?: number } = {}) =>
    new NoticeCenter({ configDir: dir, log: (message) => logs.push(message), legacyShow: (content) => legacy.push(content), platform: over.platform ?? "win32", startTimeoutMs: over.startTimeoutMs, onAction: (action) => actions.push(action), spawnHost: () => { const host = fakeHost(); hosts.push(host); return host; } });
  const entry = (over: Partial<HostEntry> = {}): HostEntry => buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: body() }) && { ...buildHostEntry({ prescriptionId: "rx_1", serverUrl: "https://pharmaboost.app", body: body() }), ...over };
  const commands = (host: FakeHost) => host.written.map((line) => JSON.parse(line));

  it("lance la fenêtre une seule fois, lui parle en JSON, et lui passe l'endroit — sans aucun délai de fermeture", () => {
    const notices = center();
    notices.configure({ seconds: 30, position: "bas-droite" });
    notices.show(entry());
    notices.show(entry({ signature: "sig-2" }));
    expect(hosts).toHaveLength(1);
    const [first, second] = commands(hosts[0]);
    expect(first).toMatchObject({ op: "show", position: "bas-droite" });
    // La fenêtre de la vente reste ouverte jusqu'à « Vente terminée » : aucune durée ne lui est donnée.
    expect(first).not.toHaveProperty("seconds");
    expect(first.positionFile).toBe(join(dir, "pharmaboost-avis-position.txt"));
    expect(first.entry).toMatchObject({ id: "rx_1", reference: "ORD-0100" });
    expect(second.entry.signature).toBe("sig-2");
    expect(readFileSync(join(dir, "pharmaboost-avis-hote.ps1"), "utf8").charCodeAt(0)).toBe(0xfeff);
    expect(legacy).toEqual([]);
  });

  it("par défaut : à droite à mi-hauteur", () => {
    const notices = center();
    notices.show(entry());
    expect(commands(hosts[0])[0]).toMatchObject({ position: "milieu-droite" });
  });

  it("ignore un endroit inconnu", () => {
    const notices = center();
    notices.configure({ seconds: 9999, position: "ailleurs" as never });
    notices.show(entry());
    expect(commands(hosts[0])[0]).toMatchObject({ position: "milieu-droite" });
  });

  it("garde la vente ouverte : « Voir le détail » ne la ferme pas, seul « fermée » la retire", () => {
    const notices = center();
    notices.show(entry());
    expect(notices.ids()).toEqual(["rx_1"]);
    hosts[0].stdout.emit("data", "PRET\nVOIR rx_1\n");
    expect(notices.ids()).toEqual(["rx_1"]);
    expect(actions).toEqual([{ kind: "view", saleId: "rx_1" }]);
    hosts[0].stdout.emit("data", Buffer.from("FERMEE rx_1\r\n"));
    expect(notices.ids()).toEqual([]);
  });

  it("transmet chaque geste du pharmacien : Vendu, Non vendu, reprise, e-mail, fin de vente", () => {
    const notices = center();
    notices.show(entry());
    const address = Buffer.from("Jean.Dupont@gmail.com", "utf8").toString("base64");
    hosts[0].stdout.emit("data", `PRET\nVENDU rx_1 rec_1\nNONVENDU rx_1 rec_2\nANNULER rx_1 rec_1\nEMAIL rx_1 ${address}\nEMAIL_RETIRER rx_1\nTERMINER rx_1\n`);
    expect(actions).toEqual([
      { kind: "sold", saleId: "rx_1", adviceId: "rec_1" },
      { kind: "not_sold", saleId: "rx_1", adviceId: "rec_2" },
      { kind: "undo", saleId: "rx_1", adviceId: "rec_1" },
      { kind: "email", saleId: "rx_1", email: "Jean.Dupont@gmail.com" },
      { kind: "email_remove", saleId: "rx_1" },
      { kind: "finish", saleId: "rx_1" },
    ]);
  });

  it("ignore un mot incomplet, une adresse illisible ou trop longue, un mot inconnu : jamais une panne", () => {
    const notices = center();
    notices.show(entry());
    hosts[0].stdout.emit("data", `PRET\nVENDU rx_1\nVENDU\nEMAIL rx_1\nEMAIL rx_1 ${Buffer.from("a b@c.fr").toString("base64")}\nEMAIL rx_1 ${Buffer.from("x".repeat(300)).toString("base64")}\nPIRATE rx_1 x\n`);
    expect(actions).toEqual([]);
  });

  it("une action qui échoue côté agent est écrite au journal, la fenêtre continue", () => {
    const failing = new NoticeCenter({ configDir: dir, log: (message) => logs.push(message), legacyShow: () => undefined, platform: "win32", onAction: () => { throw new Error("réseau coupé"); }, spawnHost: () => { const host = fakeHost(); hosts.push(host); return host; } });
    failing.show(entry());
    hosts[0].stdout.emit("data", "PRET\nTERMINER rx_1\n");
    expect(logs.join("\n")).toContain("action TERMINER impossible (réseau coupé)");
  });

  it("annonce la fin de vente à la fenêtre et retire la vente du suivi", () => {
    const notices = center();
    notices.show(entry());
    notices.done({ id: "rx_1", title: "Vente terminée — résultats enregistrés", lines: ["1 vendu"], badge: "18e conseil vendu aujourd'hui", warning: false });
    expect(commands(hosts[0]).map((command) => command.op)).toEqual(["show", "done"]);
    expect(commands(hosts[0])[1].info).toMatchObject({ id: "rx_1", badge: "18e conseil vendu aujourd'hui" });
    expect(notices.ids()).toEqual([]);
  });

  it("oublie une vente quand la fenêtre passe à la suivante, sans toucher à la fenêtre", () => {
    const notices = center();
    notices.show(entry());
    notices.forget("rx_1");
    expect(notices.ids()).toEqual([]);
    expect(commands(hosts[0]).map((command) => command.op)).toEqual(["show"]);
  });

  it("ne compte pas en attente un avis « rien à ajouter »", () => {
    const notices = center();
    notices.show(entry({ quiet: true, items: [], notes: ["Rien à ajouter pour cette délivrance."] }));
    expect(notices.ids()).toEqual([]);
  });

  it("retire une vente close, et dit à la fenêtre de quitter à l'arrêt", () => {
    const notices = center();
    notices.show(entry());
    notices.remove("rx_1");
    notices.remove("inconnue");
    expect(commands(hosts[0]).map((command) => command.op)).toEqual(["show", "remove"]);
    notices.stop();
    expect(commands(hosts[0]).map((command) => command.op)).toEqual(["show", "remove", "quit"]);
    expect(hosts[0].killed).toBe(true);
  });

  it("retombe sur l'ancienne fenêtre quand la nouvelle ne compile pas : l'avis n'est jamais perdu", () => {
    const notices = center();
    notices.show(entry());
    hosts[0].stderr.emit("data", "Add-Type : error CS1002: ; expected");
    expect(legacy).toHaveLength(1);
    expect(legacy[0]).toMatchObject({ subject: "QUETIAPINE VIATRIS LP 50 mg", seconds: 15 });
    expect(logs.join("\n")).toContain("retour à l'ancienne fenêtre");
    // Et pour les avis suivants : l'ancienne fenêtre, sans relancer la nouvelle.
    notices.show(entry({ id: "rx_2" }));
    expect(legacy).toHaveLength(2);
    expect(hosts).toHaveLength(1);
  });

  it("retombe aussi quand la fenêtre s'arrête avant d'être prête, ou n'est jamais prête", () => {
    const early = center();
    early.show(entry());
    hosts[0].emitter.emit("exit");
    expect(legacy).toHaveLength(1);

    vi.useFakeTimers();
    try {
      const slow = center({ startTimeoutMs: 1000 });
      slow.show(entry({ id: "rx_9" }));
      vi.advanceTimersByTime(1500);
      expect(legacy).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("une erreur APRÈS « PRET » n'est qu'un incident : la fenêtre reste la bonne, et repart au prochain conseil", () => {
    const notices = center();
    notices.show(entry());
    hosts[0].stdout.emit("data", "PRET\n");
    hosts[0].stderr.emit("data", "incident passager");
    expect(legacy).toEqual([]);
    hosts[0].emitter.emit("exit");
    notices.show(entry({ id: "rx_2" }));
    expect(hosts).toHaveLength(2);
    expect(legacy).toEqual([]);
  });

  it("se prépare avant le premier conseil : la fenêtre démarre sans rien afficher, une seule fois, et sert ensuite", () => {
    const notices = center();
    notices.warmUp();
    notices.warmUp();
    expect(hosts).toHaveLength(1);
    expect(hosts[0].written).toEqual([]);
    notices.show(entry());
    expect(hosts).toHaveLength(1);
    expect(commands(hosts[0]).map((command) => command.op)).toEqual(["show"]);
  });

  it("ne se prépare pas hors Windows, ni quand l'ancienne fenêtre est demandée, ni après un échec", () => {
    center({ platform: "darwin" }).warmUp();
    const forced = center();
    forced.configure({ legacy: true });
    forced.warmUp();
    expect(hosts).toHaveLength(0);
    const failing = center();
    failing.warmUp();
    hosts[0].stderr.emit("data", "Add-Type : error");
    failing.warmUp();
    expect(hosts).toHaveLength(1);
  });

  it("l'interrupteur du poste : « ancienne fenêtre » ne lance jamais la nouvelle, et se lève aussi vite", () => {
    const notices = center();
    notices.configure({ legacy: true });
    notices.show(entry());
    expect(hosts).toHaveLength(0);
    expect(legacy).toHaveLength(1);
    notices.configure({ legacy: false });
    notices.show(entry({ id: "rx_2" }));
    expect(hosts).toHaveLength(1);
    expect(legacy).toHaveLength(1);
  });

  it("hors Windows : rien n'est lancé, le conseil est écrit au journal", () => {
    const notices = center({ platform: "darwin" });
    notices.show(entry());
    expect(hosts).toHaveLength(0);
    expect(logs.join("\n")).toContain("non affiché hors Windows");
  });
});

describe("le message de fin de vente", () => {
  const result = (over: Partial<Parameters<typeof buildDoneInfo>[0]["result"]> = {}) => ({ proposed: 3, sold: 2, notSold: 1, unanswered: 0, soldToday: 18, report: "SENT" as const, ...over });

  it("dit ce qui a été enregistré, le rang du jour et l'envoi du bilan", () => {
    const info = buildDoneInfo({ saleId: "rx_1", result: result(), emailWasSaved: true });
    expect(info).toEqual({ id: "rx_1", title: "Vente terminée — résultats enregistrés", lines: ["2 vendus · 1 non vendu · 0 sans réponse", "✓ Bilan envoyé au patient."], badge: "18e conseil vendu aujourd'hui", warning: false });
  });

  it("n'annonce aucun rang quand rien n'a été vendu dans cette vente", () => {
    expect(buildDoneInfo({ saleId: "rx_1", result: result({ sold: 0, notSold: 2, unanswered: 1, soldToday: null, report: "NONE" }), emailWasSaved: false }).badge).toBe("");
    expect(buildDoneInfo({ saleId: "rx_1", result: result({ sold: 0, soldToday: 18, report: "NONE" }), emailWasSaved: false }).badge).toBe("");
  });

  it("ne dit « bilan envoyé » que si le serveur l'a confirmé ; un échec est dit, en avertissement", () => {
    expect(buildDoneInfo({ saleId: "rx_1", result: result({ report: "NONE" }), emailWasSaved: false }).lines.join(" ")).not.toContain("Bilan");
    const failed = buildDoneInfo({ saleId: "rx_1", result: result({ report: "FAILED" }), emailWasSaved: true });
    expect(failed.warning).toBe(true);
    expect(failed.lines.join(" ")).toContain("n'a pas pu être envoyé");
    expect(buildDoneInfo({ saleId: "rx_1", result: result({ report: "SIMULATED" }), emailWasSaved: true }).lines.join(" ")).toContain("mode test");
  });

  it("explique l'absence de bilan quand une adresse était donnée mais que rien n'a été vendu", () => {
    const info = buildDoneInfo({ saleId: "rx_1", result: result({ sold: 0, soldToday: null, report: "NONE" }), emailWasSaved: true });
    expect(info.lines.join(" ")).toContain("aucun produit n'a été vendu");
  });

  it("dit « aucun conseil » plutôt que des zéros quand rien n'a été proposé", () => {
    expect(buildDoneInfo({ saleId: "rx_1", result: result({ proposed: 0, sold: 0, notSold: 0, unanswered: 0, soldToday: null, report: "NONE" }), emailWasSaved: false }).lines).toEqual(["Aucun conseil à enregistrer."]);
  });

  it("écrit le rang en français : 1er, 2e, 18e", () => {
    expect([1, 2, 11, 18, 21].map(ordinalFr)).toEqual(["1er", "2e", "11e", "18e", "21e"]);
  });
});
