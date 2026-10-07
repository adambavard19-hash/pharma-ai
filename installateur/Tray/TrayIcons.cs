using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Reflection;
using System.Runtime.InteropServices;

namespace PharmaBoost.Tray
{
    /// <summary>Le logo PharmaBoost avec, en bas à droite, un point de la couleur de l'état.</summary>
    internal static class TrayIcons
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool DestroyIcon(IntPtr handle);

        private static readonly Dictionary<int, Icon> Cache = new Dictionary<int, Icon>();

        public static Icon For(Color dot)
        {
            Icon icon;
            if (Cache.TryGetValue(dot.ToArgb(), out icon)) return icon;
            icon = Compose(dot);
            Cache[dot.ToArgb()] = icon;
            return icon;
        }

        private static Icon Compose(Color dot)
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("logo-32.png"))
            using (var logo = new Bitmap(stream))
            using (var bitmap = new Bitmap(32, 32))
            using (var graphics = Graphics.FromImage(bitmap))
            using (var color = new SolidBrush(dot))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.DrawImage(logo, 0, 0, 32, 32);
                graphics.FillEllipse(Brushes.White, 16, 16, 16, 16);
                graphics.FillEllipse(color, 18, 18, 12, 12);
                IntPtr handle = bitmap.GetHicon();
                try
                {
                    using (var temporary = Icon.FromHandle(handle))
                    {
                        return (Icon)temporary.Clone();
                    }
                }
                finally
                {
                    DestroyIcon(handle);
                }
            }
        }
    }
}
