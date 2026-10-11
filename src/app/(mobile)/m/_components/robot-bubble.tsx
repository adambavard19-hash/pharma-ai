import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { RobotTip } from "@/core/robot/mascot-tips";

/**
 * La bulle du robot sur l'Accueil : UNE prochaine étape utile, sous le bonjour, avec son lien. Rien quand il n'y a rien
 * d'utile à dire (core/robot/mascot-tips.ts, `mobileTip`).
 */
export function RobotBubble({ tip }: { tip: RobotTip }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-[14px] leading-5 font-medium text-ink-900">{tip.text}</span>
      {tip.action && (
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-brand-700">
          {tip.action.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </>
  );
  const shape =
    "relative mt-4 flex items-center gap-3 rounded-2xl rounded-tr-md bg-white/95 px-4 py-3 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.35)] before:absolute before:-top-1.5 before:right-8 before:size-3 before:rotate-45 before:bg-white/95";
  return tip.action ? (
    <Link href={tip.action.href} className={`${shape} transition-transform active:scale-[0.985]`}>
      {body}
    </Link>
  ) : (
    <p className={shape}>{body}</p>
  );
}
