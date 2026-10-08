import { describe, expect, it } from "vitest";
import {
  ROBOT_CONNECTORS,
  ROBOT_MANUFACTURERS,
  describeRobot,
  describeRobotFlows,
  describeTriggers,
  readRobotSetup,
  resolveRobotIntegration,
  robotSetupSchema,
  type RobotConnector,
} from "../integration";

const valid = { manufacturer: "bd-rowa", model: "Vmax" };

describe("l'intégration robot n'invente rien", () => {
  it("aucun connecteur n'est inscrit : tout couple fabricant + logiciel est « en préparation »", () => {
    expect(ROBOT_CONNECTORS).toHaveLength(0);
    for (const maker of ROBOT_MANUFACTURERS) {
      for (const lgo of ["lgpi", "winpharma", "smart-rx", null]) {
        const integration = resolveRobotIntegration(maker.id, lgo);
        expect(integration.stage).toBe("PREPARING");
        expect(integration.label).toBe("Intégration en préparation");
        expect(integration.connector).toBeNull();
      }
    }
  });

  it("un connecteur inscrit ne vaut que pour ses logiciels", () => {
    const connector: RobotConnector = {
      id: "essai",
      manufacturer: "bd-rowa",
      lgos: ["lgpi"],
      stage: "TESTING",
      flows: {
        lgo: { carries: "stock", via: "fichier", stage: "AVAILABLE" },
        robot: { carries: "sorties", via: "journal", stage: "TESTING" },
      },
      settings: ["journalPath"],
    };
    expect(resolveRobotIntegration("bd-rowa", "lgpi", [connector]).stage).toBe("TESTING");
    expect(resolveRobotIntegration("bd-rowa", "winpharma", [connector]).stage).toBe("PREPARING");
    expect(resolveRobotIntegration("mach4", "lgpi", [connector]).stage).toBe("PREPARING");
  });

  it("ne promet jamais « disponible » sans connecteur", () => {
    const triggers = describeTriggers({ postsOnline: 1, integration: resolveRobotIntegration("bd-rowa", "lgpi") });
    expect(triggers.find((t) => t.source === "ROBOT")?.state).toBe("PREPARING");
    expect(triggers.find((t) => t.source === "SCAN")?.state).toBe("ACTIVE");
  });

  it("sans poste en ligne, même la douchette n'est pas annoncée active", () => {
    const triggers = describeTriggers({ postsOnline: 0, integration: resolveRobotIntegration(null, null) });
    expect(triggers.find((t) => t.source === "SCAN")?.state).toBe("INACTIVE");
  });
});

describe("deux flux distincts", () => {
  it("le logiciel apporte le stock, le robot la délivrance en cours — pas la même information", () => {
    const [lgo, robot] = describeRobotFlows(resolveRobotIntegration("bd-rowa", "lgpi"));
    expect(lgo.key).toBe("lgo");
    expect(robot.key).toBe("robot");
    expect(lgo.carries).not.toBe(robot.carries);
    expect(lgo.carries).toMatch(/stock/i);
    expect(robot.carries).toMatch(/délivrance/i);
    expect(lgo.stage).toBe("AVAILABLE");
    expect(robot.stage).toBe("PREPARING");
    expect(robot.stageLabel).toBe("Intégration en préparation");
  });
});

describe("la configuration gardée", () => {
  it("accepte un fabricant et un modèle, et normalise les champs vides", () => {
    const parsed = robotSetupSchema.parse({ ...valid, linkKind: "network", host: "", port: "", journalPath: "  " });
    expect(parsed).toEqual({ manufacturer: "bd-rowa", manufacturerOther: null, model: "Vmax", linkKind: "network", host: null, port: null, journalPath: null });
  });

  it("le lien « je ne sais pas » est la valeur par défaut", () => {
    expect(robotSetupSchema.parse(valid).linkKind).toBe("unknown");
  });

  it("REFUSE toute clé inconnue, d'abord un mot de passe ou un jeton", () => {
    expect(robotSetupSchema.safeParse({ ...valid, password: "secret" }).success).toBe(false);
    expect(robotSetupSchema.safeParse({ ...valid, apiKey: "abc" }).success).toBe(false);
    expect(robotSetupSchema.safeParse({ ...valid, token: "abc" }).success).toBe(false);
  });

  it("refuse un fabricant hors liste", () => {
    expect(robotSetupSchema.safeParse({ manufacturer: "inconnu" }).success).toBe(false);
    expect(robotSetupSchema.safeParse({}).success).toBe(false);
  });

  it("valide l'hôte : un nom de machine ou une adresse, jamais une adresse web ni un chemin", () => {
    for (const host of ["ROBOT-PC", "192.168.1.20", "serveur.pharmacie.local"]) {
      expect(robotSetupSchema.safeParse({ ...valid, host }).success, host).toBe(true);
    }
    for (const host of ["http://192.168.1.20", "192.168.1.20/admin", "mon robot", "a;b", "-x", "x-"]) {
      expect(robotSetupSchema.safeParse({ ...valid, host }).success, host).toBe(false);
    }
  });

  it("valide le port : un entier entre 1 et 65535, saisi en texte ou en nombre", () => {
    expect(robotSetupSchema.parse({ ...valid, port: "6050" }).port).toBe(6050);
    expect(robotSetupSchema.parse({ ...valid, port: 80 }).port).toBe(80);
    for (const port of ["0", "65536", "12.5", "abc", -1]) {
      expect(robotSetupSchema.safeParse({ ...valid, port }).success, String(port)).toBe(false);
    }
  });

  it("refuse les caractères de contrôle et les textes démesurés", () => {
    expect(robotSetupSchema.safeParse({ ...valid, model: "Vmax\u0000" }).success).toBe(false);
    expect(robotSetupSchema.safeParse({ ...valid, journalPath: "C:\\a\nb" }).success).toBe(false);
    expect(robotSetupSchema.safeParse({ ...valid, model: "x".repeat(61) }).success).toBe(false);
    expect(robotSetupSchema.safeParse({ ...valid, journalPath: "x".repeat(301) }).success).toBe(false);
  });

  it("relit sans lever d'erreur un contenu abîmé ou périmé", () => {
    expect(readRobotSetup(null)).toBeNull();
    expect(readRobotSetup("n'importe quoi")).toBeNull();
    expect(readRobotSetup({ manufacturer: "disparu" })).toBeNull();
    expect(readRobotSetup({ ...valid, password: "x" })).toBeNull();
    expect(readRobotSetup(valid)?.manufacturer).toBe("bd-rowa");
  });

  it("dit le robot comme le titulaire le connaît", () => {
    expect(describeRobot(null)).toBeNull();
    expect(describeRobot(robotSetupSchema.parse(valid))).toBe("BD Rowa Vmax");
    expect(describeRobot(robotSetupSchema.parse({ manufacturer: "autre", manufacturerOther: "Robotix", model: "R2" }))).toBe("Robotix R2");
    expect(describeRobot(robotSetupSchema.parse({ manufacturer: "autre" }))).toBe("Robot");
  });
});
