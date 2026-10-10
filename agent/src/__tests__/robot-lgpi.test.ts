import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LgpiRobotReader, findJournalDir, journalName, startLgpiJournal } from "../robot-lgpi";
import { analyse, matchDeliveries, renderReport } from "../lire-journal";

/**
 * Le suivi du robot par le journal de LGPI, éprouvé sur la FORME des lignes vues dans le rapport de POSTE3 (9 octobre 2026).
 * Les mots que le rapport masquait (« Commande », « caisse », « retire »…) sont ici INVENTÉS : le suivi ne s'appuie que sur les
 * mots que le rapport montrait en clair (« Demande à la », « Code produit », « Fin de la demande à la », « on n'en … pas »)
 * et sur les noms de classes (ControlerAutomate, StockOutputResponse…).
 */

const AUTOMATE = "f.a.soft.application.automate.ControlerAutomate";
const RECEPTION = "c.p.a.c.common.AutomateMessageEventGenerator";
const CLIENT = "f.a.soft.metier.processus.automate.ClientAutomates";

const entry = (day: string, time: string, logger: string, message: string, thread = "AWT-EventQueue-0") => `${day} ${time},123 INFO [${thread}] ${logger} - ${message}`;
const ctl = (time: string, message: string, day = "2026-10-09") => entry(day, time, AUTOMATE, `Commande automate : ${message}`);
const response = (time: string, code: string, key = "CIP_13", day = "2026-10-09") => [
  entry(day, time, RECEPTION, `Reception message en provenance de l'automate : StockOutputResponse(super=AbstractLgoContainer(id=12345678, source=101, destination=202, robotConfigId=303), salesmanCode=null, outputRequestNumber=1, outputDestination=2, priority=5, status=ACCEPT, criteria=[StockOutputCriteria(productCodes={${key}=${code}}, quantity=1)])`, "org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer#0-1"),
  entry(day, time, CLIENT, `recu StockOutputResponse(super=AbstractLgoContainer(id=12345678, source=101, destination=202, robotConfigId=303), salesmanCode=null, outputRequestNumber=1, outputDestination=2, priority=5, status=ACCEPT, criteria=[StockOutputCriteria(productCodes={${key}=${code}}, quantity=1)])`, "org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer#0-1"),
];
const delivery = (time: string, code: string, day = "2026-10-09") =>
  entry(day, time, RECEPTION, `Reception message en provenance de l'automate : StockOutputMessage(super=AbstractLgoContainer(id=12345678, source=101, destination=202, robotConfigId=303), salesmanCode=null, outputRequestNumber=-1, outputDestination=2, priority=5, status=COMPLETED, packs=[StockOutputPack(super=Pack(name=null, ean=${code}))])`, "org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer#0-1");

/** Un cycle comme celui de la vente de test : une demande, un code, la fin, la réponse du robot. */
const cycle = (time: string, code: string, day = "2026-10-09") => [
  ctl(time, "Demande à la caisse", day),
  ctl(time, `Code produit ${code} pour 1 article`, day),
  ctl(time, "1 produits, on en retire 1 sur 303", day),
  ctl(time, "Quantité totale demandée pour cette commande : 1", day),
  ctl(time, "Fin de la demande à la caisse", day),
  ...response(time, code, "CIP_13", day),
];
/** Le robot n'a pas la boîte : la demande s'arrête là, sans fin ni réponse. */
const gaveUp = (time: string, code: string) => [ctl(time, "Demande à la caisse"), ctl(time, `Code produit ${code} pour 1 article`), ctl(time, "on n'en retire pas")];

function run(lines: string[], now = 1_000_000): string[] {
  const reader = new LgpiRobotReader();
  const out: string[] = [];
  for (const line of lines) out.push(...reader.push(line, now));
  out.push(...reader.flush(now + 10_000));
  return out;
}

