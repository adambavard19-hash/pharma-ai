// Un sémaphore entre processus (fichiers dans out/rembobine/verrous) : plusieurs agents travaillent en parallèle, mais les
// outils lourds (Chrome + webpack des planches, tsc) passent au plus `places` à la fois — sinon la mémoire déborde sur le
// disque (fichiers d'échange) et le remplit (23 oct. 2026).
//   const release = await prendrePlace("planche", 2);   … ;   release();   (relâché aussi à la sortie du processus)
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function prendrePlace(nom, places = 2) {
  const dir = join("out", "rembobine", "verrous");
  mkdirSync(dir, { recursive: true });
  for (let waited = 0; ; waited++) {
    for (let slot = 0; slot < places; slot++) {
      const p = join(dir, `${nom}-${slot}`);
      if (existsSync(p) && !alive(Number(readFileSync(p, "utf8")))) rmSync(p, { force: true });
      try {
        closeSync(openSync(p, "wx"));
        writeFileSync(p, String(process.pid));
        const release = () => rmSync(p, { force: true });
        process.on("exit", release);
        return release;
      } catch {}
    }
    if (waited % 15 === 0) console.log(`(${nom} : un autre agent l'utilise, j'attends ma place…)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
