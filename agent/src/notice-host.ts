/**
 * La fenêtre d'avis du poste de caisse : le programme Windows qui dessine le conseil, le garde et le compte.
 *
 * Un seul processus (PowerShell + C# compilé à la volée, rien à installer de plus) reste en vie tant que l'agent
 * tourne. L'agent lui parle sur son entrée standard, une commande JSON par ligne :
 *   {"op":"show","entry":{…},"seconds":30,"position":"milieu-droite","positionFile":"…"}
 *   {"op":"remove","id":"…"}      la vente est close : son conseil n'a plus lieu d'être
 *   {"op":"quit"}
 * et il répond sur sa sortie standard par des mots seuls : PRET, VOIR <id>, IGNORER <id>, ATTENTE <id>.
 *
 * Ce que la fenêtre fait, et ne fait jamais :
 *  • elle ne prend JAMAIS le clavier ni le focus (WS_EX_NOACTIVATE, et WM_MOUSEACTIVATE répond « ne pas activer ») : la
 *    douchette et les touches vont au logiciel de gestion, même quand on clique sur un de ses boutons ;
 *  • elle se pose à droite, à mi-hauteur : le bas de l'écran porte les boutons de facturation du LGO (Valider…). On peut
 *    la déplacer à la souris ; l'endroit est retenu ;
 *  • elle reste 30 s, puis se range près de l'horloge : une petite icône avec le nombre de conseils en attente.
 *    Un clic la rouvre, « Ignorer » l'écarte, « Voir le conseil » ouvre la vente dans PharmaBoost ;
 *  • elle ne réaffiche pas ce que le pharmacien a déjà vu ou écarté : seule une information NOUVELLE (un autre produit,
 *    une autre alerte) rouvre la fenêtre, et une vente n'a jamais qu'UNE fenêtre, mise à jour sur place.
 *
 * Écrit en C# 5 : Windows PowerShell 5.1 compile avec cette version du langage (pas d'interpolation, pas de « ?. »).
 */
