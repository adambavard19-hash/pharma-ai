import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractRcpSection48, rcpBlocks } from "../html";
import { OFFICIAL_SIDE_EFFECTS, foldRcpText, isOrganClassHeading, readRcpSideEffects, readSideEffectBlocks } from "../side-effects";
import { ADVICE_RULES } from "@/core/ai/engines/advice";

/**
 * Les extraits sont de vrais RCP de la BDPM (rubrique 4.8 recopiée telle quelle, téléchargée le 13 octobre 2026 ;
 * la source exacte est en tête de chaque fichier). Les attendus ont été relus à la main dans ces extraits.
 */
const FIXTURES = path.join(__dirname, "fixtures");
const fixture = (cis: string) => readFileSync(path.join(FIXTURES, readdirSync(FIXTURES).find((name) => name.startsWith(cis))!), "utf8");
const read = (cis: string) => readRcpSideEffects(fixture(cis));
const byLabel = (cis: string) => Object.fromEntries(read(cis).effects.map((effect) => [effect.label, effect.frequency]));

describe("rubrique 4.8 — découpage", () => {
  it("va du titre 4.8 au titre 4.9, sans le contenu de la rubrique suivante", () => {
    const section = extractRcpSection48(fixture("61665908"))!;
    expect(section).toContain("4.8. Effets indésirables");
    expect(section).not.toContain("4.9");
    expect(section.endsWith("<")).toBe(false);
  });

  it("déplie les cellules fusionnées (rowspan, colspan)", () => {
    const blocks = rcpBlocks(`<table><tr><td rowspan="2">Fréquent</td><td>Nausées</td></tr><tr><td>Diarrhée</td></tr><tr><td colspan="2">Affections oculaires</td></tr></table>`);
    expect(blocks).toEqual([{ kind: "table", rows: [["Fréquent", "Nausées"], ["Fréquent", "Diarrhée"], ["Affections oculaires", "Affections oculaires"]] }]);
  });

  it("ne prend pas « < 1/10 » pour une balise et décode les entités de Word", () => {
    const blocks = rcpBlocks(`<p class=AmmCorpsTexte>Fréquent (≥ 1/100 à < 1/10) : gastro&#8209;intestinal&nbsp;; sécheresse&nbsp;buccale</p>`);
    expect(blocks).toEqual([{ kind: "line", text: "Fréquent (≥ 1/100 à < 1/10) : gastro-intestinal ; sécheresse buccale" }]);
  });
});

describe("effets fréquents lus dans de vrais RCP", () => {
  it("Deroxat (paroxétine) : lignes « Très fréquents : » / « Fréquents : », symptômes de sevrage écartés", () => {
    expect(byLabel("60160707")).toEqual({
      "sécheresse buccale": "COMMON",
      nausées: "VERY_COMMON",
      vomissements: "COMMON",
      diarrhée: "COMMON",
      constipation: "COMMON",
      somnolence: "COMMON",
      "fatigue (asthénie)": "COMMON",
    });
  });

  it("Laroxyl (amitriptyline) : colonne de fréquence par rangée — sécheresse buccale très fréquente, sécheresse oculaire (indéterminée) écartée", () => {
    const effects = byLabel("65892928");
    expect(effects["sécheresse buccale"]).toBe("VERY_COMMON");
    expect(effects.constipation).toBe("VERY_COMMON");
    expect(effects["congestion nasale"]).toBe("VERY_COMMON"); // « Nez bouché »
    expect(effects["sécheresse oculaire"]).toBeUndefined();
    expect(effects.diarrhée).toBeUndefined(); // peu fréquent
    expect(effects.photosensibilité).toBeUndefined(); // rare
  });

  it("isotrétinoïne : chéilite, peau sèche, œil sec et irrité très fréquents ; sécheresse de la gorge (très rare) écartée", () => {
    expect(byLabel("60265569")).toEqual({
      "sécheresse cutanée": "VERY_COMMON",
      "sécheresse des lèvres (chéilite)": "VERY_COMMON",
      "sécheresse oculaire": "VERY_COMMON",
      "yeux irrités (conjonctivite)": "VERY_COMMON",
      "sécheresse nasale": "COMMON",
    });
  });

  it("ramipril : fréquences en tête de colonnes — toux, troubles digestifs, dyspepsie (gastralgie), fatigue", () => {
    expect(byLabel("61599041")).toEqual({
      nausées: "COMMON",
      vomissements: "COMMON",
      diarrhée: "COMMON",
      "troubles digestifs": "COMMON",
      gastralgie: "COMMON",
      "fatigue (asthénie)": "COMMON",
      toux: "COMMON",
    });
  });

  it("Ciflox : un seuil sous le mot de l'en-tête (« Fréquent / ≥ 1/100 à < 1/10 ») ne casse pas la lecture", () => {
    expect(byLabel("65636245")).toEqual({ nausées: "COMMON", diarrhée: "COMMON" });
  });

  it("amoxicilline : intertitre « *Fréquent » ; la synthèse « les plus fréquents sont… » et la candidose très rare ne comptent pas", () => {
    expect(byLabel("69118175")).toEqual({ nausées: "COMMON", diarrhée: "COMMON" });
  });

  it("Pulmicort : cellules de fréquence à plusieurs lignes, candidose oropharyngée = mycose", () => {
    expect(byLabel("65036357")).toEqual({ toux: "COMMON", "maux de gorge": "COMMON", "mycose (candidose)": "COMMON" });
  });

  it("cétirizine : tableau d'incidences — retenu au-dessus du placebo seulement (nausées 1,07 % < placebo 1,14 % écartées)", () => {
    const reading = read("61665908");
    expect(Object.fromEntries(reading.effects.map((effect) => [effect.label, effect.frequency]))).toEqual({
      "sécheresse buccale": "COMMON",
      diarrhée: "COMMON", // population pédiatrique, 1,0 % contre 0,6 %
      somnolence: "COMMON",
      "fatigue (asthénie)": "COMMON",
    });
    expect(reading.effects.find((effect) => effect.key === "DRY_MOUTH")!.evidence).toBe("Sécheresse buccale — 2,09 % (placebo : 0,82 %)");
  });

  it("Atarax et Xyzall : incidences en nombres nus (« % de patients ») ou « 24 (2,6 %) », placebo en première colonne", () => {
    expect(byLabel("61519586")).toEqual({ "sécheresse buccale": "COMMON", somnolence: "VERY_COMMON", "fatigue (asthénie)": "COMMON" });
    const xyzall = byLabel("66296411");
    expect(xyzall.somnolence).toBe("COMMON");
    expect(xyzall["sécheresse buccale"]).toBe("COMMON");
    expect(xyzall.vomissements).toBeUndefined(); // 0,6 % contre 1,2 % sous placebo
  });

  it("métopimazine : sécheresse de la bouche et sédation sont « rares » — rien n'est retenu", () => {
    expect(read("64362325")).toEqual({ status: "READ", effects: [] });
  });

  it("doxycycline : la rubrique ne donne aucune fréquence — rien, même la photosensibilisation citée", () => {
    expect(read("65203952")).toEqual({ status: "NO_FREQUENCY", effects: [] });
  });
});

