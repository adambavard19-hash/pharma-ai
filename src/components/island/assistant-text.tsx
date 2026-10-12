"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * La réponse d'un robot, en Markdown simple (paragraphes, listes, tableaux, gras, liens), sur le fond noir de l'île.
 * Seuls les liens que `safeHref` accepte deviennent cliquables (chaque espace garde les siens) ; aucun HTML n'est
 * interprété.
 */
export function AssistantText({ text, safeHref, onNavigate }: { text: string; safeHref: (href: string) => string | null; onNavigate: (href: string) => void }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (value: string) => inlineParts(value, safeHref, onNavigate);
  return (
    <div className="space-y-2">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const isTable = lines.length >= 2 && lines.every((line) => /^\s*\|.*\|\s*$/.test(line)) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[1]);
        if (isTable) {
          const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
          const [head, , ...body] = lines;
          return (
            <div key={b} className="-mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr>{cells(head).map((cell, c) => <th key={c} className="border-b border-white/15 px-2 py-1.5 text-left font-semibold whitespace-nowrap text-white/70">{inline(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((line, r) => (
                    <tr key={r} className="border-b border-white/[0.07] last:border-0">
                      {cells(line).map((cell, c) => <td key={c} className="px-2 py-1.5 align-top">{inline(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const isList = lines.length > 0 && lines.every((line) => /^\s*([-*•]|\d+[.)])\s+/.test(line));
        if (isList)
          return (
            <ul key={b} className="space-y-1 pl-0.5">
              {lines.map((line, l) => (
                <li key={l} className="flex gap-2">
                  <span className="mt-[8px] size-1 shrink-0 rounded-full bg-white/45" aria-hidden="true" />
                  <span className="min-w-0">{inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        const heading = /^#{1,4}\s+/.test(block);
        return (
          <p key={b} className={cn("whitespace-pre-wrap", heading && "font-semibold")}>
            {inline(block.replace(/^#{1,4}\s+/, ""))}
          </p>
        );
      })}
    </div>
  );
}

function inlineParts(text: string, safeHref: (href: string) => string | null, onNavigate: (href: string) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) {
      const href = safeHref(match[2]);
      parts.push(
        href ? (
          <a
            key={match.index}
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey) return;
              event.preventDefault();
              onNavigate(href);
            }}
            className="font-medium text-[#36E8C8] underline decoration-[#36E8C8]/40 underline-offset-2 hover:decoration-[#36E8C8]"
          >
            {match[1]}
          </a>
        ) : (
          <Fragment key={match.index}>{match[1]}</Fragment>
        ),
      );
    } else if (match[3]) parts.push(<strong key={match.index} className="font-semibold text-white">{match[3]}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
