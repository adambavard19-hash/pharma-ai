using System;
using System.IO;

namespace PharmaBoost.Tray
{
    /// <summary>Le journal de l'icône : une ligne par fait, 512 Ko au plus, jamais d'exception.</summary>
    internal static class Journal
    {
        private const long MaxBytes = 512 * 1024;
        private static readonly object Gate = new object();

        public static void Write(string message)
        {
            try
            {
                lock (Gate)
                {
                    var file = new FileInfo(Paths.TrayLog);
                    if (file.Exists && file.Length > MaxBytes)
                    {
                        string old = Paths.TrayLog + ".1";
                        if (File.Exists(old)) File.Delete(old);
                        File.Move(Paths.TrayLog, old);
                    }
                    File.AppendAllText(Paths.TrayLog, DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine);
                }
            }
            catch (Exception)
            {
                // Le journal est une commodité.
            }
        }
    }
}
