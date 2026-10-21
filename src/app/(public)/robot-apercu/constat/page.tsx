import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConstatVariants } from "./variants";

export const metadata: Metadata = { title: "Le constat, en plus court", robots: { index: false, follow: false } };

/** La section « Le pharmacien ne peut pas penser à tout », quatre versions plus courtes (fondateur, 21 oct. 2026). Développement seulement. */
export default function ConstatPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ConstatVariants />;
}
