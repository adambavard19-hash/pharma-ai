"use client";

import { UNIVERSES } from "@/config/universes";
import { Checkbox } from "@/components/ui/field";

/** Cases à cocher des univers PharmaBoost. */
export function UniversePicker({ idPrefix, value, onChange }: { idPrefix: string; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
      {UNIVERSES.map((universe) => {
        const checked = value.includes(universe.key);
        return (
          <Checkbox
            key={universe.key}
            id={`${idPrefix}-${universe.key}`}
            label={universe.label}
            checked={checked}
            onChange={(event) => onChange(event.target.checked ? [...value, universe.key] : value.filter((key) => key !== universe.key))}
          />
        );
      })}
    </div>
  );
}
