"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/field";

/** Recherche filtrante dans une liste, synchronisée avec l'URL. */
export function PatientSearchBar({
  initialQuery,
  placeholder = "Rechercher un patient (nom, référence, téléphone…)",
  basePath = "/patients",
}: {
  initialQuery: string;
  placeholder?: string;
  basePath?: string;
}) {
  const [value, setValue] = useState(initialQuery);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      params.delete("page");
      const query = params.toString();
      router.replace(`${basePath}${query ? `?${query}` : ""}`, { scroll: false });
    }, 280);

    return () => clearTimeout(timer);
    // `searchParams` change à chaque navigation : l'inclure relancerait la
    // recherche en boucle. La valeur saisie suffit à déclencher la mise à jour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="w-full max-w-md">
      <label htmlFor="list-search" className="sr-only">
        {placeholder}
      </label>
      <Input
        id="list-search"
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        leadingIcon={<Search className="size-4" />}
      />
    </div>
  );
}
