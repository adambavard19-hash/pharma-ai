using System;

namespace PharmaBoost.Setup
{
    internal static class Program
    {
        /// <summary>
        /// PharmaBoostPreparation.exe node &lt;version&gt; &lt;sha256&gt; &lt;node.exe de destination&gt; [adresse de base]
        /// L'adresse de base ne sert qu'aux essais (https://nodejs.org par défaut).
        /// </summary>
        private static int Main(string[] args)
        {
            if (args.Length < 4 || args[0] != "node")
            {
                Console.Error.WriteLine("usage: PharmaBoostPreparation node <version> <sha256> <destination> [base-url]");
                return NodeFetcher.BadArguments;
            }
            string baseUrl = args.Length > 4 ? args[4] : "https://nodejs.org";
            return NodeFetcher.Fetch(baseUrl, args[1], args[2], args[3], Environment.OSVersion.Platform == PlatformID.Win32NT, Console.Out);
        }
    }
}
