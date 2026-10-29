"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, Clock, Flag, KanbanSquare, ListTodo, MapPin, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import {
  CARNET_CATEGORIES,
  CARNET_KINDS,
  CARNET_PRIORITIES,
  CARNET_STATUSES,
  addDays,
  carnetStats,
  compareItems,
  groupOpen,
  kindOf,
  type CarnetItem,
  type CarnetKind,
  type CarnetPriority,
  type CarnetStatus,
} from "@/core/admin/carnet";
import { addCarnetItemAction, removeCarnetItemAction, updateCarnetItemAction } from "@/server/actions/admin-carnet";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type View = "tableau" | "agenda" | "liste";

/** « Aujourd'hui », « Demain », « lun. 3 nov. » ; en retard : « il y a 2 j ». */
function dayLabel(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, 1)) return "Demain";
  if (day === addDays(today, -1)) return "Hier";
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function KindDot({ kind, size = 8 }: { kind: CarnetKind; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: kindOf(kind).tone }} aria-hidden="true" />;
}

/** La carte d'une note : sa couleur, son titre, quand, où, l'avancement de sa liste. */
function NoteCard({ item, today, onOpen, onToggle, draggable = false }: { item: CarnetItem; today: string; onOpen: () => void; onToggle: () => void; draggable?: boolean }) {
  const kind = kindOf(item.kind);
  const done = item.status === "FAIT";
  const late = !done && item.due !== null && item.due < today;
  const checks = item.checklist.length;
  const checked = item.checklist.filter((check) => check.done).length;
  return (
    <div
      draggable={draggable}
      onDragStart={(event) => event.dataTransfer.setData("text/carnet", item.id)}
      className={cn(
        "group relative flex cursor-pointer gap-2.5 overflow-hidden rounded-xl border bg-surface-card p-3 pl-3.5 shadow-[0_1px_2px_rgba(15,43,38,.06)] transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_-12px_rgba(15,43,38,.35)]",
        late ? "border-danger-300" : "border-border-subtle",
        done && "opacity-60",
      )}
      onClick={onOpen}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: kind.tone }} aria-hidden="true" />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        aria-label={done ? `Remettre « ${item.title} » à faire` : `Marquer « ${item.title} » comme fait`}
        className="mt-px shrink-0 text-text-tertiary transition-colors hover:text-brand-600"
      >
        {done ? <CheckCircle2 className="size-[18px] text-brand-600" /> : <Circle className="size-[18px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold tracking-[0.08em] uppercase" style={{ color: kind.tone }}>
          {kind.label}
          {item.priority === "HAUTE" && <span className="ml-1.5 text-danger-600">· urgent</span>}
        </p>
        <p className={cn("mt-0.5 text-[13.5px] leading-5 font-semibold text-text-primary", done && "line-through")}>{item.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-text-secondary">
          {item.due && (
            <span className={cn("inline-flex items-center gap-1", late && "font-semibold text-danger-600", item.due === today && !done && "font-semibold text-brand-700")}>
              {late ? <AlertTriangle className="size-3" aria-hidden="true" /> : <CalendarDays className="size-3" aria-hidden="true" />}
              {dayLabel(item.due, today)}
            </span>
          )}
          {item.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden="true" />
              {item.time.replace(":", " h ")}
            </span>
          )}
          {item.place && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.place}</span>
            </span>
          )}
          {item.category && item.category !== "Autre" && <span className="rounded-full bg-surface-sunken px-1.5 py-px text-[10.5px] font-medium">{item.category}</span>}
          {checks > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-sunken">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(checked / checks) * 100}%` }} />
              </span>
              {checked}/{checks}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-card px-4 py-3">
      <span className="inline-flex size-9 items-center justify-center rounded-xl" style={{ background: `${tone}1A`, color: tone }}>
        {icon}
      </span>
      <div>
        <p className="text-[22px] leading-6 font-bold text-text-primary tabular-nums">{value}</p>
        <p className="text-[12px] text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

const emptyDraft = (today: string) => ({ title: "", kind: "TACHE" as CarnetKind, due: today as string | null, time: "", priority: "NORMALE" as CarnetPriority, category: "Logiciel", place: "" });

export function CarnetBoard({ initial, today }: { initial: CarnetItem[]; today: string }) {
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState(() => emptyDraft(today));
  const [view, setView] = useState<View>("tableau");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<CarnetKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<CarnetStatus | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (!kindFilter || item.kind === kindFilter) && (!needle || `${item.title} ${item.notes} ${item.place} ${item.category}`.toLowerCase().includes(needle)));
  }, [items, query, kindFilter]);
  const stats = carnetStats(items, today);
  const groups = groupOpen(visible, today);
  const opened = items.find((item) => item.id === openId) ?? null;

  const run = (job: () => Promise<{ ok: boolean; data?: CarnetItem[]; error?: string; message?: string }>, quiet = false) =>
    start(async () => {
      const result = await job();
      if (result.ok && result.data) {
        setItems(result.data);
        if (!quiet && result.message) push({ tone: "success", title: result.message });
      } else if (!result.ok) push({ tone: "error", title: result.error ?? "Enregistrement impossible" });
    });

  const add = () => {
    if (!draft.title.trim()) return;
    run(() => addCarnetItemAction({ ...draft, title: draft.title.trim(), time: draft.time || null, place: draft.place.trim() }));
    setDraft((current) => ({ ...current, title: "", time: "", place: "" }));
  };
  const update = (id: string, patch: Partial<CarnetItem>) => {
    // Tout de suite à l'écran ; le serveur confirme.
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    run(() => updateCarnetItemAction({ id, patch }), true);
  };
  const toggle = (item: CarnetItem) => update(item.id, { status: item.status === "FAIT" ? "A_FAIRE" : "FAIT" });

  return (
    <div className="space-y-5">
      {/* L'ajout rapide : on tape, on choisit le type et le jour, Entrée. */}
      <section className="rounded-2xl border border-border-subtle bg-surface-card p-4 shadow-[0_12px_32px_-24px_rgba(15,43,38,.45)]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Sparkles className="size-5" aria-hidden="true" />
            </span>
            <input
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              maxLength={160}
              placeholder="Qu'y a-t-il à noter ? (Entrée pour ajouter)"
              aria-label="Nouvelle note"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border-default bg-surface-page px-4 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-500"
            />
            <Button type="submit" disabled={pending || !draft.title.trim()} leadingIcon={<Plus className="size-4" />}>
              Ajouter
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-12">
            {CARNET_KINDS.map((kind) => (
              <button
                key={kind.key}
                type="button"
                onClick={() => setDraft({ ...draft, kind: kind.key })}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors", draft.kind === kind.key ? "text-white" : "border-border-subtle text-text-secondary hover:text-text-primary")}
                style={draft.kind === kind.key ? { background: kind.tone, borderColor: kind.tone } : undefined}
              >
                {draft.kind !== kind.key && <KindDot kind={kind.key} />}
                {kind.label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-border-subtle" />
            {[
              { label: "Aujourd'hui", value: today },
              { label: "Demain", value: addDays(today, 1) },
              { label: "Sans date", value: null },
            ].map((choice) => (
              <button key={choice.label} type="button" onClick={() => setDraft({ ...draft, due: choice.value })} className={cn("h-8 rounded-full px-3 text-[12.5px] font-semibold", draft.due === choice.value ? "bg-text-primary text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}>
                {choice.label}
              </button>
            ))}
            <input type="date" value={draft.due ?? ""} onChange={(event) => setDraft({ ...draft, due: event.target.value || null })} aria-label="Jour" className="h-8 rounded-full border border-border-subtle bg-surface-page px-3 text-[12.5px] text-text-primary" />
            <input type="time" value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} aria-label="Heure" className="h-8 rounded-full border border-border-subtle bg-surface-page px-3 text-[12.5px] text-text-primary" />
            <input value={draft.place} onChange={(event) => setDraft({ ...draft, place: event.target.value })} maxLength={120} placeholder="Où, qui ?" aria-label="Lieu ou personne" className="h-8 w-40 rounded-full border border-border-subtle bg-surface-page px-3 text-[12.5px] text-text-primary placeholder:text-text-tertiary" />
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} aria-label="Rubrique" className="h-8 rounded-full border border-border-subtle bg-surface-page px-3 text-[12.5px] text-text-primary">
              {CARNET_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <button type="button" onClick={() => setDraft({ ...draft, priority: draft.priority === "HAUTE" ? "NORMALE" : "HAUTE" })} className={cn("inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold", draft.priority === "HAUTE" ? "bg-danger-600 text-white" : "bg-surface-sunken text-text-secondary hover:text-text-primary")}>
              <Flag className="size-3.5" aria-hidden="true" /> Urgent
            </button>
          </div>
        </form>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="À faire" value={stats.open} tone="#0E8A7B" icon={<ListTodo className="size-[18px]" />} />
        <Stat label="En retard" value={stats.late} tone="#DC2626" icon={<AlertTriangle className="size-[18px]" />} />
        <Stat label="Aujourd'hui" value={stats.today} tone="#6B55D6" icon={<CalendarDays className="size-[18px]" />} />
        <Stat label="Faits ces 7 jours" value={stats.doneWeek} tone="#2563EB" icon={<CheckCircle2 className="size-[18px]" />} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Affichage" className="inline-flex rounded-xl bg-surface-sunken p-1">
          {([
            ["tableau", "Tableau", KanbanSquare],
            ["agenda", "Agenda", CalendarDays],
            ["liste", "Liste", ListTodo],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold", view === key ? "bg-surface-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary")}>
              <Icon className="size-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setKindFilter(null)} className={cn("h-8 rounded-full px-3 text-[12.5px] font-semibold", kindFilter === null ? "bg-text-primary text-white" : "bg-surface-card text-text-secondary ring-1 ring-border-subtle")}>
            Tout
          </button>
          {CARNET_KINDS.map((kind) => (
            <button key={kind.key} type="button" onClick={() => setKindFilter(kindFilter === kind.key ? null : kind.key)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold", kindFilter === kind.key ? "text-white" : "bg-surface-card text-text-secondary ring-1 ring-border-subtle")} style={kindFilter === kind.key ? { background: kind.tone } : undefined}>
              {kindFilter !== kind.key && <KindDot kind={kind.key} />}
              {kind.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-full sm:w-64">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chercher…" leadingIcon={<Search className="size-4" />} aria-label="Chercher dans le carnet" />
        </div>
      </div>

      {view === "tableau" && (
        <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
          {/* Ma journée : ce qui est en retard, puis aujourd'hui dans l'ordre des heures. */}
          <aside className="space-y-3">
            {groups.late.length > 0 && (
              <div className="rounded-2xl border border-danger-200 bg-danger-50/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-danger-700">
                  <AlertTriangle className="size-4" aria-hidden="true" /> En retard · {groups.late.length}
                </p>
                <div className="space-y-2">
                  {groups.late.map((item) => (
                    <NoteCard key={item.id} item={item} today={today} onOpen={() => setOpenId(item.id)} onToggle={() => toggle(item)} />
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-border-subtle bg-surface-card p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-text-primary">
                <CalendarDays className="size-4 text-brand-600" aria-hidden="true" /> Aujourd&apos;hui · {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${today}T12:00:00Z`))}
              </p>
              {groups.today.length === 0 ? (
                <p className="rounded-xl bg-surface-sunken px-3 py-4 text-center text-[12.5px] text-text-secondary">Rien de prévu aujourd&apos;hui.</p>
              ) : (
                <ol className="relative space-y-2 border-l-2 border-brand-100 pl-3">
                  {groups.today.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute top-3 -left-[19px] size-2.5 rounded-full border-2 border-white" style={{ background: kindOf(item.kind).tone }} aria-hidden="true" />
                      <NoteCard item={item} today={today} onOpen={() => setOpenId(item.id)} onToggle={() => toggle(item)} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>

          {/* Le tableau : glisser une carte d'une colonne à l'autre. */}
          <div className="grid gap-3 md:grid-cols-3">
            {CARNET_STATUSES.map((status) => {
              const column = visible.filter((item) => item.status === status.key).sort(status.key === "FAIT" ? (a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "") : compareItems);
              return (
                <div
                  key={status.key}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(status.key);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(null);
                    const id = event.dataTransfer.getData("text/carnet");
                    const item = items.find((entry) => entry.id === id);
                    if (item && item.status !== status.key) update(id, { status: status.key });
                  }}
                  className={cn("flex min-h-[260px] flex-col rounded-2xl border p-2.5 transition-colors", dragOver === status.key ? "border-brand-400 bg-brand-50/60" : "border-border-subtle bg-surface-sunken/60")}
                >
                  <p className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-bold text-text-primary">
                    {status.label}
                    <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] text-text-secondary tabular-nums">{column.length}</span>
                  </p>
                  <div className="flex flex-1 flex-col gap-2">
                    {column.slice(0, status.key === "FAIT" ? 30 : 200).map((item) => (
                      <NoteCard key={item.id} item={item} today={today} draggable onOpen={() => setOpenId(item.id)} onToggle={() => toggle(item)} />
                    ))}
                    {column.length === 0 && <p className="rounded-xl border border-dashed border-border-default px-3 py-6 text-center text-[12px] text-text-tertiary">Glissez une carte ici</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "agenda" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((day) => {
            const ofDay = visible.filter((item) => item.due === day).sort(compareItems);
            return (
              <div key={day} className={cn("rounded-2xl border p-3", day === today ? "border-brand-300 bg-brand-50/40" : "border-border-subtle bg-surface-card")}>
                <p className="mb-2 text-[13px] font-bold text-text-primary first-letter:uppercase">{dayLabel(day, today)}</p>
                {ofDay.length === 0 ? <p className="text-[12px] text-text-tertiary">Rien de prévu.</p> : (
                  <div className="space-y-2">
                    {ofDay.map((item) => (
                      <NoteCard key={item.id} item={item} today={today} onOpen={() => setOpenId(item.id)} onToggle={() => toggle(item)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "liste" && (
        <div className="space-y-4">
          {([
            ["En retard", groups.late],
            ["Aujourd'hui", groups.today],
            ["Les 7 prochains jours", groups.week],
            ["Plus tard", groups.later],
            ["Sans date", groups.undated],
            ["Fait", visible.filter((item) => item.status === "FAIT").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")).slice(0, 50)],
          ] as const).map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label}>
                <p className="mb-2 text-[13px] font-bold text-text-primary">
                  {label} <span className="font-normal text-text-tertiary">· {list.length}</span>
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {list.map((item) => (
                    <NoteCard key={item.id} item={item} today={today} onOpen={() => setOpenId(item.id)} onToggle={() => toggle(item)} />
                  ))}
                </div>
              </div>
            ),
          )}
          {visible.length === 0 && <p className="rounded-2xl border border-dashed border-border-default px-4 py-10 text-center text-[13px] text-text-secondary">Le carnet est vide : notez la première chose à faire en haut.</p>}
        </div>
      )}

      {opened && (
        <NoteEditor
          key={opened.id}
          item={opened}
          today={today}
          pending={pending}
          onClose={() => setOpenId(null)}
          onSave={(patch) => {
            update(opened.id, patch);
            setOpenId(null);
          }}
          onDelete={() => {
            run(() => removeCarnetItemAction({ id: opened.id }));
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

/** La fiche d'une note : tout se modifie, avec une petite liste à cocher. */
function NoteEditor({ item, today, pending, onClose, onSave, onDelete }: { item: CarnetItem; today: string; pending: boolean; onClose: () => void; onSave: (patch: Partial<CarnetItem>) => void; onDelete: () => void }) {
  const [form, setForm] = useState(item);
  const [newCheck, setNewCheck] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<CarnetItem>) => setForm((current) => ({ ...current, ...patch }));
  const addCheck = () => {
    const text = newCheck.trim();
    if (!text) return;
    set({ checklist: [...form.checklist, { id: Math.random().toString(36).slice(2, 10), text, done: false }] });
    setNewCheck("");
  };
  return (
    <Modal open onClose={onClose} title={kindOf(form.kind).label} description={`Notée le ${dayLabel(item.createdAt.slice(0, 10), today).toLowerCase()}${item.createdBy ? ` par ${item.createdBy}` : ""}`} size="lg">
      <div className="space-y-4">
        <input value={form.title} onChange={(event) => set({ title: event.target.value })} maxLength={160} aria-label="Titre" className="w-full rounded-xl border border-border-default bg-surface-page px-3 py-2.5 text-[16px] font-semibold text-text-primary outline-none focus:border-brand-500" />
        <div className="flex flex-wrap gap-1.5">
          {CARNET_KINDS.map((kind) => (
            <button key={kind.key} type="button" onClick={() => set({ kind: kind.key })} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold", form.kind === kind.key ? "text-white" : "border-border-subtle text-text-secondary")} style={form.kind === kind.key ? { background: kind.tone, borderColor: kind.tone } : undefined}>
              {kind.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-semibold text-text-secondary">Où en est-on ?</p>
            <div className="inline-flex rounded-xl bg-surface-sunken p-1">
              {CARNET_STATUSES.map((status) => (
                <button key={status.key} type="button" onClick={() => set({ status: status.key })} className={cn("h-8 rounded-lg px-3 text-[12.5px] font-semibold", form.status === status.key ? "bg-surface-card text-text-primary shadow-sm" : "text-text-secondary")}>
                  {status.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-text-secondary">Priorité</p>
            <div className="inline-flex rounded-xl bg-surface-sunken p-1">
              {CARNET_PRIORITIES.map((priority) => (
                <button key={priority.key} type="button" onClick={() => set({ priority: priority.key })} className={cn("h-8 rounded-lg px-3 text-[12.5px] font-semibold", form.priority === priority.key ? (priority.key === "HAUTE" ? "bg-danger-600 text-white" : "bg-surface-card text-text-primary shadow-sm") : "text-text-secondary")}>
                  {priority.label}
                </button>
              ))}
            </div>
          </div>
          <label className="text-[12px] font-semibold text-text-secondary">
            Jour
            <input type="date" value={form.due ?? ""} onChange={(event) => set({ due: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-border-default bg-surface-page px-3 text-[13.5px] text-text-primary" />
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Heure
            <input type="time" value={form.time ?? ""} onChange={(event) => set({ time: event.target.value || null })} className="mt-1 h-10 w-full rounded-xl border border-border-default bg-surface-page px-3 text-[13.5px] text-text-primary" />
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Où, avec qui
            <input value={form.place} onChange={(event) => set({ place: event.target.value })} maxLength={120} placeholder="Pharmacie des Halles, visio NHCO…" className="mt-1 h-10 w-full rounded-xl border border-border-default bg-surface-page px-3 text-[13.5px] text-text-primary" />
          </label>
          <label className="text-[12px] font-semibold text-text-secondary">
            Rubrique
            <select value={form.category} onChange={(event) => set({ category: event.target.value })} className="mt-1 h-10 w-full rounded-xl border border-border-default bg-surface-page px-3 text-[13.5px] text-text-primary">
              {CARNET_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <p className="mb-1 text-[12px] font-semibold text-text-secondary">Notes</p>
          <Textarea value={form.notes} onChange={(event) => set({ notes: event.target.value })} maxLength={4000} rows={4} placeholder="Ce qu'il faut savoir, ce qui a été dit, les prochaines étapes…" />
        </div>
        <div>
          <p className="mb-1 text-[12px] font-semibold text-text-secondary">Liste à cocher</p>
          <ul className="space-y-1">
            {form.checklist.map((check) => (
              <li key={check.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-sunken">
                <input type="checkbox" checked={check.done} onChange={() => set({ checklist: form.checklist.map((entry) => (entry.id === check.id ? { ...entry, done: !entry.done } : entry)) })} className="size-4 accent-brand-600" />
                <span className={cn("flex-1 text-[13.5px] text-text-primary", check.done && "text-text-tertiary line-through")}>{check.text}</span>
                <button type="button" onClick={() => set({ checklist: form.checklist.filter((entry) => entry.id !== check.id) })} aria-label="Retirer" className="text-text-tertiary hover:text-danger-600">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={newCheck}
              onChange={(event) => setNewCheck(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addCheck();
                }
              }}
              maxLength={160}
              placeholder="Ajouter une étape (Entrée)"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCheck}>
              Ajouter
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          {confirmDelete ? (
            <span className="flex items-center gap-2 text-[12.5px] text-text-secondary">
              Supprimer cette note ?
              <Button variant="danger" size="sm" disabled={pending} onClick={onDelete}>Supprimer</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Annuler</Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} leadingIcon={<Trash2 className="size-4" />}>Supprimer</Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Fermer</Button>
            <Button
              disabled={pending || !form.title.trim()}
              onClick={() =>
                onSave({ title: form.title.trim(), kind: form.kind, status: form.status, priority: form.priority, category: form.category, due: form.due, time: form.time || null, place: form.place.trim(), notes: form.notes, checklist: form.checklist })
              }
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
