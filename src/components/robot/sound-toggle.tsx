"use client";

import { Volume2, VolumeX } from "lucide-react";
import type { SoundContext } from "@/core/robot/sound";
import { cn } from "@/lib/utils";
import { useRobotSound } from "./sound";

/**
 * Le petit haut-parleur à côté du robot : un toucher coupe ou rallume ses sons, et le choix est retenu dans ce
 * navigateur. Partout, il part allumé (au comptoir, très bas et pour les sons amicaux seulement).
 */
export function RobotSoundToggle({ where, className, tone = "light" }: { where: SoundContext; className?: string; tone?: "light" | "dark" }) {
  const { on, toggle } = useRobotSound(where);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Couper les sons du robot" : "Activer les sons du robot"}
      title={on ? "Sons du robot : activés" : "Sons du robot : coupés"}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none",
        tone === "dark" ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-text-tertiary hover:bg-surface-sunken hover:text-text-primary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
