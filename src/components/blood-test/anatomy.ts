/**
 * La carte anatomique de la Version 1 : chaque organe à sa place, et chaque analyse épinglée sur l'organe qu'elle renseigne.
 * Coordonnées dans un repère 240 × 480 (le corps vu de face : la droite du patient est à gauche de l'écran).
 */

export type OrganKey = "thyroide" | "coeur" | "foie" | "estomac" | "pancreas" | "reins" | "sang" | "os" | "muscles";

export type Organ = {
  key: OrganKey;
  label: string;
  /** Une phrase simple : ce que fait cet organe et pourquoi on le regarde dans la prise de sang. */
  what: string;
  /** Les analyses épinglées sur cet organe (ids de data.ts). */
  analyses: string[];
  /** Centre de l'organe (pour le zoom et les points). */
  cx: number;
  cy: number;
  /** Dessin de l'organe. */
  paths: string[];
  /** Organe vu « dans le dos » : trait pointillé. */
  behind?: boolean;
  /** Où poser chaque point (même ordre que analyses). */
  dots: [number, number][];
  /** Étiquette sur le côté : gauche ou droite de l'écran, hauteur dans le repère. */
  side: "l" | "r";
  labelY: number;
};

export const ORGANS: Organ[] = [
  {
    key: "thyroide", label: "Thyroïde", side: "r", labelY: 92, cx: 120, cy: 100,
    what: "Un petit papillon dans le cou. Elle règle l'énergie du corps, comme un thermostat.",
    analyses: ["tsh"],
    dots: [[120, 100]],
    paths: ["M120 100 C116 93 106 92 105 99 C104 106 113 109 120 104 C127 109 136 106 135 99 C134 92 124 93 120 100Z"],
  },
  {
    key: "coeur", label: "Cœur et vaisseaux", side: "r", labelY: 142, cx: 131, cy: 148,
    what: "Le cholestérol circule dans les vaisseaux. En trop, il peut s'y déposer avec les années.",
    analyses: ["ldl", "hdl", "tg"],
    dots: [[124, 147], [131, 151], [138, 147]],
    paths: [
      "M131 164 C117 154 110 146 113 138 C116 131 126 131 131 139 C136 131 146 131 149 138 C152 146 145 154 131 164Z",
      "M126 134 C124 122 132 116 140 120",
    ],
  },
  {
    key: "foie", label: "Foie", side: "l", labelY: 176, cx: 103, cy: 186,
    what: "Le foie filtre le sang et transforme ce que vous mangez et buvez.",
    analyses: ["alat", "asat", "ggt"],
    dots: [[95, 185], [103, 188], [111, 185]],
    paths: ["M80 178 C92 168 116 168 128 174 C126 188 114 198 98 200 C86 201 79 192 80 178Z"],
  },
  {
    key: "estomac", label: "Estomac et intestin", side: "r", labelY: 198, cx: 141, cy: 196,
    what: "C'est là que les vitamines B12 et B9 sont absorbées depuis ce que vous mangez.",
    analyses: ["b12", "b9"],
    dots: [[145, 191], [120, 244]],
    paths: [
      "M134 178 C146 172 157 178 157 190 C157 202 148 208 140 206 C136 200 139 193 136 188 C133 185 132 181 134 178Z",
      "M100 232 C104 226 136 226 140 232 C146 240 142 252 136 256 C128 262 110 262 104 256 C98 250 96 240 100 232Z",
      "M106 240 C114 236 124 246 132 240 M106 250 C114 246 124 256 134 250",
    ],
  },
  {
    key: "pancreas", label: "Pancréas (sucre)", side: "l", labelY: 222, cx: 122, cy: 212,
    what: "Le pancréas fabrique l'insuline, qui fait entrer le sucre dans les cellules.",
    analyses: ["gly", "hba1c"],
    dots: [[117, 212], [129, 211]],
    paths: ["M104 213 C112 206 132 206 146 210 C140 217 124 219 112 219 C107 219 103 217 104 213Z"],
  },
  {
    key: "reins", label: "Reins (dans le dos)", side: "l", labelY: 262, cx: 120, cy: 226, behind: true,
    what: "Les deux reins, dans le bas du dos, nettoient le sang et fabriquent l'urine.",
    analyses: ["creat"],
    dots: [[97, 227]],
    paths: [
      "M99 214 C92 214 90 222 91 228 C92 236 98 240 103 236 C100 230 101 224 104 220 C104 216 102 214 99 214Z",
      "M141 214 C148 214 150 222 149 228 C148 236 142 240 137 236 C140 230 139 224 136 220 C136 216 138 214 141 214Z",
    ],
  },
  {
    key: "sang", label: "Sang et moelle osseuse", side: "l", labelY: 124, cx: 68, cy: 199,
    what: "Le sang est prélevé au pli du coude. Les globules, eux, sont fabriqués dans la moelle des os.",
    analyses: ["hb", "gr", "gb", "plaquettes", "ferritine"],
    dots: [[74, 136], [73, 148], [71, 160], [70, 172], [68, 203]],
    paths: [
      "M68 186 C64 194 61 199 61 204 C61 209 64 212 68 212 C72 212 75 209 75 204 C75 199 72 194 68 186Z",
      "M75 130 C71 150 68 170 68 184",
    ],
  },
  {
    key: "os", label: "Os", side: "l", labelY: 330, cx: 104, cy: 330,
    what: "La vitamine D aide les os à garder le calcium, pour rester solides.",
    analyses: ["vitd"],
    dots: [[104, 330]],
    paths: [
      "M100 290 C96 286 98 280 103 282 C106 280 111 283 109 289 L108 368 C112 372 110 378 105 376 C101 379 96 374 100 369Z",
    ],
  },
  {
    key: "muscles", label: "Muscles, nerfs et défenses", side: "r", labelY: 394, cx: 138, cy: 392,
    what: "Le magnésium aide les muscles et les nerfs. Le zinc soutient les défenses et la peau.",
    analyses: ["mg", "zinc"],
    dots: [[136, 390], [140, 402]],
    paths: ["M132 372 C126 384 128 404 134 414 C140 420 146 412 147 400 C148 388 144 376 138 370 C136 369 133 370 132 372Z"],
  },
];

/** La silhouette, vue de face, dans le même repère. */
export const SILHOUETTE = {
  head: { cx: 120, cy: 56, r: 30 },
  body:
    "M108 84 L132 84 L133 100 C150 102 166 106 170 122 L182 232 C183 244 172 246 170 236 L160 146 L158 252 C158 264 154 276 152 286 L150 452 C150 464 138 466 136 454 L124 304 L116 304 L104 454 C102 466 90 464 90 452 L88 286 C86 276 82 264 82 252 L80 146 L70 236 C68 246 57 244 58 232 L70 122 C74 106 90 102 107 100Z",
};
