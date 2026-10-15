#!/bin/sh
# Prépare les musiques du film « Présentation » à partir des bruts ElevenLabs (out/sound/, voir musique-elevenlabs.mjs).
#   M1 « Tension »     public/music/presentation-m1.mp3          brut tel quel (−14,5 LUFS, attaque à 25 ms, coupure nette à 12,05 s)
#   M2 « Groove »      public/music/presentation-m2.mp3          m2-plan à partir de son attaque (2,000 s), 28 s, −14 LUFS
#   M2 « Confiance »   public/music/presentation-m2-confiance.mp3  m2-trust, −16 LUFS (plus calme)
#   M2 « Final »       public/music/presentation-m2-final.mp3      m2-finale-a, −13,5 LUFS
# Le calage (DROP, P15, P18) et la courbe de volume sont faits dans src/presentation/motion/sound.tsx.
set -e
cd "$(dirname "$0")/.."
cp out/sound/m1-brut.mp3 public/music/presentation-m1.mp3
ffmpeg -hide_banner -v error -y -ss 2.000 -t 28 -i out/sound/m2-plan.mp3 -af "afade=t=in:d=0.004,volume=-2.1dB,afade=t=out:st=27.4:d=0.6" -b:a 192k public/music/presentation-m2.mp3
ffmpeg -hide_banner -v error -y -i out/sound/m2-trust.mp3 -af "volume=-3.3dB" -b:a 192k public/music/presentation-m2-confiance.mp3
ffmpeg -hide_banner -v error -y -i out/sound/m2-finale-a.mp3 -af "volume=-2.6dB" -b:a 192k public/music/presentation-m2-final.mp3
for f in public/music/presentation-m1.mp3 public/music/presentation-m2.mp3 public/music/presentation-m2-confiance.mp3 public/music/presentation-m2-final.mp3; do
  printf "%s %ss " "$f" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
  ffmpeg -hide_banner -nostats -i "$f" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' ' | tr '\n' ' '; echo
done
