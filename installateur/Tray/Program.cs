using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace PharmaBoost.Tray
{
    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
            try { ServicePointManager.SecurityProtocol |= (SecurityProtocolType)12288; } catch (NotSupportedException) { }

            bool first;
            using (var mutex = new Mutex(true, @"Local\PharmaBoostPoste", out first))
            {
                if (!first)
                {
                    // PharmaBoost tourne déjà : un second lancement (raccourci du Bureau, du menu Démarrer) ouvre simplement l'application.
                    PostApplication.OpenPharmaBoost();
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                // Le superviseur et la mise à jour reviennent sur ce fil (celui de l'icône) par ce contexte.
                SynchronizationContext.SetSynchronizationContext(new WindowsFormsSynchronizationContext());
                Application.ThreadException += delegate (object sender, ThreadExceptionEventArgs e) { Journal.Write("erreur : " + e.Exception.Message); };
                Application.Run(new PostApplication(Array.IndexOf(args, "--premier-lancement") >= 0));
            }
        }
    }

    /// <summary>L'icône près de l'horloge : état du poste, accès à PharmaBoost, et le superviseur de l'agent.</summary>
    internal sealed class PostApplication : ApplicationContext
    {
        private static readonly TimeSpan UpdateEvery = TimeSpan.FromHours(6);

        private readonly NotifyIcon icon = new NotifyIcon();
        private readonly ToolStripMenuItem header = new ToolStripMenuItem { Enabled = false };
        private readonly ToolStripMenuItem statusLine = new ToolStripMenuItem { Enabled = false };
        private readonly AgentSupervisor supervisor = new AgentSupervisor();
        private readonly System.Windows.Forms.Timer statusTimer = new System.Windows.Forms.Timer { Interval = 5000 };
        private readonly System.Windows.Forms.Timer updateTimer = new System.Windows.Forms.Timer { Interval = 30000 };
        private readonly SynchronizationContext ui;
        private StatusView shown;
        private bool updating;

        public PostApplication(bool firstLaunch)
        {
            ui = SynchronizationContext.Current;
            icon.ContextMenuStrip = BuildMenu();
            icon.DoubleClick += delegate { OpenPharmaBoost(); };
            icon.Icon = TrayIcons.For(StatusView.Grey);
            icon.Text = "PharmaBoost";
            icon.Visible = true;

            supervisor.CrashLoop += OnCrashLoop;
            var settings = Settings.Load();
            if (settings.Paired)
            {
                supervisor.Start();
                if (firstLaunch)
                {
                    icon.ShowBalloonTip(10000, "PharmaBoost est installé", "Passez une boîte à la douchette dans votre logiciel : l'avis s'affiche en bas de l'écran.", ToolTipIcon.Info);
                }
            }
            else
            {
                icon.ShowBalloonTip(10000, "Ce poste n'est pas encore relié", "Relancez l'installation PharmaBoost avec un nouveau lien.", ToolTipIcon.Warning);
            }

            statusTimer.Tick += delegate { Refresh(); };
            statusTimer.Start();
            updateTimer.Tick += delegate { updateTimer.Interval = (int)UpdateEvery.TotalMilliseconds; CheckForUpdate(); };
            updateTimer.Start();
            Refresh();
        }

        private ContextMenuStrip BuildMenu()
        {
            var menu = new ContextMenuStrip();
            header.Font = new System.Drawing.Font(header.Font, System.Drawing.FontStyle.Bold);
            menu.Items.Add(header);
            menu.Items.Add(statusLine);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Ouvrir PharmaBoost", null, delegate { OpenPharmaBoost(); });
            menu.Items.Add("Essayer l'affichage d'un avis", null, delegate { TryNotice(); });
            menu.Items.Add("Voir le journal", null, delegate { OpenLog(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quitter PharmaBoost", null, delegate { Quit(); });
            return menu;
        }

        /// <summary>L'adresse de l'application, celle de la configuration (PharmaBoost de production par défaut).</summary>
        public static void OpenPharmaBoost()
        {
            try { Process.Start(Settings.Load().ServerUrl + "/vente/nouvelle"); }
            catch (Exception error) { Journal.Write("ouverture de PharmaBoost : " + error.Message); }
        }

        private static void OpenLog()
        {
            try { Process.Start("notepad.exe", "\"" + Paths.AgentLog + "\""); }
            catch (Exception error) { Journal.Write("ouverture du journal : " + error.Message); }
        }

        /// <summary>Un avis d'exemple en bas à droite de l'écran, sans bip ni serveur : vérifier l'affichage au poste.</summary>
        private static void TryNotice()
        {
            try
            {
                var info = new ProcessStartInfo(Paths.Node, "\"" + Paths.Agent + "\" --test-affichage")
                {
                    WorkingDirectory = Paths.Dir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                info.EnvironmentVariables["PHARMABOOST_CONNECT_CONFIG"] = Paths.Config;
                Process.Start(info);
            }
            catch (Exception error) { Journal.Write("essai d'affichage : " + error.Message); }
        }

        private void Quit()
        {
            var answer = MessageBox.Show(
                "PharmaBoost n'écoutera plus la douchette de ce poste tant que vous ne l'aurez pas relancé (menu Démarrer → PharmaBoost).\n\nQuitter PharmaBoost ?",
                "PharmaBoost", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2);
            if (answer != DialogResult.Yes) return;
            statusTimer.Stop();
            updateTimer.Stop();
            supervisor.Stop();
            icon.Visible = false;
            ExitThread();
        }

        private void Refresh()
        {
            var settings = Settings.Load();
            if (supervisor.Running && DateTime.UtcNow - supervisor.StartedUtc > TimeSpan.FromSeconds(35)) Updater.Confirm();
            var view = StatusView.Compute(settings.Paired, File.Exists(Paths.Node), supervisor.Running, supervisor.StartedUtc, DateTime.UtcNow, Settings.ReadJson(Paths.Status));
            string who = settings.Post != null && settings.Pharmacy != null ? settings.Post + " · " + settings.Pharmacy : settings.Pharmacy ?? settings.Post;
            header.Text = who == null ? "PharmaBoost" : "PharmaBoost — " + who;
            statusLine.Text = view.Text;
            if (shown != null && shown.Dot == view.Dot && shown.Text == view.Text) return;
            shown = view;
            icon.Icon = TrayIcons.For(view.Dot);
            // Une infobulle ne dépasse pas 63 caractères : au-delà, Windows lève une exception.
            string tip = "PharmaBoost — " + view.Text;
            icon.Text = tip.Length > 63 ? tip.Substring(0, 62) + "…" : tip;
        }

        private void CheckForUpdate()
        {
            if (updating) return;
            var settings = Settings.Load();
            if (!settings.Paired) return;
            updating = true;
            ThreadPool.QueueUserWorkItem(delegate
            {
                byte[] data = null;
                string sha = null;
                try { data = Updater.FetchIfNewer(settings.ServerUrl, out sha); }
                catch (Exception error) { Journal.Write("vérification de mise à jour : " + error.Message); }
                ui.Post(delegate
                {
                    updating = false;
                    if (data == null) return;
                    try
                    {
                        supervisor.Stop();
                        Updater.Apply(data, sha);
                    }
                    catch (Exception error) { Journal.Write("mise à jour impossible : " + error.Message); }
                    supervisor.Start();
                }, null);
            });
        }

        private void OnCrashLoop()
        {
            Journal.Write("l'agent s'arrête sans cesse");
            if (Updater.Rollback()) supervisor.Restart();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                supervisor.Dispose();
                icon.Dispose();
                statusTimer.Dispose();
                updateTimer.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
