// Petit client ElevenLabs commun (musique et effets du film « Présentation »).
// La clé est lue dans ~/.pharmaboost-voix.env et n'est JAMAIS affichée ni écrite.
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

function key() {
  const env = readFileSync(`${homedir()}/.pharmaboost-voix.env`, "utf8");
  const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m);
  if (!m) throw new Error("ELEVENLABS_API_KEY absente de ~/.pharmaboost-voix.env");
  return m[1];
}

export async function credits() {
  const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key() } });
  const d = await r.json();
  return { used: d.character_count, limit: d.character_limit };
}

export async function post(path, body, out) {
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method: "POST",
    headers: { "xi-api-key": key(), "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 600);
    throw new Error(`${path} → ${r.status} ${txt}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(out, buf);
  return buf.length;
}