describe("la demande de sortie au robot", () => {
  it("la vente de test d'UNE boîte : un cycle, un code, annoncé une seule fois", () => {
    expect(run(cycle("02:06:14", "3400935294227"))).toEqual(["3400935294227"]);
  });

  it("annonce à la réponse du robot, pas avant : la fin du cycle attend la réponse (qui vient dans la même seconde)", () => {
    const reader = new LgpiRobotReader();
    const lines = cycle("02:06:14", "3400935294227");
    const before = lines.slice(0, 5).flatMap((line) => reader.push(line, 0));
    expect(before).toEqual([]);
    expect(reader.push(lines[5], 0)).toEqual(["3400935294227"]);
    // La seconde ligne de réponse (même contenu, autre classe) n'annonce rien de plus.
    expect(reader.push(lines[6], 0)).toEqual([]);
  });

  it("sans réponse du robot, la demande terminée est annoncée au bout de trois secondes", () => {
    const reader = new LgpiRobotReader();
    for (const line of cycle("02:06:14", "3400935294227").slice(0, 5)) reader.push(line, 1000);
    expect(reader.flush(2500)).toEqual([]);
    expect(reader.flush(4100)).toEqual(["3400935294227"]);
    expect(reader.flush(9000)).toEqual([]);
  });

  it("la même boîte redemandée cinq fois en vingt secondes sans que le robot l'ait (19:13) : rien n'est annoncé", () => {
    const lines = [...gaveUp("19:13:22", "5162291"), ...gaveUp("19:13:22", "5162291"), ...gaveUp("19:13:24", "5162291"), ...gaveUp("19:13:31", "5162291"), ...gaveUp("19:13:31", "5162291")];
    expect(run(lines)).toEqual([]);
  });

  it("une demande restée seule (02:05:37) puis la vraie (02:06:14) : un seul code", () => {
    expect(run([ctl("02:05:37", "Demande à la caisse"), ...cycle("02:06:14", "3400935294227")])).toEqual(["3400935294227"]);
  });

  it("une demande qui n'a pas fini avant la suivante est laissée de côté, pas annoncée", () => {
    const reader = new LgpiRobotReader();
    const out = [...gaveUp("18:59:54", "3400932331536"), ...cycle("18:59:53", "3400932331536")].flatMap((line) => reader.push(line, 0));
    expect(out).toEqual(["3400932331536"]);
    expect(reader.givenUp).toBe(1);
    expect(reader.finished).toBe(1);
  });

  it("plusieurs produits dans une demande : tous annoncés, une fois chacun, dans l'ordre", () => {
    const lines = [
      ctl("18:51:11", "Demande à la caisse"),
      ctl("18:51:11", "Code produit 3400938203820 pour 1 article"),
      ctl("18:51:11", "Code produit 3400934796708 pour 1 article"),
      ctl("18:51:11", "Code produit 3400938203820 pour 1 article"),
      ctl("18:51:12", "Fin de la demande à la caisse"),
    ];
    expect(run(lines)).toEqual(["3400938203820", "3400934796708"]);
  });

  it("un produit numéroté par LGPI (7 chiffres) est remplacé par le code-barres que le robot donne dans sa réponse (19:13:12)", () => {
    const lines = [
      ctl("19:13:12", "Demande à la caisse"),
      ctl("19:13:12", "Code produit 5162291 pour 1 article"),
      ctl("19:13:12", "Fin de la demande à la caisse"),
      ...response("19:13:12", "4015630063253", "GTIN_13"),
    ];
    expect(run(lines)).toEqual(["4015630063253"]);
  });

  it("le remplacement n'a lieu que s'il est sans ambiguïté : deux codes à 13 chiffres dans la réponse, ou un cycle à plusieurs produits, ne changent rien", () => {
    const ambiguous = [
      ctl("19:13:12", "Demande à la caisse"),
      ctl("19:13:12", "Code produit 5162291 pour 1 article"),
      ctl("19:13:12", "Fin de la demande à la caisse"),
      entry("2026-10-09", "19:13:12", RECEPTION, "Reception message en provenance de l'automate : StockOutputResponse(criteria=[StockOutputCriteria(productCodes={CIP_13=3400935294227, EAN_13=4015630063253})])"),
    ];
    expect(run(ambiguous)).toEqual(["5162291"]);
    const several = [
      ctl("19:13:12", "Demande à la caisse"),
      ctl("19:13:12", "Code produit 5162291 pour 1 article"),
      ctl("19:13:12", "Code produit 3400935294227 pour 1 article"),
      ctl("19:13:12", "Fin de la demande à la caisse"),
      ...response("19:13:12", "4015630063253", "GTIN_13"),
    ];
    expect(run(several)).toEqual(["5162291", "3400935294227"]);
  });

  it("une ligne « Code produit » hors d'une demande, une suite de trace d'erreur ou une autre classe n'annonce rien", () => {
    const lines = [
      ctl("10:00:00", "Code produit 3400935294227 pour 1 article"),
      "\tat f.a.soft.application.automate.ControlerAutomate.run(ControlerAutomate.java:42)",
      entry("2026-10-09", "10:00:01", "f.a.soft.metier.autre.Facture", "Demande à la caisse"),
      entry("2026-10-09", "10:00:01", "f.a.soft.metier.autre.Facture", "Code produit 3400935294227 pour 1 article"),
      entry("2026-10-09", "10:00:01", "f.a.soft.metier.autre.Facture", "Fin de la demande à la caisse"),
    ];
    expect(run(lines)).toEqual([]);
  });

  it("n'annonce que des codes de produit : sept ou treize chiffres, jamais un numéro plus long", () => {
    const lines = [ctl("10:00:00", "Demande à la caisse"), ctl("10:00:00", "Code produit 185057800608436 pour 1 article"), ctl("10:00:00", "Code produit 12345 pour 1 article"), ctl("10:00:01", "Fin de la demande à la caisse")];
    expect(run(lines)).toEqual([]);
  });

  it("un journal d'un seul tenant (une demande qui ne finit jamais) ne grossit pas sans fin", () => {
    const reader = new LgpiRobotReader();
    reader.push(ctl("10:00:00", "Demande à la caisse"), 0);
    for (let i = 0; i < 500; i++) reader.push(ctl("10:00:00", `Code produit ${String(3400000000000 + i)} pour 1 article`), 0);
    const out = reader.push(ctl("10:00:01", "Fin de la demande à la caisse"), 0);
    expect(out).toEqual([]);
    expect(reader.flush(10_000)).toHaveLength(50);
  });
});

