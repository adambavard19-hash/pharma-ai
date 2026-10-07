using System;
using System.IO;

namespace PharmaBoost.Tray
{
    /// <summary>
    /// Tout vit dans le dossier de l'installation (%LOCALAPPDATA%\PharmaBoost\Poste) :
    /// l'icône, le moteur Node.js, l'agent, sa configuration, son journal.
    /// </summary>
    internal static class Paths
    {
        public static readonly string Dir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
        public static string Node { get { return Path.Combine(Dir, "node", "node.exe"); } }
        public static string Agent { get { return Path.Combine(Dir, "pharmaboost-connect.js"); } }
        public static string Config { get { return Path.Combine(Dir, "pharmaboost-connect.json"); } }
        public static string Status { get { return Path.Combine(Dir, "pharmaboost-statut.json"); } }
        public static string AgentLog { get { return Path.Combine(Dir, "pharmaboost-connect.log"); } }
        public static string TrayLog { get { return Path.Combine(Dir, "pharmaboost-icone.log"); } }
        /// <summary>L'agent d'avant la dernière mise à jour, gardé pour revenir en arrière.</summary>
        public static string AgentPrevious { get { return Agent + ".previous"; } }
        /// <summary>Présent entre une mise à jour et la preuve que le nouvel agent tient (30 secondes sans s'arrêter).</summary>
        public static string UpdateMarker { get { return Path.Combine(Dir, "pharmaboost-maj.txt"); } }
        /// <summary>L'empreinte d'une version de l'agent qui n'a pas tenu : on ne la réinstalle pas.</summary>
        public static string RefusedVersion { get { return Path.Combine(Dir, "pharmaboost-refusee.txt"); } }
    }
}
