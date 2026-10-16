// La musique des films « Prise en main » (17 oct. 2026) : UNE piste continue de 3 minutes (ElevenLabs Music), sans boucle ni
// raccord — la musique bouclée du premier film faisait des sauts audibles. Discrète : elle laisse toute la place à la voix.
import { post, credits } from "./eleven.mjs";
const before = await credits();
const bytes = await post("/v1/music?output_format=mp3_44100_128", {
  prompt: "Calm, warm, modern corporate background music for a French software tutorial video. Soft felt piano, gentle plucked synth, light airy pads, very soft steady pulse, 95 BPM, major key, optimistic and reassuring. Even and constant energy from start to end, no drops, no build-ups, no breaks, no tempo changes. Instrumental only, leaves room for a male voice-over.",
  music_length_ms: 180000,
  force_instrumental: true,
}, "public/music/guide.mp3");
const after = await credits();
console.log(`public/music/guide.mp3 · ${(bytes / 1024).toFixed(0)} Ko · décompté ${after.used - before.used} · restants ${after.limit - after.used}`);
