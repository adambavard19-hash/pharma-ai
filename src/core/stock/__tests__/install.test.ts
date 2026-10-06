import { describe, expect, it } from "vitest";
import {
  buildPostInstallCommand,
  buildPostInstallScript,
  buildRefusalScript,
  buildServerInstallCommand,
  buildServerInstallScript,
  cleanPostLabel,
  psq,
  safeServerHostname,
  stockSharePath,
} from "../install";

describe("la ligne du serveur", () => {
  it("une seule ligne PowerShell : l'adresse, le code, et rien d'autre à taper", () => {
    const command = buildServerInstallCommand("https://pharmaboost.app", "123456");
    expect(command).toBe('powershell -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm https://pharmaboost.app/api/agent/installer-serveur/123456 | iex"');
    expect(command).not.toContain("\n");
  });

  it("ne contient aucun « $ » : collée dans PowerShell, une variable serait remplacée avant de partir", () => {
    expect(buildServerInstallCommand("https://pharmaboost.app", "123456")).not.toContain("$");
    expect(buildPostInstallCommand("https://pharmaboost.app", "AbCdEfGhIjKlMnOp")).not.toContain("$");
  });

  it("une adresse terminée par un « / » ne donne pas de « // »", () => {
    expect(buildServerInstallCommand("https://pharmaboost.app/", "123456")).toContain("https://pharmaboost.app/api/agent/installer-serveur/123456");
    expect(buildPostInstallCommand("http://192.168.1.20:3000//", "tok")).toContain("http://192.168.1.20:3000/api/agent/installer/tok");
  });

  it("la ligne d'un poste vise l'installateur de poste", () => {
    expect(buildPostInstallCommand("https://pharmaboost.app", "AbCdEfGhIjKlMnOp")).toContain("irm https://pharmaboost.app/api/agent/installer/AbCdEfGhIjKlMnOp | iex");
  });
});

describe("le nom de machine du serveur", () => {
  it("accepte un nom Windows ordinaire", () => {
    expect(safeServerHostname("SERVEUR")).toBe("SERVEUR");
    expect(safeServerHostname(" SRV-PHARMA_01 ")).toBe("SRV-PHARMA_01");
    expect(safeServerHostname("serveur.officine.local")).toBe("serveur.officine.local");
  });

  it("refuse tout ce qui pourrait finir en commande ou en chemin piégé", () => {
    for (const bad of ["", "   ", null, undefined, "SRV;calc", "SRV PHARMA", "SRV'", 'SRV"', "SRV$(calc)", "\\\\SRV", "SRV/x", "-SRV", ".SRV", "A".repeat(64), "SRV\nx"]) {
      expect(safeServerHostname(bad as string | null | undefined)).toBeNull();
    }
  });

  it("le dossier partagé s'écrit \\\\SERVEUR\\PharmaBoost", () => {
    expect(stockSharePath("SRV-PHARMA")).toBe("\\\\SRV-PHARMA\\PharmaBoost");
  });
});

describe("un littéral PowerShell entre apostrophes", () => {
  it("n'interprète rien : $, backticks et parenthèses restent du texte", () => {
    expect(psq("Pharmacie $(calc) `x`")).toBe("'Pharmacie $(calc) `x`'");
  });

  it("double les apostrophes, droites ou typographiques : on ne sort jamais du littéral", () => {
    expect(psq("l'officine")).toBe("'l''officine'");
    expect(psq("x'; calc; '")).toBe("'x''; calc; '''");
    expect(psq("d\u2019un \u2018 \u201a \u201b")).toBe("'d''un '' '' '''");
  });

  it("aplatit les retours à la ligne : un nom ne peut pas ouvrir une nouvelle commande", () => {
    expect(psq("ligne 1\ncalc\r\nligne 3")).toBe("'ligne 1 calc  ligne 3'");
    expect(psq("a\u2028b")).toBe("'a b'");
  });
});

describe("le nom d'un poste", () => {
  it("garde « Comptoir 1 » tel quel, sans espaces en trop", () => {
    expect(cleanPostLabel("  Comptoir   1 ")).toBe("Comptoir 1");
  });

  it("aplatit les retours à la ligne et les caractères de contrôle", () => {
    expect(cleanPostLabel("Caisse\n2\u0007")).toBe("Caisse 2");
  });

  it("coupe à 60 caractères ; vide ou absent : pas de nom", () => {
    expect(cleanPostLabel("x".repeat(100))).toHaveLength(60);
    expect(cleanPostLabel("   ")).toBeNull();
    expect(cleanPostLabel(null)).toBeNull();
    expect(cleanPostLabel(undefined)).toBeNull();
  });
});

