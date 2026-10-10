import { BANNER, csColor } from "./banner-design";

/**
 * La bannière PharmaBoost du poste de caisse : le programme Windows qui la dessine, la garde en haut à droite de l'écran, la fait
 * réagir aux scans et garde la vente ouverte jusqu'à « Vente terminée ».
 *
 * Un seul processus (PowerShell + C# compilé à la volée, rien à installer de plus) reste en vie tant que l'agent tourne. L'agent lui
 * parle sur son entrée standard, une commande JSON par ligne :
 *   {"op":"init","positionFile":"…","position":"haut-droite"}   la bannière apparaît, « En attente de scan… »
 *   {"op":"scan"}                  un scan vient d'être envoyé : « Scan détecté ! Analyse en cours… »
 *   {"op":"show","entry":{…}}      la vente (ou sa mise à jour, sur place) : la bannière s'agrandit et montre les conseils
 *   {"op":"done","info":{…}}       « Vente terminée ! » : le message de fin, puis la bannière redevient « en attente »
 *   {"op":"remove","id":"…"}       la vente est close ailleurs
 *   {"op":"quit"}
 * et il répond sur sa sortie standard par des mots seuls (les mêmes que l'ancienne fenêtre) :
 *   PRET · VENDU <vente> <conseil> · NONVENDU <vente> <conseil> · ANNULER <vente> <conseil> (reprendre sa réponse)
 *   EMAIL <vente> <adresse en base64> · EMAIL_RETIRER <vente> · TERMINER <vente> · VOIR <vente> · FERMEE <vente>
 *   ERREUR dessin … (la bannière n'arrive pas à se dessiner : l'agent revient à l'ancienne fenêtre)
 *
 * Le dessin : une fenêtre « à calque » (WS_EX_LAYERED) dont chaque pixel porte sa transparence. Rien n'est un contrôle Windows : la
 * carte, ses coins arrondis, l'ombre douce, les pastilles, les boutons et la mascotte sont dessinés en GDI+ (anticrénelé), à l'échelle
 * de l'affichage (100 %, 125 %, 150 %…). Les couleurs, tailles et phrases viennent de banner-design.ts, comme l'aperçu pour Mac.
 *
 * Ce que la bannière fait, et ne fait jamais :
 *  • elle reste visible en haut à droite, au-dessus du logiciel de gestion, sans jamais prendre le clavier ni le focus
 *    (WS_EX_NOACTIVATE, et WM_MOUSEACTIVATE répond « ne pas activer ») : la douchette et les touches vont au logiciel de gestion,
 *    même quand on clique sur un de ses boutons. Une seule exception, voulue : le champ « e-mail du patient » (EmailForm) prend le
 *    clavier le temps de la saisie, puis le rend ;
 *  • elle s'agrandit toute seule quand les conseils arrivent, reste ouverte pendant TOUTE la vente (aucun délai) et ne se ferme qu'à
 *    « Vente terminée ». Le pharmacien peut la déplacer, la verrouiller, la réduire ou la masquer ; seul un conseil NOUVEAU la rouvre ;
 *  • « Vendu » / « Non vendu » sont des déclarations du pharmacien : la bannière n'en déduit jamais rien d'elle-même.
 *
 * Écrit en C# 5 : Windows PowerShell 5.1 compile avec cette version du langage (pas d'interpolation, pas de « ?. »).
 */
const C = BANNER.colors;
const Z = BANNER.sizes;
const T = BANNER.text;
const M = BANNER.timing;

const pascal = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
const cs = (value: string) => JSON.stringify(value);

/** Les couleurs du design, une constante C# par couleur. */
const PALETTE = Object.entries(C)
  .filter(([key]) => key !== "cardAlpha")
  .map(([key, value]) => `    public static readonly Color ${pascal(key)} = ${csColor(value as string)};`)
  .join("\n");
const DIMENSIONS = Object.entries(Z).map(([key, value]) => `    public const int ${pascal(key)} = ${value};`).join("\n");
const TIMINGS = Object.entries(M).map(([key, value]) => `    public const ${Number.isInteger(value) ? "int" : "double"} ${pascal(key)} = ${value};`).join("\n");
const PHRASES = Object.entries(T).map(([key, value]) => `    public const string ${pascal(key)} = ${cs(value)};`).join("\n");

