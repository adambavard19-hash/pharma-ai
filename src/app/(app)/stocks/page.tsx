import { redirect } from "next/navigation";

/** Ancienne adresse du stock, au pluriel. */
export default function LegacyStocksPage() {
  redirect("/stock");
}
