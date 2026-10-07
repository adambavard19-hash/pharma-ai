using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace PharmaBoost.Tray
{
    /// <summary>
    /// Fait tourner l'agent (node.exe pharmaboost-connect.js) sans fenêtre, et le
    /// relance quand il s'arrête : tout de suite s'il tournait depuis longtemps,
    /// avec un délai croissant (5 s à 60 s) s'il s'arrête aussitôt. Trois arrêts
    /// consécutifs en moins de 30 secondes préviennent l'icône, qui peut revenir
    /// à la version précédente de l'agent si une mise à jour vient d'avoir lieu.
    /// </summary>
    internal sealed class AgentSupervisor : IDisposable
    {
        private static readonly TimeSpan StableAfter = TimeSpan.FromSeconds(30);
        private const int CrashLoopAfter = 3;

        private readonly SynchronizationContext ui;
        private readonly System.Windows.Forms.Timer retry = new System.Windows.Forms.Timer();
        private Process child;
        private bool stopped = true;
        private int quickFailures;

        public DateTime StartedUtc { get; private set; }
        public bool Running { get { return child != null && !HasExited(child); } }

        /// <summary>L'agent s'arrête aussitôt, encore et encore : vrai quand une mise à jour est en cause, le moment de revenir en arrière.</summary>
        public event Action CrashLoop;

        public AgentSupervisor()
        {
            ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            retry.Tick += delegate { retry.Stop(); if (!stopped) Launch(); };
        }

        public void Start()
        {
            stopped = false;
            quickFailures = 0;
            Launch();
        }

        public void Restart()
        {
            Stop();
            Start();
        }

        public void Stop()
        {
            stopped = true;
            retry.Stop();
            KillChild();
        }

        private void Launch()
        {
            if (!File.Exists(Paths.Node) || !File.Exists(Paths.Agent) || !File.Exists(Paths.Config))
            {
                Journal.Write("lancement impossible : node.exe, l'agent ou la configuration manque");
                return;
            }
            try
            {
                var info = new ProcessStartInfo(Paths.Node, "\"" + Paths.Agent + "\"")
                {
                    WorkingDirectory = Paths.Dir,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                info.EnvironmentVariables["PHARMABOOST_CONNECT_CONFIG"] = Paths.Config;
                var started = Process.Start(info);
                started.EnableRaisingEvents = true;
                started.Exited += delegate { ui.Post(delegate { OnExited(started); }, null); };
                child = started;
                StartedUtc = DateTime.UtcNow;
                Journal.Write("agent démarré (processus " + started.Id + ")");
            }
            catch (Exception error)
            {
                Journal.Write("agent non démarré : " + error.Message);
                ScheduleRetry();
            }
        }

        private void OnExited(Process exited)
        {
            if (stopped || exited != child) return;
            TimeSpan ranFor = DateTime.UtcNow - StartedUtc;
            int code = 0;
            try { code = exited.ExitCode; } catch (InvalidOperationException) { }
            Journal.Write("agent arrêté (code " + code + ") après " + (int)ranFor.TotalSeconds + " s");
            quickFailures = ranFor < StableAfter ? quickFailures + 1 : 0;
            if (quickFailures >= CrashLoopAfter)
            {
                quickFailures = 0;
                var handler = CrashLoop;
                if (handler != null) handler();
            }
            ScheduleRetry();
        }

        private void ScheduleRetry()
        {
            if (stopped) return;
            int seconds = quickFailures == 0 ? 2 : Math.Min(60, 5 * (1 << Math.Min(quickFailures, 4)));
            retry.Interval = seconds * 1000;
            retry.Start();
        }

        private void KillChild()
        {
            var process = child;
            child = null;
            if (process == null) return;
            try
            {
                if (!HasExited(process))
                {
                    // /T : l'agent a des enfants (écoute de la douchette, fenêtre d'avis), ils partent avec lui.
                    var kill = Process.Start(new ProcessStartInfo("taskkill", "/PID " + process.Id + " /T /F") { CreateNoWindow = true, UseShellExecute = false });
                    if (kill != null) kill.WaitForExit(5000);
                }
            }
            catch (Exception error)
            {
                Journal.Write("arrêt de l'agent : " + error.Message);
            }
        }

        private static bool HasExited(Process process)
        {
            try { return process.HasExited; } catch (InvalidOperationException) { return true; }
        }

        public void Dispose()
        {
            Stop();
            retry.Dispose();
        }
    }
}
