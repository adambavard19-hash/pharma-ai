import { describe, expect, it } from "vitest";
import { GAMMES, gammesFor, inGamme } from "../gammes";

const gamme = (key: string) => {
  const found = GAMMES.find((item) => item.key === key);
  if (!found) throw new Error(key);
  return found;
};

describe("toute une gamme d'un coup (fondateur, 5 nov. 2026)", () => {
  it("« réhydratation », « électrolytes » ou une marque retrouvent la gamme de réhydratation", () => {
    for (const query of ["réhydratation", "electrolytes", "Hydratis", "pastilles de réhydratation", "hydrafizz"]) expect(gammesFor(query).map((g) => g.key), query).toContain("rehydratation");
  });

  it("les intitulés réels des rayons sont reconnus, sans attraper une crème hydratante", () => {
    const rehydration = gamme("rehydratation");
    for (const name of ["HYDRATIS MIEL CITRON", "HYDRATIS CITRON SUREAU PAST EFF 20", "ADIARIL SOLUTION DE REHYDRATATION 10 SACH", "Solution de réhydratation orale", "HYDRAFIZZ ELECTROLYTES PAST", "HYDRAPLUS 20 COMPRIMES"]) expect(inGamme(rehydration, name), name).toBe(true);
    for (const name of ["CERAVE LAIT HYDRATANT 236ML", "CICABIAFINE LAIT HYDRAT CORP200", "AVENE CREME HYDRATANTE", "AMILAB Bme lab réhydrat calm"]) expect(inGamme(rehydration, name), name).toBe(false);
  });

  it("chute de cheveux : les compléments à avaler, les shampoings et les lotions sont trois gammes distinctes", () => {
    const pills = gamme("chute-cheveux-complements");
    const shampoos = gamme("chute-cheveux-shampoings");
    const lotions = gamme("chute-cheveux-lotions");
    expect(inGamme(pills, "FORCAPIL CHEVEUX ONGLES 60 GELULES")).toBe(true);
    expect(inGamme(pills, "Gummies cheveux anti-chute x60")).toBe(true);
    expect(inGamme(pills, "FORCAPIL SHAMPOOING FORTIFIANT")).toBe(false);
    expect(inGamme(shampoos, "KLORANE SHAMPOOING A LA QUININE ANTI-CHUTE 200ML")).toBe(true);
    expect(inGamme(shampoos, "DUCRAY ANACAPS GELULES")).toBe(false);
    expect(inGamme(lotions, "LUXEOL A/CHUTE SPR 100ML")).toBe(true);
    expect(inGamme(lotions, "DUCRAY NEOPTIDE LOTION ANTICHUTE")).toBe(true);
    expect(gammesFor("chute de cheveux").map((g) => g.key)).toEqual(["chute-cheveux-complements", "chute-cheveux-shampoings", "chute-cheveux-lotions"]);
  });

  it("moins de trois lettres : rien", () => {
    expect(gammesFor("hy")).toEqual([]);
  });
});
