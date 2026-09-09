"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { classifyProductsAction } from "@/server/actions/stock-import";
import { completeOnboardingAction } from "@/server/actions/onboarding";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function VerifyStockButton({ pending: count }: { pending: number }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button
      loading={busy}
      leadingIcon={<Sparkles className="size-[18px]" />}
      onClick={() =>
        start(async () => {
          const result = await classifyProductsAction();
          push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Produits compris.") : result.error });
          if (result.ok) router.refresh();
        })
      }
    >
      Comprendre les {count} produit{count > 1 ? "s" : ""} restant{count > 1 ? "s" : ""}
    </Button>
  );
}

export function FinishButton() {
  const [busy, start] = useTransition();
  return (
    <Button size="lg" loading={busy} leadingIcon={<Sparkles className="size-[18px]" />} onClick={() => start(async () => { await completeOnboardingAction(); })}>
      Ouvrir le comptoir
    </Button>
  );
}
