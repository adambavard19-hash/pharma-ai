"use client";

import { useState } from "react";
import { Robot, emitRobotMood, type RobotMood } from "@/components/robot";

/** Le banc d'essai : une carte par humeur, les tailles, l'immobile, et les signaux du fil. */
export function RobotPlayground({ moods }: { moods: RobotMood[] }) {
  const [cheer, setCheer] = useState(0);
  return (
    <main className="mx-auto max-w-5xl space-y-8 bg-white p-6 text-ink-900">
      <h1 className="text-2xl font-bold">Le robot — aperçu de développement</h1>
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-test="moods">
        {moods.map((mood) => (
          <div key={mood} className="flex flex-col items-center gap-2 rounded-2xl border p-4" data-mood-card={mood}>
            <Robot mood={mood} size={120} interactive cheerKey={cheer} />
            <span className="text-sm font-semibold">{mood}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-wrap items-end gap-6 rounded-2xl border p-4" data-test="sizes">
        {[24, 32, 48, 80, 200].map((size) => (
          <Robot key={size} size={size} />
        ))}
        <Robot size={140} floating track interactive greet label="Le robot PharmaBoost" />
      </section>
      <section className="flex flex-wrap items-end gap-6 rounded-2xl border p-4" data-test="reduced">
        {moods.map((mood) => (
          <Robot key={mood} mood={mood} size={64} motion="reduce" />
        ))}
      </section>
      <section className="flex flex-wrap gap-3">
        <Robot size={72} listen />
        <button type="button" className="rounded border px-3 py-2" onClick={() => emitRobotMood("celebrate")}>Signal : fête</button>
        <button type="button" className="rounded border px-3 py-2" onClick={() => emitRobotMood("happy")}>Signal : joie</button>
        <button type="button" className="rounded border px-3 py-2" onClick={() => setCheer((n) => n + 1)}>Rejouer les gestes</button>
      </section>
    </main>
  );
}
