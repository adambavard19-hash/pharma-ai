/**
 * Réduction d'une photo dans le navigateur, avant envoi.
 *
 * Une photo de téléphone pèse 3 Mo pour 5 000 pixels de large ; le lecteur
 * n'en exploite pas plus que 2 000. Réduire ici, avant le transfert, divise
 * le poids envoyé par dix : sur la 4G d'une officine, c'est la différence
 * entre une seconde et dix. Le serveur réduit de nouveau si besoin — c'est
 * idempotent — et un fichier que le navigateur ne sait pas décoder part tel
 * quel : mieux vaut un envoi lourd qu'aucune lecture.
 */
export const UPLOAD_MAX_SIDE = 2000;

export async function downscaleForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    // `imageOrientation: from-image` applique l'orientation EXIF : une photo
    // prise en portrait ne part pas couchée.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob || blob.size === 0) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
