#!/bin/zsh
# Les quatre vidéos de présentation en 1080p, sur le Bureau (6 nov. 2026). Depuis video/ : zsh src/promo/tools/rendre.sh 1 2 3 4
set -e
for n in "$@"; do
  npx remotion render src/promo/index.ts Presentation$n out/promo/p$n.mp4 --codec=h264 --crf=17 --concurrency=4 --log=error
  ffmpeg -v error -y -i out/promo/p$n.mp4 -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k -movflags +faststart "$HOME/Desktop/Vidéo de présentation $n.mp4"
  echo "OK $n"
done
echo FIN
