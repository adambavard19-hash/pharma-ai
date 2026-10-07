using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Web.Script.Serialization;

namespace PharmaBoost.Tray
{
    /// <summary>Ce que l'icône lit dans la configuration de l'agent et dans son fichier d'état.</summary>
    internal sealed class Settings
    {
        public string ServerUrl = "https://pharmaboost.app";
        public string Pharmacy;
        public string Post;
        public bool Paired;

        public static Settings Load()
        {
            var settings = new Settings();
            var config = ReadJson(Paths.Config);
            if (config == null) return settings;
            settings.Paired = Text(config, "agentKey") != null;
            settings.ServerUrl = (Text(config, "serverUrl") ?? settings.ServerUrl).TrimEnd('/');
            settings.Pharmacy = Text(config, "pharmacyName");
            settings.Post = Text(config, "postLabel");
            return settings;
        }

        public static Dictionary<string, object> ReadJson(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
            }
            catch (Exception)
            {
                return null;
            }
        }

        public static string Text(Dictionary<string, object> json, string key)
        {
            object value;
            if (json == null || !json.TryGetValue(key, out value) || value == null) return null;
            string text = Convert.ToString(value, CultureInfo.InvariantCulture);
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
    }
}
