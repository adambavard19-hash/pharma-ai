/**
 * La fiche complète d'un conseil vit dans `src/core/counter/advice-sheet.ts` : la page de vente ET la carte déployée de
 * la bannière du comptoir la lisent par la même fonction (une seule source de vérité, jamais deux textes).
 */
export {
  buildAdviceSheet,
  counterSheetOf,
  SHEET_MISSING,
  SHEET_PATIENT_LABELS,
  SHEET_SOURCES,
  sortForPatient,
  type AdviceSheetInput,
  type AdviceSheetView,
  type SheetLine,
  type SheetPatient,
} from "@/core/counter/advice-sheet";
