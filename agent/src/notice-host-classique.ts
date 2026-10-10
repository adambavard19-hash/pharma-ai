/**
 * L'ANCIENNE fenêtre de la vente (« classique » : une fenêtre Windows Forms à bordure, avec boutons). Gardée en secours : si la
 * nouvelle bannière (notice-host.ts) posait un problème sur un poste, `affichage.fenetre = "classique"` dans la configuration du poste
 * la remet, sans rien republier.
 *
 * La fenêtre de la vente au poste de caisse : le programme Windows qui dessine les conseils, garde la vente ouverte et la clôt.
 *
 * Un seul processus (PowerShell + C# compilé à la volée, rien à installer de plus) reste en vie tant que l'agent
 * tourne. L'agent lui parle sur son entrée standard, une commande JSON par ligne :
 *   {"op":"show","entry":{…},"position":"milieu-droite","positionFile":"…"}   la vente (ou sa mise à jour, sur place)
 *   {"op":"done","info":{…}}      « Vente terminée » : le message de fin, puis la fenêtre s'efface
 *   {"op":"remove","id":"…"}      la vente est close ailleurs : la fenêtre s'efface
 *   {"op":"quit"}
 * et il répond sur sa sortie standard par des mots seuls :
 *   PRET · VENDU <vente> <conseil> · NONVENDU <vente> <conseil> · ANNULER <vente> <conseil> (reprendre sa réponse)
 *   EMAIL <vente> <adresse en base64> · EMAIL_RETIRER <vente> · TERMINER <vente> · VOIR <vente> · FERMEE <vente>
 *
 * Ce que la fenêtre fait, et ne fait jamais :
 *  • elle reste ouverte pendant TOUTE la vente — aucun délai — et se met à jour à chaque bip ; elle ne se ferme qu'à
 *    « Vente terminée » (ou quand le serveur dit que la vente est close). Le pharmacien peut la réduire à une barre ;
 *    seul un conseil NOUVEAU la rouvre ;
 *  • elle ne prend JAMAIS le clavier ni le focus (WS_EX_NOACTIVATE, et WM_MOUSEACTIVATE répond « ne pas activer ») : la
 *    douchette et les touches vont au logiciel de gestion, même quand on clique sur un de ses boutons. Une seule exception,
 *    voulue : un clic dans le champ « e-mail du patient » lui donne le clavier le temps de la saisie, puis elle le rend au
 *    logiciel de gestion (Enregistrer, Plus tard, Échap, un clic ailleurs, ou quarante secondes sans rien taper) ;
 *  • « Vendu » / « Non vendu » sont des déclarations du pharmacien : la fenêtre n'en déduit jamais rien d'elle-même ;
 *  • elle se pose à droite, à mi-hauteur : le bas de l'écran porte les boutons de facturation du LGO (Valider…). On peut
 *    la déplacer à la souris ; l'endroit est retenu ; elle ne déborde jamais de l'écran (une barre de défilement apparaît
 *    quand la vente porte beaucoup de conseils).
 *
 * Écrit en C# 5 : Windows PowerShell 5.1 compile avec cette version du langage (pas d'interpolation, pas de « ?. »).
 */
