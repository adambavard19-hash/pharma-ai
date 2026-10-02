import { cn } from "@/lib/utils";

/** Le logo d'une marque partenaire s'il a été fourni, sinon ses initiales. Jamais d'image inventée. */
export function BrandLogo({ name, logoUrl, size = "md" }: { name: string; logoUrl: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-14 rounded-xl text-[17px]" : "size-10 rounded-lg text-[13px]";
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo saisi par URL dans la console, domaine non connu à l'avance
      <img src={logoUrl} alt="" className={cn("shrink-0 border border-border-subtle bg-white object-contain p-1", box)} />
    );
  }
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center bg-surface-sunken font-semibold text-text-secondary", box)}>
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