export const NOTICE_HOST_CSHARP = String.raw`
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
    public static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    public const uint SWP_NOSIZE = 0x1;
    public const uint SWP_NOMOVE = 0x2;
    public const uint SWP_NOACTIVATE = 0x10;
    public const uint SWP_SHOWWINDOW = 0x40;
  }

  public class Item
  {
    public string Name = "";
    public string Price = "";
    public string Reason = "";
    public string Availability = "UNKNOWN";
    public string Image = "";
  }

  public class Entry
  {
    public string Id = "";
    public string Reference = "";
    public string Label = "Détecté";
    public string Subject = "";
    public string Url = "";
    public string Signature = "";
    public bool Quiet;
    public List<string> Alerts = new List<string>();
    public List<string> Notes = new List<string>();
    public List<Item> Items = new List<Item>();
    public List<string> Shown = new List<string>();
    public DateTime Since = DateTime.Now;
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

    public static void Availability(string code, out string text, out Color back, out Color fore)
    {
      if (code == "IN_STOCK") { text = "En stock"; back = Color.FromArgb(220, 250, 230); fore = Color.FromArgb(6, 118, 71); }
      else if (code == "LOW_STOCK") { text = "Stock faible"; back = Color.FromArgb(254, 240, 199); fore = Color.FromArgb(181, 71, 8); }
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
        using (SolidBrush fill = new SolidBrush(hovered ? backHover : back)) { g.FillPath(fill, path); }
        if (!filled)
        {
          using (Pen pen = new Pen(border, 1.5f)) { g.DrawPath(pen, path); }
        }
      }
      TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 0, Width, Height), ForeColor, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPadding);
    }
  }

  /// <summary>
  /// La fenêtre du conseil. Jamais activée : ni clavier, ni focus volé au logiciel de gestion.
  /// </summary>
  public class ToastForm : Form
  {
    public event Action<Entry> ViewClicked;
    public event Action<Entry> IgnoreClicked;
    public event Action<Point> Moved;

    private readonly float scale;
    private Entry entry;
    private bool dragging;
    private Point dragStart;
    private Point dragOrigin;
    public string Position = "milieu-droite";
    public string PositionFile = "";

    public ToastForm()
    {
      using (Graphics g = Graphics.FromHwnd(IntPtr.Zero)) { scale = g.DpiX / 96f; }
      FormBorderStyle = FormBorderStyle.None;
      ShowInTaskbar = false;
      TopMost = true;
      StartPosition = FormStartPosition.Manual;
      BackColor = Color.White;
      DoubleBuffered = true;
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
      if (m.Msg == 0x0021) { m.Result = (IntPtr)3; return; }
      base.WndProc(ref m);
    }

    private int S(int value) { return (int)Math.Round(value * scale); }
    private Font F(float points, FontStyle style) { return new Font("Segoe UI", points, style, GraphicsUnit.Point); }

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

    /// <summary>Dessine (ou redessine, sur place) le conseil d'une vente.</summary>
    public void Render(Entry e)
    {
      entry = e;
      SuspendLayout();
      while (Controls.Count > 0)
      {
        Control old = Controls[0];
        Controls.RemoveAt(0);
        PictureBox oldPicture = old as PictureBox;
        if (oldPicture != null && oldPicture.Image != null) oldPicture.Image.Dispose();
        old.Dispose();
      }
      int pad = S(16);
      int width = S(432);
      int inner = width - 2 * pad;
      int y = pad;

      // --- En-tête : logo, « PharmaBoost / Conseil disponible », disponibilité du premier produit.
      PictureBox logo = new PictureBox();
      logo.Image = Look.Logo(S(46));
      logo.SizeMode = PictureBoxSizeMode.Normal;
      logo.Location = new Point(pad, y);
      logo.Size = new Size(S(46), S(46));
      logo.BackColor = Color.Transparent;
      Controls.Add(logo);
      int textLeft = pad + S(46) + S(12);
      Words("PharmaBoost", F(14f, FontStyle.Bold), Look.Ink, textLeft, y - S(1), S(200));
      string subtitle = e.Items.Count > 1 ? e.Items.Count + " conseils disponibles" : (e.Items.Count == 1 ? "Conseil disponible" : (e.Alerts.Count > 0 ? "À lire avant de conseiller" : "Aucun conseil à proposer"));
      Words(subtitle, F(10.5f, FontStyle.Regular), Look.Faint, textLeft, y + S(23), S(210));
      if (e.Items.Count > 0)
      {
        string pillText; Color pillBack; Color pillFore;
        Look.Availability(e.Items[0].Availability, out pillText, out pillBack, out pillFore);
        Font pillFont = F(10f, FontStyle.Bold);
        Size pillSize = TextRenderer.MeasureText(pillText, pillFont);
        Label pill = new Label();
        pill.AutoSize = false;
        pill.UseCompatibleTextRendering = false;
        pill.Text = pillText;
        pill.Font = pillFont;
        pill.ForeColor = pillFore;
        pill.BackColor = pillBack;
        pill.TextAlign = ContentAlignment.MiddleCenter;
        pill.Size = new Size(pillSize.Width + S(26), S(28));
        pill.Location = new Point(width - pad - pill.Width, y + S(4));
        Controls.Add(pill);
        Look.Rounded(pill, S(14));
      }
      y += S(46) + S(14);

      // --- Ce qui a été détecté.
      Words(e.Label, F(10.5f, FontStyle.Regular), Look.Faint, pad, y, inner);
      y += S(21);
      Label subject = Words(e.Subject, F(14f, FontStyle.Bold), Look.Ink, pad, y, inner);
      y += subject.Height + S(10);

      // --- Les alertes, avant les conseils : on ne vend rien par-dessus une alerte non lue.
      if (e.Alerts.Count > 0)
      {
        Panel box = new Panel();
        box.BackColor = Look.AmberSoft;
        box.Location = new Point(pad, y);
        int boxY = S(8);
        foreach (string alert in e.Alerts)
        {
          Label line = new Label();
          line.AutoSize = false;
          line.UseMnemonic = false;
          line.UseCompatibleTextRendering = false;
          Font f = F(10.5f, FontStyle.Bold);
          string text = "⚠ " + alert;
          Size size = TextRenderer.MeasureText(text, f, new Size(inner - S(28), 10000), TextFormatFlags.WordBreak);
          line.Text = text;
          line.Font = f;
          line.ForeColor = Look.Amber;
          line.BackColor = Color.Transparent;
          line.Location = new Point(S(12), boxY);
          line.Size = new Size(inner - S(24), size.Height + S(3));
          box.Controls.Add(line);
          boxY += line.Height + S(4);
        }
        box.Size = new Size(inner, boxY + S(4));
        Controls.Add(box);
        Look.Rounded(box, S(10));
        y += box.Height + S(10);
      }

      // --- Les conseils : le premier avec sa photo, les suivants en une ligne.
      if (e.Items.Count > 0)
      {
        Panel divider = new Panel();
        divider.BackColor = Look.Line;
        divider.Location = new Point(pad, y);
        divider.Size = new Size(inner, 1);
        Controls.Add(divider);
        y += S(14);

        Item first = e.Items[0];
        int photo = S(84);
        PictureBox picture = new PictureBox();
        picture.Location = new Point(pad, y);
        picture.Size = new Size(photo, photo);
        picture.SizeMode = PictureBoxSizeMode.Zoom;
        picture.BackColor = Color.FromArgb(242, 244, 247);
        picture.Image = LoadPhoto(first.Image, photo);
        Controls.Add(picture);
        Look.Rounded(picture, S(12));

        int colX = pad + photo + S(14);
        int colW = inner - photo - S(14);
        int cy = y;
        Label name = Words(first.Name, F(13f, FontStyle.Bold), Look.Ink, colX, cy, colW);
        cy += name.Height + S(1);
        if (first.Price.Length > 0)
        {
          Label price = Words(first.Price, F(11.5f, FontStyle.Bold), Look.Green, colX, cy, colW);
          cy += price.Height;
        }
        if (first.Reason.Length > 0)
        {
          Label reason = Words(first.Reason, F(10f, FontStyle.Regular), Look.Soft, colX, cy, colW);
          cy += reason.Height;
        }
        Label check = Words("Suggestion à vérifier par le pharmacien", F(9f, FontStyle.Italic), Look.Faint, colX, cy, colW);
        cy += check.Height;
        y = Math.Max(y + photo, cy) + S(10);

        for (int i = 1; i < e.Items.Count; i++)
        {
          Item more = e.Items[i];
          string availabilityText; Color unusedBack; Color unusedFore;
          Look.Availability(more.Availability, out availabilityText, out unusedBack, out unusedFore);
          string line = "• " + more.Name + (more.Price.Length > 0 ? " · " + more.Price : "") + (more.Availability == "IN_STOCK" ? "" : " · " + availabilityText.ToLower());
          Label extra = Words(line, F(10.5f, FontStyle.Regular), Look.Ink, pad, y, inner);
          y += extra.Height + S(2);
        }
        if (e.Items.Count > 1) y += S(6);
      }
      else if (e.Notes.Count > 0)
      {
        foreach (string note in e.Notes)
        {
          Label line = Words(note, F(10.5f, FontStyle.Regular), Look.Soft, pad, y, inner);
          y += line.Height + S(2);
        }
        y += S(6);
      }

      // --- Deux gestes, pas un de plus.
      int buttonHeight = S(44);
      int ignoreWidth = S(104);
      PillButton view = new PillButton("Voir le conseil   →", true, Look.Green, Look.GreenDark, Color.White, Look.Green, F(11.5f, FontStyle.Bold));
      view.Location = new Point(pad, y);
      view.Size = new Size(inner - ignoreWidth - S(10), buttonHeight);
      view.Click += delegate { if (ViewClicked != null) ViewClicked(entry); };
      Controls.Add(view);
      PillButton ignore = new PillButton("Ignorer", false, Color.White, Color.FromArgb(242, 244, 247), Look.Ink, Color.FromArgb(208, 213, 221), F(11.5f, FontStyle.Bold));
      ignore.Location = new Point(pad + view.Width + S(10), y);
      ignore.Size = new Size(ignoreWidth, buttonHeight);
      ignore.Click += delegate { if (IgnoreClicked != null) IgnoreClicked(entry); };
      Controls.Add(ignore);
      y += buttonHeight + S(10);

      if (!e.Quiet)
      {
        Words("Ce conseil reste disponible près de l'horloge.", F(9f, FontStyle.Regular), Look.Faint, pad, y, inner);
        y += S(20);
      }
      y += S(4);

      ClientSize = new Size(width, y);
      Look.Rounded(this, S(18));
      // Les éléments qui ne sont pas des boutons font glisser la fenêtre.
      WireDrag(this);
      ResumeLayout(true);
      Invalidate();
    }

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
        if (child is PillButton) continue;
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
    }

    public void Reveal()
    {
      if (!Visible) Show();
      Native.SetWindowPos(Handle, Native.HWND_TOPMOST, 0, 0, 0, 0, Native.SWP_NOMOVE | Native.SWP_NOSIZE | Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
    }
  }

  /// <summary>Le chef d'orchestre : les conseils en attente, la fenêtre, l'icône près de l'horloge, la ligne de commande.</summary>
  public class Host : ApplicationContext
  {
    private static readonly TimeSpan MaxAge = TimeSpan.FromHours(2);

    private readonly List<Entry> pending = new List<Entry>();
    private readonly Dictionary<string, List<string>> dismissed = new Dictionary<string, List<string>>();
    private readonly NotifyIcon counter = new NotifyIcon();
    private readonly ContextMenuStrip menu = new ContextMenuStrip();
    private readonly System.Windows.Forms.Timer hideTimer = new System.Windows.Forms.Timer();
    private readonly System.Windows.Forms.Timer ageTimer = new System.Windows.Forms.Timer();
    private readonly Control ui = new Control();
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private ToastForm form;
    private Entry current;
    private IntPtr iconHandle = IntPtr.Zero;
    private int seconds = 30;
    private string position = "milieu-droite";
    private string positionFile = "";

    public Host()
    {
      ui.CreateControl();
      IntPtr unused = ui.Handle;
      counter.Visible = false;
      counter.ContextMenuStrip = menu;
      counter.MouseClick += delegate (object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowLatest(); };
      menu.Opening += delegate { BuildMenu(); };
      hideTimer.Tick += delegate { hideTimer.Stop(); Tuck(); };
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
          seconds = Math.Max(5, Math.Min(120, Int(command, "seconds", 30)));
          position = Str(command, "position");
          if (position.Length == 0) position = "milieu-droite";
          positionFile = Str(command, "positionFile");
          Dictionary<string, object> raw = command.ContainsKey("entry") ? command["entry"] as Dictionary<string, object> : null;
          if (raw != null) Show(Parse(raw));
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

    private static int Int(Dictionary<string, object> d, string key, int fallback)
    {
      object value;
      if (!d.TryGetValue(key, out value) || value == null) return fallback;
      try { return Convert.ToInt32(value); } catch (Exception) { return fallback; }
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
      e.Quiet = Str(d, "quiet") == "True" || Str(d, "quiet") == "true";
      foreach (object a in Seq(d, "alerts")) e.Alerts.Add(Convert.ToString(a));
      foreach (object n in Seq(d, "notes")) e.Notes.Add(Convert.ToString(n));
      foreach (object o in Seq(d, "items"))
      {
        Dictionary<string, object> raw = o as Dictionary<string, object>;
        if (raw == null) continue;
        Item item = new Item();
        item.Name = Str(raw, "name");
        item.Price = Str(raw, "price");
        item.Reason = Str(raw, "reason");
        item.Availability = Str(raw, "availability");
        item.Image = Str(raw, "image");
        e.Items.Add(item);
      }
      return e;
    }

    /// <summary>Un conseil arrive ou se met à jour. Seul du NOUVEAU rouvre la fenêtre.</summary>
    private void Show(Entry entry)
    {
      Entry existing = pending.Find(delegate (Entry p) { return p.Id == entry.Id; });
      List<string> already;
      bool wasDismissed = dismissed.TryGetValue(entry.Id, out already);
      List<string> known = new List<string>();
      if (existing != null) known.AddRange(existing.Shown);
      if (wasDismissed) known.AddRange(already);
      List<string> fresh = new List<string>();
      foreach (Item item in entry.Items) { string key = "p:" + item.Name; if (!known.Contains(key)) fresh.Add(key); }
      foreach (string alert in entry.Alerts) { string key = "a:" + alert; if (!known.Contains(key)) fresh.Add(key); }
      entry.Shown.AddRange(known);
      entry.Shown.AddRange(fresh);

      if (existing != null && fresh.Count == 0)
      {
        // Rien de nouveau (une photo qui arrive, un prix qui change) : on met à jour sur place, sans rouvrir.
        entry.Since = existing.Since;
        pending[pending.IndexOf(existing)] = entry;
        if (current != null && current.Id == entry.Id)
        {
          current = entry;
          if (form != null && form.Visible) { form.Render(entry); form.Place(); form.Reveal(); }
        }
        Refresh();
        return;
      }
      if (existing == null && wasDismissed && fresh.Count == 0) return;
      if (!entry.Quiet)
      {
        if (existing != null) { entry.Since = existing.Since; pending[pending.IndexOf(existing)] = entry; }
        else pending.Add(entry);
      }
      Present(entry, entry.Quiet ? 8 : seconds);
    }

    private void Present(Entry entry, int secondsToStay)
    {
      current = entry;
      if (form == null || form.IsDisposed)
      {
        form = new ToastForm();
        form.ViewClicked += delegate (Entry e) { View(e); };
        form.IgnoreClicked += delegate (Entry e) { Ignore(e); };
        form.Moved += delegate (Point p) { SavePosition(p); };
      }
      form.Position = position;
      form.PositionFile = positionFile;
      form.Render(entry);
      form.Place();
      form.Reveal();
      hideTimer.Stop();
      hideTimer.Interval = secondsToStay * 1000;
      hideTimer.Start();
      Refresh();
    }

    private void SavePosition(Point p)
    {
      try { if (!string.IsNullOrEmpty(positionFile)) File.WriteAllText(positionFile, p.X + "," + p.Y); } catch (Exception) { }
    }

    /// <summary>Le délai est écoulé : la fenêtre se range, le conseil reste compté près de l'horloge.</summary>
    private void Tuck()
    {
      Entry shown = current;
      Hide();
      if (shown != null && !shown.Quiet) Say("ATTENTE " + shown.Id);
      Refresh();
    }

    private void Hide()
    {
      hideTimer.Stop();
      if (form != null && !form.IsDisposed) form.Hide();
      current = null;
    }

    private void View(Entry entry)
    {
      try { if (!string.IsNullOrEmpty(entry.Url)) Process.Start(entry.Url); } catch (Exception) { }
      Dismiss(entry);
      Say("VOIR " + entry.Id);
    }

    private void Ignore(Entry entry)
    {
      Dismiss(entry);
      Say("IGNORER " + entry.Id);
    }

    /// <summary>Vu ou écarté : on s'en souvient, pour ne rouvrir la fenêtre que sur du nouveau.</summary>
    private void Dismiss(Entry entry)
    {
      dismissed[entry.Id] = new List<string>(entry.Shown);
      pending.RemoveAll(delegate (Entry p) { return p.Id == entry.Id; });
      Hide();
      Refresh();
    }

    private void Remove(string id)
    {
      pending.RemoveAll(delegate (Entry p) { return p.Id == id; });
      dismissed.Remove(id);
      if (current != null && current.Id == id) Hide();
      Refresh();
    }

    private void ShowLatest()
    {
      if (pending.Count == 0) return;
      Present(pending[pending.Count - 1], seconds);
    }

    private void IgnoreAll()
    {
      foreach (Entry entry in new List<Entry>(pending)) { dismissed[entry.Id] = new List<string>(entry.Shown); Say("IGNORER " + entry.Id); }
      pending.Clear();
      Hide();
      Refresh();
    }

    private void Expire()
    {
      int before = pending.Count;
      pending.RemoveAll(delegate (Entry p) { return DateTime.Now - p.Since > MaxAge; });
      if (pending.Count != before) Refresh();
    }

    private void BuildMenu()
    {
      menu.Items.Clear();
      ToolStripMenuItem title = new ToolStripMenuItem("PharmaBoost — " + pending.Count + (pending.Count > 1 ? " conseils en attente" : " conseil en attente"));
      title.Enabled = false;
      menu.Items.Add(title);
      menu.Items.Add(new ToolStripSeparator());
      for (int i = pending.Count - 1; i >= 0; i--)
      {
        Entry entry = pending[i];
        string text = entry.Items.Count > 0 ? entry.Items[0].Name : entry.Subject;
        if (text.Length > 44) text = text.Substring(0, 43) + "…";
        ToolStripMenuItem item = new ToolStripMenuItem("Voir : " + text + "   (" + entry.Reference + ")");
        item.Click += delegate { View(entry); };
        menu.Items.Add(item);
      }
      if (pending.Count > 0)
      {
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Tout ignorer", null, delegate { IgnoreAll(); });
      }
    }

    /// <summary>L'icône près de l'horloge n'existe que tant qu'un conseil attend ; elle porte leur nombre.</summary>
    private void Refresh()
    {
      if (pending.Count == 0)
      {
        counter.Visible = false;
        return;
      }
      IntPtr previous = iconHandle;
      using (Bitmap bmp = Look.CounterIcon(pending.Count))
      {
        iconHandle = bmp.GetHicon();
        counter.Icon = Icon.FromHandle(iconHandle);
      }
      string tip = "PharmaBoost — " + pending.Count + (pending.Count > 1 ? " conseils en attente" : " conseil en attente");
      counter.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
      counter.Visible = true;
      if (previous != IntPtr.Zero) Native.DestroyIcon(previous);
    }

    private void Quit()
    {
      hideTimer.Stop();
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
export const NOTICE_HOST_SCRIPT = `$ErrorActionPreference = "Stop"
$code = @'
${NOTICE_HOST_CSHARP}
'@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Web.Extensions
[PharmaBoostAvis.Program]::Run()
`;
