"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { VigilanceView } from "@/core/ai/vigilance-catalog";
import { VIGILANCE_LEVELS } from "@/core/ai/vigilance-catalog";
import type { VigilanceKind } from "@/core/ai/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type LevelFilter = VigilanceKind | "ALL";

const LEVEL_ORDER = (Object.keys(VIGILANCE_LEVELS) as VigilanceKind[]).sort((a, b) => VIGILANCE_LEVELS[a].order - VIGILANCE_LEVELS[b].order);

/**
 * Ce qu'il ne faut pas associer ni faire : le côté « produit non conseillé » de PharmaBoost.
 *
 * PharmaBoost ne se contente pas de pousser le bon produit : à côté de chaque conseil, la carte du comptoir dit ce qui doit rester
 * à l'écart (un exfoliant sous rétinoïde, le millepertuis avec la ciclosporine, une cycline avec la vitamine A…). Ces
 * mises en garde sont écrites dans le code, sourcées (RCP, Vidal, thésaurus ANSM) et versionnées : on les lit ici, on ne les supprime
 * pas d'ici. Les produits qu'elles concernent sont écartés des propositions de toutes les pharmacies.
 */
export function AvoidList({ vigilances }: { vigilances: VigilanceView[] }) {
  const [level, setLevel] = useState<LevelFilter>("ALL");
  const [origin, setOrigin] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const text = query.trim().toLowerCase();

  const origins = useMemo(() => [...new Set(vigilances.map((item) => item.origin))].sort((a, b) => a.localeCompare(b, "fr")), [vigilances]);
  const shown = useMemo(
    () =>
      vigilances.filter(
        (item) =>
          (level === "ALL" || item.kind === level) &&
          (origin === "ALL" || item.origin === origin) &&
          (!text || `${item.title} ${item.subtitle} ${item.trigger} ${item.explanation} ${item.concerned.join(" ")}`.toLowerCase().includes(text)),
      ),
    [vigilances, level, origin, text],
  );
  const count = (kind: VigilanceKind) => vigilances.filter((item) => item.kind === kind).length;

  return (
    <div className="space-y-5">
      <Alert tone="info" title="Ce que PharmaBoost déconseille, à côté de ce qu'il conseille">
        Un conseil dit quoi proposer ; ces règles disent <strong>quoi ne pas associer et quoi ne pas faire</strong> avec le traitement du patient. Elles s&apos;affichent sur la carte du comptoir, dans quatre niveaux
        (contre-indiqué, à éviter, à espacer, bon usage), et les produits concernés sont écartés des propositions de toutes les pharmacies. Elles sont écrites dans le code, avec leur source : on les relit ici,
        on ne les supprime pas d&apos;ici.
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrer par niveau" className="flex flex-wrap gap-2">
          <LevelPill active={level === "ALL"} onClick={() => setLevel("ALL")} label="Tous" count={vigilances.length} />
          {LEVEL_ORDER.filter((kind) => count(kind) > 0).map((kind) => (
            <LevelPill key={kind} active={level === kind} onClick={() => setLevel(kind)} label={VIGILANCE_LEVELS[kind].label} count={count(kind)} />
          ))}
        </div>
        <select
          value={origin}
          onChange={(event) => setOrigin(event.target.value)}
          aria-label="Filtrer par origine"
          className="h-9 rounded-lg border border-border-subtle bg-surface-card px-3 text-[13px] text-text-primary"
        >
          <option value="ALL">Toutes les origines</option>
          {origins.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher un médicament, un produit à éviter…" leadingIcon={<Search className="size-4" />} aria-label="Chercher dans la liste" />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState title="Rien ne correspond" description="Changez de niveau, d'origine ou de recherche pour voir le reste." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((item) => (
            <AvoidItem key={item.key} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LevelPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors", active ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}
    >
      {label} <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

function AvoidItem({ item }: { item: VigilanceView }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <Card>
        <CardContent className="space-y-3.5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="text-[15px] font-semibold text-text-primary">
                {item.trigger} <span className="font-normal text-text-secondary">— {item.title.toLowerCase()}</span>
              </h3>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge tone={item.tone}>{item.levelLabel}</Badge>
                <span className="text-[12px] text-text-tertiary">{item.origin}</span>
              </p>
            </div>
          </div>

          <dl className="grid gap-x-6 gap-y-2.5 text-[13px] leading-5 sm:grid-cols-[9.5rem_1fr]">
            <dt className="font-medium text-text-secondary">Ce qu&apos;on déconseille</dt>
            <dd className="text-text-primary">
              {item.concerned.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {item.concerned.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-text-secondary">Rappel de bon usage, sans produit à écarter.</span>
              )}
            </dd>
            {item.patientAdvice && (
              <>
                <dt className="font-medium text-text-secondary">Ce qu&apos;on dit au patient</dt>
                <dd className="text-text-primary">« {item.patientAdvice} »</dd>
              </>
            )}
            {item.blocks.length > 0 && (
              <>
                <dt className="font-medium text-text-secondary">Produits écartés</dt>
                <dd className="text-text-primary">Tout produit étiqueté : {item.blocks.join(", ")} (jamais proposé avec ce traitement).</dd>
              </>
            )}
          </dl>

          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1 text-[12.5px] text-text-tertiary hover:text-text-secondary">
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            Voir pourquoi et la source
          </button>
          {open && (
            <div className="space-y-2 rounded-lg bg-surface-sunken px-3.5 py-3 text-[12.5px] leading-5 text-text-secondary">
              <p>{item.explanation}</p>
              <p>
                <strong className="text-text-primary">Sources : </strong>
                {item.sources.join(" · ")}
              </p>
              <p className="text-text-tertiary">
                Règle {item.key} · version {item.version}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
