/**
 * La validation d'une vente dans LGPI, lue en DEUX signaux (vente sur ordonnance coupée en cinq sur POSTE3, 16 oct. 2026 :
 * la ligne du journal revient aussi pendant la saisie d'une ordonnance) :
 *  1. la ligne « … lignes de vente par type de facturation - ok » du journal de LGPI (robot-lgpi.ts, isSaleValidatedLine) ;
 *  2. l'écran de facturation de LGPI qui se ferme (le titre de sa fenêtre perd « (Facturation », lu par le crochet de la
 *     douchette, douchette.ts).
 * Il faut les deux, dans l'ordre (ligne puis fermeture, dans la minute) ou presque à rebours (fermeture lue juste avant la
 * ligne, le journal n'étant relu que chaque seconde). Un seul des deux ne termine rien. Sans titre lisible : jamais.
 */
export const VALIDATION_CONFIRM_MS = 60_000;
export const BILLING_CLOSED_GRACE_MS = 10_000;

export class SaleValidationWatch {
  private lastLine = -Infinity;
  private lastClose = -Infinity;
  private billing: boolean | null = null;

  constructor(private readonly onValidated: () => void) {}

  /** La ligne de validation est lue dans le journal. */
  line(at: number): void {
    this.lastLine = at;
    if (this.billing === false && at - this.lastClose <= BILLING_CLOSED_GRACE_MS) this.confirm();
  }

  /** L'écran de facturation : ouvert (vrai), fermé (faux), introuvable (null). */
  billingState(open: boolean | null, at: number): void {
    const wasOpen = this.billing === true;
    this.billing = open;
    if (!wasOpen || open !== false) return;
    this.lastClose = at;
    if (at - this.lastLine <= VALIDATION_CONFIRM_MS) this.confirm();
  }

  private confirm(): void {
    this.lastLine = -Infinity;
    this.lastClose = -Infinity;
    this.onValidated();
  }
}
