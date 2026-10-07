using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;

namespace PharmaBoost.Tray
{
    /// <summary>
    /// Met l'agent à jour sans personne : PharmaBoost publie l'empreinte SHA-256 de
    /// la version courante (/api/agent/version) ; si elle diffère de celle du poste,
    /// l'icône télécharge le fichier, vérifie que son empreinte est bien celle
    /// annoncée, et seulement alors le remplace. Une version qui n'a pas tenu
    /// (voir AgentSupervisor.CrashLoop) est mise de côté et jamais réinstallée.
    /// Seul l'agent est concerné : cette icône et node.exe ne changent que par
    /// une nouvelle installation.
    /// </summary>
    internal static class Updater
    {
        /// <summary>Rend le nouvel agent et son empreinte, ou null s'il n'y a rien à faire ou rien de sûr à faire.</summary>
        public static byte[] FetchIfNewer(string serverUrl, out string sha256)
        {
            sha256 = null;
            if (!IsTrustedServer(serverUrl)) return null;
            var meta = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(GetText(serverUrl + "/api/agent/version"));
            string wanted = Settings.Text(meta, "sha256");
            if (wanted == null || wanted.Length != 64) return null;
            wanted = wanted.ToLowerInvariant();

            string current = File.Exists(Paths.Agent) ? Sha256(File.ReadAllBytes(Paths.Agent)) : null;
            if (current == wanted) return null;
            if (File.Exists(Paths.RefusedVersion) && File.ReadAllText(Paths.RefusedVersion).Trim() == wanted) return null;

            byte[] data = GetBytes(serverUrl + "/api/agent/fichiers/pharmaboost-connect.js");
            if (Sha256(data) != wanted)
            {
                Journal.Write("mise à jour ignorée : l'empreinte du fichier reçu n'est pas celle annoncée");
                return null;
            }
            sha256 = wanted;
            return data;
        }

        /// <summary>Remplace l'agent en gardant l'ancien. À appeler quand l'agent est arrêté.</summary>
        public static void Apply(byte[] data, string sha256)
        {
            string staged = Paths.Agent + ".new";
            File.WriteAllBytes(staged, data);
            if (File.Exists(Paths.Agent)) File.Copy(Paths.Agent, Paths.AgentPrevious, true);
            File.Copy(staged, Paths.Agent, true);
            File.Delete(staged);
            File.WriteAllText(Paths.UpdateMarker, sha256);
            Journal.Write("agent mis à jour (" + sha256.Substring(0, 12) + ")");
        }

        /// <summary>Le nouvel agent s'est arrêté trois fois de suite : retour à l'ancien, et on ne réessaie pas cette version.</summary>
        public static bool Rollback()
        {
            if (!File.Exists(Paths.UpdateMarker) || !File.Exists(Paths.AgentPrevious)) return false;
            try
            {
                File.WriteAllText(Paths.RefusedVersion, File.ReadAllText(Paths.UpdateMarker).Trim());
                File.Copy(Paths.AgentPrevious, Paths.Agent, true);
                File.Delete(Paths.UpdateMarker);
                Journal.Write("retour à l'agent précédent : la dernière mise à jour ne tenait pas");
                return true;
            }
            catch (Exception error)
            {
                Journal.Write("retour arrière impossible : " + error.Message);
                return false;
            }
        }

        /// <summary>La mise à jour a tenu : on n'a plus besoin de pouvoir revenir en arrière.</summary>
        public static void Confirm()
        {
            try { if (File.Exists(Paths.UpdateMarker)) File.Delete(Paths.UpdateMarker); } catch (IOException) { }
        }

        /// <summary>Jamais de code téléchargé depuis un serveur en clair : https, ou le poste de développement.</summary>
        private static bool IsTrustedServer(string url)
        {
            Uri uri;
            if (!Uri.TryCreate(url, UriKind.Absolute, out uri)) return false;
            return uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback);
        }

        private static string Sha256(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                var hash = sha.ComputeHash(data);
                var text = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) text.Append(b.ToString("x2"));
                return text.ToString();
            }
        }

        private static string GetText(string url)
        {
            return Encoding.UTF8.GetString(GetBytes(url));
        }

        private static byte[] GetBytes(string url)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 30000;
            request.ReadWriteTimeout = 30000;
            if (request.Proxy != null) request.Proxy.Credentials = CredentialCache.DefaultCredentials;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var stream = response.GetResponseStream())
            using (var memory = new MemoryStream())
            {
                stream.CopyTo(memory);
                return memory.ToArray();
            }
        }
    }
}
