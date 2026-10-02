import { Badge } from "@/components/ui/badge";
import { CONNECTOR_CAPABILITIES, CONNECTOR_CAPABILITY_LABELS, MODE_CAPABILITIES, type ConnectorCapability } from "@/core/partners/connector";
import type { IntegrationMode } from "@/core/partners/status";

const isCapability = (value: string): value is ConnectorCapability => (CONNECTOR_CAPABILITIES as readonly string[]).includes(value);

/** Ce que le mode sait faire aujourd'hui, en une phrase. */
export function modeTodayLine(mode: IntegrationMode): string {
  const today = MODE_CAPABILITIES[mode].capabilities;
  if (today.length === 0) return "Rien pour l'instant : en attente de l'API du partenaire.";
  return today.map((capability) => CONNECTOR_CAPABILITY_LABELS[capability]).join(", ") + ".";
}

/**
 * Les capacités annoncées par le partenaire, confrontées à ce que son mode
 * d'intégration fait réellement aujourd'hui. Une capacité annoncée que le
 * mode ne couvre pas reste « en attente de l'API du partenaire » : rien
 * n'est simulé.
 */
export function CapabilityComparison({ mode, declared, isActive }: { mode: IntegrationMode; declared: string[]; isActive: boolean }) {
  const today = MODE_CAPABILITIES[mode].capabilities;
  const known = declared.filter(isCapability);
  return (
    <div className="space-y-1.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-text-tertiary">Annoncées :</span>
        {known.length === 0 ? (
          <span className="text-text-secondary">aucune</span>
        ) : (
          known.map((capability) => {
            const works = today.includes(capability);
            return (
              <Badge key={capability} tone={works && isActive ? "success" : works ? "neutral" : "warning"} title={works ? (isActive ? "Assurée par ce mode aujourd'hui" : "Assurée par ce mode, mais l'intégration est inactive") : "En attente de l'API du partenaire"}>
                {CONNECTOR_CAPABILITY_LABELS[capability]}
                {works ? "" : " · en attente de l'API"}
              </Badge>
            );
          })
        )}
      </div>
      <p className="text-text-secondary">
        <span className="text-text-tertiary">Ce mode assure aujourd&apos;hui : </span>
        {modeTodayLine(mode)}
      </p>
    </div>
  );
}
