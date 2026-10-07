using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace PharmaBoost.Setup
{
    /// <summary>
    /// Met en place Node.js pour l'agent : télécharge l'archive officielle de la
    /// version ÉPINGLÉE, vérifie son empreinte SHA-256 (celle publiée dans
    /// SHASUMS256.txt de nodejs.org, recopiée dans node-version.json), n'en sort
    /// que node.exe, et s'assure qu'il démarre. Une archive dont l'empreinte
    /// diffère n'est jamais ouverte.
    ///
    /// Les messages écrits sur la sortie ne contiennent que de l'ASCII : la
    /// console Windows abîme les accents, l'installateur écrit les textes lui-même.
    /// </summary>
    public static class NodeFetcher
    {
        public const int Ok = 0;
        public const int DownloadFailed = 10;
        public const int ChecksumMismatch = 11;
        public const int ExtractFailed = 12;
        public const int BadArguments = 13;
        public const int NodeWontStart = 14;

        public static string ArchiveUrl(string baseUrl, string version)
        {
            return baseUrl.TrimEnd('/') + "/dist/" + version + "/node-" + version + "-win-x64.zip";
        }

        /// <param name="runCheck">Vrai sur Windows : node.exe --version doit répondre la version attendue.</param>
        public static int Fetch(string baseUrl, string version, string sha256, string destination, bool runCheck, TextWriter log)
        {
            if (string.IsNullOrWhiteSpace(version) || string.IsNullOrWhiteSpace(destination) || sha256 == null || sha256.Length != 64)
            {
                log.WriteLine("bad-arguments");
                return BadArguments;
            }

            EnableModernTls();
            string archive = Path.Combine(Path.GetTempPath(), "pharmaboost-node-" + Guid.NewGuid().ToString("N") + ".zip");
            try
            {
                string url = ArchiveUrl(baseUrl, version);
                if (!DownloadWithRetries(url, archive, log))
                {
                    return DownloadFailed;
                }

                string actual = Sha256OfFile(archive);
                if (!string.Equals(actual, sha256, StringComparison.OrdinalIgnoreCase))
                {
                    log.WriteLine("checksum-mismatch expected=" + sha256 + " actual=" + actual);
                    return ChecksumMismatch;
                }
                log.WriteLine("checksum-ok");

                if (!ExtractNode(archive, version, destination, log))
                {
                    return ExtractFailed;
                }

                if (runCheck && !NodeAnswers(destination, version, log))
                {
                    return NodeWontStart;
                }

                log.WriteLine("node-ready");
                return Ok;
            }
            finally
            {
                TryDelete(archive);
            }
        }

        private static void EnableModernTls()
        {
            // Windows 10 négocie déjà TLS 1.2 ; les vieilles configurations .NET 4.x non.
            // 12288 = TLS 1.3, ignoré si le système ne le connaît pas.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)12288; } catch (NotSupportedException) { }
        }

        private static bool DownloadWithRetries(string url, string target, TextWriter log)
        {
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                try
                {
                    Download(url, target, log);
                    return true;
                }
                catch (Exception error)
                {
                    log.WriteLine("download-failed attempt=" + attempt + " " + Ascii(error.Message));
                    TryDelete(target);
                    if (attempt < 3) Thread.Sleep(2000 * attempt);
                }
            }
            return false;
        }

        private static void Download(string url, string target, TextWriter log)
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.Timeout = 30000;
            request.ReadWriteTimeout = 30000;
            // Un proxy d'entreprise qui demande les identifiants Windows de la session.
            if (request.Proxy != null) request.Proxy.Credentials = CredentialCache.DefaultCredentials;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var input = response.GetResponseStream())
            using (var output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                long total = response.ContentLength;
                long received = 0;
                int lastPercent = -1;
                var buffer = new byte[81920];
                int read;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    output.Write(buffer, 0, read);
                    received += read;
                    if (total > 0)
                    {
                        int percent = (int)(received * 100 / total);
                        if (percent / 5 != lastPercent / 5)
                        {
                            lastPercent = percent;
                            log.WriteLine("download " + percent + "%");
                        }
                    }
                }
                if (total > 0 && received != total) throw new IOException("incomplete download");
            }
        }

        private static string Sha256OfFile(string path)
        {
            using (var stream = File.OpenRead(path))
            using (var sha = SHA256.Create())
            {
                return ToHex(sha.ComputeHash(stream));
            }
        }

        private static bool ExtractNode(string archive, string version, string destination, TextWriter log)
        {
            string wanted = "node-" + version + "-win-x64/node.exe";
            string temporary = destination + ".part";
            try
            {
                string folder = Path.GetDirectoryName(Path.GetFullPath(destination));
                Directory.CreateDirectory(folder);
                using (var zip = ZipFile.OpenRead(archive))
                {
                    ZipArchiveEntry entry = null;
                    foreach (var candidate in zip.Entries)
                    {
                        if (string.Equals(candidate.FullName, wanted, StringComparison.OrdinalIgnoreCase)) { entry = candidate; break; }
                    }
                    if (entry == null)
                    {
                        log.WriteLine("node.exe-not-in-archive");
                        return false;
                    }
                    using (var input = entry.Open())
                    using (var output = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
                    {
                        input.CopyTo(output);
                    }
                }
                if (File.Exists(destination)) File.Delete(destination);
                File.Move(temporary, destination);
                return true;
            }
            catch (Exception error)
            {
                log.WriteLine("extract-failed " + Ascii(error.Message));
                TryDelete(temporary);
                return false;
            }
        }

        /// <summary>Un antivirus peut retirer node.exe à la seconde où il apparaît : on le vérifie en le lançant.</summary>
        private static bool NodeAnswers(string node, string version, TextWriter log)
        {
            try
            {
                var info = new ProcessStartInfo(node, "--version")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                };
                using (var process = Process.Start(info))
                {
                    if (!process.WaitForExit(20000))
                    {
                        try { process.Kill(); } catch (InvalidOperationException) { }
                        log.WriteLine("node-timeout");
                        return false;
                    }
                    string said = process.StandardOutput.ReadToEnd().Trim();
                    if (said != version)
                    {
                        log.WriteLine("node-version-mismatch said=" + Ascii(said));
                        return false;
                    }
                    return true;
                }
            }
            catch (Exception error)
            {
                log.WriteLine("node-wont-start " + Ascii(error.Message));
                return false;
            }
        }

        private static string ToHex(byte[] bytes)
        {
            var text = new StringBuilder(bytes.Length * 2);
            foreach (byte b in bytes) text.Append(b.ToString("x2"));
            return text.ToString();
        }

        private static string Ascii(string value)
        {
            var text = new StringBuilder();
            foreach (char c in value ?? "")
            {
                text.Append(c >= 32 && c < 127 ? c : '?');
            }
            return text.ToString();
        }

        private static void TryDelete(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
        }
    }
}
