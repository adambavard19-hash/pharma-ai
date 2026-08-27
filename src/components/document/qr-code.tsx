import { encodeQr, qrToSvgPath } from "@/lib/qrcode";

/** QR code rendu en SVG côté serveur : net à l'écran comme à l'impression. */
export function QrCode({
  value,
  size = 160,
  label,
  className,
}: {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  let path: string;
  let matrixSize: number;

  try {
    const matrix = encodeQr(value);
    path = qrToSvgPath(matrix);
    matrixSize = matrix.size;
  } catch {
    return (
      <p className="text-[12px] text-text-tertiary">
        QR code indisponible pour ce lien.
      </p>
    );
  }

  const quiet = 2;
  const viewBox = matrixSize + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      className={className}
      role="img"
      aria-label={label ?? "QR code d'accès à la fiche conseil"}
      shapeRendering="crispEdges"
    >
      <rect width={viewBox} height={viewBox} fill="#ffffff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={path} fill="#0f172a" />
      </g>
    </svg>
  );
}
