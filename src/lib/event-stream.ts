/**
 * Lecture d'un flux d'événements serveur (`text/event-stream`) depuis le
 * navigateur, événement par événement.
 *
 * Utilisé partout où l'écran doit réagir à ce que le serveur vient de
 * commencer — lecture d'une ordonnance, analyse — plutôt qu'attendre une
 * réponse d'un bloc. Aucune temporisation, aucune étape simulée : chaque
 * événement reçu est une étape réelle.
 */
export async function readEventStream<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const line = chunk.split("\n").find((part) => part.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as T);
      separator = buffer.indexOf("\n\n");
    }
  }
}
