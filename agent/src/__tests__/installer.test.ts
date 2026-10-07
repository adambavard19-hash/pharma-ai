import { describe, expect, it } from "vitest";
import { INSTALLER_EXIT, normalizeInstallCode, resolveInstallCode, tokenFromInstallerName } from "../installer";

const TOKEN = "Ab3_dE-fGh1JkLmNoPqRsTuV";

describe("le jeton porté par le nom de l'installateur", () => {
  it("lit PharmaBoost-Installation-<jeton>.exe", () => {
    expect(tokenFromInstallerName(`PharmaBoost-Installation-${TOKEN}.exe`)).toBe(TOKEN);
  });

  it("garde les tirets et soulignés du jeton, y compris en tête", () => {
    expect(tokenFromInstallerName("PharmaBoost-Installation--_abcdefghijklmnop.exe")).toBe("-_abcdefghijklmnop");
  });

  it("tolère ce que les navigateurs et Windows ajoutent quand le fichier existe déjà", () => {
    expect(tokenFromInstallerName(`PharmaBoost-Installation-${TOKEN} (1).exe`)).toBe(TOKEN);
    expect(tokenFromInstallerName(`PharmaBoost-Installation-${TOKEN} - Copie.exe`)).toBe(TOKEN);
    expect(tokenFromInstallerName(`PharmaBoost-Installation-${TOKEN}(2).exe`)).toBe(TOKEN);
  });

  it("accepte un chemin complet, Windows ou non, et la casse du préfixe", () => {
    expect(tokenFromInstallerName(`C:\\Users\\Marie\\Downloads\\PharmaBoost-Installation-${TOKEN}.exe`)).toBe(TOKEN);
    expect(tokenFromInstallerName(`/tmp/pharmaboost-installation-${TOKEN}.exe`)).toBe(TOKEN);
  });

  it("rend null quand le nom ne porte pas de jeton : renommé, ou téléchargé sans lien", () => {
    expect(tokenFromInstallerName("PharmaBoost-Installation.exe")).toBeNull();
    expect(tokenFromInstallerName("PharmaBoost-Installation-.exe")).toBeNull();
    expect(tokenFromInstallerName("setup.exe")).toBeNull();
    expect(tokenFromInstallerName("")).toBeNull();
  });

  it("refuse ce qui ne ressemble pas à un jeton : mot trop court, caractères étrangers", () => {
    expect(tokenFromInstallerName("PharmaBoost-Installation-Copie.exe")).toBeNull();
    expect(tokenFromInstallerName("PharmaBoost-Installation-nouveau-dossier.exe")).toBeNull();
    expect(tokenFromInstallerName("PharmaBoost-Installation-abc$def.exe")).toBeNull();
  });

  it("accepte le code à six chiffres d'un poste", () => {
    expect(tokenFromInstallerName("PharmaBoost-Installation-482913.exe")).toBe("482913");
  });

  it("ne lit pas un jeton au milieu d'un autre nom", () => {
    expect(tokenFromInstallerName(`Mon-PharmaBoost-Installation-${TOKEN}.exe`)).toBeNull();
  });
});

describe("le code saisi à la main", () => {
  it("accepte le code à six chiffres, avec ou sans séparateur", () => {
    expect(normalizeInstallCode("482913")).toBe("482913");
    expect(normalizeInstallCode(" 482 913 ")).toBe("482913");
    expect(normalizeInstallCode("482-913")).toBe("482913");
  });

  it("accepte le jeton seul", () => {
    expect(normalizeInstallCode(` ${TOKEN} `)).toBe(TOKEN);
  });

  it("accepte le lien collé, avec ou sans barre finale ou paramètres", () => {
    expect(normalizeInstallCode(`https://pharmaboost.app/installer/${TOKEN}`)).toBe(TOKEN);
    expect(normalizeInstallCode(`https://pharmaboost.app/installer/${TOKEN}/`)).toBe(TOKEN);
    expect(normalizeInstallCode(`https://pharmaboost.app/installer/${TOKEN}?from=mail`)).toBe(TOKEN);
    expect(normalizeInstallCode(`https://pharmaboost.app/api/agent/installateur/${TOKEN}`)).toBe(TOKEN);
  });

  it("refuse le vide, un mot, un code trop court", () => {
    expect(normalizeInstallCode("")).toBeNull();
    expect(normalizeInstallCode("   ")).toBeNull();
    expect(normalizeInstallCode("bonjour")).toBeNull();
    expect(normalizeInstallCode("12345")).toBeNull();
    expect(normalizeInstallCode("https://pharmaboost.app/installer/court")).toBeNull();
  });
});

describe("le code retenu", () => {
  it("préfère ce que la personne a saisi au nom du fichier", () => {
    expect(resolveInstallCode({ fileName: `PharmaBoost-Installation-${TOKEN}.exe`, typed: "482913" })).toBe("482913");
  });

  it("prend le nom du fichier quand rien n'est saisi", () => {
    expect(resolveInstallCode({ fileName: `PharmaBoost-Installation-${TOKEN}.exe`, typed: "" })).toBe(TOKEN);
    expect(resolveInstallCode({ fileName: `PharmaBoost-Installation-${TOKEN}.exe` })).toBe(TOKEN);
  });

  it("ne se rabat pas sur le nom du fichier quand la saisie est illisible : la personne a voulu autre chose", () => {
    expect(resolveInstallCode({ fileName: `PharmaBoost-Installation-${TOKEN}.exe`, typed: "oups" })).toBeNull();
  });

  it("rend null quand il n'y a rien", () => {
    expect(resolveInstallCode({})).toBeNull();
  });
});

describe("les codes de sortie", () => {
  it("sont distincts, et 0 seulement pour le succès", () => {
    const values = Object.values(INSTALLER_EXIT);
    expect(new Set(values).size).toBe(values.length);
    expect(INSTALLER_EXIT.ok).toBe(0);
    expect(values.filter((value) => value === 0)).toHaveLength(1);
  });
});
