/**
 * Générateur de QR code minimal (version 1 à 10, correction de niveau M).
 *
 * Implémenté en interne plutôt qu'importé : le besoin est limité — encoder une
 * URL — et cela évite une dépendance supplémentaire au chemin critique du
 * comptoir. Le rendu est un chemin SVG, donc net à l'impression.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function reedSolomon(data: number[], ecLength: number): number[] {
  const generator = generatorPoly(ecLength);
  const result = new Array<number>(ecLength).fill(0);

  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < generator.length - 1; i += 1) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  }
  return result;
}

/** Capacité en octets (mode octet, correction M) par version. */
const CAPACITY_M = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
/** Nombre de blocs de correction, correction M. */
const EC_BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
/** Octets de correction par bloc, correction M. */
const EC_BYTES_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];

const ALIGNMENT_POSITIONS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

export type QrMatrix = { size: number; modules: boolean[][] };

export function encodeQr(text: string): QrMatrix {
  const bytes = [...new TextEncoder().encode(text)];

  let version = 1;
  while (version <= 10 && bytes.length + 2 > CAPACITY_M[version]) version += 1;
  if (version > 10) throw new Error("Contenu trop long pour un QR code de version ≤ 10.");

  const size = 17 + version * 4;
  // --- Flux binaire : mode octet + longueur + données ---------------------
  const bits: number[] = [];
  const pushBits = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  pushBits(0b0100, 4);
  pushBits(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) pushBits(byte, 8);

  const dataCapacityBits = CAPACITY_M[version] * 8;
  pushBits(0, Math.min(4, dataCapacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    dataCodewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }

  const PAD = [0xec, 0x11];
  let padIndex = 0;
  while (dataCodewords.length < CAPACITY_M[version]) {
    dataCodewords.push(PAD[padIndex % 2]);
    padIndex += 1;
  }

  // --- Blocs et correction d'erreur ---------------------------------------
  const blockCount = EC_BLOCKS_M[version];
  const ecPerBlock = EC_BYTES_M[version];
  const shortBlockSize = Math.floor(dataCodewords.length / blockCount);
  const longBlockCount = dataCodewords.length % blockCount;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i += 1) {
    const length = shortBlockSize + (i >= blockCount - longBlockCount ? 1 : 0);
    const block = dataCodewords.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomon(block, ecPerBlock));
  }

  const interleaved: number[] = [];
  const maxDataLength = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i]);
  }

  // --- Placement dans la matrice -------------------------------------------
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  );

  const setFunction = (row: number, col: number, value: boolean) => {
    if (row >= 0 && row < size && col >= 0 && col < size) modules[row][col] = value;
  };

  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const isDark =
          r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFunction(row + r, col + c, isDark);
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    const isDark = i % 2 === 0;
    setFunction(6, i, isDark);
    setFunction(i, 6, isDark);
  }

  for (const row of ALIGNMENT_POSITIONS[version]) {
    for (const col of ALIGNMENT_POSITIONS[version]) {
      if ((row === 6 && col === 6) || (row === 6 && col === size - 7) || (row === size - 7 && col === 6)) {
        continue;
      }
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          setFunction(row + r, col + c, Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
        }
      }
    }
  }

  setFunction(size - 8, 8, true); // module toujours sombre

  // Réservation des zones d'information de format.
  for (let i = 0; i < 9; i += 1) {
    if (modules[8][i] === null) modules[8][i] = false;
    if (modules[i][8] === null) modules[i][8] = false;
  }
  for (let i = size - 8; i < size; i += 1) {
    if (modules[8][i] === null) modules[8][i] = false;
    if (modules[i][8] === null) modules[i][8] = false;
  }

  // Version ≥ 7 : blocs d'information de version (non requis ici, version ≤ 10
  // avec contenus courts reste en pratique sous la version 7 pour une URL).
  if (version >= 7) {
    const versionBits = computeVersionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((versionBits >> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = size - 11 + (i % 3);
      modules[row][col] = bit;
      modules[col][row] = bit;
    }
  }

  // Parcours en zigzag des colonnes, de droite à gauche.
  let bitIndex = 0;
  const dataBits: number[] = [];
  for (const codeword of interleaved) {
    for (let i = 7; i >= 0; i -= 1) dataBits.push((codeword >> i) & 1);
  }

  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const currentCol = col - c;
        if (modules[row][currentCol] !== null) continue;
        const bit = bitIndex < dataBits.length ? dataBits[bitIndex] === 1 : false;
        bitIndex += 1;
        // Masque 0 : (row + col) % 2 === 0
        modules[row][currentCol] = (row + currentCol) % 2 === 0 ? !bit : bit;
      }
    }
    upward = !upward;
  }

  // Information de format : correction M (0b00) + masque 0.
  const formatBits = computeFormatBits(0b00, 0);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((formatBits >> i) & 1) === 1;
    if (i < 6) modules[8][i] = bit;
    else if (i < 8) modules[8][i + 1] = bit;
    else if (i === 8) modules[7][8] = bit;
    else modules[14 - i][8] = bit;

    if (i < 8) modules[size - 1 - i][8] = bit;
    else modules[8][size - 15 + i] = bit;
  }

  return {
    size,
    modules: modules.map((row) => row.map((cell) => cell === true)),
  };
}

function computeFormatBits(errorCorrection: number, mask: number): number {
  const data = (errorCorrection << 3) | mask;
  let value = data << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if ((value >> (10 + i)) & 1) value ^= 0b10100110111 << i;
  }
  return ((data << 10) | value) ^ 0b101010000010010;
}

function computeVersionBits(version: number): number {
  let value = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if ((value >> (12 + i)) & 1) value ^= 0b1111100100101 << i;
  }
  return (version << 12) | value;
}

/** Convertit une matrice en chemin SVG unique — un seul nœud à rendre. */
export function qrToSvgPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.modules[row][col]) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return parts.join("");
}
