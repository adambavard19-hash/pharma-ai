"use client";

import { useState, useTransition } from "react";
import { Check, Star } from "lucide-react";
import { Robot } from "@/components/robot";
import { submitPatientReviewAction } from "@/server/actions/patient-reviews";
import { APP_STORE_REVIEW_URL, GOOGLE_REVIEW_URL, REVIEW_TAGS, TESTIMONIAL_MIN_RATING } from "@/core/patient-app/reviews";
import { ACCENT, Card, GRAD, SectionTitle } from "../_components/ui";

type InAppReview = { requestReview?: () => Promise<void> };
type CapacitorGlobal = { isNativePlatform?: () => boolean; Plugins?: { InAppReview?: InAppReview } };

/** La fenêtre officielle d'Apple « Vous aimez PharmaBoost ? » : c'est iOS qui décide de l'afficher (quelques fois par an au plus). */
function askAppleRating(): boolean {
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const plugin = capacitor?.isNativePlatform?.() ? capacitor.Plugins?.InAppReview : undefined;
  if (!plugin?.requestReview) return false;
  plugin.requestReview().catch(() => undefined);
  return true;
}

export function ReviewForm({ pharmacyName, team }: { pharmacyName: string; team: { userId: string; firstName: string }[] }) {
  const [rating, setRating] = useState(0);
  const [staff, setStaff] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const toggle = (key: string) => setTags((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const staffName = team.find((member) => member.userId === staff)?.firstName ?? null;

  const send = () =>
    start(async () => {
      setError(null);
      const result = await submitPatientReviewAction({ rating, tags, staffUserId: staff, publicConsent: consent, publicName: name });
      if (!result.ok) return setError(result.error);
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      // La même invitation pour tous, quelle que soit la note : on ne trie jamais les avis.
      setTimeout(askAppleRating, 900);
    });

  if (done) {
    return (
      <div data-app-avis-merci="">
        <Card className="mt-5 text-center">
          <div className="flex justify-center"><Robot size={84} mood="happy" label="Le robot PharmaBoost" /></div>
          <p className="mt-3 text-[18px] font-extrabold">Merci pour votre avis !</p>
          <p className="mt-1 text-[14px] leading-6 text-[#4B6A62]">{staffName ? `${staffName} et l'équipe de ${pharmacyName} vont le recevoir.` : `L'équipe de ${pharmacyName} va le recevoir.`}</p>
        </Card>
        <SectionTitle>Et l&apos;appli PharmaBoost ?</SectionTitle>
        <Card>
          <p className="text-[14.5px] leading-6 text-[#0F2F2A]">Votre note aide d&apos;autres patients à découvrir PharmaBoost. C&apos;est vous qui la publiez, en quelques secondes.</p>
          <a href={APP_STORE_REVIEW_URL} className="mt-3 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-bold text-white" style={{ background: GRAD }}>
            <Star className="size-5" aria-hidden="true" /> Noter PharmaBoost sur l&apos;App Store
          </a>
          {GOOGLE_REVIEW_URL && (
            <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noreferrer" className="mt-2.5 flex h-12 items-center justify-center gap-2 rounded-full border border-[#DCE8E4] bg-white text-[15px] font-bold text-[#0F2F2A]">
              Laisser un avis sur Google
            </a>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div data-app-avis="">
      <Card className="mt-5 text-center">
        <p className="text-[15px] font-bold">Comment s&apos;est passé votre passage ?</p>
        <div className="mt-3 flex justify-center gap-1.5" role="radiogroup" aria-label="Votre note">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1">
              <Star className="size-10 transition-transform active:scale-90" strokeWidth={1.6} style={{ color: n <= rating ? "#F5A524" : "#C9D6D2", fill: n <= rating ? "#F5A524" : "transparent" }} aria-hidden="true" />
            </button>
          ))}
        </div>
      </Card>

      {team.length > 0 && (
        <>
          <SectionTitle>Qui vous a servi ?</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {team.map((member) => (
              <Chip key={member.userId} on={staff === member.userId} onClick={() => setStaff(staff === member.userId ? null : member.userId)}>{member.firstName}</Chip>
            ))}
            <Chip on={staff === null} onClick={() => setStaff(null)}>Je ne sais pas</Chip>
          </div>
        </>
      )}

      <SectionTitle>En quelques mots</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {REVIEW_TAGS.map((tag) => (
          <Chip key={tag.key} on={tags.includes(tag.key)} onClick={() => toggle(tag.key)} soft={!tag.positive}>{tag.label}</Chip>
        ))}
      </div>

      {rating >= TESTIMONIAL_MIN_RATING && (
        <Card className="mt-5">
          <label className="flex items-start gap-3 text-[13.5px] leading-5 text-[#0F2F2A]">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-5 accent-[#0E8A7B]" />
            <span>J&apos;accepte que PharmaBoost publie mon avis sur son site, avec mon prénom et la ville de ma pharmacie.</span>
          </label>
          {consent && <input value={name} onChange={(event) => setName(event.target.value)} maxLength={30} placeholder="Votre prénom (facultatif)" className="mt-3 h-11 w-full rounded-xl border border-[#DCE8E4] px-3 text-[15px]" />}
        </Card>
      )}

      {error && <p className="mt-4 text-[14px] font-semibold text-[#B42318]">{error}</p>}
      <button type="button" disabled={rating === 0 || pending} onClick={send} className="mt-5 h-12 w-full rounded-full text-[15px] font-bold text-white disabled:opacity-50" style={{ background: GRAD }}>
        {pending ? "Envoi…" : rating === 0 ? "Choisissez une note" : "Envoyer mon avis"}
      </button>
      <p className="mt-2.5 text-center text-[11.5px] leading-4 text-[#94A3A0]">Votre avis est transmis à votre pharmacie, sans votre e-mail. Aucune information sur votre santé n&apos;est demandée.</p>
    </div>
  );
}

function Chip({ on, onClick, soft = false, children }: { on: boolean; onClick: () => void; soft?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${on ? "text-white" : soft ? "bg-white text-[#7C918C]" : "bg-white text-[#0F2F2A]"} shadow-sm`} style={on ? { background: ACCENT } : undefined}>
      {on && <Check className="size-3.5" aria-hidden="true" />}
      {children}
    </button>
  );
}
