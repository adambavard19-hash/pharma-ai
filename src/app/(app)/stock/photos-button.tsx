"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { fetchProductImagesAction } from "@/server/actions/stock-import";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Cherche la photo des boîtes dans les bases ouvertes, par code-barres. Un
 * passage borné par clic ; le message dit combien ont été trouvées et ce
 * qu'il reste.
 */
export function FetchPhotosButton({ pending: count, size = "sm" }: { pending: number; size?: "sm" | "md" }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  return (
    <Button
      size={size}
      variant="outline"
      loading={busy}
      leadingIcon={<Camera className="size-4" />}
      onClick={() =>
        start(async () => {
          const result = await fetchProductImagesAction();
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Photos cherchées.") : result.error });
          if (result.ok) router.refresh();
        })
      }
    >
      Chercher les photos de {count} boîte{count > 1 ? "s" : ""}
    </Button>
  );
}
