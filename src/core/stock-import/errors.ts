/**
 * Un fichier qui n'est pas un fichier de stock : ni colonnes à reconnaître, ni
 * inventaire. Relire le même fichier n'y changera rien, contrairement à une
 * panne passagère (base, stockage) : le moteur des dépôts n'a pas à le garder.
 */
export class UnreadableFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableFileError";
  }
}
