import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { encodeQr } from "../qrcode";

/**
 * Le QR code affiché au patient doit se lire avec un décodeur indépendant du
 * nôtre : c'est la seule preuve que le lien encodé est bien celui qu'un
 * téléphone ouvrira.
 */
function rasterize(text: string, scale = 8, quiet = 4): { data: Uint8ClampedArray; width: number } {
  const matrix = encodeQr(text);
  const width = (matrix.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (!matrix.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = ((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx;
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width };
}

describe("QR code du plan patient", () => {
  it("se décode avec un lecteur tiers et restitue exactement le lien sécurisé", () => {
    const url = "https://pharmacie-saint-michel.exemple.fr/fiche/JQpov7LhGyW__W_eR6i4jUKjg-0TA-sbhUBwOt-aG7Q";
    const { data, width } = rasterize(url);
    const decoded = jsQR(data, width, width);
    expect(decoded?.data).toBe(url);
  });

  it("encode aussi une adresse locale longue avec port", () => {
    const url = "http://192.168.1.43:3000/fiche/JQpov7LhGyW__W_eR6i4jUKjg-0TA-sbhUBwOt-aG7Q?imprimer=1";
    const { data, width } = rasterize(url);
    expect(jsQR(data, width, width)?.data).toBe(url);
  });
});
