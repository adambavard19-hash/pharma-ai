"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAdminNotificationsReadAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";

export function MarkReadButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" loading={pending} onClick={() => start(async () => { await markAdminNotificationsReadAction(); router.refresh(); })}>
      Tout marquer comme lu
    </Button>
  );
}
