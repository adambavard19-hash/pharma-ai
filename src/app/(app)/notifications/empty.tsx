"use client";

import { Robot } from "@/components/robot";
import { useCounterLook } from "@/components/robot/counter-look-context";

/** Rien à signaler : le robot du comptoir le dit. */
export function EmptyNotifications() {
  const counterLook = useCounterLook();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Robot size={84} interactive look={counterLook?.look} />
      <p className="text-[15px] font-semibold text-text-primary">Rien de neuf pour l&apos;instant</p>
      <p className="max-w-sm text-[13px] leading-5 text-text-secondary">Les alertes de stock, les évènements de l&apos;équipe et les réponses du support apparaîtront ici.</p>
    </div>
  );
}
