"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { completeTaskAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  return (
    <Button size="sm" loading={pending} leadingIcon={<Check className="size-4" />} onClick={() => startTransition(async () => { const r = await completeTaskAction(taskId); push({ tone: r.ok ? "success" : "error", title: r.ok ? (r.message ?? "Fait") : r.error }); router.refresh(); })}>Fait</Button>
  );
}
