import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loaderArch, WEBVIEW2_SDK } from "./notice-host-ile";

/**
 * Le kit WebView2 de l'île (bibliothèques .NET de Microsoft + chargeur natif) : téléchargé une fois depuis PharmaBoost,
 * gardé à côté de la configuration, et vérifié fichier par fichier sur son empreinte SHA-256 — à chaque démarrage, pas
 * seulement au téléchargement. Un fichier absent ou modifié est retéléchargé ; une empreinte fausse après téléchargement
 * est un refus : l'île ne démarre pas, la bannière GDI+ prend le relais.
 */

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Les fichiers dont ce poste a besoin : les deux bibliothèques et le chargeur de SON architecture. */
export function sdkFilesFor(arch: string): string[] {
  const loader = `${loaderArch(arch)}/WebView2Loader.dll`;
  return ["Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", loader];
}

function intact(path: string, expected: string): boolean {
  try {
    return existsSync(path) && sha256(readFileSync(path)) === expected;
  } catch {
    return false;
  }
}

export type SdkPaths = { sdkDir: string; loaderDir: string };

export async function ensureWebView2Sdk(input: { serverUrl: string; configDir: string; arch?: string; fetchImpl?: typeof fetch }): Promise<SdkPaths> {
  const arch = input.arch ?? process.arch;
  const sdkDir = join(input.configDir, "webview2", WEBVIEW2_SDK.version);
  const base = `${input.serverUrl.replace(/\/$/, "")}/poste/webview2/${WEBVIEW2_SDK.version}`;
  const fetchImpl = input.fetchImpl ?? fetch;
  for (const name of sdkFilesFor(arch)) {
    const expected = WEBVIEW2_SDK.files[name];
    const path = join(sdkDir, ...name.split("/"));
    if (intact(path, expected)) continue;
    const response = await fetchImpl(`${base}/${name}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`kit WebView2 : ${name} introuvable (HTTP ${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== expected) throw new Error(`kit WebView2 : empreinte inattendue pour ${name}`);
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.part`;
    writeFileSync(temporary, bytes);
    renameSync(temporary, path);
  }
  return { sdkDir, loaderDir: join(sdkDir, loaderArch(arch)) };
}