export const NOTICE_HOST_CLASSIC_CSHARP = String.raw`
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace PharmaBoostAvis
{
  internal static class Native
  {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr handle);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] public static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
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
    public string Quantity = "";
    public string Image = "";
  }

  /// <summary>Ce que la fenêtre affiche pour UNE vente, du premier bip à « Vente terminée ».</summary>
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

  internal static class Look
  {
    public static readonly Color Ink = Color.FromArgb(16, 24, 40);
    public static readonly Color Soft = Color.FromArgb(71, 84, 103);
    public static readonly Color Faint = Color.FromArgb(102, 112, 133);
    public static readonly Color Line = Color.FromArgb(234, 236, 240);
    public static readonly Color Green = Color.FromArgb(18, 128, 92);
    public static readonly Color GreenDark = Color.FromArgb(14, 107, 77);
    public static readonly Color GreenBorder = Color.FromArgb(52, 168, 124);
    public static readonly Color GreenSoft = Color.FromArgb(232, 246, 240);
    public static readonly Color Amber = Color.FromArgb(181, 71, 8);
    public static readonly Color AmberSoft = Color.FromArgb(255, 247, 232);
    public static readonly Color ChallengeBack = Color.FromArgb(255, 237, 213);
    public static readonly Color ChallengeFore = Color.FromArgb(194, 65, 12);
    public static readonly Color DateBack = Color.FromArgb(254, 226, 226);
    public static readonly Color DateFore = Color.FromArgb(185, 28, 28);

    public static GraphicsPath Round(Rectangle r, int radius)
    {
      int d = radius * 2;
      GraphicsPath path = new GraphicsPath();
      path.AddArc(r.X, r.Y, d, d, 180, 90);
      path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
      path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
      path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
      path.CloseFigure();
      return path;
    }

    public static void Rounded(Control control, int radius)
    {
      using (GraphicsPath path = Round(new Rectangle(0, 0, control.Width, control.Height), radius))
      {
        control.Region = new Region(path);
      }
    }

    public static void Availability(string code, string quantity, out string text, out Color back, out Color fore)
    {
      if (code == "IN_STOCK") { text = "En stock" + (quantity.Length > 0 ? " · " + quantity : ""); back = Color.FromArgb(220, 250, 230); fore = Color.FromArgb(6, 118, 71); }
      else if (code == "LOW_STOCK") { text = "Stock faible" + (quantity.Length > 0 ? " · " + quantity : ""); back = Color.FromArgb(254, 240, 199); fore = Color.FromArgb(181, 71, 8); }
      else if (code == "OUT_OF_STOCK") { text = "Rupture"; back = Color.FromArgb(254, 228, 226); fore = Color.FromArgb(180, 35, 24); }
      else { text = "Stock à vérifier"; back = Color.FromArgb(242, 244, 247); fore = Color.FromArgb(71, 84, 103); }
    }

    /// <summary>Le logo : un carré vert arrondi, une croix blanche.</summary>
    public static Bitmap Logo(int size)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using (GraphicsPath path = Round(new Rectangle(0, 0, size - 1, size - 1), size / 4))
        using (SolidBrush fill = new SolidBrush(GreenSoft))
        using (Pen edge = new Pen(Color.FromArgb(190, 232, 214), 1f))
        {
          g.FillPath(fill, path);
          g.DrawPath(edge, path);
        }
        int arm = Math.Max(3, size / 9);
        int span = size * 5 / 12;
        int mid = size / 2;
        using (SolidBrush cross = new SolidBrush(Green))
        {
          g.FillRectangle(cross, mid - arm, mid - span / 2, arm * 2, span);
          g.FillRectangle(cross, mid - span / 2, mid - arm, span, arm * 2);
        }
      }
      return bmp;
    }

    /// <summary>Quand un produit n'a pas de photo : un flacon gris, plutôt qu'un trou.</summary>
    public static Bitmap Bottle(int size)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.FromArgb(242, 244, 247));
        using (SolidBrush body = new SolidBrush(Color.FromArgb(208, 213, 221)))
        {
          int w = size * 40 / 100;
          int h = size * 52 / 100;
          g.FillRectangle(body, (size - w / 2) / 2, size * 14 / 100, w / 2, size * 14 / 100);
          using (GraphicsPath path = Round(new Rectangle((size - w) / 2, size * 28 / 100, w, h), Math.Max(3, size / 14)))
          {
            g.FillPath(body, path);
          }
        }
      }
      return bmp;
    }

    /// <summary>Le rond de fin de vente : une coche blanche sur fond vert (ou un point d'exclamation si quelque chose a échoué).</summary>
    public static Bitmap CheckBadge(int size, bool warning)
    {
      Bitmap bmp = new Bitmap(size, size);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        using (SolidBrush fill = new SolidBrush(warning ? Color.FromArgb(217, 119, 6) : Green)) { g.FillEllipse(fill, 1, 1, size - 3, size - 3); }
        using (Pen pen = new Pen(Color.White, Math.Max(3f, size / 11f)))
        {
          pen.StartCap = LineCap.Round;
          pen.EndCap = LineCap.Round;
          pen.LineJoin = LineJoin.Round;
          if (warning)
          {
            g.DrawLine(pen, size / 2, size * 28 / 100, size / 2, size * 58 / 100);
            g.DrawLine(pen, size / 2, size * 72 / 100, size / 2, size * 73 / 100);
          }
          else
          {
            g.DrawLines(pen, new Point[] { new Point(size * 28 / 100, size * 53 / 100), new Point(size * 44 / 100, size * 68 / 100), new Point(size * 72 / 100, size * 34 / 100) });
          }
        }
      }
      return bmp;
    }

    /// <summary>L'icône près de l'horloge : le logo et, en pastille rouge, le nombre de conseils en attente.</summary>
    public static Bitmap CounterIcon(int count)
    {
      Bitmap bmp = new Bitmap(32, 32);
      using (Graphics g = Graphics.FromImage(bmp))
      {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.Clear(Color.Transparent);
        using (GraphicsPath path = Round(new Rectangle(1, 3, 26, 26), 7))
        using (SolidBrush fill = new SolidBrush(Green))
        {
          g.FillPath(fill, path);
        }
        using (SolidBrush white = new SolidBrush(Color.White))
        {
          g.FillRectangle(white, 12, 8, 4, 16);
          g.FillRectangle(white, 6, 14, 16, 4);
        }
        if (count <= 0) return bmp;
        string label = count > 9 ? "9+" : count.ToString();
        using (SolidBrush red = new SolidBrush(Color.FromArgb(217, 45, 32)))
        using (Pen ring = new Pen(Color.White, 2f))
        using (Font font = new Font("Segoe UI", count > 9 ? 9f : 11f, FontStyle.Bold, GraphicsUnit.Pixel))
        using (SolidBrush ink = new SolidBrush(Color.White))
        {
          g.FillEllipse(red, 13, 0, 19, 19);
          g.DrawEllipse(ring, 13, 0, 19, 19);
          StringFormat center = new StringFormat();
          center.Alignment = StringAlignment.Center;
          center.LineAlignment = StringAlignment.Center;
          g.DrawString(label, font, ink, new RectangleF(13, 0, 19, 19), center);
        }
      }
      return bmp;
    }
  }

  /// <summary>Un bouton arrondi qui ne prend jamais le focus.</summary>
  public class PillButton : Control
  {
    private readonly bool filled;
    private readonly Color back;
    private readonly Color backHover;
    private readonly Color border;
    private bool hovered;
    /// <summary>Un bouton momentanément inutilisable : grisé, et sans effet (le clic est ignoré par celui qui l'écoute).</summary>
    public bool Muted;

    public PillButton(string text, bool filled, Color back, Color backHover, Color fore, Color border, Font font)
    {
      this.filled = filled;
      this.back = back;
      this.backHover = backHover;
      this.border = border;
      Text = text;
      ForeColor = fore;
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
      int radius = Math.Max(6, Height / 4);
      using (GraphicsPath path = Look.Round(new Rectangle(0, 0, Width - 1, Height - 1), radius))
      {
        using (SolidBrush fill = new SolidBrush(Muted ? Color.FromArgb(228, 231, 236) : (hovered ? backHover : back))) { g.FillPath(fill, path); }
        if (!filled && !Muted)
        {
          using (Pen pen = new Pen(border, 1.5f)) { g.DrawPath(pen, path); }
        }
      }
      TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), Muted ? Color.FromArgb(120, 130, 146) : ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }
  }

  /// <summary>Une carte arrondie, fond blanc, filet clair : un conseil.</summary>
  public class Card : Panel
  {
    public Card()
    {
      DoubleBuffered = true;
      BackColor = Color.White;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Look.Round(new Rectangle(0, 0, Width - 1, Height - 1), 10))
      using (Pen pen = new Pen(Look.Line, 1.5f))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }
  }

  /// <summary>
  /// La fenêtre de la vente. Elle ne prend ni le clavier ni le focus, sauf UN geste volontaire du pharmacien :
  /// cliquer dans le champ « e-mail du patient » (BeginTyping, EndTyping). Tout le reste se fait à la souris.
  /// </summary>
  public class SaleForm : Form
  {
    public event Action<string> Word;
    public event Action<Point> Moved;

    private readonly float scale;
    private readonly System.Windows.Forms.Timer typingTimer = new System.Windows.Forms.Timer();
    private Entry entry;
    private Entry deferred;
    private DoneInfo done;
    private bool dragging;
    private Point dragStart;
    private Point dragOrigin;
    private bool editing;
    private IntPtr previousForeground = IntPtr.Zero;
    private bool emailOpen;
    private string emailText = "";
    private bool emailConsent;
    private bool finishing;
    private TextBox emailBox;
    private PillButton saveButton;
    private Label emailMessage;
    public bool Reduced;
    /// <summary>Rien à conseiller : un mot de quelques secondes, sans réponse à donner ni bouton.</summary>
    public bool Quiet;
    public string Position = "milieu-droite";
    public string PositionFile = "";

    public SaleForm()
    {
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Color.White;
      DoubleBuffered = true;
      typingTimer.Tick += delegate { EndTyping(true); };
    }

    protected override bool ShowWithoutActivation { get { return true; } }

    protected override CreateParams CreateParams
    {
      get
      {
        CreateParams p = base.CreateParams;
        // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW : jamais dans la barre des tâches ni dans Alt+Tab, jamais activée.
        p.ExStyle |= 0x08000000 | 0x00000080;
        return p;
      }
    }

    protected override void WndProc(ref Message m)
    {
      // WM_MOUSEACTIVATE : même un clic sur un bouton de la fenêtre n'active pas la fenêtre (MA_NOACTIVATE).
      // Seule la saisie de l'e-mail, voulue par un clic dans son champ, a le droit d'activer.
      if (m.Msg == 0x0021 && !editing) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    protected override void OnDeactivate(EventArgs e)
    {
      base.OnDeactivate(e);
      // Le pharmacien a cliqué ailleurs (le logiciel de gestion) : la saisie s'arrête, la fenêtre redevient muette.
      if (editing) EndTyping(false);
    }

    private int S(int value) { return (int)Math.Round(value * scale); }
    private Font F(float points, FontStyle style) { return new Font("Segoe UI", points, style, GraphicsUnit.Point); }

    private void Say(string text)
    {
      if (Word != null) Word(text);
    }

    private static string Shorten(string text, int max)
    {
      if (text == null) return "";
      return text.Length > max ? text.Substring(0, max - 1).TrimEnd() + "…" : text;
    }

    private Label Words(Control parent, string text, Font font, Color color, int x, int y, int width)
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
      parent.Controls.Add(label);
      return label;
    }

    /// <summary>Un lien cliquable (texte souligné, main au survol), à droite ou à gauche.</summary>
    private Label Link(Control parent, string text, int x, int y, bool alignRight, Action click)
    {
      Font font = new Font("Segoe UI", 9.5f, FontStyle.Underline | FontStyle.Bold, GraphicsUnit.Point);
      Size size = TextRenderer.MeasureText(text, font);
      Label label = new Label();
      label.AutoSize = false;
      label.UseMnemonic = false;
      label.UseCompatibleTextRendering = false;
      label.Text = text;
      label.Font = font;
      label.ForeColor = Look.Green;
      label.BackColor = Color.Transparent;
      label.Cursor = Cursors.Hand;
      label.Size = new Size(size.Width + S(4), size.Height + S(3));
      label.Location = new Point(alignRight ? x - label.Width : x, y);
      label.Click += delegate { click(); };
      parent.Controls.Add(label);
      return label;
    }

    /// <summary>Une pastille posée à la suite des autres (à partir de left), à la ligne quand la place manque.</summary>
    private void AddPill(Control parent, int left, string text, Color back, Color fore, bool bold, int maxWidth, ref int x, ref int y)
    {
      Font font = F(9f, bold ? FontStyle.Bold : FontStyle.Regular);
      Size size = TextRenderer.MeasureText(text, font);
      bool plain = back == Color.Transparent;
      int width = size.Width + (plain ? S(4) : S(18));
      if (x > 0 && x + width > maxWidth) { x = 0; y += S(24); }
      Label pill = new Label();
      pill.AutoSize = false;
      pill.UseMnemonic = false;
      pill.UseCompatibleTextRendering = false;
      pill.Text = text;
      pill.Font = font;
      pill.ForeColor = fore;
      pill.BackColor = back;
      pill.TextAlign = ContentAlignment.MiddleCenter;
      pill.Size = new Size(width, S(20));
      pill.Location = new Point(left + x, y);
      parent.Controls.Add(pill);
      if (!plain) Look.Rounded(pill, S(10));
      x += width + S(6);
    }

    private static void DisposeTree(Control control)
    {
      List<Control> children = new List<Control>();
      foreach (Control child in control.Controls) children.Add(child);
      foreach (Control child in children)
      {
        control.Controls.Remove(child);
        PictureBox picture = child as PictureBox;
        if (picture != null && picture.Image != null) { picture.Image.Dispose(); picture.Image = null; }
        DisposeTree(child);
        child.Dispose();
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Les états de la fenêtre.
    // ------------------------------------------------------------------------------------------------------------

    /// <summary>Dessine (ou redessine, sur place) la vente. Pendant une saisie d'e-mail, la mise à jour attend la fin de la saisie.</summary>
    public void Render(Entry e)
    {
      if (editing) { deferred = e; return; }
      entry = e;
      done = null;
      finishing = false;
      Rebuild();
    }

    public void RenderDone(DoneInfo info)
    {
      if (editing) EndTyping(false);
      deferred = null;
      done = info;
      Rebuild();
    }

    public void SetReduced(bool value)
    {
      if (Reduced == value) return;
      Reduced = value;
      if (editing) EndTyping(false);
      Rebuild();
    }

    private void Rebuild()
    {
      SuspendLayout();
      DisposeTree(this);
      emailBox = null;
      saveButton = null;
      emailMessage = null;
      if (done != null) BuildDone();
      else if (entry != null && Quiet) BuildQuiet();
      else if (entry != null && Reduced) BuildReduced();
      else if (entry != null) BuildOpen();
      Look.Rounded(this, S(18));
      WireDrag(this);
      ResumeLayout(true);
      Invalidate();
      if (Visible) Clamp();
    }

    /// <summary>mode 0 : fenêtre ouverte (bouton « réduire »), 1 : réduite (bouton « agrandir »), 2 : message de fin, sans bouton.</summary>
    private int BuildHeader(int width, string subtitle, int mode)
    {
      int pad = S(14);
      PictureBox logo = new PictureBox();
      logo.Image = Look.Logo(S(36));
      logo.SizeMode = PictureBoxSizeMode.Normal;
      logo.Location = new Point(pad, S(10));
      logo.Size = new Size(S(36), S(36));
      logo.BackColor = Color.Transparent;
      Controls.Add(logo);
      int textLeft = pad + S(36) + S(10);
      Words(this, "PharmaBoost", F(12.5f, FontStyle.Bold), Look.Ink, textLeft, S(7), S(220));
      Words(this, subtitle, F(9.5f, FontStyle.Regular), Look.Faint, textLeft, S(27), width - textLeft - S(60));
      if (mode == 2) return S(56);
      PillButton toggle = new PillButton(mode == 1 ? "+" : "–", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(12f, FontStyle.Bold));
      toggle.Location = new Point(width - pad - S(30), S(13));
      toggle.Size = new Size(S(30), S(30));
      toggle.Click += delegate { SetReduced(!Reduced); };
      Controls.Add(toggle);
      return S(56);
    }

    private string SubtitleOf(Entry e)
    {
      if (e.Items.Count == 0) return e.Alerts.Count > 0 ? "À lire avant de conseiller" : "Aucun conseil à proposer";
      int open = 0;
      foreach (Item item in e.Items) { if (item.Outcome == "NONE") open++; }
      string count = e.Items.Count > 1 ? e.Items.Count + " conseils" : "1 conseil";
      return "Vente en cours · " + count + (open == 0 ? " · tous traités" : "");
    }

    private void BuildQuiet()
    {
      int width = S(380);
      int pad = S(14);
      int hh = BuildHeader(width, SubtitleOf(entry), 2);
      int y = hh;
      Words(this, entry.Label, F(9.5f, FontStyle.Regular), Look.Faint, pad, y, width - 2 * pad);
      y += S(18);
      Label subject = Words(this, entry.Subject, F(12f, FontStyle.Bold), Look.Ink, pad, y, width - 2 * pad);
      y += subject.Height + S(4);
      foreach (string note in entry.Notes)
      {
        Label line = Words(this, note, F(10.5f, FontStyle.Regular), Look.Soft, pad, y, width - 2 * pad);
        y += line.Height + S(2);
      }
      ClientSize = new Size(width, y + S(12));
    }

    private void BuildReduced()
    {
      int width = S(330);
      int hh = BuildHeader(width, SubtitleOf(entry), 1);
      ClientSize = new Size(width, hh);
    }

    private void BuildOpen()
    {
      int width = S(420);
      int pad = S(14);
      string subtitle = SubtitleOf(entry);
      int hh = BuildHeader(width, subtitle, 0);

      // Le pied : « Vente terminée », toujours visible.
      string hint = "Enregistre les résultats ; le bilan part si le patient a donné son accord.";
      Font hintFont = F(9f, FontStyle.Regular);
      Size hintSize = TextRenderer.MeasureText(hint, hintFont, new Size(width - 2 * pad - S(4), 10000), TextFormatFlags.WordBreak);
      int footerH = S(12) + S(44) + S(6) + hintSize.Height + S(10);
      int maxMiddle = (int)(Screen.PrimaryScreen.WorkingArea.Height * 0.9) - hh - footerH;
      if (maxMiddle < S(160)) maxMiddle = S(160);

      Panel scroll = new Panel();
      scroll.AutoScroll = true;
      scroll.BackColor = Color.White;
      scroll.Location = new Point(0, hh);
      int contentWidth = width - 2 * pad;
      scroll.Size = new Size(width, S(100));
      Controls.Add(scroll);
      int height = BuildMiddle(scroll, pad, contentWidth);
      if (height > maxMiddle)
      {
        DisposeTree(scroll);
        contentWidth = width - 2 * pad - SystemInformation.VerticalScrollBarWidth;
        height = BuildMiddle(scroll, pad, contentWidth);
      }
      scroll.Size = new Size(width, Math.Min(height, maxMiddle));
      scroll.AutoScrollMinSize = new Size(0, height);

      int fy = hh + scroll.Height;
      Panel line = new Panel();
      line.BackColor = Look.Line;
      line.Location = new Point(pad, fy);
      line.Size = new Size(width - 2 * pad, 1);
      Controls.Add(line);
      PillButton finish = new PillButton(finishing ? "Enregistrement…" : "Vente terminée", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(12f, FontStyle.Bold));
      finish.Location = new Point(pad, fy + S(12));
      finish.Size = new Size(width - 2 * pad, S(44));
      finish.Muted = finishing;
      finish.Click += delegate
      {
        if (finishing || entry == null) return;
        finishing = true;
        Say("TERMINER " + entry.Id);
        Rebuild();
      };
      Controls.Add(finish);
      Words(this, hint, hintFont, Look.Faint, pad, fy + S(12) + S(44) + S(6), width - 2 * pad);
      ClientSize = new Size(width, fy + footerH);
    }

    private int BuildMiddle(Panel scroll, int x, int w)
    {
      int y = S(2);
      Words(scroll, entry.Label, F(9.5f, FontStyle.Regular), Look.Faint, x, y, w);
      y += S(18);
      Label subject = Words(scroll, entry.Subject, F(12f, FontStyle.Bold), Look.Ink, x, y, w);
      y += subject.Height + S(8);

      if (entry.Alerts.Count > 0)
      {
        Panel box = new Panel();
        box.BackColor = Look.AmberSoft;
        box.Location = new Point(x, y);
        int boxY = S(8);
        foreach (string alert in entry.Alerts)
        {
          Label line = Words(box, "⚠ " + alert, F(10f, FontStyle.Bold), Look.Amber, S(12), boxY, w - S(24));
          boxY += line.Height + S(4);
        }
        box.Size = new Size(w, boxY + S(4));
        scroll.Controls.Add(box);
        Look.Rounded(box, S(10));
        y += box.Height + S(8);
      }

      if (entry.Items.Count > 0)
      {
        foreach (Item item in entry.Items)
        {
          int cardHeight = BuildCard(scroll, item, x, y, w);
          y += cardHeight + S(8);
        }
      }
      else
      {
        foreach (string note in entry.Notes)
        {
          Label line = Words(scroll, note, F(10.5f, FontStyle.Regular), Look.Soft, x, y, w);
          y += line.Height + S(2);
        }
        y += S(6);
      }

      y += BuildEmail(scroll, x, y, w) + S(10);
      return y;
    }

    private int BuildCard(Panel scroll, Item item, int x, int y, int w)
    {
      Card card = new Card();
      card.Location = new Point(x, y);
      int cp = S(10);
      int photo = S(52);
      PictureBox picture = new PictureBox();
      picture.Location = new Point(cp, cp);
      picture.Size = new Size(photo, photo);
      picture.SizeMode = PictureBoxSizeMode.Zoom;
      picture.BackColor = Color.FromArgb(242, 244, 247);
      picture.Image = LoadPhoto(item.Image, photo);
      card.Controls.Add(picture);
      Look.Rounded(picture, S(10));

      int colX = cp + photo + S(10);
      int colW = w - colX - cp;
      int cy = cp;
      Label name = Words(card, item.Name, F(11f, FontStyle.Bold), Look.Ink, colX, cy, colW);
      cy += name.Height;
      if (item.Drug.Length > 0)
      {
        Label drug = Words(card, "Pour : " + item.Drug, F(9f, FontStyle.Regular), Look.Faint, colX, cy, colW);
        cy += drug.Height;
      }
      if (item.Reason.Length > 0)
      {
        Label reason = Words(card, Shorten(item.Reason, 120), F(9.5f, FontStyle.Regular), Look.Soft, colX, cy, colW);
        cy += reason.Height;
      }
      // Les pastilles : prix, stock, challenge (orange), date courte (rouge). Jamais inventées : le serveur ne les envoie que si elles sont réelles.
      int px = 0;
      int py = cy + S(3);
      if (item.Price.Length > 0) AddPill(card, colX, item.Price, Color.Transparent, Look.Green, true, colW, ref px, ref py);
      string availabilityText; Color availabilityBack; Color availabilityFore;
      Look.Availability(item.Availability, item.Quantity, out availabilityText, out availabilityBack, out availabilityFore);
      AddPill(card, colX, availabilityText, availabilityBack, availabilityFore, true, colW, ref px, ref py);
      if (item.Challenge.Length > 0) AddPill(card, colX, "Challenge", Look.ChallengeBack, Look.ChallengeFore, true, colW, ref px, ref py);
      if (item.ShortDate.Length > 0) AddPill(card, colX, "Date courte " + item.ShortDate, Look.DateBack, Look.DateFore, true, colW, ref px, ref py);
      int ya = Math.Max(cp + photo, py + S(20)) + S(8);

      int buttonH = S(34);
      if (item.Outcome == "NONE")
      {
        PillButton sold = new PillButton("Vendu", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(10.5f, FontStyle.Bold));
        sold.Location = new Point(cp, ya);
        sold.Size = new Size(S(98), buttonH);
        sold.Click += delegate { Choose(item, "SOLD"); };
        card.Controls.Add(sold);
        PillButton notSold = new PillButton("Non vendu", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(10.5f, FontStyle.Bold));
        notSold.Location = new Point(cp + sold.Width + S(8), ya);
        notSold.Size = new Size(S(106), buttonH);
        notSold.Click += delegate { Choose(item, "NOT_SOLD"); };
        card.Controls.Add(notSold);
      }
      else
      {
        bool isSold = item.Outcome == "SOLD";
        int cx = 0;
        int cyy = ya + S(6);
        AddPill(card, cp, isSold ? "✓ Vendu" : "Non vendu", isSold ? Color.FromArgb(220, 250, 230) : Color.FromArgb(242, 244, 247), isSold ? Color.FromArgb(6, 118, 71) : Look.Soft, true, w, ref cx, ref cyy);
        Link(card, "Modifier", cp + cx, ya + S(7), false, delegate { Choose(item, "NONE"); });
      }
      Link(card, "Voir le détail", w - cp, ya + S(7), true, delegate { Say("VOIR " + entry.Id); });

      card.Size = new Size(w, ya + buttonH + cp);
      scroll.Controls.Add(card);
      Look.Rounded(card, S(10));
      return card.Height;
    }

    private void Choose(Item item, string outcome)
    {
      if (entry == null || item.Id.Length == 0) return;
      item.Outcome = outcome;
      Say((outcome == "SOLD" ? "VENDU " : outcome == "NOT_SOLD" ? "NONVENDU " : "ANNULER ") + entry.Id + " " + item.Id);
      Rebuild();
    }

    // ------------------------------------------------------------------------------------------------------------
    // L'e-mail du patient : facultatif, avec son accord, saisi à la main.
    // ------------------------------------------------------------------------------------------------------------

    private int BuildEmail(Panel scroll, int x, int y, int w)
    {
      if (entry.EmailSaved)
      {
        Label saved = Words(scroll, "✓ E-mail enregistré · le bilan partira à la fin de la vente", F(9.5f, FontStyle.Bold), Look.GreenDark, x, y, w - S(70));
        Link(scroll, "Retirer", x + w, y, true, delegate { Say("EMAIL_RETIRER " + entry.Id); entry.EmailSaved = false; Rebuild(); });
        return saved.Height;
      }
      if (!emailOpen && entry.EmailError.Length == 0)
      {
        Words(scroll, "✉  E-mail du patient (facultatif)", F(10f, FontStyle.Regular), Look.Soft, x, y + S(2), w - S(80));
        Link(scroll, "Ajouter", x + w, y + S(1), true, delegate { emailOpen = true; Rebuild(); });
        return S(26);
      }

      Panel box = new Panel();
      box.BackColor = Look.GreenSoft;
      box.Location = new Point(x, y);
      int bp = S(12);
      int bw = w - 2 * bp;
      int by = bp;
      Label title = Words(box, "E-mail du patient", F(10.5f, FontStyle.Bold), Look.Ink, bp, by, bw);
      by += title.Height + S(2);

      emailBox = new TextBox();
      emailBox.Font = F(11f, FontStyle.Regular);
      emailBox.BorderStyle = BorderStyle.FixedSingle;
      emailBox.Location = new Point(bp, by);
      emailBox.Width = bw;
      emailBox.Text = emailText;
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
      box.Controls.Add(emailBox);
      by += emailBox.Height + S(6);

      CheckBox consent = new CheckBox();
      consent.Text = "Le patient accepte de recevoir son bilan par e-mail";
      consent.Font = F(9.5f, FontStyle.Regular);
      consent.ForeColor = Look.Ink;
      consent.BackColor = Color.Transparent;
      consent.UseCompatibleTextRendering = false;
      consent.Checked = emailConsent;
      consent.AutoSize = false;
      consent.Location = new Point(bp, by);
      consent.Size = new Size(bw, S(22));
      consent.TabStop = false;
      consent.CheckedChanged += delegate { emailConsent = consent.Checked; RefreshSave(); };
      box.Controls.Add(consent);
      by += consent.Height + S(4);

      emailMessage = Words(box, entry.EmailError, F(9.5f, FontStyle.Bold), Look.Amber, bp, by, bw);
      by += Math.Max(emailMessage.Height, S(4));

      saveButton = new PillButton("Enregistrer l'e-mail", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(10.5f, FontStyle.Bold));
      saveButton.Location = new Point(bp, by);
      saveButton.Size = new Size(bw - S(96) - S(8), S(36));
      saveButton.Click += delegate { SaveEmail(); };
      box.Controls.Add(saveButton);
      PillButton later = new PillButton("Plus tard", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(10.5f, FontStyle.Bold));
      later.Location = new Point(bp + saveButton.Width + S(8), by);
      later.Size = new Size(S(96), S(36));
      later.Click += delegate { LaterEmail(); };
      box.Controls.Add(later);
      by += S(36) + bp;
      RefreshSave();

      box.Size = new Size(w, by);
      scroll.Controls.Add(box);
      Look.Rounded(box, S(10));
      return box.Height;
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
      if (entry == null) return;
      string text = emailText.Trim();
      if (!emailConsent) { if (emailMessage != null) emailMessage.Text = "Le patient doit d'abord donner son accord."; return; }
      if (!LooksLikeEmail(text)) { if (emailMessage != null) emailMessage.Text = "Cette adresse ne semble pas valide."; return; }
      string id = entry.Id;
      emailText = "";
      emailConsent = false;
      emailOpen = false;
      EndTyping(true);
      if (entry != null && entry.Id == id) entry.EmailSaved = true;
      Say("EMAIL " + id + " " + Convert.ToBase64String(Encoding.UTF8.GetBytes(text)));
      Rebuild();
    }

    private void LaterEmail()
    {
      emailOpen = false;
      emailText = "";
      emailConsent = false;
      if (entry != null) entry.EmailError = "";
      EndTyping(true);
      Rebuild();
    }

    /// <summary>
    /// Le seul moment où la fenêtre prend le clavier : le pharmacien a cliqué dans le champ de l'e-mail. Elle retient la
    /// fenêtre qui était devant (le logiciel de gestion) pour la lui rendre aussitôt la saisie finie.
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
      if (deferred != null)
      {
        Entry waiting = deferred;
        deferred = null;
        Render(waiting);
      }
    }

    // ------------------------------------------------------------------------------------------------------------
    // La fin de vente.
    // ------------------------------------------------------------------------------------------------------------

    private void BuildDone()
    {
      int width = S(380);
      int pad = S(14);
      int hh = BuildHeader(width, "Vente terminée", 2);
      int y = hh + S(4);
      PictureBox badge = new PictureBox();
      badge.Image = Look.CheckBadge(S(52), done.Warning);
      badge.SizeMode = PictureBoxSizeMode.Normal;
      badge.Location = new Point(pad, y);
      badge.Size = new Size(S(52), S(52));
      badge.BackColor = Color.Transparent;
      Controls.Add(badge);
      int textX = pad + S(52) + S(12);
      int textW = width - textX - pad;
      Label title = Words(this, done.Title, F(12.5f, FontStyle.Bold), Look.Ink, textX, y, textW);
      int ty = y + title.Height + S(2);
      foreach (string text in done.Lines)
      {
        Label line = Words(this, text, F(10f, FontStyle.Regular), Look.Soft, textX, ty, textW);
        ty += line.Height;
      }
      y = Math.Max(y + S(52), ty) + S(10);
      if (done.Badge.Length > 0)
      {
        int px = 0;
        int py = y;
        AddPill(this, pad, done.Badge, Color.FromArgb(220, 250, 230), Color.FromArgb(6, 118, 71), true, width - 2 * pad, ref px, ref py);
        y += S(28);
      }
      ClientSize = new Size(width, y + S(10));
    }

    // ------------------------------------------------------------------------------------------------------------
    // La photo, le déplacement, la place à l'écran.
    // ------------------------------------------------------------------------------------------------------------

    private Image LoadPhoto(string path, int size)
    {
      if (!string.IsNullOrEmpty(path) && File.Exists(path))
      {
        try
        {
          using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
          using (Image raw = Image.FromStream(stream))
          {
            return new Bitmap(raw);
          }
        }
        catch (Exception) { }
      }
      return Look.Bottle(size);
    }

    private void WireDrag(Control parent)
    {
      foreach (Control child in parent.Controls)
      {
        if (child is PillButton || child is TextBox || child is CheckBox) continue;
        child.MouseDown += OnDragDown;
        child.MouseMove += OnDragMove;
        child.MouseUp += OnDragUp;
        WireDrag(child);
      }
    }

    protected override void OnMouseDown(MouseEventArgs e) { OnDragDown(this, e); base.OnMouseDown(e); }
    protected override void OnMouseMove(MouseEventArgs e) { OnDragMove(this, e); base.OnMouseMove(e); }
    protected override void OnMouseUp(MouseEventArgs e) { OnDragUp(this, e); base.OnMouseUp(e); }

    private void OnDragDown(object sender, MouseEventArgs e)
    {
      if (e.Button != MouseButtons.Left) return;
      dragging = true;
      dragStart = Cursor.Position;
      dragOrigin = Location;
    }

    private void OnDragMove(object sender, MouseEventArgs e)
    {
      if (!dragging) return;
      Point now = Cursor.Position;
      Location = new Point(dragOrigin.X + now.X - dragStart.X, dragOrigin.Y + now.Y - dragStart.Y);
    }

    private void OnDragUp(object sender, MouseEventArgs e)
    {
      if (!dragging) return;
      dragging = false;
      if (Moved != null) Moved(Location);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
      base.OnPaint(e);
      e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
      using (GraphicsPath path = Look.Round(new Rectangle(1, 1, Width - 3, Height - 3), S(18)))
      using (Pen pen = new Pen(Look.GreenBorder, Math.Max(2f, scale * 2f)))
      {
        e.Graphics.DrawPath(pen, path);
      }
    }

    /// <summary>L'endroit : celui que le pharmacien a choisi en la déplaçant, sinon à droite à mi-hauteur.</summary>
    public void Place()
    {
      Rectangle area = Screen.PrimaryScreen.WorkingArea;
      Point wanted = new Point(area.Right - Width - S(16), area.Top + (area.Height - Height) / 2);
      if (Position == "bas-droite") wanted = new Point(area.Right - Width - S(16), area.Bottom - Height - S(16));
      else if (Position == "haut-droite") wanted = new Point(area.Right - Width - S(16), area.Top + S(16));
      try
      {
        if (!string.IsNullOrEmpty(PositionFile) && File.Exists(PositionFile))
        {
          string[] parts = File.ReadAllText(PositionFile).Trim().Split(',');
          if (parts.Length == 2)
          {
            Point saved = new Point(int.Parse(parts[0]), int.Parse(parts[1]));
            foreach (Screen screen in Screen.AllScreens)
            {
              if (screen.WorkingArea.Contains(new Point(saved.X + Width / 2, saved.Y + S(30)))) { wanted = saved; break; }
            }
          }
        }
      }
      catch (Exception) { }
      Location = wanted;
      Clamp();
    }

    /// <summary>La fenêtre change de hauteur avec la vente : elle ne déborde jamais de l'écran où elle se trouve.</summary>
    private void Clamp()
    {
      Rectangle area = Screen.FromControl(this).WorkingArea;
      int x = Math.Min(Math.Max(Left, area.Left), Math.Max(area.Left, area.Right - Width));
      int y = Math.Min(Math.Max(Top, area.Top), Math.Max(area.Top, area.Bottom - Height));
      if (x != Left || y != Top) Location = new Point(x, y);
    }

    public void Reveal()
    {
      if (!Visible) Show();
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
    }
  }

  /// <summary>Le chef d'orchestre : la vente en cours, la fenêtre, l'icône près de l'horloge, la ligne de commande.</summary>
  public class Host : ApplicationContext
  {
    private static readonly TimeSpan MaxAge = TimeSpan.FromHours(3);

    private readonly NotifyIcon counter = new NotifyIcon();
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly System.Windows.Forms.Timer quietTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer doneTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer ageTimer = new System.Windows.Forms.Timer();
    private readonly Control ui = new Control();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private SaleForm form;
    /// <summary>La vente affichée. Tant qu'elle est « ouverte », la fenêtre reste : aucun délai, jusqu'à « Vente terminée ».</summary>
    private Entry current;
    private bool sessionOpen;
    private string doneId = "";
    private IntPtr iconHandle = IntPtr.Zero;
    private string position = "milieu-droite";
    private string positionFile = "";

    public Host()
    {
      ui.CreateControl();
      IntPtr unused = ui.Handle;
      counter.Visible = false;
      counter.ContextMenuStrip = menu;
      counter.MouseClick += delegate (object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) Expand(); };
      menu.Opening += delegate { BuildMenu(); };
      quietTimer.Tick += delegate { quietTimer.Stop(); if (!sessionOpen) End(); };
      doneTimer.Tick += delegate { doneTimer.Stop(); string finished = doneId; End(); if (finished.Length > 0) Say("FERMEE " + finished); };
      ageTimer.Interval = 60000;
      ageTimer.Tick += delegate { Expire(); };
      ageTimer.Start();

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
        if (op == "show")
        {
          position = Str(command, "position");
          if (position.Length == 0) position = "milieu-droite";
          positionFile = Str(command, "positionFile");
          Dictionary<string, object> raw = command.ContainsKey("entry") ? command["entry"] as Dictionary<string, object> : null;
          if (raw != null) Show(Parse(raw));
        }
        else if (op == "done")
        {
          Dictionary<string, object> raw = command.ContainsKey("info") ? command["info"] as Dictionary<string, object> : null;
          if (raw != null) Finish(ParseDone(raw));
        }
        else if (op == "remove") Remove(Str(command, "id"));
        else if (op == "quit") Quit();
      }
      catch (Exception) { Say("ERREUR commande"); }
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

    private static string KeyOf(Item item) { return "p:" + item.Name; }

    /// <summary>
    /// Une vente arrive ou se met à jour. Une vente n'a qu'UNE fenêtre, mise à jour sur place, qui reste jusqu'à
    /// « Vente terminée ». Seule une information NOUVELLE (un autre produit, une autre alerte) rouvre la fenêtre réduite.
    /// </summary>
    private void Show(Entry entry)
    {
      Entry existing = (current != null && current.Id == entry.Id) ? current : null;
      List<string> known = new List<string>();
      if (existing != null) known.AddRange(existing.Shown);
      List<string> fresh = new List<string>();
      foreach (Item item in entry.Items) { string key = KeyOf(item); if (!known.Contains(key)) fresh.Add(key); }
      foreach (string alert in entry.Alerts) { string key = "a:" + alert; if (!known.Contains(key)) fresh.Add(key); }
      entry.Shown.AddRange(known);
      entry.Shown.AddRange(fresh);
      if (existing != null) entry.Since = existing.Since;

      doneTimer.Stop();
      doneId = "";
      bool sameSale = existing != null;
      if (entry.Quiet && !(sameSale && sessionOpen))
      {
        // Rien à conseiller : un mot de huit secondes, sans session ni compteur.
        current = entry;
        sessionOpen = false;
        EnsureForm();
        form.Reduced = false;
        form.Quiet = true;
        Present(entry);
        quietTimer.Stop();
        quietTimer.Interval = 8000;
        quietTimer.Start();
        return;
      }
      quietTimer.Stop();
      current = entry;
      sessionOpen = true;
      EnsureForm();
      form.Quiet = false;
      if (!sameSale) form.Reduced = false;
      else if (fresh.Count > 0 && form.Reduced) form.Reduced = false;
      Present(entry);
    }

    private void EnsureForm()
    {
      if (form != null && !form.IsDisposed) return;
      form = new SaleForm();
      form.Word += delegate (string word) { OnFormWord(word); };
      form.Moved += delegate (Point p) { SavePosition(p); };
    }

    private void Present(Entry entry)
    {
      EnsureForm();
      form.Position = position;
      form.PositionFile = positionFile;
      bool firstShow = !form.Visible;
      form.Render(entry);
      if (firstShow) form.Place();
      form.Reveal();
      RefreshIcon();
    }

    /// <summary>Ce que la fenêtre dit : les réponses vont à l'agent ; « Voir le détail » ouvre la vente dans PharmaBoost.</summary>
    private void OnFormWord(string word)
    {
      if (word.StartsWith("VOIR "))
      {
        Entry shown = current;
        try { if (shown != null && !string.IsNullOrEmpty(shown.Url)) Process.Start(shown.Url); } catch (Exception) { }
      }
      Say(word);
    }

    private void SavePosition(Point p)
    {
      try { if (!string.IsNullOrEmpty(positionFile)) File.WriteAllText(positionFile, p.X + "," + p.Y); } catch (Exception) { }
    }

    /// <summary>La vente est terminée : le message reste quelques secondes, puis la fenêtre s'efface et attend la suivante.</summary>
    private void Finish(DoneInfo info)
    {
      if (current == null || current.Id != info.Id || form == null || form.IsDisposed) return;
      sessionOpen = false;
      quietTimer.Stop();
      doneId = info.Id;
      form.RenderDone(info);
      form.Place();
      form.Reveal();
      RefreshIcon();
      doneTimer.Stop();
      doneTimer.Interval = 7000;
      doneTimer.Start();
    }

    private void End()
    {
      quietTimer.Stop();
      doneTimer.Stop();
      sessionOpen = false;
      doneId = "";
      current = null;
      if (form != null && !form.IsDisposed) form.Hide();
      RefreshIcon();
    }

    private void Remove(string id)
    {
      if (current != null && current.Id == id) End();
    }

    private void Expand()
    {
      if (current == null || form == null || form.IsDisposed) return;
      form.SetReduced(false);
      form.Place();
      form.Reveal();
    }

    private void Expire()
    {
      if (current != null && DateTime.Now - current.Since > MaxAge) End();
    }

    private int Unanswered()
    {
      int count = 0;
      if (current == null) return 0;
      foreach (Item item in current.Items) { if (item.Outcome == "NONE") count++; }
      return count;
    }

    private void BuildMenu()
    {
      menu.Items.Clear();
      if (current == null || !sessionOpen)
      {
        ToolStripMenuItem none = new ToolStripMenuItem("PharmaBoost — aucune vente en cours");
        none.Enabled = false;
        menu.Items.Add(none);
        return;
      }
      int open = Unanswered();
      ToolStripMenuItem title = new ToolStripMenuItem("PharmaBoost — " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse"));
      title.Enabled = false;
      menu.Items.Add(title);
      menu.Items.Add(new ToolStripSeparator());
      menu.Items.Add("Afficher la fenêtre", null, delegate { Expand(); });
      menu.Items.Add("Réduire la fenêtre", null, delegate { if (form != null && !form.IsDisposed) form.SetReduced(true); });
      menu.Items.Add("Vente terminée", null, delegate { if (current != null) Say("TERMINER " + current.Id); });
    }

    /// <summary>L'icône près de l'horloge n'existe que pendant une vente ouverte ; elle porte le nombre de conseils sans réponse.</summary>
    private void RefreshIcon()
    {
      if (current == null || !sessionOpen)
      {
        counter.Visible = false;
        return;
      }
      int open = Unanswered();
      IntPtr previous = iconHandle;
      using (Bitmap bmp = Look.CounterIcon(open))
      {
        iconHandle = bmp.GetHicon();
        counter.Icon = Icon.FromHandle(iconHandle);
      }
      string tip = "PharmaBoost — vente en cours · " + open + (open > 1 ? " conseils sans réponse" : " conseil sans réponse");
      counter.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
      counter.Visible = true;
      if (previous != IntPtr.Zero) Native.DestroyIcon(previous);
    }

    private void Quit()
    {
      quietTimer.Stop();
      doneTimer.Stop();
      ageTimer.Stop();
      counter.Visible = false;
      counter.Dispose();
      if (form != null && !form.IsDisposed) form.Dispose();
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
 * Le script PowerShell qui compile ce C# et lance la fenêtre. Lancé avec -STA : les fenêtres et l'icône de
 * notification de Windows Forms veulent un fil « appartement unique ». Une erreur de compilation sort sur la
 * sortie d'erreur : l'agent le voit et retombe sur l'ancienne fenêtre, plutôt que de ne plus rien afficher.
 */
export const NOTICE_HOST_CLASSIC_SCRIPT = `$ErrorActionPreference = "Stop"
$code = @'
${NOTICE_HOST_CLASSIC_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PharmaBoostAvis.Program]::Run()
`;
