/**
 * Reconnaître un passage de douchette dans un flux de touches.
 *
 * Une douchette « clavier » tape les chiffres du code-barres en rafale, en
 * quelques dizaines de millisecondes, puis Entrée. Un humain ne tape jamais
 * treize chiffres en moins d'une demi-seconde. C'est ce contraste qui sert de
 * critère : on ne garde que les rafales de chiffres, rapides et terminées par
 * Entrée (ou par un silence). Tout le reste est oublié aussitôt — jamais
 * journalisé, jamais envoyé.
 */

export type KeyEvent = { key: string; at: number };

export type ScanDetectorOptions = {
  /** Écart maximal entre deux touches d'une même rafale, en ms. */
  maxGapMs?: number;
  /** Longueur minimale d'un code retenu (un CIP7 fait 7 chiffres, un CIP13/EAN 13). */
  minLength?: number;
  maxLength?: number;
  /** Silence après lequel une rafale sans Entrée est close, en ms. */
  settleMs?: number;
};

const DEFAULTS: Required<ScanDetectorOptions> = { maxGapMs: 120, minLength: 7, maxLength: 80, settleMs: 250 };

export class ScanDetector {
  private buffer = "";
  private lastAt = 0;
  /** Dernière touche qui n'était pas un chiffre : une rafale qui la suit de trop près est une frappe humaine. */
  private lastOtherAt = -Infinity;
  private tainted = false;
  private readonly options: Required<ScanDetectorOptions>;

  constructor(private readonly onScan: (code: string, at: number) => void, options: ScanDetectorOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Une touche arrive. `key` vaut un caractère (« 3 »), « Enter », « Tab » ou autre chose. */
  feed(event: KeyEvent): void {
    const { maxGapMs, minLength } = this.options;
    if (this.buffer && event.at - this.lastAt > maxGapMs) {
      // Trop lent pour une douchette : ce qui précède était une frappe humaine.
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
    if (event.key === "Enter" || event.key === "Tab") {
      this.flushIfScan(event.at);
      this.buffer = "";
      return;
    }
    if (/^[0-9A-Za-z]$/.test(event.key)) {
      // Une rafale qui commence juste après une touche spéciale est une frappe humaine.
      if (!this.buffer) this.tainted = event.at - this.lastOtherAt < maxGapMs * 3;
      this.buffer += event.key.toUpperCase();
      this.lastAt = event.at;
      if (this.buffer.length > this.options.maxLength) this.buffer = "";
      return;
    }
    // Touche spéciale au milieu d'une rafale (le séparateur GS d'un Datamatrix
    // arrive parfois ainsi) : on l'ignore ; hors rafale, elle marque une frappe humaine.
    if (this.buffer && event.at - this.lastAt <= maxGapMs) {
      this.lastAt = event.at;
      return;
    }
    this.buffer = "";
    this.lastOtherAt = event.at;
    void minLength;
  }

  /** À appeler régulièrement : clôt une rafale restée sans Entrée. */
  tick(now: number): void {
    if (this.buffer && now - this.lastAt > this.options.settleMs) {
      this.flushIfScan(this.lastAt);
      this.buffer = "";
    }
  }

  private flushIfScan(at: number): void {
    if (!this.tainted && this.buffer.length >= this.options.minLength && this.buffer.length <= this.options.maxLength) this.onScan(this.buffer, at);
    this.tainted = false;
  }
}

/**
 * Un code-barres de boîte, ou rien.
 *   - EAN13 / CIP13 : treize chiffres, rien d'autre ;
 *   - CIP7 ou EAN8 : sept ou huit chiffres, rien d'autre ;
 *   - GS1 Datamatrix d'un médicament : « 01 » + GTIN-14, puis péremption
 *     (17…), lot (10…, lettres possibles), série (21…). On en extrait le
 *     CIP13. Certaines douchettes préfixent le symbole (« ]d2 », « ]C1 »).
 * Une chaîne de lettres et de chiffres qui n'a pas une de ces formes n'est
 * pas un code-barres : c'est une frappe humaine, on l'oublie.
 */
export function normalizeScannedCode(raw: string): string | null {
  const text = raw.replace(/^\](D2|C1|E0|Q3)/i, "").trim();
  if (/^\d{13}$/.test(text)) return text;
  if (/^\d{7,8}$/.test(text)) return text;
  const gs1 = /^01(\d{14})/.exec(text);
  if (gs1) {
    const gtin14 = gs1[1]!;
    return gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
  }
  return null;
}