describe("le journal du jour", () => {
  const dirs: string[] = [];
  let dir: string;
  let clock = new Date(2026, 9, 9, 8, 0, 0).getTime();
  beforeEach(() => {
    vi.useFakeTimers();
    dir = mkdtempSync(join(tmpdir(), "pb-lgpi-"));
    dirs.push(dir);
    clock = new Date(2026, 9, 9, 8, 0, 0).getTime();
  });
  afterEach(() => {
    vi.useRealTimers();
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const start = () => {
    const scans: string[] = [];
    const statuses: string[] = [];
    const stop = startLgpiJournal({ kind: "lgpi", dir }, { onScan: (code) => scans.push(code), onStatus: (message) => statuses.push(message) }, () => clock);
    return { scans, statuses, stop };
  };
  const tick = (seconds = 1) => {
    clock += seconds * 1000;
    vi.advanceTimersByTime(seconds * 1000);
  };
  const append = (name: string, lines: string[]) => appendFileSync(join(dir, name), lines.join("\r\n") + "\r\n", "latin1");

  it("le nom du journal est celui du jour, à l'heure du poste", () => {
    expect(journalName(new Date(2026, 9, 9, 23, 59))).toBe("lgpi.2026-10-09.log");
    expect(journalName(new Date(2026, 0, 5, 0, 1))).toBe("lgpi.2026-01-05.log");
  });

  it("part de la fin : l'historique du jour n'est jamais rejoué, la demande suivante est annoncée", () => {
    writeFileSync(join(dir, "lgpi.2026-10-09.log"), cycle("07:00:00", "3400937950527").join("\r\n") + "\r\n", "latin1");
    const { scans, stop } = start();
    tick();
    expect(scans).toEqual([]);
    append("lgpi.2026-10-09.log", cycle("08:00:03", "3400935294227"));
    tick();
    expect(scans).toEqual(["3400935294227"]);
    stop();
  });

  it("une ligne coupée en deux par l'écriture de LGPI est lue entière", () => {
    writeFileSync(join(dir, "lgpi.2026-10-09.log"), "");
    const { scans, stop } = start();
    tick();
    const lines = cycle("08:00:03", "3400935294227").join("\r\n") + "\r\n";
    appendFileSync(join(dir, "lgpi.2026-10-09.log"), lines.slice(0, 200), "latin1");
    tick();
    appendFileSync(join(dir, "lgpi.2026-10-09.log"), lines.slice(200), "latin1");
    tick();
    expect(scans).toEqual(["3400935294227"]);
    stop();
  });

  it("LGPI ouvert APRÈS PharmaBoost : le journal du jour, créé plus tard, est lu depuis son début", () => {
    const { scans, statuses, stop } = start();
    tick();
    expect(statuses.join("\n")).toContain("n'existe pas (encore)");
    append("lgpi.2026-10-09.log", cycle("08:00:03", "3400935294227"));
    tick();
    expect(scans).toEqual(["3400935294227"]);
    stop();
  });

  it("à minuit : la fin de la veille est lue, puis le nouveau journal depuis son début", () => {
    clock = new Date(2026, 9, 9, 23, 59, 50).getTime();
    writeFileSync(join(dir, "lgpi.2026-10-09.log"), "");
    const { scans, stop } = start();
    tick();
    append("lgpi.2026-10-09.log", cycle("23:59:55", "3400935294227"));
    clock = new Date(2026, 9, 10, 0, 0, 5).getTime();
    append("lgpi.2026-10-10.log", cycle("00:00:03", "3400937950527", "2026-10-10"));
    vi.advanceTimersByTime(1000);
    expect(scans).toEqual(["3400935294227", "3400937950527"]);
    // La suite se lit dans le fichier du lendemain.
    append("lgpi.2026-10-10.log", cycle("00:01:00", "3400938203820", "2026-10-10"));
    tick();
    expect(scans.at(-1)).toBe("3400938203820");
    stop();
  });

  it("un journal qui rétrécit (remise à zéro) est relu depuis le début", () => {
    writeFileSync(join(dir, "lgpi.2026-10-09.log"), "x".repeat(5000));
    const { scans, stop } = start();
    tick();
    writeFileSync(join(dir, "lgpi.2026-10-09.log"), cycle("08:00:03", "3400935294227").join("\r\n") + "\r\n", "latin1");
    tick();
    expect(scans).toEqual(["3400935294227"]);
    stop();
  });

  it("un poste sans LGPI le dit une fois et ne fait aucun bruit ensuite", () => {
    const statuses: string[] = [];
    const stop = startLgpiJournal({ kind: "lgpi", dir: join(dir, "absent") }, { onScan: () => undefined, onStatus: (message) => statuses.push(message) }, () => clock);
    tick(3);
    expect(statuses).toHaveLength(1);
    stop();
  });

  it("trouve le dossier habituel quand rien n'est indiqué", () => {
    const real = join(dir, "var", "log");
    mkdirSync(real, { recursive: true });
    expect(findJournalDir([join(dir, "nulle-part"), real])).toBe(real);
    expect(findJournalDir([join(dir, "nulle-part")])).toBeNull();
  });
});

describe("le rapport de lecture du journal, avec le suivi appliqué", () => {
  const texts = () => {
    const evening = [...cycle("18:51:11", "3400938203820", "2026-10-08"), delivery("18:51:25", "3400938203820", "2026-10-08"), ...gaveUp("19:13:22", "5162291"), ...gaveUp("19:13:24", "5162291")];
    const night = [...cycle("02:06:14", "3400935294227"), delivery("02:08:14", "3400935294227"), ...cycle("02:20:00", "3400937950527")];
    return [evening.join("\r\n"), night.join("\r\n")];
  };

  it("compte les demandes terminées, celles laissées de côté, et les sorties de boîte qui suivent", () => {
    const analysis = analyse(texts());
    expect(analysis.requests.finished).toBe(3);
    expect(analysis.requests.announced).toBe(3);
    expect(analysis.requests.withDelivery).toBe(2);
    expect(analysis.requests.withoutDelivery).toBe(1);
    expect(analysis.requests.recent.at(-2)).toMatchObject({ date: "2026-10-09", code: "3400935294227" });
  });

  it("écrit la section avec le dernier produit annoncé, à comparer à la vente de test", () => {
    const analysis = analyse(texts());
    const report = renderReport({ computer: "POSTE3", now: new Date(2026, 9, 9, 2, 12), dir: "C:\\x", files: [], analysis, errors: [] }).join("\n");
    expect(report).toContain("5. Ce que PharmaBoost annoncerait");
    expect(report).toContain("2026-10-09 02:06:14 → 3400935294227");
    expect(report).toContain("Produits annoncés : 3");
  });

  it("apparie chaque sortie de boîte une seule fois", () => {
    expect(matchDeliveries([1000, 2000], [1500])).toEqual({ withDelivery: 1, withoutDelivery: 1 });
    expect(matchDeliveries([1000], [1000 + 11 * 60_000])).toEqual({ withDelivery: 0, withoutDelivery: 1 });
  });
});
