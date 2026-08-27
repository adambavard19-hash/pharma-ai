"use client";

import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { markAllReadAction } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function MarkAllReadButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  return (
    <Button
      variant="outline"
      loading={pending}
      leadingIcon={<CheckCheck className="size-[18px]" />}
      onClick={() =>
        startTransition(async () => {
          await markAllReadAction();
          push({ tone: "success", title: `${count} notification(s) marquée(s) comme lue(s)` });
        })
      }
    >
      Tout marquer comme lu
    </Button>
  );
}
