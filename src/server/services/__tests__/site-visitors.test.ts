import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({ getEnv: () => ({ AUTH_SESSION_SECRET: "x".repeat(40) }) }));
vi.mock("@/server/db/client", () => ({ prisma: {} }));
vi.mock("@/server/services/counter-dashboard", () => ({ startOfParisDay: (d: Date) => d }));

const { ipFingerprint, isBot, visitorIp, visitorPlace } = await import("../site-visitors");

describe("visiteurs du site", () => {
  it("la même adresse donne la même empreinte, jamais l'adresse en clair", () => {
    expect(ipFingerprint("1.2.3.4")).toBe(ipFingerprint(" 1.2.3.4 "));
    expect(ipFingerprint("1.2.3.4")).not.toBe(ipFingerprint("1.2.3.5"));
    expect(ipFingerprint("1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("lit l'adresse du visiteur (la première de x-forwarded-for)", () => {
    expect(visitorIp(new Headers({ "x-forwarded-for": "81.2.3.4, 10.0.0.1" }))).toBe("81.2.3.4");
    expect(visitorIp(new Headers({ "x-real-ip": "81.2.3.4" }))).toBe("81.2.3.4");
    expect(visitorIp(new Headers())).toBeNull();
  });

  it("ne compte pas les robots", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("WhatsApp/2.23")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1")).toBe(false);
  });

  it("lit la ville donnée par l'hébergeur, accents compris, et rien quand il ne sait pas", () => {
    expect(visitorPlace(new Headers({ "x-vercel-ip-city": "Saint-%C3%89tienne", "x-vercel-ip-country": "fr", "x-vercel-ip-country-region": "ARA" }))).toEqual({ city: "Saint-Étienne", region: "ARA", country: "FR" });
    expect(visitorPlace(new Headers())).toEqual({ city: null, region: null, country: null });
    expect(visitorPlace(new Headers({ "x-vercel-ip-city": "%E0%A4%A" })).city).toBe("%E0%A4%A");
  });
});
