import { ean13Modules, spacedCode } from "@/core/patient-app/offers";

/** Un code-barres EAN-13 net, que toute douchette lit sur un écran de téléphone (luminosité haute conseillée). */
export function Barcode({ code }: { code: string }) {
  const modules = ean13Modules(code);
  const quiet = 11;
  const width = modules.length + quiet * 2;
  return (
    <figure data-app-code-barres={code} className="rounded-2xl bg-white p-4">
      <svg viewBox={`0 0 ${width} 60`} className="h-28 w-full" preserveAspectRatio="none" role="img" aria-label={`Code ${spacedCode(code)}`} shapeRendering="crispEdges">
        <rect width={width} height={60} fill="#fff" />
        {modules.split("").map((bit, index) => (bit === "1" ? <rect key={index} x={quiet + index} y={0} width={1} height={60} fill="#000" /> : null))}
      </svg>
      <figcaption className="mt-2 text-center font-mono text-[17px] font-bold tracking-[0.18em] text-[#0F2F2A]">{spacedCode(code)}</figcaption>
    </figure>
  );
}
