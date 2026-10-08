import { FileText } from "lucide-react";
import { describeRobot, describeRobotFlows, describeTriggers, resolveRobotIntegration, type RobotSetup } from "@/core/robot/integration";
import { Badge } from "@/components/ui/badge";

/**
 * Le robot, côté assistance : les deux flux (le logiciel apporte le stock, le robot apportera la délivrance en
 * cours — pas les mêmes informations), ce qui déclenche les conseils aujourd'hui, et le diagnostic en lecture seule.
 * Aucun état « connecté » : rien n'est lu du robot.
 */
export function RobotDiagnostic({ robot, lgo, postsOnline }: { robot: RobotSetup | null; lgo: string | null; postsOnline: number }) {
  const integration = resolveRobotIntegration(robot?.manufacturer, lgo);
  const flows = describeRobotFlows(integration);
  const triggers = describeTriggers({ postsOnline, integration });
  return (
    <div className="space-y-3 text-[13.5px] leading-5">
      <p className="text-text-secondary">
        {robot ? <strong className="text-text-primary">{describeRobot(robot)}</strong> : "Aucun robot renseigné."} <Badge tone="info">{integration.label}</Badge> Rien n&apos;est lu du robot.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {flows.map((flow) => (
          <div key={flow.key} className="rounded-lg border border-border-subtle p-3">
            <p className="font-semibold text-text-primary">
              {flow.title} <span className="font-normal text-text-tertiary">· {flow.stageLabel}</span>
            </p>
            <p className="text-text-primary">{flow.carries}</p>
            <p className="text-text-secondary">{flow.via}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-text-secondary">
        {triggers.map((trigger) => (
          <li key={trigger.source}>
            <strong className="text-text-primary">{trigger.title}</strong> : {trigger.detail}
          </li>
        ))}
      </ul>
      <a href="/api/agent/fichiers/diagnostic-robot.cmd" className="inline-flex items-center gap-2 font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">
        <FileText className="size-4" aria-hidden="true" />
        Télécharger le diagnostic du robot (lecture seule)
      </a>
      <p className="text-text-secondary">À ouvrir sur l&apos;ordinateur du robot : il écrit un rapport sur le Bureau, n&apos;envoie rien et ne change aucun réglage.</p>
    </div>
  );
}
