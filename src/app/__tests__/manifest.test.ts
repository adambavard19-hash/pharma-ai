import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../manifest";

/** Le manifeste rend /m installable, et SEULEMENT /m : le comptoir reste un site. */
describe("manifeste de PharmaBoost Mobile", () => {
  const value = manifest();

  it("démarre et reste dans /m, en plein écran", () => {
    expect(value).toMatchObject({ name: "PharmaBoost Mobile", short_name: "PharmaBoost", start_url: "/m", scope: "/m", display: "standalone" });
  });

  it("déclare des icônes 192, 512 et une « maskable », et chacune existe dans public/", () => {
    const icons = value.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public/mobile/apple-touch-icon.png"))).toBe(true);
  });
});
