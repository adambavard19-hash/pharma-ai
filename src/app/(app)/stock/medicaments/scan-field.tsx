"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Input } from "@/components/ui/field";

/**
 * Le champ unique du stock médicament.
 *
 * Une douchette se comporte comme un clavier très rapide qui termine par une
 * entrée : c'est pourquoi la soumission est immédiate sur « Entrée » et
 * seulement différée quand quelqu'un tape. Le champ se resélectionne après
 * chaque lecture pour que le scan suivant remplace le précédent sans un geste
 * de plus — au comptoir, chaque geste compte.
 */
export function DrugScanField({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const submitted = useRef(initialQuery);

  const submit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === submitted.current) return;
    submitted.current = trimmed;

    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    params.delete("page");
    const query = params.toString();
    router.replace(`/stock/medicaments${query ? `?${query}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => submit(value), 320);
    return () => clearTimeout(timer);
    // `searchParams` change à chaque navigation : l'inclure relancerait la
    // recherche en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      className="w-full max-w-xl"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
        inputRef.current?.select();
      }}
    >
      <label htmlFor="drug-scan" className="sr-only">
        Scanner une boîte, ou chercher un médicament ou une substance
      </label>
      <Input
        id="drug-scan"
        ref={inputRef}
        name="q"
        type="search"
        autoFocus
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.target.select()}
        placeholder="Scannez une boîte, ou tapez un nom ou une substance…"
        leadingIcon={<ScanLine className="size-4" />}
      />
    </form>
  );
}
