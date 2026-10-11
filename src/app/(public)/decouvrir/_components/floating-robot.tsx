import { Robot, type RobotProps } from "@/components/robot";

/**
 * Le petit robot qui flotte à côté du nom (en-tête du site) et de « À côté de votre logiciel de gestion » (accueil) :
 * il monte et descend doucement, son ombre rétrécit quand il s'élève — c'est elle qui donne l'impression qu'il flotte.
 *
 * C'est désormais le robot partagé (`components/robot`) en mode flottant : il respire, cligne des yeux, regarde autour
 * de lui, rit quand on le touche. Le dessin et les couleurs restent ceux de la mascotte du poste et du logo.
 */
export function FloatingRobot({ className, ...props }: Omit<RobotProps, "floating">) {
  return <Robot floating interactive className={className} {...props} />;
}
