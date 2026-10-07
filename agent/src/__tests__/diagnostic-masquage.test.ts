import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le rapport du diagnostic du robot ne doit contenir AUCUNE valeur d'un journal : ce test fait
 * tourner les vraies fonctions de masquage de `diagnostic-robot.ps1` sur des lignes inventées
 * qui portent un nom de patient, un numéro de sécurité sociale et un code produit.
 *
 * Il demande PowerShell (pwsh, ou PB_PWSH=/chemin/pwsh) : sans lui, il est ignoré, et le contrôle
 * reste celui des tests statiques de src/core/stock/__tests__/diagnostic.test.ts.
 */

function findPwsh(): string | null {
  const candidates = [process.env.PB_PWSH, "pwsh"].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-NoProfile", "-Command", "1"], { stdio: "ignore" });
      return candidate;
    } catch {
      // essai suivant
    }
  }
  return null;
}

const pwsh = findPwsh();

describe.skipIf(!pwsh)("le masquage du rapport de diagnostic", () => {
  const lines = [
    '<PickRequest Id="123"><Article Id="3400930000001" Quantity="2"/></PickRequest>',
    "DUPONT Jean <b>né le 01/02/1950</b> suite",
    "<Patient>MARTIN Claire</Patient>",
    "<![CDATA[LEROY Paul 185057800608436]]>",
    "   DURAND Marie",
    "<Nom>BERNARD",
    "Sophie</Nom>",
    "2026-10-07 10:01 PICK article 3400930000002 qty 1 patient PETIT Luc status OK",
  ];

  const run = (file: string): string => {
    const script = [
      "$PB_ESSAI = $true",
      `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`,
      `Get-MaskedTail '${file.replace(/'/g, "''")}' 8192 50`,
    ].join("\n");
    const result = spawnSync(pwsh!, ["-NoProfile", "-Command", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout;
  };

  it("ne laisse sortir aucun nom, numéro ni code produit", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-masque-"));
    try {
      const file = join(dir, "journal.log");
      writeFileSync(file, `${lines.join("\r\n")}\r\n`, "latin1");
      const report = run(file);
      for (const secret of ["DUPONT", "Jean", "MARTIN", "Claire", "LEROY", "Paul", "185057", "DURAND", "Marie", "BERNARD", "Sophie", "PETIT", "Luc", "3400930000001", "3400930000002", "1950"]) {
        expect(report).not.toContain(secret);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("garde la forme : balises, attributs, vocabulaire générique", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-masque-"));
    try {
      const file = join(dir, "journal.log");
      writeFileSync(file, `${lines.join("\r\n")}\r\n`, "latin1");
      const report = run(file);
      expect(report).toContain('<PickRequest Id="…"><Article Id="…" Quantity="…"/></PickRequest>');
      expect(report).toContain("<Patient>…</Patient>");
      expect(report).toContain("PICK article 9999999999999 qty 9");
      expect(report).toContain("status OK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