describe("rubrique absente ou mal formée : rien", () => {
  it("pas de titre 4.8 (médicament autorisé par l'EMA, RCP hors BDPM)", () => {
    expect(readRcpSideEffects("<p>Ce médicament a été autorisé par la Commission Européenne : vous allez être redirigé·e vers le site de l'EMA.</p>")).toEqual({ status: "NO_SECTION", effects: [] });
  });

  it("titre 4.8 sans titre suivant (page tronquée)", () => {
    const html = fixture("60160707");
    // L'extrait finit par le titre de la rubrique 4.9 : on le retire.
    const truncated = html.slice(0, html.lastIndexOf("<p "));
    expect(extractRcpSection48(html)).not.toBeNull();
    expect(truncated).toContain("Très fréquents : nausées");
    expect(readRcpSideEffects(truncated)).toEqual({ status: "NO_SECTION", effects: [] });
  });

  it("une prose sans fréquence, un intitulé de classe d'organes ou une ligne de convention ne donnent rien", () => {
    const reading = readSideEffectBlocks([
      { kind: "line", text: "Les fréquences sont définies comme suit : très fréquent (≥ 1/10) ; fréquent (≥ 1/100) ; peu fréquent ; rare." },
      { kind: "line", text: "Des cas isolés de sécheresse buccale ont été rapportés." },
      { kind: "table", rows: [["Fréquent", "Troubles gastro-intestinaux"]] },
    ]);
    expect(reading.effects).toEqual([]);
  });

  it("un effet hors liste fermée n'est jamais ajouté, un synonyme documenté l'est", () => {
    const reading = readSideEffectBlocks([{ kind: "line", text: "Fréquent : céphalées, xérostomie, xérose cutanée, insomnie." }]);
    expect(reading.effects.map((effect) => effect.label)).toEqual(["sécheresse buccale", "sécheresse cutanée"]);
  });
});

describe("liste fermée", () => {
  it("chaque règle « classe ou effet » qui a des déclencheurs d'effet indésirable est atteignable par un libellé de la liste", () => {
    const labels = OFFICIAL_SIDE_EFFECTS.map((effect) => foldRcpText(effect.label));
    const rules = ADVICE_RULES.filter((rule) => rule.triggerMode !== "CLASS_ONLY" && rule.sideEffectTriggers.length > 0);
    expect(rules.map((rule) => rule.key).sort()).toEqual(["dry-mouth-hygiene", "magnesium-fatigue", "sun-photosensitivity"]);
    const orphan = rules.filter((rule) => !rule.sideEffectTriggers.some((trigger) => labels.some((label) => label.includes(foldRcpText(trigger)))));
    expect(orphan.map((rule) => rule.key)).toEqual([]);
  });

  it("« irritation » n'apparaît que dans l'irritation de la peau : un œil irrité n'ouvre pas la règle d'hydratation cutanée", () => {
    const withIrritation = OFFICIAL_SIDE_EFFECTS.filter((effect) => foldRcpText(effect.label).includes("irritation")).map((effect) => effect.key);
    expect(withIrritation).toEqual(["SKIN_IRRITATION"]);
  });

  it("reconnaît les intitulés de classes d'organes MedDRA", () => {
    expect(isOrganClassHeading("Affections gastro-intestinales")).toBe(true);
    expect(isOrganClassHeading("Troubles gastro-intestinaux")).toBe(true);
    expect(isOrganClassHeading("Troubles digestifs (nausée, épigastralgie)")).toBe(false);
  });
});
