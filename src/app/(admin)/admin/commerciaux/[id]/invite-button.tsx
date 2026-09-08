"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { inviteSalesRepAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function InviteButton({ salesRepId, invited }: { salesRepId: string; invited: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button variant="outline" loading={pending} leadingIcon={<Send className="size-4" />} onClick={() => startTransition(async () => { const r = await inviteSalesRepAction(salesRepId); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Envoyé") : r.error }); router.refresh(); })}>
      {invited ? "Renvoyer l'invitation" : "Envoyer l'invitation"}
    </Button>
  );
}
