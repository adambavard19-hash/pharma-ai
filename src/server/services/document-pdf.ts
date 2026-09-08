import "server-only";

/**
 * Production du PDF d'un plan patient.
 *
 * Chromium (Playwright) imprime la page publique en mode papier : la mise en
 * page est exactement celle de l'aperçu avant impression, avec les mêmes
 * règles `@media print`. Le navigateur est lancé à la demande et refermé ; le
 * premier appel coûte une à deux secondes, les suivants moins.
 *
 * Aucun secret ne transite : l'adresse ouverte contient le jeton du plan, qui
 * est précisément ce que le patient reçoit.
 */
export async function renderDocumentPdf(
  url: string,
): Promise<{ ok: true; pdf: Buffer } | { ok: false; error: string }> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    return { ok: false, error: "Le générateur de PDF (Playwright/Chromium) n'est pas installé sur ce serveur." };
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20_000 });
    if (!response || !response.ok()) {
      return { ok: false, error: `La page du plan n'a pas pu être rendue (HTTP ${response?.status() ?? "?"}).` };
    }
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "12mm", bottom: "11mm", left: "12mm" },
    });
    return { ok: true, pdf: Buffer.from(pdf) };
  } catch (error) {
    return { ok: false, error: `PDF non produit : ${error instanceof Error ? error.message : "erreur inconnue"}` };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
