import { describe, expect, it } from "vitest";
import { nameWords, pickFamilyByName } from "../family-by-name";

const spec = (searchName: string, atcCode: string, substances: string[] = []) => ({ searchName, atcCode, substances });

describe("famille officielle d'après le nom", () => {
  it("ignore dosages et formes abrégées", () => {
    expect(nameWords("DESOGESTREL BIOG 75µG CPR")).toEqual(["DESOGESTREL", "BIOG"]);
  });

  it("un seul code parmi les spécialités : c'est lui", () => {
    expect(pickFamilyByName("OMEPRAZOLE 20MG GELULE", [spec("OMEPRAZOLE BIOGARAN 20 MG", "A02BC01"), spec("OMEPRAZOLE SANDOZ 10 MG", "A02BC01")])).toBe("A02BC01");
  });

  it("les spécialités qui reprennent le plus de mots l'emportent", () => {
    const candidates = [spec("LEVONORGESTREL BIOGARAN 1,5 MG", "G03AD01"), spec("LEVONORGESTREL/ETHINYLESTRADIOL BIOGARAN", "G03AA07")];
    expect(pickFamilyByName("LEVONORGESTREL/ETHINYLESTRADIOL BIOG", candidates)).toBe("G03AA07");
  });

  it("un désaccord garde le début commun s'il dit la famille", () => {
    expect(pickFamilyByName("LEVONORGESTREL", [spec("LEVONORGESTREL A", "G03AD01"), spec("LEVONORGESTREL B", "G03AA07")])).toBe("G03A");
  });

  it("un désaccord trop large ne donne rien", () => {
    expect(pickFamilyByName("ESTRADIOL", [spec("ESTRADIOL A", "G03CA03"), spec("ESTRADIOL B", "G03FA01")])).toBeNull();
  });

  it("un nom prolongé retrouve sa spécialité (GAVISCONPRO ↔ GAVISCON)", () => {
    expect(pickFamilyByName("GAVISCONPRO menthe", [spec("GAVISCON MENTHE", "A02BX13")])).toBe("A02BX13");
  });

  it("aucun mot commun : rien", () => {
    expect(pickFamilyByName("BRUMISATEUR EAU THERMALE", [spec("OMEPRAZOLE", "A02BC01")])).toBeNull();
  });
});
