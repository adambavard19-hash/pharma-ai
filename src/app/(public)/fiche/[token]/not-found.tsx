import { LinkIcon } from "lucide-react";

export default function DocumentNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md space-y-3 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-surface-sunken text-text-tertiary">
          <LinkIcon className="size-5" />
        </span>
        <h1 className="text-[19px] font-semibold text-text-primary">
          Ce lien n&apos;est plus valide
        </h1>
        <p className="text-[13.5px] leading-6 text-text-secondary">
          La fiche a peut-être expiré ou été révoquée par votre pharmacie. Contactez votre
          officine pour en obtenir une nouvelle.
        </p>
      </div>
    </main>
  );
}
