/**
 * La file des bips du poste de caisse.
 *
 * Chaque bip de la douchette est mis en file puis envoyé à PharmaBoost, dans
 * l'ordre ; un bip qui n'a pas pu partir (coupure Internet) reste en tête et
 * repart au tour suivant. Le serveur n'a pas d'idempotence : une boîte envoyée
 * deux fois ferait « 2 × DOLIPRANE » à l'écran et baisserait le stock deux fois.
 *
 * La vidange est donc MONOFIL : une seule à la fois. Un bip lu pendant qu'un
 * envoi est en vol, ou le tour de la boucle principale qui tombe pendant cet
 * envoi, rejoint la vidange en cours au lieu d'en lancer une seconde qui
 * relirait la même tête de file.
 */
export type PendingScan = { code: string; scannedAt: string };

export type ScanQueue = {
  /** Met un bip en file. N'envoie rien : `flush` le fait. */
  push(scan: PendingScan): void;
  /** Vide la file, dans l'ordre. Rend la vidange déjà en cours, s'il y en a une. */
  flush(): Promise<void>;
  /** Combien de bips attendent encore (celui qui est en vol compris). */
  readonly size: number;
};

/**
 * `send` envoie UN bip et rejette si l'envoi a échoué : le bip reste alors en
 * tête de file (rien n'est perdu, rien n'est doublé), et la vidange suivante
 * le renverra. Un bip que le serveur a refusé pour de bon (code inconnu) doit
 * se terminer sans rejeter : `send` l'a consommé.
 */
export function createScanQueue(send: (scan: PendingScan) => Promise<void>): ScanQueue {
  const pending: PendingScan[] = [];
  let flushing: Promise<void> | null = null;

  async function drain(): Promise<void> {
    while (pending.length > 0) {
      await send(pending[0]!);
      pending.shift();
    }
  }

  return {
    push(scan) {
      pending.push(scan);
    },
    flush() {
      flushing ??= drain().finally(() => {
        flushing = null;
      });
      return flushing;
    },
    get size() {
      return pending.length;
    },
  };
}
