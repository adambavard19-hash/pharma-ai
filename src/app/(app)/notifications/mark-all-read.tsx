"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markAllReadAction } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function MarkAllReadButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      loading={pending}
      leadingIcon={<CheckCheck className="size-[18px]" />}
      onClick={() =>
        startTransition(async () => {
          await markAllReadAction();
          push({ tone: "success", title: count > 1 ? `${count} notifications marquées comme lues` : "Notification marquée comme lue" });
          router.refresh();
        })
      }
    >
      Tout marquer comme lu
    </Button>
  );
}