describe("le script du serveur", () => {
  const script = buildServerInstallScript({ baseUrl: "https://pharmaboost.app/", code: "123456", lgo: "lgpi" });

  it("reçoit le code, le logiciel et l'adresse en littéraux, sans « / » final", () => {
    expect(script).toContain("$code = '123456'");
    expect(script).toContain("$lgo = 'lgpi'");
    expect(script).toContain("$serveur = 'https://pharmaboost.app'");
  });

  it("vérifie les droits d'administrateur et le dit en rouge", () => {
    expect(script).toContain("IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)");
    expect(script).toMatch(/Ouvrez PowerShell en tant qu'administrateur[^\n]*-ForegroundColor Red/);
  });

  it("télécharge le programme et l'installateur, puis lance l'installateur avec le code", () => {
    expect(script).toContain("'pharmaboost-connect.js', 'install-windows.ps1'");
    expect(script).toContain("/api/agent/fichiers/$nom");
    expect(script).toContain("-File (Join-Path $dossier 'install-windows.ps1') -Code $code -Lgo $lgo -Serveur $serveur");
  });

  it("dit l'échec en rouge et range le dossier temporaire, quoi qu'il arrive", () => {
    expect(script).toMatch(/catch \{\s+Write-Host \("L'installation a échoué/);
    expect(script).toMatch(/finally \{\s+Remove-Item -Recurse -Force \$dossier/);
  });

  it("ne dit rien de l'officine : pas de nom, pas de chemin de poste", () => {
    expect(script).not.toMatch(/Pharmacie|SELARL/);
    expect(script).not.toContain("-DossierStock");
  });

  it("un logiciel piégé reste un littéral : il ne ferme pas l'apostrophe", () => {
    const hostile = buildServerInstallScript({ baseUrl: "https://pharmaboost.app", code: "123456", lgo: "x'; Remove-Item C:\\ -Recurse; '" });
    expect(hostile).toContain("$lgo = 'x''; Remove-Item C:\\ -Recurse; '''");
  });
});

describe("le script d'un poste", () => {
  const base = { baseUrl: "https://pharmaboost.app", token: "AbCdEfGhIjKlMnOp", label: "Comptoir 1", pharmacyName: "Pharmacie du Port" };

  it("passe le dossier partagé quand le serveur est relié", () => {
    const script = buildPostInstallScript({ ...base, serverHostname: "SRV-PHARMA" });
    expect(script).toContain("-Code 'AbCdEfGhIjKlMnOp' -Serveur $serveur -DossierStock '\\\\SRV-PHARMA\\PharmaBoost'");
    expect(script).toContain("Write-Host 'PharmaBoost Connect : poste « Comptoir 1 », Pharmacie du Port'");
  });

  it("sans serveur relié, aucun raccourci demandé", () => {
    const script = buildPostInstallScript({ ...base, serverHostname: null });
    expect(script).not.toContain("-DossierStock");
    expect(script).toContain("-Code 'AbCdEfGhIjKlMnOp' -Serveur $serveur\n");
  });

  it("un nom de machine douteux n'est jamais recopié", () => {
    expect(buildPostInstallScript({ ...base, serverHostname: "SRV;calc" })).not.toContain("-DossierStock");
  });

  it("un nom d'officine ou de poste piégé ne devient pas une commande", () => {
    const script = buildPostInstallScript({ ...base, label: "x'\nRemove-Item C:\\ -Recurse #", pharmacyName: "Pharma $(calc)", serverHostname: null });
    const line = script.split("\n").find((l) => l.startsWith("Write-Host 'PharmaBoost Connect"));
    expect(line).toBe("Write-Host 'PharmaBoost Connect : poste « x'' Remove-Item C:\\ -Recurse # », Pharma $(calc)'");
    // Rien du nom ne déborde sur une ligne à part.
    expect(script.split("\n").some((l) => l.startsWith("Remove-Item"))).toBe(false);
  });

  it("sans nom de poste : « poste de comptoir »", () => {
    expect(buildPostInstallScript({ ...base, label: null, serverHostname: null })).toContain("'PharmaBoost Connect : poste de comptoir, Pharmacie du Port'");
  });
});

describe("le message de refus", () => {
  it("s'affiche en rouge, apostrophes comprises", () => {
    expect(buildRefusalScript("Ce code n'est plus valable.")).toBe("Write-Host 'Ce code n''est plus valable.' -ForegroundColor Red\n");
  });
});