export const NOTICE_HOST_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PharmaBoostAvis
{
  [StructLayout(LayoutKind.Sequential)]
  internal struct POINT
  {
    public int x;
    public int y;
    public POINT(int px, int py) { x = px; y = py; }
  }

  [StructLayout(LayoutKind.Sequential)]
  internal struct SIZE
  {
    public int cx;
    public int cy;
    public SIZE(int w, int h) { cx = w; cy = h; }
  }

  [StructLayout(LayoutKind.Sequential, Pack = 1)]
  internal struct BLENDFUNCTION
  {
    public byte BlendOp;
    public byte BlendFlags;
    public byte SourceConstantAlpha;
    public byte AlphaFormat;
  }

  internal static class Native
  {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("user32.dll", SetLastError = true)] public static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, int crKey, ref BLENDFUNCTION pblend, int dwFlags);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOSIZE = 0x1;
    public const uint SWP_NOMOVE = 0x2;
    public const uint SWP_NOACTIVATE = 0x10;
    public const uint SWP_SHOWWINDOW = 0x40;
    public const int GWL_EXSTYLE = -20;
    public const int WS_EX_NOACTIVATE = 0x08000000;
  }

  /// <summary>Un conseil de la vente : le produit, le médicament concerné, les pastilles, la réponse du pharmacien.</summary>
  public class Item
  {
    public string Id = "";
    public string Drug = "";
    public string Challenge = "";
    public string ShortDate = "";
    /// <summary>NONE (pas de réponse), SOLD (Vendu) ou NOT_SOLD (Non vendu).</summary>
    public string Outcome = "NONE";
    public string Name = "";
    public string Price = "";
    public string Reason = "";
    public string Availability = "UNKNOWN";
    /// <summary>Le stock exact de l'officine (« 3 »), ou vide quand il n'est pas connu.</summary>
    public string Quantity = "";
    public string Image = "";
  }

  /// <summary>Ce que la bannière affiche pour UNE vente, du premier bip à « Vente terminée ».</summary>
  public class Entry
  {
    public string Id = "";
    public string Reference = "";
    public string Label = "Détecté";
    public string Subject = "";
    public string Url = "";
    public string Signature = "";
    public bool Quiet;
    public bool EmailSaved;
    public string EmailError = "";
    public List<string> Alerts = new List<string>();
    public List<string> Notes = new List<string>();
    public List<Item> Items = new List<Item>();
    public List<string> Shown = new List<string>();
    public DateTime Since = DateTime.Now;
  }

  /// <summary>Le message de fin de vente : ce qui a été enregistré, et si un bilan est parti.</summary>
  public class DoneInfo
  {
    public string Id = "";
    public string Title = "";
    public List<string> Lines = new List<string>();
    public string Badge = "";
    public bool Warning;
  }

  /// <summary>Une zone cliquable de la bannière, refaite à chaque image.</summary>
  internal class Hit
  {
    public RectangleF R;
    public string Kind = "";
    public Item Item;
    public string Tip = "";
  }

  /// <summary>Les couleurs du design (banner-design.ts).</summary>
  internal static class Pal
  {
${PALETTE}
    public const double CardAlpha = ${C.cardAlpha};
  }

  /// <summary>Les cotes du design, en pixels à 100 % d'affichage.</summary>
  internal static class Dim
  {
${DIMENSIONS}
  }

  internal static class Tim
  {
${TIMINGS}
  }

  /// <summary>Les phrases du design.</summary>
  internal static class Txt
  {
${PHRASES}
  }

  internal static class St
  {
    public const int Idle = 0;
    public const int Scanning = 1;
    public const int Ready = 2;
    public const int Expanded = 3;
    public const int Done = 4;
    public const int Quiet = 5;
  }

  /// <summary>Les outils de dessin : pinceaux et polices en réserve, formes arrondies, textes, pastilles, petites icônes.</summary>
  internal static class Gfx
  {
    private static readonly Dictionary<int, SolidBrush> brushes = new Dictionary<int, SolidBrush>();
    private static readonly Dictionary<string, Font> fonts = new Dictionary<string, Font>();
    private static string face = null;
    public static readonly StringFormat Left = Make(StringAlignment.Near, true);
    public static readonly StringFormat Center = Make(StringAlignment.Center, true);
    public static readonly StringFormat Right = Make(StringAlignment.Far, true);
    public static readonly StringFormat Wrap = Make(StringAlignment.Near, false);
    /// <summary>La transparence du contenu qui apparaît (0 à 1) : les textes d'un nouvel état se fondent.</summary>
    public static float Fade = 1f;

    private static StringFormat Make(StringAlignment align, bool single)
    {
      StringFormat format = new StringFormat(StringFormat.GenericTypographic);
      format.Alignment = align;
      format.LineAlignment = StringAlignment.Near;
      format.Trimming = single ? StringTrimming.EllipsisCharacter : StringTrimming.Word;
      if (single) format.FormatFlags |= StringFormatFlags.NoWrap;
      return format;
    }

    /// <summary>La police : Segoe UI (présente sur Windows 10 et 11), sinon la plus proche qui existe.</summary>
    public static string Face()
    {
      if (face != null) return face;
      string[] wanted = new string[] { "Segoe UI", "Tahoma", "Arial" };
      face = "Arial";
      try
      {
        using (InstalledFontCollection installed = new InstalledFontCollection())
        {
          foreach (string name in wanted)
          {
            bool found = false;
            foreach (FontFamily family in installed.Families) { if (family.Name == name) { found = true; break; } }
            if (found) { face = name; break; }
          }
        }
      }
      catch (Exception) { }
      return face;
    }

    public static Font Fnt(float pixels, FontStyle style)
    {
      string key = pixels + "|" + (int)style;
      Font font;
      if (!fonts.TryGetValue(key, out font))
      {
        font = new Font(Face(), pixels, style, GraphicsUnit.Pixel);
        fonts[key] = font;
      }
      return font;
    }

    public static Color Fx(Color color)
    {
      if (Fade >= 0.999f) return color;
      return Color.FromArgb((int)Math.Round(color.A * Fade), color);
    }

    public static SolidBrush Brs(Color color)
    {
      int key = color.ToArgb();
      SolidBrush brush;
      if (!brushes.TryGetValue(key, out brush))
      {
        brush = new SolidBrush(color);
        brushes[key] = brush;
      }
      return brush;
    }

    /// <summary>Vide la réserve de pinceaux quand elle grossit : appelé entre deux images, jamais pendant.</summary>
    public static void Trim()
    {
      if (brushes.Count < 300) return;
      foreach (SolidBrush brush in brushes.Values) brush.Dispose();
      brushes.Clear();
    }

    public static GraphicsPath Round(float x, float y, float w, float h, float r)
    {
      GraphicsPath path = new GraphicsPath();
      w = Math.Max(w, 1f);
      h = Math.Max(h, 1f);
      r = Math.Min(r, Math.Min(w, h) / 2f);
      if (r < 0.75f) { path.AddRectangle(new RectangleF(x, y, w, h)); return path; }
      float d = r * 2f;
      path.AddArc(x, y, d, d, 180, 90);
      path.AddArc(x + w - d, y, d, d, 270, 90);
      path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
      path.AddArc(x, y + h - d, d, d, 90, 90);
      path.CloseFigure();
      return path;
    }

    public static void Fill(Graphics g, Color color, float x, float y, float w, float h, float r)
    {
      using (GraphicsPath path = Round(x, y, w, h, r)) { g.FillPath(Brs(color), path); }
    }

    public static void Gradient(Graphics g, Color top, Color bottom, float x, float y, float w, float h, float r)
    {
      if (w < 1f || h < 1f) return;
      using (GraphicsPath path = Round(x, y, w, h, r))
      using (LinearGradientBrush brush = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, h + 1f), top, bottom, LinearGradientMode.Vertical))
      {
        g.FillPath(brush, path);
      }
    }

    public static void Stroke(Graphics g, Color color, float width, float x, float y, float w, float h, float r)
    {
      using (GraphicsPath path = Round(x, y, w, h, r))
      using (Pen pen = new Pen(color, width)) { g.DrawPath(pen, path); }
    }

    public static void Disc(Graphics g, Color color, float cx, float cy, float radius)
    {
      g.FillEllipse(Brs(color), cx - radius, cy - radius, radius * 2f, radius * 2f);
    }

    public static Pen Line(Color color, float width)
    {
      Pen pen = new Pen(color, width);
      pen.StartCap = LineCap.Round;
      pen.EndCap = LineCap.Round;
      pen.LineJoin = LineJoin.Round;
      return pen;
    }

    /// <summary>Un texte dans un cadre ; trop long, il se termine par « … ».</summary>
    public static void Text(Graphics g, string text, Font font, Color color, float x, float y, float w, float h, StringFormat format)
    {
      if (string.IsNullOrEmpty(text) || w < 2f) return;
      g.DrawString(text, font, Brs(Fx(color)), new RectangleF(x, y, w, h), format);
    }

    public static float Measure(Graphics g, string text, Font font)
    {
      if (string.IsNullOrEmpty(text)) return 0f;
      return g.MeasureString(text, font, 10000, StringFormat.GenericTypographic).Width;
    }

    /// <summary>La hauteur d'un texte qui passe à la ligne dans une largeur donnée.</summary>
    public static float MeasureHeight(Graphics g, string text, Font font, float width)
    {
      if (string.IsNullOrEmpty(text)) return 0f;
      return g.MeasureString(text, font, (int)Math.Max(20f, width), Wrap).Height + 2f;
    }

    public static string Shorten(string text, int max)
    {
      if (text == null) return "";
      return text.Length > max ? text.Substring(0, max - 1).TrimEnd() + "…" : text;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les petites icônes, toutes dessinées : aucune police de symboles.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>Une coche. progress (0 à 1) la trace peu à peu.</summary>
    public static void Tick(Graphics g, Color color, float cx, float cy, float size, float width, float progress)
    {
      PointF a = new PointF(cx - size * 0.32f, cy + size * 0.02f);
      PointF b = new PointF(cx - size * 0.08f, cy + size * 0.27f);
      PointF c = new PointF(cx + size * 0.34f, cy - size * 0.24f);
      float first = 0.38f;
      using (Pen pen = Line(color, width))
      {
        if (progress <= 0f) return;
        if (progress < first)
        {
          float k = progress / first;
          g.DrawLine(pen, a, new PointF(a.X + (b.X - a.X) * k, a.Y + (b.Y - a.Y) * k));
        }
        else
        {
          float k = Math.Min(1f, (progress - first) / (1f - first));
          g.DrawLines(pen, new PointF[] { a, b, new PointF(b.X + (c.X - b.X) * k, b.Y + (c.Y - b.Y) * k) });
        }
      }
    }

    public static void Cross(Graphics g, Color color, float cx, float cy, float half, float width)
    {
      using (Pen pen = Line(color, width))
      {
        g.DrawLine(pen, cx - half, cy - half, cx + half, cy + half);
        g.DrawLine(pen, cx - half, cy + half, cx + half, cy - half);
      }
    }

    public static void Star(Graphics g, Color color, float cx, float cy, float radius)
    {
      PointF[] points = new PointF[10];
      for (int i = 0; i < 10; i++)
      {
        double angle = -Math.PI / 2 + i * Math.PI / 5;
        float r = (i % 2 == 0) ? radius : radius * 0.45f;
        points[i] = new PointF(cx + (float)Math.Cos(angle) * r, cy + (float)Math.Sin(angle) * r);
      }
      g.FillPolygon(Brs(color), points);
    }

    public static void Clock(Graphics g, Color color, float cx, float cy, float radius)
    {
      using (Pen pen = Line(color, 1.5f))
      {
        g.DrawEllipse(pen, cx - radius, cy - radius, radius * 2f, radius * 2f);
        g.DrawLine(pen, cx, cy, cx, cy - radius * 0.6f);
        g.DrawLine(pen, cx, cy, cx + radius * 0.5f, cy + radius * 0.25f);
      }
    }

    public static void Bang(Graphics g, Color color, float cx, float cy, float size)
    {
      using (Pen pen = Line(color, 1.8f))
      {
        g.DrawLine(pen, cx, cy - size * 0.45f, cx, cy + size * 0.1f);
        g.DrawLine(pen, cx, cy + size * 0.38f, cx, cy + size * 0.4f);
      }
    }

    public static void Warning(Graphics g, Color color, float cx, float cy, float size)
    {
      PointF[] triangle = new PointF[] { new PointF(cx, cy - size * 0.5f), new PointF(cx + size * 0.5f, cy + size * 0.42f), new PointF(cx - size * 0.5f, cy + size * 0.42f) };
      using (Pen pen = new Pen(color, 1.8f))
      {
        pen.LineJoin = LineJoin.Round;
        g.DrawPolygon(pen, triangle);
      }
      Bang(g, color, cx, cy + size * 0.06f, size * 0.62f);
    }

    public static void Envelope(Graphics g, Color color, float cx, float cy, float w)
    {
      float h = w * 0.7f;
      using (Pen pen = Line(color, 1.5f))
      using (GraphicsPath path = Round(cx - w / 2f, cy - h / 2f, w, h, 2.5f))
      {
        g.DrawPath(pen, path);
        g.DrawLines(pen, new PointF[] { new PointF(cx - w / 2f + 1f, cy - h / 2f + 1.5f), new PointF(cx, cy + h * 0.1f), new PointF(cx + w / 2f - 1f, cy - h / 2f + 1.5f) });
      }
    }

    public static void Pin(Graphics g, Color color, float cx, float cy, float size, bool filled)
    {
      using (Pen pen = Line(color, 1.6f))
      {
        float head = size * 0.28f;
        if (filled) g.FillEllipse(Brs(color), cx - head, cy - size * 0.38f, head * 2f, head * 2f);
        else g.DrawEllipse(pen, cx - head, cy - size * 0.38f, head * 2f, head * 2f);
        g.DrawLine(pen, cx, cy + size * 0.12f, cx, cy + size * 0.42f);
      }
    }

    public static void Minus(Graphics g, Color color, float cx, float cy, float half)
    {
      using (Pen pen = Line(color, 1.8f)) { g.DrawLine(pen, cx - half, cy, cx + half, cy); }
    }

    public static void Chevron(Graphics g, Color color, float cx, float cy, float half, bool down)
    {
      float d = down ? 1f : -1f;
      using (Pen pen = Line(color, 1.8f)) { g.DrawLines(pen, new PointF[] { new PointF(cx - half, cy - d * half * 0.45f), new PointF(cx, cy + d * half * 0.45f), new PointF(cx + half, cy - d * half * 0.45f) }); }
    }

    public static void Arrow(Graphics g, Color color, float x, float cy, float length)
    {
      using (Pen pen = Line(color, 2f))
      {
        g.DrawLine(pen, x, cy, x + length, cy);
        g.DrawLines(pen, new PointF[] { new PointF(x + length - 4.5f, cy - 4.5f), new PointF(x + length, cy), new PointF(x + length - 4.5f, cy + 4.5f) });
      }
    }

    /// <summary>Un flacon gris : la place d'un produit sans photo.</summary>
    public static void Bottle(Graphics g, float x, float y, float size)
    {
      Fill(g, Color.FromArgb(230, 238, 242), x, y, size, size, size * 0.22f);
      Color body = Color.FromArgb(190, 205, 214);
      float w = size * 0.42f;
      float h = size * 0.5f;
      Fill(g, body, x + (size - w * 0.5f) / 2f, y + size * 0.14f, w * 0.5f, size * 0.12f, 2f);
      Fill(g, body, x + (size - w) / 2f, y + size * 0.27f, w, h, size * 0.1f);
    }

    /// <summary>Une pastille : texte, fond, et une petite icône (1 étoile, 2 horloge, 3 coche, 4 point d'exclamation, 5 croix). Renvoie sa largeur.</summary>
    public static float Pill(Graphics g, float x, float y, string text, Color back, Color fore, int icon, bool draw)
    {
      Font font = Fnt(11.5f, FontStyle.Bold);
      float textWidth = Measure(g, text, font);
      float iconWidth = icon > 0 ? 15f : 0f;
      float width = 9f + iconWidth + textWidth + 10f;
      if (!draw) return width;
      Fill(g, Fx(back), x, y, width, 22f, 11f);
      float ix = x + 9f + 5f;
      float iy = y + 11f;
      if (icon == 1) Star(g, Fx(Pal.ChallengeIcon), ix, iy, 6f);
      else if (icon == 2) Clock(g, Fx(fore), ix, iy, 5.2f);
      else if (icon == 3) Tick(g, Fx(fore), ix, iy, 13f, 1.9f, 1f);
      else if (icon == 4) Bang(g, Fx(fore), ix, iy, 12f);
      else if (icon == 5) Cross(g, Fx(fore), ix, iy, 3.6f, 1.8f);
      Text(g, text, font, fore, x + 9f + iconWidth, y + 3.2f, textWidth + 4f, 18f, Left);
      return width;
    }
  }

  /// <summary>La mascotte PharmaBoost : un petit robot casqué, une croix verte, une antenne qui pulse. Dessinée en vectoriel, jamais une image.</summary>
  internal static class Mascot
  {
    /// <summary>mood : idle, alert, think, idea, happy. x, y : coin haut-gauche de la boîte carrée de côté size.</summary>
    public static void Draw(Graphics g, float x, float y, float size, string mood, double t)
    {
      float u = size / 100f;
      float bob = (float)Math.Sin(t * 2.2) * 2.2f;
      if (mood == "alert") bob = (float)Math.Sin(t * 11) * 1.2f - 1.5f;
      GraphicsState saved = g.Save();
      g.TranslateTransform(x, y + bob * u);
      g.ScaleTransform(u, u);
      Body(g, mood, t);
      g.Restore(saved);
    }

    private static void Body(Graphics g, string mood, double t)
    {
      float pulse = (float)(0.5 + 0.5 * Math.Sin(t * (mood == "think" ? 9.0 : 3.2)));
      Color lamp = mood == "alert" ? Color.FromArgb(255, 245, 176, 40) : Pal.Eye;

      // Antenne et sa petite lampe qui pulse.
      using (Pen stem = Gfx.Line(Pal.ShellEdge, 3f)) { g.DrawLine(stem, 50, 17, 50, 8); }
      Gfx.Disc(g, Color.FromArgb((int)(40 + 90 * pulse), lamp), 50, 6, 5f + 4f * pulse);
      Gfx.Disc(g, lamp, 50, 6, 3.6f);

      // Le casque : arceau et deux écouteurs.
      using (Pen band = Gfx.Line(Pal.Ear, 5f)) { g.DrawArc(band, 9, 9, 82, 70, 192, 156); }
      Gfx.Gradient(g, Pal.Ear, Color.FromArgb(255, 18, 150, 140), 3, 36, 15, 28, 7);
      Gfx.Gradient(g, Pal.Ear, Color.FromArgb(255, 18, 150, 140), 82, 36, 15, 28, 7);

      // La tête : coque claire, écran sombre.
      Gfx.Gradient(g, Pal.ShellTop, Pal.ShellBottom, 14, 16, 72, 58, 24);
      Gfx.Stroke(g, Pal.ShellEdge, 1.6f, 14, 16, 72, 58, 24);
      Gfx.Gradient(g, Pal.ScreenTop, Pal.ScreenBottom, 22, 25, 56, 40, 17);

      // Les yeux : ils clignent de temps en temps.
      bool blink = (t % 4.6) > 4.46;
      float eyeY = 42f;
      float shift = 0f;
      float eyeW = 9f;
      float eyeH = 12f;
      if (mood == "think") { shift = (float)Math.Sin(t * 2.6) * 3.5f; eyeW = 8f; eyeH = 10f; }
      if (mood == "alert") { eyeW = 11f; eyeH = 15f; }
      float[] centers = new float[] { 38f, 62f };
      foreach (float cx in centers)
      {
        if (mood == "happy" || mood == "idea")
        {
          using (Pen arc = Gfx.Line(Pal.Eye, 3.2f)) { g.DrawArc(arc, cx - 5.5f, eyeY - 4f, 11f, 10f, 190, 160); }
        }
        else
        {
          float h = blink ? 2f : eyeH;
          g.FillEllipse(Gfx.Brs(Pal.Eye), cx + shift - eyeW / 2f, eyeY - h / 2f, eyeW, h);
          if (!blink) g.FillEllipse(Gfx.Brs(Color.FromArgb(210, 255, 255, 255)), cx + shift - 3f, eyeY - eyeH / 2f + 2f, 3.2f, 3.2f);
        }
      }

      // La bouche.
      if (mood == "happy" || mood == "idea")
      {
        g.FillPie(Gfx.Brs(Pal.Eye), 41, 46, 18, 14, 0, 180);
      }
      else if (mood == "alert")
      {
        using (Pen ring = Gfx.Line(Pal.Eye, 2.4f)) { g.DrawEllipse(ring, 46, 51, 8, 9); }
      }
      else if (mood == "think")
      {
        using (Pen flat = Gfx.Line(Pal.Eye, 2.6f)) { g.DrawLine(flat, 44, 55, 56, 55); }
      }
      else
      {
        using (Pen smile = Gfx.Line(Pal.Eye, 2.6f)) { g.DrawArc(smile, 43, 47, 14, 9, 20, 140); }
      }

      // Le badge : la croix verte de la pharmacie.
      Gfx.Disc(g, Color.FromArgb(235, 255, 255, 255), 74, 69, 15f);
      using (GraphicsPath badge = new GraphicsPath())
      {
        badge.AddEllipse(60.5f, 55.5f, 27f, 27f);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(60f, 55f, 28f, 28f), Pal.Accent, Pal.AccentDark, LinearGradientMode.Vertical)) { g.FillPath(fill, badge); }
      }
      g.FillRectangle(Gfx.Brs(Color.White), 72.2f, 61f, 3.6f, 16f);
      g.FillRectangle(Gfx.Brs(Color.White), 66f, 67.2f, 16f, 3.6f);

      // Une idée : une étincelle qui scintille près de l'antenne.
      if (mood == "idea")
      {
        float twinkle = (float)(0.6 + 0.4 * Math.Sin(t * 6));
        Gfx.Star(g, Color.FromArgb((int)(255 * twinkle), 255, 214, 90), 80, 14, 6f + 2f * twinkle);
      }
    }
  }

  /// <summary>
  /// La bannière. Une fenêtre « à calque » : l'image entière (carte, ombre, texte, mascotte) est dessinée à chaque image puis posée
  /// d'un coup sur l'écran avec sa transparence par pixel. Elle ne prend jamais le clavier ni le focus.
  /// </summary>
  public class BannerForm : Form
  {
    public event Action<string> Word;
    public event Action Changed;
    public event Action EmailRequested;
    public event Action<string> DoneEnded;
    public event Action Ended;

    private readonly float scale;
    private readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
    private readonly Stopwatch clock = Stopwatch.StartNew();
    private readonly List<Hit> hits = new List<Hit>();
    private readonly Dictionary<string, Image> photos = new Dictionary<string, Image>();
    private readonly Bitmap measureBitmap = new Bitmap(4, 4);
    private readonly Graphics measure;
    private Bitmap buffer;

    private int state = St.Idle;
    private double stateStart;
    private Entry entry;
    private DoneInfo done;
    private bool started;
    private bool sessionOpen;
    private bool analyzing;
    private bool finishing;
    private bool userReduced;
    private bool hidden;
    private bool pinned;
    private bool failed;
    private string hiddenSale = "";
    private double analyzeStart;
    private float fade = 1f;
    private float curW = Dim.WidthIdle;
    private float curH = Dim.HeightIdle;
    private bool sized;
    private float scrollY;
    private float listHeight;
    private Hit hover;
    private Hit pressed;
    private bool dragging;
    private bool dragMoved;
    private Point dragStart;
    private int dragAnchorX;
    private int dragAnchorY;
    private int anchorX;
    private int anchorY;
    private int windowX;
    private int windowY;
    private string positionFile = "";
    private string position = "haut-droite";
    private double lastTick;
    private double lastTop;

    public BannerForm()
    {
      float found = 1f;
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { found = g.DpiX / 96f; }
      scale = found < 1f ? 1f : found;
      measure = Graphics.FromImage(measureBitmap);
      measure.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      SetStyle(ControlStyles.Selectable, false);
      timer.Interval = 60;
      timer.Tick += delegate
      {
        try { Tick(); }
        catch (Exception problem) { Fail(problem); }
      };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_LAYERED : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée,
        // dessinée pixel par pixel avec sa transparence.
        p.ExStyle |= 0x08000000 | 0x00000080 | 0x00080000;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : même un clic sur un bouton de la bannière n'active pas la fenêtre (MA_NOACTIVATE).
      if (m.Msg == 0x0021) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnPaintBackground(PaintEventArgs e) { }
    protected override void OnPaint(PaintEventArgs e) { }

    private int S(float value) { return (int)Math.Round(value * scale); }
    private double Now() { return clock.Elapsed.TotalSeconds; }

    private void Say(string text)
    {
      if (Word != null) Word(text);
    }

    private void Fail(Exception problem)
    {
      if (failed) return;
      failed = true;
      timer.Stop();
      string text = problem.GetType().Name + " " + problem.Message;
      Say("ERREUR dessin " + Gfx.Shorten(text.Replace("\r", " ").Replace("\n", " "), 140));
    }

    // ------------------------------------------------------------------------------------------------------------
    // Ce que l'agent demande.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>La bannière apparaît, « En attente de scan… », là où le pharmacien l'a laissée (sinon en haut à droite).</summary>
    public void Start(string file, string where)
    {
      if (!string.IsNullOrEmpty(file)) positionFile = file;
      if (!string.IsNullOrEmpty(where)) position = where;
      if (started) return;
      started = true;
      Place();
      lastTick = Now();
      stateStart = Now();
      timer.Start();
      if (!hidden) ShowCard();
    }

    public bool Started { get { return started; } }
    public bool Hidden { get { return hidden; } }
    public bool Reduced { get { return userReduced; } }
    public bool Pinned { get { return pinned; } }
    public bool SaleOpen { get { return sessionOpen && entry != null; } }
    public string SaleId { get { return entry != null ? entry.Id : ""; } }
    public string SaleUrl { get { return entry != null ? entry.Url : ""; } }

    public int Unanswered()
    {
      int count = 0;
      if (entry == null || !sessionOpen) return 0;
      foreach (Item item in entry.Items) { if (item.Outcome == "NONE") count++; }
      return count;
    }

    /// <summary>Un scan vient d'être envoyé : « Scan détecté ! Analyse en cours… ».</summary>
    public void BeginScan()
    {
      if (!started) return;
      analyzeStart = Now();
      if (sessionOpen) { analyzing = true; return; }
      SetState(St.Scanning);
    }

    /// <summary>
    /// Une vente arrive ou se met à jour. Une vente n'a qu'UNE bannière, mise à jour sur place, qui reste jusqu'à « Vente terminée ».
    /// Seule une information NOUVELLE (un autre produit, une autre alerte) rouvre la bannière réduite.
    /// </summary>
    public void ApplyEntry(Entry e)
    {
      if (!started) return;
      Entry existing = (entry != null && entry.Id == e.Id) ? entry : null;
      List<string> known = new List<string>();
      if (existing != null) known.AddRange(existing.Shown);
      List<string> fresh = new List<string>();
      foreach (Item item in e.Items) { string key = "p:" + item.Name; if (!known.Contains(key)) fresh.Add(key); }
      foreach (string alert in e.Alerts) { string key = "a:" + alert; if (!known.Contains(key)) fresh.Add(key); }
      e.Shown.AddRange(known);
      e.Shown.AddRange(fresh);
      if (existing != null) e.Since = existing.Since;
      bool sameSale = existing != null;
      analyzing = false;
      finishing = false;
      done = null;
      if (e.Quiet && !(sameSale && sessionOpen))
      {
        // Rien à conseiller : un mot de quelques secondes, sans session ni compteur.
        entry = e;
        sessionOpen = false;
        SetState(St.Quiet);
        return;
      }
      if (hidden && hiddenSale != e.Id) { hidden = false; ShowCard(); }
      entry = e;
      sessionOpen = true;
      if (!sameSale) { userReduced = false; SetState(St.Ready); }
      else if (fresh.Count > 0) { userReduced = false; if (state != St.Expanded) SetState(St.Expanded); }
      else if (state != St.Expanded && state != St.Ready) SetState(St.Expanded);
      if (Changed != null) Changed();
    }

    /// <summary>« Vente terminée » est enregistrée : le message de fin reste quelques secondes, puis la bannière redevient « en attente ».</summary>
    public void ApplyDone(DoneInfo info)
    {
      if (entry == null || entry.Id != info.Id) return;
      sessionOpen = false;
      analyzing = false;
      finishing = false;
      done = info;
      SetState(St.Done);
      if (Changed != null) Changed();
    }

    public void RemoveSale(string id)
    {
      if (entry == null || entry.Id != id) return;
      EndSale();
    }

    /// <summary>Une vente restée ouverte plus de trois heures n'est plus une vente : la bannière s'en détache.</summary>
    public void Expire()
    {
      if (entry != null && sessionOpen && DateTime.Now - entry.Since > TimeSpan.FromHours(3)) EndSale();
    }

    private void EndSale()
    {
      entry = null;
      done = null;
      sessionOpen = false;
      analyzing = false;
      finishing = false;
      SetState(St.Idle);
      if (Ended != null) Ended();
      if (Changed != null) Changed();
    }

    public void SetReduced(bool value)
    {
      if (userReduced == value) return;
      userReduced = value;
      fade = 0.3f;
      if (Changed != null) Changed();
    }

    public void SetPinned(bool value)
    {
      pinned = value;
      if (Changed != null) Changed();
    }

    /// <summary>Masquée à la main : la bannière disparaît jusqu'à la prochaine vente qui porte un conseil (ou un clic sur l'icône près de l'horloge).</summary>
    public void HideByUser()
    {
      hidden = true;
      hiddenSale = entry != null ? entry.Id : "";
      if (Visible) Hide();
      if (Changed != null) Changed();
    }

    public void Reveal()
    {
      hidden = false;
      userReduced = false;
      if (!started) return;
      fade = 0.3f;
      ShowCard();
      if (Changed != null) Changed();
    }

    private void ShowCard()
    {
      if (hidden) return;
      if (!Visible) Show();
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
      Redraw();
    }

    private void SetState(int next)
    {
      state = next;
      stateStart = Now();
      fade = 0.12f;
      if (next == St.Expanded) scrollY = 0f;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le temps : minuteries d'état, animation de la taille, une image par tic.
    // ------------------------------------------------------------------------------------------------------------

    private bool IsReduced { get { return userReduced && state != St.Done; } }

    private void Tick()
    {
      double now = Now();
      double dt = Math.Min(0.25, Math.Max(0.0, now - lastTick));
      lastTick = now;
      double age = now - stateStart;

      if (state == St.Ready && age * 1000.0 > Tim.ReadyPauseMs) SetState(St.Expanded);
      else if (state == St.Quiet && age * 1000.0 > Tim.QuietMs) { entry = null; SetState(St.Idle); if (Changed != null) Changed(); }
      else if (state == St.Scanning && age * 1000.0 > Tim.ScanTimeoutMs) SetState(St.Idle);
      else if (state == St.Done && age * 1000.0 > Tim.DoneMs)
      {
        string finished = done != null ? done.Id : "";
        done = null;
        entry = null;
        sessionOpen = false;
        SetState(St.Idle);
        if (DoneEnded != null) DoneEnded(finished);
        if (Ended != null) Ended();
        if (Changed != null) Changed();
      }
      if (analyzing && now - analyzeStart > Tim.ScanTimeoutMs / 1000.0) analyzing = false;

      if (fade < 1f) fade = Math.Min(1f, fade + (float)(dt / 0.2));
      bool moving = AnimateSize(dt);
      bool visible = Visible && !hidden;
      bool busy = moving || fade < 1f || dragging || state == St.Done || state == St.Scanning;
      int wanted = !visible ? 250 : (busy ? 1000 / Tim.MotionFps : 1000 / Tim.IdleFps);
      if (timer.Interval != wanted) timer.Interval = wanted;
      if (!visible) return;

      // D'autres fenêtres « toujours au premier plan » peuvent passer devant : on se remet devant, sans prendre le focus.
      if (now - lastTop > 2.0)
      {
        lastTop = now;
        ClampAnchor();
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE);
      }
      Redraw();
    }

    private void Targets(out float tw, out float th)
    {
      if (IsReduced) { tw = Dim.WidthReduced; th = Dim.HeightReduced; return; }
      if (state == St.Ready) { tw = Dim.WidthReady; th = Dim.HeightReady; return; }
      if (state == St.Expanded && entry != null)
      {
        tw = Dim.WidthExpanded;
        th = ExpandedHeight(tw);
        return;
      }
      if (state == St.Done && done != null)
      {
        tw = Dim.WidthDone;
        th = DoneHeight(tw);
        return;
      }
      tw = Dim.WidthIdle;
      th = Dim.HeightIdle;
    }

    private bool AnimateSize(double dt)
    {
      float tw;
      float th;
      Targets(out tw, out th);
      if (!sized) { curW = tw; curH = th; sized = true; return false; }
      double k = 1.0 - Math.Pow(1.0 - Tim.Ease, dt * 60.0);
      bool moving = false;
      curW += (float)((tw - curW) * k);
      curH += (float)((th - curH) * k);
      if (Math.Abs(tw - curW) < 0.6f) curW = tw; else moving = true;
      if (Math.Abs(th - curH) < 0.6f) curH = th; else moving = true;
      return moving;
    }

    private float MaxCardHeight()
    {
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      return Math.Max(260f, area.Height * 0.9f / scale - 2 * Dim.Margin);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Où elle est : en haut à droite, ou là où le pharmacien l'a posée.
    // ------------------------------------------------------------------------------------------------------------

    private void Place()
    {
      Rectangle area = Screen.PrimaryScreen.WorkingArea;
      // Sous la barre de titre d'un logiciel plein écran : ses boutons Réduire / Fermer restent libres.
      anchorX = area.Right - S(18);
      anchorY = area.Top + SystemInformation.CaptionHeight + S(10);
      if (position == "milieu-droite") anchorY = area.Top + area.Height / 2 - S(150);
      else if (position == "bas-droite") anchorY = area.Bottom - S(330);
      try
      {
        if (!string.IsNullOrEmpty(positionFile) && File.Exists(positionFile))
        {
          string[] parts = File.ReadAllText(positionFile).Trim().Split(',');
          if (parts.Length == 2)
          {
            Point saved = new Point(int.Parse(parts[0]), int.Parse(parts[1]));
            foreach (Screen screen in Screen.AllScreens)
            {
              if (screen.WorkingArea.Contains(new Point(saved.X - S(40), saved.Y + S(20)))) { anchorX = saved.X; anchorY = saved.Y; break; }
            }
          }
        }
      }
      catch (Exception) { }
      ClampAnchor();
    }

    private void ClampAnchor()
    {
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      if (anchorX > area.Right) anchorX = area.Right;
      if (anchorX < area.Left + S(80)) anchorX = area.Left + S(80);
      if (anchorY < area.Top) anchorY = area.Top;
      if (anchorY > area.Bottom - S(60)) anchorY = area.Bottom - S(60);
    }

    private void SavePosition()
    {
      try { if (!string.IsNullOrEmpty(positionFile)) File.WriteAllText(positionFile, anchorX + "," + anchorY); } catch (Exception) { }
    }

    /// <summary>La carte à l'écran, en pixels : pour poser le champ e-mail juste dessous.</summary>
    public Rectangle CardBounds()
    {
      return new Rectangle(windowX + S(Dim.Margin), windowY + S(Dim.Margin), S(curW), S(curH));
    }

    // ------------------------------------------------------------------------------------------------------------
    // La souris : survol, clic, déplacement, molette.
    // ------------------------------------------------------------------------------------------------------------

    private Hit HitAt(int px, int py)
    {
      float x = px / scale;
      float y = py / scale;
      for (int i = hits.Count - 1; i >= 0; i--)
      {
        if (hits[i].R.Contains(x, y)) return hits[i];
      }
      return null;
    }

    private bool InCard(int px, int py)
    {
      float x = px / scale;
      float y = py / scale;
      return x >= Dim.Margin && x <= Dim.Margin + curW && y >= Dim.Margin && y <= Dim.Margin + curH;
    }

    private static bool Same(Hit a, Hit b)
    {
      if (a == null || b == null) return a == b;
      return a.Kind == b.Kind && a.Item == b.Item;
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
      base.OnMouseMove(e);
      if (dragging)
      {
        Point now = Cursor.Position;
        if (!dragMoved && Math.Abs(now.X - dragStart.X) + Math.Abs(now.Y - dragStart.Y) < S(4)) return;
        dragMoved = true;
        anchorX = dragAnchorX + now.X - dragStart.X;
        anchorY = dragAnchorY + now.Y - dragStart.Y;
        ClampAnchor();
        Redraw();
        return;
      }
      Hit now2 = HitAt(e.X, e.Y);
      if (!Same(now2, hover))
      {
        hover = now2;
        Cursor = now2 != null ? Cursors.Hand : Cursors.Default;
        Redraw();
      }
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
      base.OnMouseDown(e);
      if (e.Button != MouseButtons.Left || !InCard(e.X, e.Y)) return;
      pressed = HitAt(e.X, e.Y);
      if (pressed == null && !pinned)
      {
        dragging = true;
        dragMoved = false;
        dragStart = Cursor.Position;
        dragAnchorX = anchorX;
        dragAnchorY = anchorY;
      }
      Redraw();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
      base.OnMouseUp(e);
      if (e.Button != MouseButtons.Left) return;
      bool moved = dragging && dragMoved;
      dragging = false;
      Hit up = HitAt(e.X, e.Y);
      Hit down = pressed;
      pressed = null;
      if (moved) { SavePosition(); Redraw(); return; }
      if (down != null && up != null && Same(down, up)) Perform(up);
      else if (down == null && up == null && InCard(e.X, e.Y)) Backdrop();
      Redraw();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
      base.OnMouseLeave(e);
      hover = null;
      pressed = null;
      Cursor = Cursors.Default;
      Redraw();
    }

    protected override void OnMouseWheel(MouseEventArgs e)
    {
      base.OnMouseWheel(e);
      if (state != St.Expanded || IsReduced) return;
      scrollY -= e.Delta / 120f * 44f;
      Redraw();
    }

    /// <summary>Un clic dans le vide de la carte : une bannière réduite ou « prête » s'ouvre.</summary>
    private void Backdrop()
    {
      if (IsReduced) { SetReduced(false); return; }
      if (state == St.Ready) SetState(St.Expanded);
    }

    private void Perform(Hit h)
    {
      if (h.Kind == "pin") SetPinned(!pinned);
      else if (h.Kind == "min") SetReduced(true);
      else if (h.Kind == "expand") SetReduced(false);
      else if (h.Kind == "close") HideByUser();
      else if (h.Kind == "see") SetState(St.Expanded);
      else if (h.Kind == "vendu") Choose(h.Item, "SOLD");
      else if (h.Kind == "nonvendu") Choose(h.Item, "NOT_SOLD");
      else if (h.Kind == "modifier") Choose(h.Item, "NONE");
      else if (h.Kind == "detail") { if (entry != null) Say("VOIR " + entry.Id); }
      else if (h.Kind == "email") { if (EmailRequested != null) EmailRequested(); }
      else if (h.Kind == "emailRemove")
      {
        if (entry != null) { Say("EMAIL_RETIRER " + entry.Id); entry.EmailSaved = false; }
      }
      else if (h.Kind == "finish")
      {
        if (finishing || entry == null) return;
        finishing = true;
        Say("TERMINER " + entry.Id);
      }
    }

    private void Choose(Item item, string outcome)
    {
      if (entry == null || item == null || item.Id.Length == 0) return;
      item.Outcome = outcome;
      Say((outcome == "SOLD" ? "VENDU " : outcome == "NOT_SOLD" ? "NONVENDU " : "ANNULER ") + entry.Id + " " + item.Id);
      if (Changed != null) Changed();
    }

    /// <summary>L'adresse a été enregistrée par l'agent : le champ se range.</summary>
    public void MarkEmailSaved()
    {
      if (entry != null) entry.EmailSaved = true;
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le dessin d'une image, puis sa pose à l'écran.
    // ------------------------------------------------------------------------------------------------------------

    private void Redraw()
    {
      if (!started || hidden || failed || !IsHandleCreated || !Visible) return;
      int pw = (int)Math.Ceiling((curW + 2 * Dim.Margin) * scale);
      int ph = (int)Math.Ceiling((curH + 2 * Dim.Margin) * scale);
      if (pw < 8 || ph < 8) return;
      if (buffer == null || buffer.Width != pw || buffer.Height != ph)
      {
        if (buffer != null) buffer.Dispose();
        buffer = new Bitmap(pw, ph, PixelFormat.Format32bppPArgb);
      }
      using (Graphics g = Graphics.FromImage(buffer))
      {
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        g.ScaleTransform(scale, scale);
        Compose(g);
      }

      // La carte reste entière à l'écran : si elle grandit vers le bas au-delà de l'écran, elle remonte.
      Rectangle area = Screen.FromPoint(new Point(anchorX - S(30), anchorY + S(20))).WorkingArea;
      int cardHeight = (int)Math.Ceiling(curH * scale);
      int top = anchorY;
      int limit = area.Bottom - S(8);
      if (top + cardHeight > limit) top = Math.Max(area.Top, limit - cardHeight);
      windowX = anchorX + S(Dim.Margin) - pw;
      windowY = top - S(Dim.Margin);
      Push(pw, ph);
    }

    private void Push(int pw, int ph)
    {
      IntPtr screenDc = Native.GetDC(IntPtr.Zero);
      IntPtr memoryDc = Native.CreateCompatibleDC(screenDc);
      IntPtr bitmap = IntPtr.Zero;
      IntPtr old = IntPtr.Zero;
      try
      {
        bitmap = buffer.GetHbitmap(Color.FromArgb(0));
        old = Native.SelectObject(memoryDc, bitmap);
        SIZE size = new SIZE(pw, ph);
        POINT source = new POINT(0, 0);
        POINT target = new POINT(windowX, windowY);
        BLENDFUNCTION blend = new BLENDFUNCTION();
        blend.BlendOp = 0;
        blend.BlendFlags = 0;
        blend.SourceConstantAlpha = 255;
        blend.AlphaFormat = 1;
        // ULW_ALPHA : la transparence de chaque pixel est celle de l'image.
        Native.UpdateLayeredWindow(Handle, screenDc, ref target, ref size, memoryDc, ref source, 0, ref blend, 2);
      }
      finally
      {
        if (bitmap != IntPtr.Zero) { Native.SelectObject(memoryDc, old); Native.DeleteObject(bitmap); }
        Native.DeleteDC(memoryDc);
        Native.ReleaseDC(IntPtr.Zero, screenDc);
      }
    }

    private void Compose(Graphics g)
    {
      Gfx.Trim();
      Gfx.Fade = 1f;
      hits.Clear();
      float x = Dim.Margin;
      float y = Dim.Margin;
      float w = curW;
      float h = curH;
      DrawShadow(g, x, y, w, h);
      using (GraphicsPath card = Gfx.Round(x, y, w, h, Dim.Radius))
      {
        Color top = Color.FromArgb((int)Math.Round(255 * Pal.CardAlpha), Pal.CardTop);
        Color bottom = Color.FromArgb((int)Math.Round(255 * Pal.CardAlpha), Pal.CardBottom);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, h + 1f), top, bottom, LinearGradientMode.Vertical)) { g.FillPath(fill, card); }
        GraphicsState saved = g.Save();
        g.SetClip(card, CombineMode.Intersect);
        // La lumière douce derrière la mascotte, et un reflet de verre sur le haut de la carte.
        using (GraphicsPath halo = new GraphicsPath())
        {
          halo.AddEllipse(x - 40f, y - 50f, 230f, 200f);
          using (PathGradientBrush glow = new PathGradientBrush(halo))
          {
            glow.CenterColor = Color.FromArgb(58, Pal.Glow);
            glow.SurroundColors = new Color[] { Color.FromArgb(0, Pal.Glow) };
            g.FillPath(glow, halo);
          }
        }
        using (LinearGradientBrush sheen = new LinearGradientBrush(new RectangleF(x, y - 0.5f, w, Math.Min(h, 46f) + 1f), Color.FromArgb(30, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), LinearGradientMode.Vertical))
        {
          g.FillRectangle(sheen, x, y, w, Math.Min(h, 46f));
        }
        Gfx.Fade = fade;
        PaintContent(g, x, y, w, h);
        Gfx.Fade = 1f;
        g.Restore(saved);
        using (Pen rim = new Pen(Color.FromArgb(78, Pal.Glow), 1.2f)) { g.DrawPath(rim, card); }
        using (GraphicsPath inner = Gfx.Round(x + 1.2f, y + 1.2f, w - 2.4f, h - 2.4f, Dim.Radius - 1.2f))
        using (Pen light = new Pen(Color.FromArgb(26, 255, 255, 255), 1f)) { g.DrawPath(light, inner); }
      }
      DrawTip(g);
    }

    /// <summary>L'ombre douce : des couches arrondies de plus en plus larges et de plus en plus pâles.</summary>
    private void DrawShadow(Graphics g, float x, float y, float w, float h)
    {
      for (int i = 13; i >= 1; i--)
      {
        float grow = i * 1.05f;
        int alpha = 3 + (14 - i) / 4;
        Gfx.Fill(g, Color.FromArgb(alpha, 3, 24, 38), x - grow, y - grow + 5f, w + grow * 2f, h + grow * 2f, Dim.Radius + grow);
      }
    }

    private Color Lighten(Color color, float amount)
    {
      return Color.FromArgb(color.A, (int)(color.R + (255 - color.R) * amount), (int)(color.G + (255 - color.G) * amount), (int)(color.B + (255 - color.B) * amount));
    }

    private bool IsHover(string kind, Item item)
    {
      return hover != null && hover.Kind == kind && hover.Item == item;
    }

    private bool IsPressed(string kind, Item item)
    {
      return pressed != null && pressed.Kind == kind && pressed.Item == item;
    }

    private void AddHit(RectangleF area, string kind, Item item, string tip, RectangleF? view)
    {
      RectangleF r = area;
      if (view.HasValue)
      {
        r = RectangleF.Intersect(area, view.Value);
        if (r.Width < 2f || r.Height < 2f) return;
      }
      Hit hit = new Hit();
      hit.R = r;
      hit.Kind = kind;
      hit.Item = item;
      hit.Tip = tip;
      hits.Add(hit);
    }

    /// <summary>Un bouton plein ou à contour, avec son texte centré ; renvoie sa zone cliquable.</summary>
    private void Btn(Graphics g, string kind, Item item, float x, float y, float w, float h, string text, Color back, Color fore, Color edge, float radius, float font, RectangleF? view)
    {
      Color fill = IsPressed(kind, item) ? Color.FromArgb(back.A, (int)(back.R * 0.9), (int)(back.G * 0.9), (int)(back.B * 0.9)) : (IsHover(kind, item) ? Lighten(back, 0.12f) : back);
      Gfx.Fill(g, Gfx.Fx(fill), x, y, w, h, radius);
      if (edge.A > 0) Gfx.Stroke(g, Gfx.Fx(edge), 1.3f, x + 0.6f, y + 0.6f, w - 1.2f, h - 1.2f, radius);
      Gfx.Text(g, text, Gfx.Fnt(font, FontStyle.Bold), fore, x, y + (h - font * 1.35f) / 2f, w, font * 1.5f, Gfx.Center);
      AddHit(new RectangleF(x, y, w, h), kind, item, "", view);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Le contenu, état par état.
    // ------------------------------------------------------------------------------------------------------------

    private void PaintContent(Graphics g, float x, float y, float w, float h)
    {
      if (IsReduced) { PaintReduced(g, x, y, w, h); return; }
      if (state == St.Ready && entry != null) PaintReady(g, x, y, w, h);
      else if (state == St.Expanded && entry != null) PaintExpanded(g, x, y, w, h);
      else if (state == St.Done && done != null) PaintDone(g, x, y, w, h);
      else if (state == St.Scanning) PaintScanning(g, x, y, w, h);
      else if (state == St.Quiet) PaintQuiet(g, x, y, w, h);
      else PaintIdle(g, x, y, w, h);
    }

    private double T() { return clock.Elapsed.TotalSeconds; }

    private static string Plural(int count, string one, string many)
    {
      return count > 1 ? many.Replace("{n}", count.ToString()) : one;
    }

    private void IconButton(Graphics g, string kind, float x, float y, string tip, int glyph)
    {
      float size = Dim.IconButton;
      bool over = IsHover(kind, null);
      if (over) Gfx.Disc(g, Color.FromArgb((int)(IsPressed(kind, null) ? 56 : 34), 255, 255, 255), x + size / 2f, y + size / 2f, size / 2f);
      Color ink = over ? Pal.Text : Pal.Muted;
      float cx = x + size / 2f;
      float cy = y + size / 2f;
      if (glyph == 1) Gfx.Pin(g, pinned ? Pal.Accent : ink, cx, cy, 14f, pinned);
      else if (glyph == 2) Gfx.Minus(g, ink, cx, cy, 5f);
      else if (glyph == 3) Gfx.Cross(g, ink, cx, cy, 4.4f, 1.8f);
      else if (glyph == 4) Gfx.Chevron(g, ink, cx, cy, 5.5f, true);
      AddHit(new RectangleF(x, y, size, size), kind, null, tip, null);
    }

    /// <summary>Les trois petits boutons du haut : verrouiller la position, réduire, masquer.</summary>
    private void HeaderButtons(Graphics g, float x, float y, float w, bool full)
    {
      float size = Dim.IconButton;
      float right = x + w - 12f;
      float top = y + 12f;
      IconButton(g, "close", right - size, top, Txt.CloseTip, 3);
      if (full)
      {
        IconButton(g, "min", right - 2 * size - 4f, top, Txt.MinTip, 2);
        IconButton(g, "pin", right - 3 * size - 8f, top, pinned ? "Position verrouillée" : Txt.PinTip, 1);
      }
    }

    private string Mood()
    {
      if (analyzing || state == St.Scanning) return "think";
      if (state == St.Ready) return "alert";
      if (state == St.Done) return "happy";
      if (state == St.Expanded) return Unanswered() > 0 ? "idea" : "happy";
      return "idle";
    }

    private void PaintIdle(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "idle", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 17f, w - 104f - 100f, 24f, Gfx.Left);
      float pulse = (float)(0.5 + 0.5 * Math.Sin(T() * 3.0));
      Gfx.Disc(g, Gfx.Fx(Color.FromArgb((int)(70 + 110 * pulse), Pal.Accent)), tx + 4f, y + 58f, 4f);
      Gfx.Text(g, Txt.Idle, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx + 15f, y + 49f, w - 104f - 30f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);
    }

    private void PaintScanning(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "think", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.ScanTitle, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      Gfx.Text(g, Txt.ScanSub, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      PaintProgress(g, tx, y + 72f, w - 104f - 22f);
      HeaderButtons(g, x, y, w, true);
    }

    /// <summary>Une barre sans pourcentage inventé : un reflet qui court tant que l'analyse dure.</summary>
    private void PaintProgress(Graphics g, float x, float y, float w)
    {
      Gfx.Fill(g, Gfx.Fx(Color.FromArgb(34, 255, 255, 255)), x, y, w, 6f, 3f);
      float seg = w * 0.4f;
      float phase = (float)((T() * 0.85) % 1.0);
      float eased = phase * phase * (3f - 2f * phase);
      float sx = x - seg + (w + seg) * eased;
      GraphicsState saved = g.Save();
      using (GraphicsPath track = Gfx.Round(x, y, w, 6f, 3f))
      {
        g.SetClip(track, CombineMode.Intersect);
        using (LinearGradientBrush bar = new LinearGradientBrush(new RectangleF(sx, y, seg, 6f), Gfx.Fx(Pal.Accent), Gfx.Fx(Pal.Glow), LinearGradientMode.Horizontal)) { g.FillRectangle(bar, sx, y, seg, 6f); }
      }
      g.Restore(saved);
    }

    private void PaintQuiet(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + (h - Dim.Mascot) / 2f, Dim.Mascot, "idle", T());
      float tx = x + 104f;
      Gfx.Text(g, Txt.Quiet, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      Gfx.Text(g, Txt.QuietSub, Gfx.Fnt(13.5f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);
    }

    private string ReadyTitle()
    {
      if (entry.Items.Count == 0) return entry.Alerts.Count > 0 ? Txt.ReadFirst : Txt.Quiet;
      return Plural(entry.Items.Count, Txt.ReadyOne, Txt.ReadyMany);
    }

    private void PaintReady(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 10f, Dim.Mascot, "alert", T());
      float tx = x + 104f;
      Gfx.Text(g, ReadyTitle(), Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 15f, w - 104f - 100f, 24f, Gfx.Left);
      string sub = entry.Subject.Length > 0 ? entry.Subject : Plural(entry.Items.Count, Txt.ForSaleOne, Txt.ForSaleMany);
      Gfx.Text(g, sub, Gfx.Fnt(13f, FontStyle.Regular), Pal.Muted, tx, y + 43f, w - 104f - 20f, 20f, Gfx.Left);
      float bw = w - 104f - 20f;
      float by = y + 78f;
      bool over = IsHover("see", null);
      Color a = over ? Lighten(Pal.Accent, 0.1f) : Pal.Accent;
      Gfx.Gradient(g, Gfx.Fx(a), Gfx.Fx(Pal.AccentDark), tx, by, bw, Dim.ButtonHeight, 14f);
      float label = Gfx.Measure(g, Txt.ReadyButton, Gfx.Fnt(14f, FontStyle.Bold));
      float lx = tx + (bw - label - 24f) / 2f;
      Gfx.Text(g, Txt.ReadyButton, Gfx.Fnt(14f, FontStyle.Bold), Pal.SoldFg, lx, by + 10f, label + 6f, 22f, Gfx.Left);
      Gfx.Arrow(g, Gfx.Fx(Pal.SoldFg), lx + label + 8f, by + Dim.ButtonHeight / 2f, 12f);
      AddHit(new RectangleF(tx, by, bw, Dim.ButtonHeight), "see", null, "", null);
      HeaderButtons(g, x, y, w, true);
    }

    private string ReducedLabel()
    {
      if (analyzing || state == St.Scanning) return Txt.ScanSub;
      if (sessionOpen && entry != null && entry.Items.Count > 0)
      {
        int open = Unanswered();
        return open > 0 ? Plural(open, Txt.ReducedOne, Txt.ReducedMany) : Txt.AllDone;
      }
      if (state == St.Quiet) return Txt.Quiet;
      return Txt.ReducedIdle;
    }

    private void PaintReduced(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 9f, 46f, Mood(), T());
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(14.5f, FontStyle.Bold), Pal.Text, x + 62f, y + 11f, w - 62f - 76f, 20f, Gfx.Left);
      Gfx.Text(g, ReducedLabel(), Gfx.Fnt(12.5f, FontStyle.Regular), Pal.Muted, x + 62f, y + 33f, w - 62f - 76f, 18f, Gfx.Left);
      float size = Dim.IconButton;
      float right = x + w - 10f;
      float top = y + (h - size) / 2f;
      IconButton(g, "close", right - size, top, Txt.CloseTip, 3);
      IconButton(g, "expand", right - 2 * size - 4f, top, "Agrandir", 4);
    }

    // ------------------------------------------------------------------------------------------------------------
    // La fin de vente : une grande coche verte qui se trace, quelques étincelles.
    // ------------------------------------------------------------------------------------------------------------

    private float DoneHeight(float width)
    {
      float textW = width - 24f - 72f - 16f - 20f;
      float height = 20f + 26f + 6f;
      foreach (string line in done.Lines) height += Gfx.MeasureHeight(measure, line, Gfx.Fnt(13f, FontStyle.Regular), textW);
      if (done.Badge.Length > 0) height += 34f;
      height += 20f;
      return Math.Max((float)Dim.HeightDone, height);
    }

    private void PaintDone(Graphics g, float x, float y, float w, float h)
    {
      double age = Now() - stateStart;
      Color tone = done.Warning ? Color.FromArgb(255, 245, 158, 11) : Pal.Accent;
      Color toneDark = done.Warning ? Color.FromArgb(255, 217, 119, 6) : Pal.AccentDark;
      float cx = x + 24f + 36f;
      float cy = y + 20f + 36f;
      float pop = (float)Math.Min(1.0, age / 0.42);
      float back = 1f + 1.70158f * 1.2f;
      float eased = 1f + back * (float)Math.Pow(pop - 1.0, 3) + 1.70158f * (float)Math.Pow(pop - 1.0, 2);
      float radius = 34f * Math.Max(0.05f, eased);
      // Les étincelles : huit points qui s'écartent puis s'éteignent.
      double burst = Math.Min(1.0, age / 0.9);
      if (burst < 1.0 && !done.Warning)
      {
        for (int i = 0; i < 8; i++)
        {
          double angle = i * Math.PI / 4 + 0.2;
          float distance = (float)(40.0 + 24.0 * (1.0 - Math.Pow(1.0 - burst, 2)));
          int alpha = (int)(230 * (1.0 - burst));
          Color spark = (i % 3 == 0) ? Color.FromArgb(alpha, 255, 214, 90) : (i % 3 == 1 ? Color.FromArgb(alpha, Pal.Glow) : Color.FromArgb(alpha, Pal.Accent));
          Gfx.Disc(g, spark, cx + (float)Math.Cos(angle) * distance, cy + (float)Math.Sin(angle) * distance, 3f);
        }
      }
      Gfx.Disc(g, Color.FromArgb(46, tone), cx, cy, radius + 6f);
      using (GraphicsPath disc = new GraphicsPath())
      {
        disc.AddEllipse(cx - radius, cy - radius, radius * 2f, radius * 2f);
        using (LinearGradientBrush fill = new LinearGradientBrush(new RectangleF(cx - radius - 1f, cy - radius - 1f, radius * 2f + 2f, radius * 2f + 2f), tone, toneDark, LinearGradientMode.Vertical)) { g.FillPath(fill, disc); }
      }
      if (done.Warning)
      {
        Gfx.Bang(g, Color.White, cx, cy, 34f);
      }
      else
      {
        float stroke = (float)Math.Max(0.0, Math.Min(1.0, (age - 0.14) / 0.42));
        Gfx.Tick(g, Color.White, cx, cy, 52f, 5.2f, stroke);
      }
      float tx = x + 24f + 72f + 16f;
      float textW = w - (tx - x) - 20f;
      Gfx.Text(g, Txt.DoneTitle, Gfx.Fnt(19f, FontStyle.Bold), Pal.Text, tx, y + 18f, textW, 28f, Gfx.Left);
      float ty = y + 18f + 28f;
      foreach (string line in done.Lines)
      {
        float lh = Gfx.MeasureHeight(g, line, Gfx.Fnt(13f, FontStyle.Regular), textW);
        Gfx.Text(g, line, Gfx.Fnt(13f, FontStyle.Regular), Pal.Muted, tx, ty, textW, lh, Gfx.Wrap);
        ty += lh;
      }
      if (done.Badge.Length > 0)
      {
        float bw = Gfx.Pill(g, tx, ty + 6f, done.Badge, Pal.StockBg, Pal.StockFg, 3, true);
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les conseils : la bannière ouverte.
    // ------------------------------------------------------------------------------------------------------------

    private float FooterHeight() { return 8f + Dim.ButtonHeight + 8f + Dim.FinishHeight + 12f; }

    private float TextColumn(float listWidth) { return listWidth - Dim.Thumb - 12f - 88f - 10f; }

    private float RowHeight(Item item, float listWidth)
    {
      float height = 10f + 20f + (item.Drug.Length > 0 ? 16f : 0f) + (item.Reason.Length > 0 ? 16f : 0f) + 6f + 22f + 10f;
      height += (PillLines(measure, item, TextColumn(listWidth)) - 1) * 28f;
      return Math.Max(height, 78f);
    }

    /// <summary>Les pastilles d'un conseil : Challenge, Date courte, stock. Jamais inventées : le serveur ne les envoie que si elles sont réelles.</summary>
    private static int BuildPills(Item item, string[] texts, Color[] backs, Color[] fores, int[] icons)
    {
      int count = 0;
      if (item.Challenge.Length > 0) { texts[count] = Txt.Challenge; backs[count] = Pal.ChallengeBg; fores[count] = Pal.ChallengeFg; icons[count] = 1; count++; }
      if (item.ShortDate.Length > 0) { texts[count] = Txt.ShortDate + " " + ShortDay(item.ShortDate); backs[count] = Pal.DateBg; fores[count] = Pal.DateFg; icons[count] = 2; count++; }
      string stock; Color stockBack; Color stockFore; int stockIcon;
      Availability(item.Availability, item.Quantity, out stock, out stockBack, out stockFore, out stockIcon);
      texts[count] = stock; backs[count] = stockBack; fores[count] = stockFore; icons[count] = stockIcon; count++;
      return count;
    }

    /// <summary>Une ou deux lignes de pastilles : quand elles ne tiennent pas côte à côte, la dernière passe à la ligne.</summary>
    private int PillLines(Graphics g, Item item, float width)
    {
      string[] texts = new string[3];
      Color[] backs = new Color[3];
      Color[] fores = new Color[3];
      int[] icons = new int[3];
      int count = BuildPills(item, texts, backs, fores, icons);
      float x = 0f;
      int lines = 1;
      for (int i = 0; i < count; i++)
      {
        float pw = Gfx.Pill(g, 0f, 0f, texts[i], backs[i], fores[i], icons[i], false);
        if (x > 0f && x + pw > width) { lines++; x = 0f; }
        x += pw + 6f;
      }
      return lines;
    }

    private float AlertHeight(Graphics g, string text, float width)
    {
      return Gfx.MeasureHeight(g, text, Gfx.Fnt(12.5f, FontStyle.Bold), width - 44f) + 16f;
    }

    private float ListHeight(float width)
    {
      float inner = width - 20f - 28f;
      float total = 24f;
      foreach (string alert in entry.Alerts) total += AlertHeight(measure, alert, inner) + 8f;
      if (entry.Items.Count == 0)
      {
        foreach (string note in entry.Notes) total += Gfx.MeasureHeight(measure, note, Gfx.Fnt(13f, FontStyle.Regular), inner) + 4f;
        total += 6f;
      }
      foreach (Item item in entry.Items) total += RowHeight(item, inner);
      return total + 6f;
    }

    private float ExpandedHeight(float width)
    {
      listHeight = ListHeight(width);
      float viewTop = Dim.Header - 4f + 8f;
      float need = viewTop + listHeight + FooterHeight() + 10f;
      return Math.Min(need, MaxCardHeight());
    }

    private string Subtitle()
    {
      if (analyzing) return Txt.ScanSub;
      if (entry.Items.Count == 0) return entry.Alerts.Count > 0 ? Txt.ReadFirst : Txt.QuietSub;
      int answered = 0;
      foreach (Item item in entry.Items) { if (item.Outcome != "NONE") answered++; }
      if (answered == 0) return Plural(entry.Items.Count, Txt.ForSaleOne, Txt.ForSaleMany);
      return Txt.DuringSale + "  " + answered + "/" + entry.Items.Count;
    }

    private void PaintExpanded(Graphics g, float x, float y, float w, float h)
    {
      Mascot.Draw(g, x + 8f, y + 6f, 76f, Mood(), T());
      float tx = x + 96f;
      Gfx.Text(g, Txt.Brand, Gfx.Fnt(17f, FontStyle.Bold), Pal.Text, tx, y + 18f, w - 96f - 120f, 24f, Gfx.Left);
      Gfx.Text(g, Subtitle(), Gfx.Fnt(13.5f, FontStyle.Regular), analyzing ? Pal.Glow : Pal.Muted, tx, y + 45f, w - 96f - 20f, 20f, Gfx.Left);
      HeaderButtons(g, x, y, w, true);

      float panelX = x + 10f;
      float panelY = y + Dim.Header - 4f;
      float panelW = w - 20f;
      float panelH = h - Dim.Header + 4f - 10f;
      if (panelH < 30f) return;
      Gfx.Fill(g, Gfx.Fx(Pal.Panel), panelX, panelY, panelW, panelH, 18f);

      float footer = FooterHeight();
      float viewTop = panelY + 8f;
      float viewBottom = panelY + panelH - footer;
      float viewH = viewBottom - viewTop;
      float maxScroll = Math.Max(0f, listHeight - viewH);
      if (scrollY > maxScroll) scrollY = maxScroll;
      if (scrollY < 0f) scrollY = 0f;
      if (viewH > 6f)
      {
        RectangleF view = new RectangleF(panelX, viewTop, panelW, viewH);
        GraphicsState saved = g.Save();
        g.SetClip(view, CombineMode.Intersect);
        PaintList(g, panelX + 14f, viewTop - scrollY, panelW - 28f, view);
        g.Restore(saved);
        if (maxScroll > 1f)
        {
          float trackH = viewH - 8f;
          float thumbH = Math.Max(24f, trackH * viewH / listHeight);
          float thumbY = viewTop + 4f + (trackH - thumbH) * (scrollY / maxScroll);
          Gfx.Fill(g, Gfx.Fx(Color.FromArgb(90, 90, 114, 128)), panelX + panelW - 7f, thumbY, 3.5f, thumbH, 1.75f);
        }
      }

      float footerTop = panelY + panelH - footer;
      Gfx.Fill(g, Gfx.Fx(Pal.Line), panelX + 14f, footerTop, panelW - 28f, 1f, 0f);
      PaintFooter(g, panelX + 14f, footerTop + 8f, panelW - 28f);
    }

    private void PaintList(Graphics g, float x, float y, float w, RectangleF view)
    {
      float cursor = y;
      Gfx.Text(g, entry.Label.ToUpperInvariant(), Gfx.Fnt(10.5f, FontStyle.Bold), Pal.InkSoft, x, cursor + 3f, 70f, 14f, Gfx.Left);
      float labelW = Gfx.Measure(g, entry.Label.ToUpperInvariant(), Gfx.Fnt(10.5f, FontStyle.Bold)) + 10f;
      Gfx.Text(g, entry.Subject, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + labelW, cursor + 1f, w - labelW, 18f, Gfx.Left);
      cursor += 24f;

      foreach (string alert in entry.Alerts)
      {
        float ah = AlertHeight(g, alert, w);
        if (cursor + ah > view.Top && cursor < view.Bottom)
        {
          Gfx.Fill(g, Gfx.Fx(Pal.AlertBg), x, cursor, w, ah, 12f);
          Gfx.Warning(g, Gfx.Fx(Pal.AlertFg), x + 17f, cursor + 14f, 13f);
          Gfx.Text(g, alert, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.AlertFg, x + 34f, cursor + 8f, w - 44f, ah - 10f, Gfx.Wrap);
        }
        cursor += ah + 8f;
      }

      if (entry.Items.Count == 0)
      {
        foreach (string note in entry.Notes)
        {
          float nh = Gfx.MeasureHeight(g, note, Gfx.Fnt(13f, FontStyle.Regular), w);
          Gfx.Text(g, note, Gfx.Fnt(13f, FontStyle.Regular), Pal.InkSoft, x, cursor, w, nh, Gfx.Wrap);
          cursor += nh + 4f;
        }
        cursor += 6f;
      }

      for (int i = 0; i < entry.Items.Count; i++)
      {
        cursor += PaintRow(g, entry.Items[i], x, cursor, w, i == entry.Items.Count - 1, view);
      }
    }

    private static string ShortDay(string date)
    {
      // 30/11/2026 -> 30/11/26
      return date.Length == 10 ? date.Substring(0, 6) + date.Substring(8, 2) : date;
    }

    private float PaintRow(Graphics g, Item item, float x, float y, float w, bool last, RectangleF view)
    {
      float rowH = RowHeight(item, w);
      if (y + rowH < view.Top || y > view.Bottom) return rowH;
      if (!last) Gfx.Fill(g, Gfx.Fx(Pal.Line), x, y + rowH - 1f, w, 1f, 0f);
      DrawPhoto(g, item.Image, x, y + 12f, Dim.Thumb);
      float tx = x + Dim.Thumb + 12f;
      float buttons = 88f;
      float rightX = x + w - buttons;
      float textW = rightX - tx - 10f;

      Font nameFont = Gfx.Fnt(14f, FontStyle.Bold);
      float priceW = 0f;
      if (item.Price.Length > 0) priceW = Gfx.Measure(g, item.Price, Gfx.Fnt(12.5f, FontStyle.Bold)) + 4f;
      Gfx.Text(g, item.Name, nameFont, Pal.Ink, tx, y + 9f, textW - priceW - (priceW > 0f ? 6f : 0f), 20f, Gfx.Left);
      if (priceW > 0f) Gfx.Text(g, item.Price, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.StockFg, tx + textW - priceW, y + 10f, priceW + 2f, 18f, Gfx.Right);
      float line = y + 30f;
      if (item.Drug.Length > 0)
      {
        Gfx.Text(g, Txt.ForDrug + item.Drug, Gfx.Fnt(12f, FontStyle.Regular), Pal.InkSoft, tx, line, textW, 16f, Gfx.Left);
        line += 16f;
      }
      if (item.Reason.Length > 0)
      {
        Gfx.Text(g, Gfx.Shorten(item.Reason, 110), Gfx.Fnt(12f, FontStyle.Regular), Pal.InkSoft, tx, line, textW, 16f, Gfx.Left);
      }

      // Les pastilles, sur une ou deux lignes (le bas de la ligne reste aligné avec le bas du conseil).
      string[] texts = new string[3];
      Color[] backs = new Color[3];
      Color[] fores = new Color[3];
      int[] icons = new int[3];
      int count = BuildPills(item, texts, backs, fores, icons);
      int pillLines = PillLines(g, item, textW);
      float px = 0f;
      float py = y + rowH - 10f - 22f - (pillLines - 1) * 28f;
      for (int i = 0; i < count; i++)
      {
        float pw = Gfx.Pill(g, 0f, 0f, texts[i], backs[i], fores[i], icons[i], false);
        if (px > 0f && px + pw > textW) { px = 0f; py += 28f; }
        Gfx.Pill(g, tx + px, py, texts[i], backs[i], fores[i], icons[i], true);
        px += pw + 6f;
      }

      // La réponse du pharmacien.
      if (item.Outcome == "NONE")
      {
        float by = y + (rowH - 56f) / 2f;
        Btn(g, "vendu", item, rightX, by, buttons, 26f, Txt.Sold, Pal.SoldBg, Pal.SoldFg, Color.FromArgb(0, 0, 0, 0), 13f, 13f, view);
        Btn(g, "nonvendu", item, rightX, by + 30f, buttons, 26f, Txt.NotSold, Pal.NotSoldBg, Pal.NotSoldFg, Color.FromArgb(0, 0, 0, 0), 13f, 12.5f, view);
      }
      else
      {
        bool sold = item.Outcome == "SOLD";
        float cy = y + (rowH - 54f) / 2f;
        Gfx.Fill(g, Gfx.Fx(sold ? Pal.StockBg : Pal.NotSoldBg), rightX, cy, buttons, 28f, 14f);
        if (sold)
        {
          Gfx.Tick(g, Gfx.Fx(Pal.StockFg), rightX + 18f, cy + 14f, 14f, 2f, 1f);
          Gfx.Text(g, Txt.Sold, Gfx.Fnt(13f, FontStyle.Bold), Pal.StockFg, rightX + 30f, cy + 6f, buttons - 34f, 18f, Gfx.Left);
        }
        else
        {
          Gfx.Text(g, Txt.NotSold, Gfx.Fnt(12.5f, FontStyle.Bold), Pal.NotSoldFg, rightX, cy + 6f, buttons, 18f, Gfx.Center);
        }
        bool over = IsHover("modifier", item);
        Gfx.Text(g, Txt.Change, Gfx.Fnt(12f, FontStyle.Bold), over ? Pal.AccentDark : Pal.InkSoft, rightX, cy + 34f, buttons, 16f, Gfx.Center);
        AddHit(new RectangleF(rightX, cy + 30f, buttons, 22f), "modifier", item, "", view);
      }
      return rowH;
    }

    private static void Availability(string code, string quantity, out string text, out Color back, out Color fore, out int icon)
    {
      if (code == "IN_STOCK") { text = Txt.InStock + (quantity.Length > 0 ? " · " + quantity : ""); back = Pal.StockBg; fore = Pal.StockFg; icon = 3; }
      else if (code == "LOW_STOCK") { text = Txt.LowStock + (quantity.Length > 0 ? " · " + quantity : ""); back = Pal.LowBg; fore = Pal.LowFg; icon = 4; }
      else if (code == "OUT_OF_STOCK") { text = Txt.OutOfStock; back = Pal.OutBg; fore = Pal.OutFg; icon = 5; }
      else { text = Txt.UnknownStock; back = Pal.UnknownBg; fore = Pal.UnknownFg; icon = 0; }
    }

    private void PaintFooter(Graphics g, float x, float y, float w)
    {
      float detailW = 138f;
      float leftW = w - detailW - 8f;
      float bh = Dim.ButtonHeight;
      if (entry.EmailSaved)
      {
        Gfx.Fill(g, Gfx.Fx(Pal.StockBg), x, y, leftW, bh, 14f);
        Gfx.Tick(g, Gfx.Fx(Pal.StockFg), x + 20f, y + bh / 2f, 15f, 2.2f, 1f);
        Gfx.Text(g, Txt.EmailSaved, Gfx.Fnt(13f, FontStyle.Bold), Pal.StockFg, x + 36f, y + 11f, leftW - 36f - 70f, 20f, Gfx.Left);
        bool over = IsHover("emailRemove", null);
        Gfx.Text(g, Txt.EmailRemove, Gfx.Fnt(12.5f, FontStyle.Bold), over ? Pal.AccentDark : Pal.StockFg, x + leftW - 72f, y + 12f, 64f, 18f, Gfx.Right);
        AddHit(new RectangleF(x + leftW - 76f, y, 76f, bh), "emailRemove", null, "", null);
      }
      else
      {
        bool over = IsHover("email", null);
        Gfx.Fill(g, Gfx.Fx(over ? Color.White : Pal.Panel), x, y, leftW, bh, 14f);
        Gfx.Stroke(g, Gfx.Fx(over ? Pal.Accent : Color.FromArgb(255, 190, 208, 218)), 1.4f, x + 0.7f, y + 0.7f, leftW - 1.4f, bh - 1.4f, 14f);
        Gfx.Envelope(g, Gfx.Fx(Pal.InkSoft), x + 22f, y + bh / 2f, 15f);
        Gfx.Text(g, Txt.EmailAdd, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + 40f, y + 11f, leftW - 46f, 20f, Gfx.Left);
        AddHit(new RectangleF(x, y, leftW, bh), "email", null, "", null);
      }
      bool detailOver = IsHover("detail", null);
      Gfx.Fill(g, Gfx.Fx(detailOver ? Color.White : Pal.Panel), x + leftW + 8f, y, detailW, bh, 14f);
      Gfx.Stroke(g, Gfx.Fx(detailOver ? Pal.Accent : Color.FromArgb(255, 190, 208, 218)), 1.4f, x + leftW + 8.7f, y + 0.7f, detailW - 1.4f, bh - 1.4f, 14f);
      Gfx.Text(g, Txt.Detail, Gfx.Fnt(13f, FontStyle.Bold), Pal.Ink, x + leftW + 8f, y + 11f, detailW, 20f, Gfx.Center);
      AddHit(new RectangleF(x + leftW + 8f, y, detailW, bh), "detail", null, "", null);

      float fy = y + bh + 8f;
      bool busy = finishing;
      Color top = busy ? Color.FromArgb(255, 160, 178, 188) : (IsHover("finish", null) ? Lighten(Pal.Accent, 0.1f) : Pal.Accent);
      Color bottom = busy ? Color.FromArgb(255, 140, 158, 168) : Pal.AccentDark;
      Gfx.Gradient(g, Gfx.Fx(top), Gfx.Fx(bottom), x, fy, w, Dim.FinishHeight, 16f);
      string label = busy ? Txt.Finishing : Txt.Finish;
      Font labelFont = Gfx.Fnt(15f, FontStyle.Bold);
      float lw = Gfx.Measure(g, label, labelFont);
      float lx = x + (w - lw - (busy ? 0f : 26f)) / 2f + (busy ? 0f : 26f);
      if (!busy) Gfx.Tick(g, Gfx.Fx(Pal.SoldFg), lx - 16f, fy + Dim.FinishHeight / 2f, 17f, 2.4f, 1f);
      Gfx.Text(g, label, labelFont, Pal.SoldFg, lx, fy + (Dim.FinishHeight - 20f) / 2f, lw + 8f, 22f, Gfx.Left);
      if (!busy) AddHit(new RectangleF(x, fy, w, Dim.FinishHeight), "finish", null, "", null);
    }

    private void DrawTip(Graphics g)
    {
      if (hover == null || hover.Tip.Length == 0 || dragging) return;
      Font font = Gfx.Fnt(11.5f, FontStyle.Regular);
      float tw = Gfx.Measure(g, hover.Tip, font) + 18f;
      float tx = hover.R.X + hover.R.Width / 2f - tw / 2f;
      float limitLeft = Dim.Margin + 6f;
      float limitRight = Dim.Margin + curW - 6f - tw;
      if (tx > limitRight) tx = limitRight;
      if (tx < limitLeft) tx = limitLeft;
      float ty = hover.R.Bottom + 6f;
      Gfx.Fill(g, Color.FromArgb(232, 6, 24, 34), tx, ty, tw, 24f, 8f);
      g.DrawString(hover.Tip, font, Gfx.Brs(Color.White), new RectangleF(tx + 9f, ty + 4.5f, tw, 18f), Gfx.Left);
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les photos des produits.
    // ------------------------------------------------------------------------------------------------------------

    private Image LoadPhoto(string path)
    {
      if (!File.Exists(path)) return null;
      try
      {
        using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
        using (Image raw = Image.FromStream(stream))
        {
          return new Bitmap(raw);
        }
      }
      catch (Exception) { return null; }
    }

    private void DrawPhoto(Graphics g, string path, float x, float y, float size)
    {
      Image image = null;
      if (!string.IsNullOrEmpty(path) && !photos.TryGetValue(path, out image))
      {
        image = LoadPhoto(path);
        if (photos.Count > 24)
        {
          foreach (Image old in photos.Values) { if (old != null) old.Dispose(); }
          photos.Clear();
        }
        photos[path] = image;
      }
      if (image == null) { Gfx.Bottle(g, x, y, size); return; }
      GraphicsState saved = g.Save();
      using (GraphicsPath clip = Gfx.Round(x, y, size, size, 11f)) { g.SetClip(clip, CombineMode.Intersect); }
      Gfx.Fill(g, Color.White, x, y, size, size, 0f);
      float zoom = Math.Min(size / image.Width, size / image.Height);
      float iw = image.Width * zoom;
      float ih = image.Height * zoom;
      g.DrawImage(image, x + (size - iw) / 2f, y + (size - ih) / 2f, iw, ih);
      g.Restore(saved);
    }

    protected override void Dispose(bool disposing)
    {
      if (disposing)
      {
        timer.Stop();
        timer.Dispose();
        if (buffer != null) buffer.Dispose();
        measure.Dispose();
        measureBitmap.Dispose();
        foreach (Image image in photos.Values) { if (image != null) image.Dispose(); }
        photos.Clear();
      }
      base.Dispose(disposing);
    }
  }

  /// <summary>Un bouton arrondi qui ne prend jamais le focus.</summary>
  public class FlatButton : Control
  {
    private readonly Color back;
    private readonly Color backHover;
    private readonly Color fore;
    private readonly Color edge;
    private bool hovered;
    /// <summary>Un bouton momentanément inutilisable : grisé, et sans effet.</summary>
    public bool Muted;

    public FlatButton(string text, Color back, Color backHover, Color fore, Color edge, Font font)
    {
      this.back = back;
      this.backHover = backHover;
      this.fore = fore;
      this.edge = edge;
      Text = text;
      Font = font;
      Cursor = Cursors.Hand;
      SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
      SetStyle(ControlStyles.Selectable, false);
      TabStop = false;
    }

    protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }

    protected override void OnPaint(PaintEventArgs e)
    {
      Graphics g = e.Graphics;
      g.SmoothingMode = SmoothingMode.AntiAlias;
      g.Clear(Parent != null ? Parent.BackColor : Color.White);
      using (GraphicsPath path = Gfx.Round(0.5f, 0.5f, Width - 1.5f, Height - 1.5f, Height / 3f))
      {
        g.FillPath(Gfx.Brs(Muted ? Color.FromArgb(255, 226, 233, 237) : (hovered ? backHover : back)), path);
        if (edge.A > 0 && !Muted) { using (Pen pen = new Pen(edge, 1.4f)) { g.DrawPath(pen, path); } }
      }
      TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), Muted ? Color.FromArgb(255, 120, 136, 146) : fore, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }
  }

  /// <summary>
  /// Le champ « e-mail du patient » : une petite carte posée sous la bannière. C'est la SEULE fenêtre qui prend le clavier, et seulement
  /// quand le pharmacien clique dans son champ (BeginTyping, EndTyping) ; elle le rend aussitôt la saisie finie.
  /// </summary>
  public class EmailForm : Form
  {
    public event Action<string> Word;
    public event Action Saved;

    private readonly float scale;
    private readonly string saleId;
    private readonly System.Windows.Forms.Timer typingTimer = new System.Windows.Forms.Timer();
    private bool editing;
    private IntPtr previousForeground = IntPtr.Zero;
    private TextBox emailBox;
    private CheckBox consent;
    private Label message;
    private FlatButton saveButton;
    private string emailText = "";
    private bool emailConsent;

    public EmailForm(string id, string error)
    {
      saleId = id;
      float found = 1f;
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { found = g.DpiX / 96f; }
      scale = found < 1f ? 1f : found;
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Pal.Panel;
      DoubleBuffered = true;
      typingTimer.Tick += delegate { EndTyping(true); };
      Build(error);
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée d'elle-même.
        p.ExStyle |= 0x08000000 | 0x00000080;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : un clic sur un bouton n'active pas la fenêtre ; seule la saisie, voulue par un clic dans le champ, a le droit d'activer.
      if (m.Msg == 0x0021 && !editing) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnDeactivate(EventArgs e)
    {
      base.OnDeactivate(e);
      // Le pharmacien a cliqué ailleurs (le logiciel de gestion) : la saisie s'arrête, la carte redevient muette.
      if (editing) EndTyping(false);
    }

    private int S(int value) { return (int)Math.Round(value * scale); }
    private Font F(float points, FontStyle style) { return new Font(Gfx.Face(), points, style, GraphicsUnit.Point); }

    private Label Words(string text, Font font, Color color, int x, int y, int width)
    {
      Size size = TextRenderer.MeasureText(text, font, new Size(Math.Max(10, width - S(4)), 10000), TextFormatFlags.WordBreak);
      Label label = new Label();
      label.AutoSize = false;
      label.UseMnemonic = false;
      label.UseCompatibleTextRendering = false;
      label.Text = text;
      label.Font = font;
      label.ForeColor = color;
      label.BackColor = Color.Transparent;
      label.Location = new Point(x, y);
      label.Size = new Size(width, size.Height + S(3));
      Controls.Add(label);
      return label;
    }

    private void Build(string error)
    {
      int width = S(360);
      int pad = S(16);
      int inner = width - 2 * pad;
      int y = pad;
      Label title = Words("E-mail du patient", F(11.5f, FontStyle.Bold), Pal.Ink, pad, y, inner);
      y += title.Height + S(4);

      emailBox = new TextBox();
      emailBox.Font = F(11f, FontStyle.Regular);
      emailBox.BorderStyle = BorderStyle.FixedSingle;
      emailBox.Location = new Point(pad, y);
      emailBox.Width = inner;
      emailBox.MaxLength = 160;
      emailBox.MouseDown += delegate { BeginTyping(); };
      emailBox.TextChanged += delegate
      {
        string typed = emailBox.Text;
        // Un code-barres tombé dans le champ (douchette) n'est pas une adresse : on l'efface.
        if (typed.Length >= 8 && IsAllDigits(typed)) { emailBox.Text = ""; typed = ""; }
        emailText = typed;
        RefreshSave();
      };
      emailBox.KeyDown += delegate (object sender, KeyEventArgs k)
      {
        if (k.KeyCode == Keys.Enter) { k.SuppressKeyPress = true; SaveEmail(); }
        else if (k.KeyCode == Keys.Escape) { k.SuppressKeyPress = true; LaterEmail(); }
      };
      Controls.Add(emailBox);
      y += emailBox.Height + S(8);

      consent = new CheckBox();
      consent.Text = "Le patient accepte de recevoir son bilan par e-mail";
      consent.Font = F(9.5f, FontStyle.Regular);
      consent.ForeColor = Pal.Ink;
      consent.BackColor = Color.Transparent;
      consent.UseCompatibleTextRendering = false;
      consent.AutoSize = false;
      consent.Location = new Point(pad, y);
      consent.Size = new Size(inner, S(24));
      consent.TabStop = false;
      consent.CheckedChanged += delegate { emailConsent = consent.Checked; RefreshSave(); };
      Controls.Add(consent);
      y += consent.Height + S(2);

      message = Words(error, F(9.5f, FontStyle.Bold), Pal.AlertFg, pad, y, inner);
      y += Math.Max(message.Height, S(6));

      saveButton = new FlatButton("Enregistrer l'e-mail", Pal.Accent, Lighten(Pal.Accent), Pal.SoldFg, Color.FromArgb(0, 0, 0, 0), F(10.5f, FontStyle.Bold));
      saveButton.Location = new Point(pad, y);
      saveButton.Size = new Size(inner - S(104), S(38));
      saveButton.Click += delegate { SaveEmail(); };
      Controls.Add(saveButton);
      FlatButton later = new FlatButton("Plus tard", Pal.NotSoldBg, Lighten(Pal.NotSoldBg), Pal.NotSoldFg, Color.FromArgb(0, 0, 0, 0), F(10.5f, FontStyle.Bold));
      later.Location = new Point(pad + saveButton.Width + S(8), y);
      later.Size = new Size(S(96), S(38));
      later.Click += delegate { LaterEmail(); };
      Controls.Add(later);
      y += S(38) + pad;
      ClientSize = new Size(width, y);
      using (GraphicsPath shape = Gfx.Round(0, 0, Width, Height, S(18))) { Region = new Region(shape); }
      RefreshSave();
    }

    private static Color Lighten(Color color)
    {
      return Color.FromArgb(color.A, (int)(color.R + (255 - color.R) * 0.14), (int)(color.G + (255 - color.G) * 0.14), (int)(color.B + (255 - color.B) * 0.14));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Gfx.Round(1f, 1f, Width - 3f, Height - 3f, S(18)))
      using (Pen pen = new Pen(Pal.Accent, Math.Max(2f, scale * 2f)))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }

    /// <summary>Le serveur a refusé l'adresse : on le dit dans la carte, sans la refermer.</summary>
    public void ShowError(string text)
    {
      if (message != null) message.Text = text;
    }

    /// <summary>Se pose sous la carte de la bannière, alignée à sa droite ; au-dessus si le bas de l'écran manque de place.</summary>
    public void Place(Rectangle card)
    {
      Rectangle area = Screen.FromRectangle(card).WorkingArea;
      int x = card.Right - Width;
      int y = card.Bottom + S(10);
      if (y + Height > area.Bottom) y = Math.Max(area.Top, card.Top - Height - S(10));
      if (x < area.Left) x = area.Left;
      if (x + Width > area.Right) x = area.Right - Width;
      Location = new Point(x, y);
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
    }

    private static bool IsAllDigits(string text)
    {
      foreach (char c in text) { if (c < '0' || c > '9') return false; }
      return text.Length > 0;
    }

    private static bool LooksLikeEmail(string text)
    {
      if (text.Length < 6 || text.Length > 160 || text.Contains(" ")) return false;
      int at = text.IndexOf('@');
      if (at < 1 || at != text.LastIndexOf('@')) return false;
      string domain = text.Substring(at + 1);
      int dot = domain.LastIndexOf('.');
      return dot > 0 && dot < domain.Length - 2 && !domain.Contains("..");
    }

    private void RefreshSave()
    {
      if (saveButton == null) return;
      saveButton.Muted = !(emailConsent && LooksLikeEmail(emailText.Trim()));
      saveButton.Invalidate();
    }

    private void SaveEmail()
    {
      string text = emailText.Trim();
      if (!emailConsent) { message.Text = "Le patient doit d'abord donner son accord."; return; }
      if (!LooksLikeEmail(text)) { message.Text = "Cette adresse ne semble pas valide."; return; }
      EndTyping(true);
      if (Word != null) Word("EMAIL " + saleId + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
      if (Saved != null) Saved();
      Close();
    }

    private void LaterEmail()
    {
      EndTyping(true);
      Close();
    }

    /// <summary>
    /// Le seul moment où l'on prend le clavier : le pharmacien a cliqué dans le champ de l'e-mail. On retient la fenêtre qui était
    /// devant (le logiciel de gestion) pour la lui rendre aussitôt la saisie finie.
    /// </summary>
    private void BeginTyping()
    {
      if (editing || emailBox == null) return;
      editing = true;
      previousForeground = Native.GetForegroundWindow();
      if (previousForeground == Handle) previousForeground = IntPtr.Zero;
      int style = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
      Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, style & ~Native.WS_EX_NOACTIVATE);
      Native.SetForegroundWindow(Handle);
      ActiveControl = emailBox;
      typingTimer.Stop();
      typingTimer.Interval = 40000;
      typingTimer.Start();
    }

    private void EndTyping(bool giveBack)
    {
      if (!editing) return;
      editing = false;
      typingTimer.Stop();
      try
      {
        int style = Native.GetWindowLong(Handle, Native.GWL_EXSTYLE);
        Native.SetWindowLong(Handle, Native.GWL_EXSTYLE, style | Native.WS_EX_NOACTIVATE);
      }
      catch (Exception) { }
      ActiveControl = null;
      if (giveBack && previousForeground != IntPtr.Zero) Native.SetForegroundWindow(previousForeground);
      previousForeground = IntPtr.Zero;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
      EndTyping(true);
      base.OnFormClosing(e);
    }
  }

  internal static class TrayIcon
  {
    /// <summary>L'icône près de l'horloge : le logo PharmaBoost et, en pastille rouge, le nombre de conseils sans réponse.</summary>
    public static Bitmap Make(int count)
    {
      Bitmap bmp = new Bitmap(32, 32);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        Gfx.Gradient(g, Pal.Accent, Pal.AccentDark, 1, 3, 26, 26, 8);
        g.FillRectangle(Gfx.Brs(Color.White), 12, 8, 4, 16);
        g.FillRectangle(Gfx.Brs(Color.White), 6, 14, 16, 4);
        if (count <= 0) return bmp;
        string label = count > 9 ? "9+" : count.ToString();
        using (Pen ring = new Pen(Color.White, 2f))
        using (Font font = new Font(Gfx.Face(), count > 9 ? 9f : 11f, FontStyle.Bold, GraphicsUnit.Pixel))
        {
          g.FillEllipse(Gfx.Brs(Color.FromArgb(255, 217, 45, 32)), 13, 0, 19, 19);
          g.DrawEllipse(ring, 13, 0, 19, 19);
          StringFormat center = new StringFormat();
          center.Alignment = StringAlignment.Center;
          center.LineAlignment = StringAlignment.Center;
          g.DrawString(label, font, Gfx.Brs(Color.White), new RectangleF(13, 0, 19, 19), center);
        }
      }
      return bmp;
    }
  }

  /// <summary>Le chef d'orchestre : la bannière, le champ e-mail, l'icône près de l'horloge, la ligne de commande.</summary>
  public class Host : ApplicationContext
  {
    private readonly NotifyIcon tray = new NotifyIcon();
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly System.Windows.Forms.Timer ageTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer followTimer = new System.Windows.Forms.Timer();
    private readonly Control ui = new Control();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private BannerForm banner;
    private EmailForm email;
    private IntPtr iconHandle = IntPtr.Zero;
    private int iconCount = -1;
    private string position = "haut-droite";
    private string positionFile = "";

    public Host()
    {
      ui.CreateControl();
      IntPtr unused = ui.Handle;
      tray.ContextMenuStrip = menu;
      tray.MouseClick += delegate (object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left && banner != null && !banner.IsDisposed) banner.Reveal(); };
      menu.Opening += delegate { BuildMenu(); };
      ageTimer.Interval = 60000;
      ageTimer.Tick += delegate { if (banner != null && !banner.IsDisposed) banner.Expire(); };
      ageTimer.Start();
      followTimer.Interval = 300;
      followTimer.Tick += delegate { FollowBanner(); };

      System.Threading.Thread reader = new System.Threading.Thread(ReadLoop);
      reader.IsBackground = true;
      reader.Start();
      Say("PRET");
    }

    private static void Say(string text)
    {
      try { Console.Out.WriteLine(text); Console.Out.Flush(); } catch (Exception) { }
    }

    private void ReadLoop()
    {
      try
      {
        StreamReader input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        string line;
        while ((line = input.ReadLine()) != null)
        {
          string copy = line;
          if (copy.Length == 0) continue;
          ui.BeginInvoke(new MethodInvoker(delegate { Handle(copy); }));
        }
      }
      catch (Exception) { }
      // La liaison avec l'agent est fermée : plus personne à servir.
      try { ui.BeginInvoke(new MethodInvoker(delegate { Quit(); })); } catch (Exception) { }
    }

    private void Handle(string line)
    {
      try
      {
        Dictionary<string, object> command = json.DeserializeObject(line) as Dictionary<string, object>;
        if (command == null) return;
        string op = Str(command, "op");
        string where = Str(command, "position");
        if (where.Length > 0) position = where;
        string file = Str(command, "positionFile");
        if (file.Length > 0) positionFile = file;
        if (op == "init") Begin();
        else if (op == "scan") { Begin(); banner.BeginScan(); }
        else if (op == "show")
        {
          Dictionary<string, object> raw = command.ContainsKey("entry") ? command["entry"] as Dictionary<string, object> : null;
          if (raw != null) Show(Parse(raw));
        }
        else if (op == "done")
        {
          Dictionary<string, object> raw = command.ContainsKey("info") ? command["info"] as Dictionary<string, object> : null;
          if (raw != null && banner != null) { banner.ApplyDone(ParseDone(raw)); CloseEmail(); }
        }
        else if (op == "remove") { if (banner != null) banner.RemoveSale(Str(command, "id")); }
        else if (op == "quit") Quit();
      }
      catch (Exception problem)
      {
        Say("ERREUR commande " + Gfx.Shorten(problem.Message.Replace("\r", " ").Replace("\n", " "), 120));
      }
    }

    private static string Str(Dictionary<string, object> d, string key)
    {
      object value;
      return d.TryGetValue(key, out value) && value != null ? Convert.ToString(value) : "";
    }

    private static bool Flag(Dictionary<string, object> d, string key)
    {
      string text = Str(d, key);
      return text == "True" || text == "true";
    }

    private static List<object> Seq(Dictionary<string, object> d, string key)
    {
      List<object> list = new List<object>();
      object value;
      if (d.TryGetValue(key, out value) && value is System.Collections.IEnumerable && !(value is string))
      {
        foreach (object item in (System.Collections.IEnumerable)value) list.Add(item);
      }
      return list;
    }

    private static Entry Parse(Dictionary<string, object> d)
    {
      Entry e = new Entry();
      e.Id = Str(d, "id");
      e.Reference = Str(d, "reference");
      e.Label = Str(d, "label");
      if (e.Label.Length == 0) e.Label = "Détecté";
      e.Subject = Str(d, "subject");
      e.Url = Str(d, "url");
      e.Signature = Str(d, "signature");
      e.Quiet = Flag(d, "quiet");
      e.EmailSaved = Flag(d, "emailSaved");
      e.EmailError = Str(d, "emailError");
      foreach (object a in Seq(d, "alerts")) e.Alerts.Add(Convert.ToString(a));
      foreach (object n in Seq(d, "notes")) e.Notes.Add(Convert.ToString(n));
      foreach (object o in Seq(d, "items"))
      {
        Dictionary<string, object> raw = o as Dictionary<string, object>;
        if (raw == null) continue;
        Item item = new Item();
        item.Id = Str(raw, "id");
        item.Drug = Str(raw, "drug");
        item.Challenge = Str(raw, "challenge");
        item.ShortDate = Str(raw, "shortDate");
        item.Outcome = Str(raw, "outcome");
        if (item.Outcome != "SOLD" && item.Outcome != "NOT_SOLD") item.Outcome = "NONE";
        item.Name = Str(raw, "name");
        item.Price = Str(raw, "price");
        item.Reason = Str(raw, "reason");
        item.Availability = Str(raw, "availability");
        item.Quantity = Str(raw, "quantity");
        item.Image = Str(raw, "image");
        e.Items.Add(item);
      }
      return e;
    }

    private static DoneInfo ParseDone(Dictionary<string, object> d)
    {
      DoneInfo info = new DoneInfo();
      info.Id = Str(d, "id");
      info.Title = Str(d, "title");
      info.Badge = Str(d, "badge");
      info.Warning = Flag(d, "warning");
      foreach (object line in Seq(d, "lines")) info.Lines.Add(Convert.ToString(line));
      return info;
    }

    /// <summary>La bannière existe, visible, « En attente de scan… ». Appelée par « init », et par tout ce qui l'oublierait.</summary>
    private void Begin()
    {
      if (banner == null || banner.IsDisposed)
      {
        banner = new BannerForm();
        banner.Word += delegate (string word) { OnBannerWord(word); };
        banner.EmailRequested += delegate { OpenEmail(""); };
        banner.Changed += delegate { RefreshTray(); };
        banner.Ended += delegate { CloseEmail(); };
        banner.DoneEnded += delegate (string id) { if (id.Length > 0) Say("FERMEE " + id); };
      }
      banner.Start(positionFile, position);
      tray.Visible = true;
      RefreshTray();
    }

    private void Show(Entry entry)
    {
      Begin();
      banner.ApplyEntry(entry);
      if (entry.EmailError.Length > 0) OpenEmail(entry.EmailError);
      else if (entry.EmailSaved) CloseEmail();
      RefreshTray();
    }

    /// <summary>Ce que la bannière dit : les réponses vont à l'agent ; « Voir le détail » ouvre la vente dans PharmaBoost.</summary>
    private void OnBannerWord(string word)
    {
      if (word.StartsWith("VOIR "))
      {
        string url = banner != null ? banner.SaleUrl : "";
        try { if (!string.IsNullOrEmpty(url)) Process.Start(url); } catch (Exception) { }
      }
      Say(word);
    }

    private void OpenEmail(string error)
    {
      if (banner == null || banner.IsDisposed || !banner.SaleOpen) return;
      if (email != null && !email.IsDisposed)
      {
        if (error.Length > 0) email.ShowError(error);
        email.Place(banner.CardBounds());
        return;
      }
      email = new EmailForm(banner.SaleId, error);
      email.Word += delegate (string word) { Say(word); };
      email.Saved += delegate { if (banner != null && !banner.IsDisposed) banner.MarkEmailSaved(); };
      email.FormClosed += delegate { email = null; followTimer.Stop(); };
      email.Show();
      email.Place(banner.CardBounds());
      followTimer.Start();
    }

    private void CloseEmail()
    {
      if (email != null && !email.IsDisposed) email.Close();
      email = null;
      followTimer.Stop();
    }

    /// <summary>Le champ e-mail suit la bannière quand elle bouge ou change de taille ; il se range si la bannière se masque.</summary>
    private void FollowBanner()
    {
      if (email == null || email.IsDisposed) { followTimer.Stop(); return; }
      if (banner == null || banner.IsDisposed || banner.Hidden) { CloseEmail(); return; }
      email.Place(banner.CardBounds());
    }

    private void BuildMenu()
    {
      menu.Items.Clear();
      int open = banner != null ? banner.Unanswered() : 0;
      string head = (banner != null && banner.SaleOpen) ? "PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse") : "PharmaBoost — en attente de scan";
      ToolStripMenuItem title = new ToolStripMenuItem(head);
      title.Enabled = false;
      menu.Items.Add(title);
      menu.Items.Add(new ToolStripSeparator());
      if (banner == null || banner.IsDisposed) return;
      menu.Items.Add("Afficher la bannière", null, delegate { banner.Reveal(); });
      menu.Items.Add(banner.Reduced ? "Agrandir la bannière" : "Réduire la bannière", null, delegate { banner.SetReduced(!banner.Reduced); });
      menu.Items.Add("Masquer la bannière", null, delegate { banner.HideByUser(); });
      ToolStripMenuItem pin = new ToolStripMenuItem("Verrouiller la position");
      pin.Checked = banner.Pinned;
      pin.Click += delegate { banner.SetPinned(!banner.Pinned); };
      menu.Items.Add(pin);
      if (banner.SaleOpen)
      {
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Vente terminée", null, delegate { Say("TERMINER " + banner.SaleId); });
      }
    }

    /// <summary>L'icône près de l'horloge reste toujours là (c'est le moyen de retrouver une bannière masquée) ; elle porte le nombre de conseils sans réponse.</summary>
    private void RefreshTray()
    {
      int open = banner != null && !banner.IsDisposed ? banner.Unanswered() : 0;
      if (open != iconCount)
      {
        iconCount = open;
        IntPtr previous = iconHandle;
        using (Bitmap bmp = TrayIcon.Make(open))
        {
          iconHandle = bmp.GetHicon();
          tray.Icon = Icon.FromHandle(iconHandle);
        }
        if (previous != IntPtr.Zero) Native.DestroyIcon(previous);
      }
      string tip = open > 0 ? "PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse") : "PharmaBoost";
      tray.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
    }

    private void Quit()
    {
      ageTimer.Stop();
      followTimer.Stop();
      tray.Visible = false;
      tray.Dispose();
      if (email != null && !email.IsDisposed) email.Dispose();
      if (banner != null && !banner.IsDisposed) banner.Dispose();
      ExitThread();
    }
  }

  public static class Program
  {
    public static void Run()
    {
      try { Native.SetProcessDPIAware(); } catch (Exception) { }
      Application.EnableVisualStyles();
      try { Application.SetCompatibleTextRenderingDefault(false); } catch (Exception) { }
      Application.Run(new Host());
    }
  }
}
`;

/**
 * Le script PowerShell qui compile ce C# et lance la bannière. Lancé avec -STA : les fenêtres et l'icône de notification de Windows
 * Forms veulent un fil « appartement unique ». Une erreur de compilation sort sur la sortie d'erreur : l'agent le voit et retombe
 * sur l'ancienne fenêtre (notice-host-classique.ts), puis sur la notification Windows, plutôt que de ne plus rien afficher.
 */
export const NOTICE_HOST_SCRIPT = `$ErrorActionPreference = "Stop"
$code = @'
${NOTICE_HOST_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PharmaBoostAvis.Program]::Run()
`;
