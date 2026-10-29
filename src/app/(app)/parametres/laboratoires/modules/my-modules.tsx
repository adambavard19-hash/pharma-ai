"use client";

import type { AdviceModuleCode } from "@/core/ai/advice-modules";
import { saveMyAdviceModulesAction } from "@/server/actions/advice-modules";
import { ModulePicker } from "@/components/advice/module-picker";

export function MyModules({ initial, counts }: { initial: AdviceModuleCode[]; counts: Partial<Record<AdviceModuleCode, number>> }) {
  return <ModulePicker initial={initial} counts={counts} onSave={(modules) => saveMyAdviceModulesAction({ modules })} />;
}
