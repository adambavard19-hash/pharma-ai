import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ROBOT_MOODS } from "@/core/robot/mascot";
import { RobotPlayground } from "./playground";

export const metadata: Metadata = { title: "Le robot, en aperçu", robots: { index: false, follow: false } };

/**
 * L'aperçu du robot, pour le développement seulement : chaque humeur, plusieurs tailles, le mode immobile. Introuvable
 * en production (404), jamais indexé.
 */
export default function RobotPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <RobotPlayground moods={[...ROBOT_MOODS]} />;
}
