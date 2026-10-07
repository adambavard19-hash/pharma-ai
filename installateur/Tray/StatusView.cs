using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;

namespace PharmaBoost.Tray
{
    /// <summary>Ce que l'icône montre : une couleur et une phrase.</summary>
    internal sealed class StatusView
    {
        public static readonly Color Green = Color.FromArgb(22, 163, 74);
        public static readonly Color Orange = Color.FromArgb(245, 158, 11);
        public static readonly Color Red = Color.FromArgb(220, 38, 38);
        public static readonly Color Grey = Color.FromArgb(156, 163, 175);

        public Color Dot;
        public string Text;

        /// <summary>Un état écrit par l'agent depuis plus de quatre minutes n'est plus un état : l'agent ne tourne plus.</summary>
        private static readonly TimeSpan Stale = TimeSpan.FromMinutes(4);

        public static StatusView Compute(bool paired, bool engineExists, bool agentRunning, DateTime agentStartedUtc, DateTime nowUtc, Dictionary<string, object> status)
        {
            if (!paired) return new StatusView { Dot = Red, Text = "Poste non relié : relancez l'installation avec un nouveau lien" };
            if (!engineExists) return new StatusView { Dot = Red, Text = "Moteur introuvable : relancez l'installateur PharmaBoost" };
            if (!agentRunning) return new StatusView { Dot = Orange, Text = "Relance en cours…" };
            if (status == null)
            {
                bool starting = nowUtc - agentStartedUtc < TimeSpan.FromSeconds(90);
                return new StatusView { Dot = starting ? Grey : Orange, Text = starting ? "Démarrage…" : "En attente de l'agent…" };
            }

            DateTime at;
            string written = Settings.Text(status, "at");
            if (written == null || !DateTime.TryParse(written, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out at) || nowUtc - at > Stale)
            {
                return new StatusView { Dot = Orange, Text = "Pas de nouvelles du poste" };
            }

            switch (Settings.Text(status, "etat"))
            {
                case "ok":
                    string notice = Settings.Text(status, "notice");
                    return notice == null
                        ? new StatusView { Dot = Green, Text = "Relié à PharmaBoost" }
                        : new StatusView { Dot = Orange, Text = "À vérifier : " + notice };
                case "revoque":
                    return new StatusView { Dot = Red, Text = "Poste retiré dans PharmaBoost : réinstallez avec un nouveau lien" };
                default:
                    return new StatusView { Dot = Orange, Text = "Hors ligne : PharmaBoost est injoignable" };
            }
        }
    }
}
