import type { RobotLook } from "@/core/robot/counter-look";

/**
 * Les accessoires des robots de comptoir (voir core/robot/counter-look.ts), dans la boîte de 100 unités du robot.
 * Gros traits, formes pleines : ils se lisent encore à 56 px. Ils restent dans la boîte du dessin (y ≥ -4).
 *
 * `HeadAccessory` se dessine par-dessus la tête (chapeaux, antenne), `FaceAccessory` par-dessus le visage (lunettes,
 * nœud, cœur, fleur) : tous deux dans le groupe qui respire, pour bouger avec le robot.
 */
export function HeadAccessory({ look }: { look: RobotLook }) {
  const { accent, lamp, earDark, ear } = look.palette;
  switch (look.accessory) {
    case "cap":
      return (
        <g>
          <path d="M 25 21 Q 27 4 50 4 Q 73 4 75 21 Z" fill={accent} />
          <path d="M 62 19 Q 84 15 94 21 Q 84 25 62 23 Z" fill={earDark} />
          <circle cx={50} cy={4.5} r={2.6} fill={lamp} />
        </g>
      );
    case "tophat":
      return (
        <g>
          <rect x={37} y={-2} width={26} height={19} rx={2.5} fill={accent} />
          <rect x={37} y={10.5} width={26} height={4} fill={lamp} />
          <rect x={29} y={15} width={42} height={5} rx={2.5} fill={earDark} />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M 32 19 L 32 5 L 41 12 L 50 1 L 59 12 L 68 5 L 68 19 Z" fill="#FFD65A" stroke="#E0A800" strokeWidth={1.4} strokeLinejoin="round" />
          <circle cx={50} cy={13.5} r={2.6} fill={accent} />
          <circle cx={39} cy={15} r={1.9} fill={accent} />
          <circle cx={61} cy={15} r={1.9} fill={accent} />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M 21 22 Q 22 3 50 3 Q 78 3 79 22 Z" fill={accent} />
          <rect x={19} y={16.5} width={62} height={7.5} rx={3.75} fill={earDark} />
          <circle cx={50} cy={1.5} r={5} fill={lamp} />
        </g>
      );
    case "star":
      return <path d="M 50 -3 L 52.8 3 L 59.5 3.6 L 54.4 8 L 56 14.5 L 50 11 L 44 14.5 L 45.6 8 L 40.5 3.6 L 47.2 3 Z" fill={lamp} stroke={accent} strokeWidth={1.6} strokeLinejoin="round" />;
    case "leaf":
      return (
        <g>
          <path d="M 50 9 Q 39 -1 32 6 Q 40 14 50 9 Z" fill={ear} stroke={earDark} strokeWidth={1.2} />
          <path d="M 50 7 Q 61 -3 68 3 Q 60 12 50 7 Z" fill={ear} stroke={earDark} strokeWidth={1.2} />
        </g>
      );
    default:
      return null;
  }
}

export function FaceAccessory({ look }: { look: RobotLook }) {
  const { accent, lamp } = look.palette;
  switch (look.accessory) {
    case "glasses":
      return (
        <g fill="none" stroke={accent} strokeWidth={2.8}>
          <circle cx={38} cy={42} r={9.5} />
          <circle cx={62} cy={42} r={9.5} />
          <path d="M 47.5 41 Q 50 38.5 52.5 41" strokeLinecap="round" />
        </g>
      );
    case "bowtie":
      return (
        <g>
          <path d="M 50 79 L 37 72 L 37 86 Z M 50 79 L 63 72 L 63 86 Z" fill={accent} stroke="#fff" strokeWidth={1.2} strokeLinejoin="round" />
          <circle cx={50} cy={79} r={3.4} fill={lamp} stroke="#fff" strokeWidth={1} />
        </g>
      );
    case "heart":
      return <path transform="translate(25 68) scale(1.35) translate(-25 -68)" d="M 25 76 C 15 69 15 61 20.5 60 C 23 59.6 24.4 61 25 62.6 C 25.6 61 27 59.6 29.5 60 C 35 61 35 69 25 76 Z" fill={accent} stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />;
    case "flower":
      return (
        <g>
          {[0, 72, 144, 216, 288].map((angle) => {
            const rad = ((angle - 90) * Math.PI) / 180;
            return <circle key={angle} cx={22 + 5 * Math.cos(rad)} cy={20 + 5 * Math.sin(rad)} r={4.2} fill={accent} stroke="#fff" strokeWidth={0.9} />;
          })}
          <circle cx={22} cy={20} r={3.2} fill="#FFD65A" />
        </g>
      );
    default:
      return null;
  }
}
