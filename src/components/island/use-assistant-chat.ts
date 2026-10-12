"use client";

import { useCallback, useRef, useState } from "react";
import type { RobotMood } from "@/core/robot/mascot";

/**
 * La discussion avec un robot (console, officine, direction, extranet, site public) : même protocole partout — on
 * envoie l'historique, la réponse arrive au fil de l'eau, une ligne JSON par événement (`text`, `tool`, `error`,
 * `done`). Le hook garde la conversation tant que l'île est montée.
 */

export type ChatTurn = { role: "user" | "assistant"; text: string; status?: string; failed?: boolean };

export function useAssistantChat(endpoint: string) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [mood, setMood] = useState<RobotMood>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;
      const history: ChatTurn[] = [...turns.filter((t) => !t.failed), { role: "user", text }];
      setTurns([...history, { role: "assistant", text: "", status: "Je réfléchis…" }]);
      setPending(true);
      setMood("thinking");
      const controller = new AbortController();
      abortRef.current = controller;
      const update = (patch: (last: ChatTurn) => ChatTurn) => setTurns((current) => [...current.slice(0, -1), patch(current[current.length - 1])]);
      try {
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turns: history.map(({ role, text: t }) => ({ role, text: t })) }), signal: controller.signal });
        if (!response.ok || !response.body) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Le robot n'a pas pu répondre.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let failure: string | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as { type: string; delta?: string; label?: string; message?: string };
            if (event.type === "text" && event.delta) update((last) => ({ ...last, text: last.text + event.delta, status: undefined }));
            else if (event.type === "tool" && event.label) update((last) => ({ ...last, status: event.label, text: last.text ? `${last.text.trimEnd()}\n\n` : "" }));
            else if (event.type === "error") failure = event.message ?? "Le robot n'a pas pu répondre.";
          }
        }
        if (failure) throw new Error(failure);
        update((last) => ({ ...last, status: undefined, text: last.text.trim() || "Je n'ai rien trouvé à répondre." }));
        setMood("happy");
      } catch (error) {
        if ((error as { name?: string }).name === "AbortError") update((last) => ({ ...last, status: undefined, text: last.text || "Question arrêtée.", failed: !last.text }));
        else {
          update((last) => ({ ...last, status: undefined, failed: true, text: error instanceof Error ? error.message : "Le robot n'a pas pu répondre." }));
          setMood("concerned");
        }
      } finally {
        setPending(false);
        abortRef.current = null;
        setTimeout(() => setMood("idle"), 2_500);
      }
    },
    [endpoint, pending, turns],
  );

  return { turns, pending, mood, ask, stop: () => abortRef.current?.abort(), reset: () => setTurns([]) };
}
