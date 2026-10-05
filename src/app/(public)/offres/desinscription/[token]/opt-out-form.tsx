"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";

type State = { status: "idle" | "pending" | "done" } | { status: "error"; error: string };

/** La désinscription n'a lieu qu'ici, sur un geste explicite : un POST, le même que celui des messageries (« un clic »). */
export function OptOutForm({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "pending" });
    try {
      const response = await fetch(`/offres/desinscription/${encodeURIComponent(token)}/un-clic`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      setState(response.ok && body?.ok ? { status: "done" } : { status: "error", error: body?.error ?? "La demande n'a pas abouti. Réessayez dans quelques instants." });
    } catch {
      setState({ status: "error", error: "Connexion impossible. Réessayez dans quelques instants." });
    }
  }

  if (state.status === "done") {
    return (
      <Alert tone="success" title="C'est fait" icon={<CheckCircle2 className="size-[18px]" />}>
        Vous ne recevrez plus les offres de PharmaBoost à cette adresse.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {state.status === "error" && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" size="lg" variant="outline" loading={state.status === "pending"} className="w-full">
        Ne plus recevoir ces offres
      </Button>
    </form>
  );
}
