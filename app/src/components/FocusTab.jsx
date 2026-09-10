import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Settings2, Plus, Trash2, X, ChevronRight, BarChart2, FastForward, Repeat, CheckCircle2, Bell, ChevronDown } from 'lucide-react';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { scheduleTaskReminder, cancelTaskReminder, scheduleDailyMotivational, cancelDailyMotivational } from '../utils/taskNotifications';
import TaskReminderModal from './TaskReminderModal';
import StatsModal from './StatsModal';
import { commitSessionDelta, commitSessionComplete, commitTaskCompleted, commitTaskUncompleted, getHistory } from '../utils/statsManager';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';

const TimerNotification = registerPlugin('TimerNotification');

// ── DurationRow ───────────────────────────────────────────────────────────────
// Allows free typing: local string state until blur, only then commits.
function DurationRow({ label, value, disabled, hapticsEnabled, onChange }) {
  const [draft, setDraft] = useState(String(value));

  // Sync draft when parent value changes externally (e.g. reset)
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= 1) {
      onChange(parsed);
      setDraft(String(parsed));
    } else {
      setDraft(String(value)); // revert
    }
  };

  return (
    <div className="bg-surfaceHighlight px-5 py-4 flex items-center justify-between">
      <span className="font-medium text-white">{label}</span>
      <div className="flex items-center gap-2">
        <button
          onPointerDown={() => {
            if (!disabled) {
              if (hapticsEnabled !== false) {
                try { Haptics.impact({ style: ImpactStyle.Light }); } catch (_) {}
              }
              onChange(Math.max(1, value - 1));
            }
          }}
          className="w-8 h-8 rounded-full bg-background border border-white/10 text-gray-300 font-bold text-lg flex items-center justify-center active:scale-90 transition-transform select-none"
        >−</button>
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
          className="bg-background text-white font-mono font-bold w-14 text-center py-1.5 rounded-xl outline-none border border-white/10 focus:border-primary transition-colors disabled:cursor-not-allowed text-base"
        />
        <button
          onPointerDown={() => {
            if (!disabled) {
              if (hapticsEnabled !== false) {
                try { Haptics.impact({ style: ImpactStyle.Light }); } catch (_) {}
              }
              onChange(Math.min(180, value + 1));
            }
          }}
          className="w-8 h-8 rounded-full bg-background border border-white/10 text-gray-300 font-bold text-lg flex items-center justify-center active:scale-90 transition-transform select-none"
        >+</button>
      </div>
    </div>
  );
}

// ── AlertRow ──────────────────────────────────────────────────────────────────
// 3-option pill segmented control: None / Notify / Alarm
const ALERT_OPTIONS = [
  { value: 'none',         label: 'Off'    },
  { value: 'notification', label: 'Notify' },
  { value: 'alarm',        label: 'Alarm'  },
];

function AlertRow({ label, sublabel, value, hapticsEnabled, onChange }) {
  return (
    <div className="bg-surfaceHighlight px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="font-medium text-white block">{label}</span>
        <span className="text-xs text-gray-500 block mt-0.5 truncate">{sublabel}</span>
      </div>
      <div className="flex items-center bg-background rounded-full p-1 border border-white/8 gap-0.5 flex-shrink-0">
        {ALERT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              if (hapticsEnabled !== false) {
                try { Haptics.impact({ style: ImpactStyle.Light }); } catch (_) {}
              }
              onChange(opt.value);
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 ${
              value === opt.value
                ? 'bg-primary text-black shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FocusTab({ partnerStats, isPartnerStudying }) {
  // ── Local Stats ──────────────────────────────────────────────────────────────
  const [localStats, setLocalStats] = useState(() => {
    try {
      const saved = localStorage.getItem('study_buddy_stats');
      const parsed = saved ? JSON.parse(saved) : null;
      const todayDate = new Date().toDateString();
      if (parsed && parsed.date === todayDate) return parsed;
      return { date: todayDate, todaySeconds: 0 };
    } catch {
      return { date: new Date().toDateString(), todaySeconds: 0 };
    }
  });

  const [activeMode, setActiveMode] = useState(() => localStorage.getItem('focus_activeMode') || 'FOCUS');
  const [running, setRunning] = useState(() => localStorage.getItem('focus_running') === 'true');
  const [elapsed, setElapsed] = useState(() => parseInt(localStorage.getItem('focus_elapsed')) || 0);

  const [showSettings, setShowSettings] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCompletePrompt, setShowCompletePrompt] = useState(false);
  const [completedMode, setCompletedMode] = useState('FOCUS');
  const [skipProgress, setSkipProgress] = useState(0);
  const lastCreditedRef = useRef(0);

  // ── Android version detection (for feature-gating) ───────────────────────────
  // navigator.userAgent in Capacitor WebView always includes "Android X.Y" on Android.
  // We extract the major version to gate features like Dynamic Island (requires Android 16).
  const [androidMajorVersion, setAndroidMajorVersion] = useState(0);
  useEffect(() => {
    const match = navigator.userAgent.match(/Android (\d+)/i);
    if (match) setAndroidMajorVersion(parseInt(match[1], 10));
  }, []);

  // Dynamic Island (Live Updates) requires Android 16 (API 36).
  // On Android 11 or any non-Android 16 device this is never shown.
  const supportsLiveUpdates = androidMajorVersion >= 16;

  // ── Settings ─────────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('focusSettings');
      return saved ? {
        FOCUS: 25, SHORT_BREAK: 5, LONG_BREAK: 15, isStopwatch: false,
        focusAlert: 'notification', breakAlert: 'notification',
        hapticsEnabled: true,
        dailyRemindersEnabled: true,
        dailyReminderTimes: ['20:00', '23:00'],
        dynamicIslandEnabled: true,
        ...JSON.parse(saved)
      } : {
        FOCUS: 25, SHORT_BREAK: 5, LONG_BREAK: 15, isStopwatch: false,
        focusAlert: 'notification', breakAlert: 'notification',
        hapticsEnabled: true,
        dailyRemindersEnabled: true,
        dailyReminderTimes: ['20:00', '23:00'],
        dynamicIslandEnabled: true,
      };
    } catch {
      return { FOCUS: 25, SHORT_BREAK: 5, LONG_BREAK: 15, isStopwatch: false, focusAlert: 'notification', breakAlert: 'notification', hapticsEnabled: true, dailyRemindersEnabled: true, dailyReminderTimes: ['20:00', '23:00'], dynamicIslandEnabled: true };
    }
  });

  // ── Safe Haptics Helper ───────────────────────────────────────────────────────
  const triggerHaptic = (styleOrType, isNotification = false) => {
    if (settings.hapticsEnabled === false) return;
    try {
      if (isNotification) {
        Haptics.notification({ type: styleOrType });
      } else {
        Haptics.impact({ style: styleOrType });
      }
    } catch (_) {}
  };

  // ── Alarm helpers ─────────────────────────────────────────────────────────────
  const startAlarm = (title, body) => {
    try { TimerNotification.playAlarm({ title, body }); } catch (e) { console.warn('Native alarm failed', e); }
  };
  const stopAlarm = () => {
    try { TimerNotification.stopAlarm(); } catch (e) { console.warn('Native alarm stop failed', e); }
  };

  // ── Mode config ───────────────────────────────────────────────────────────────
  const MODES = {
    FOCUS:       { label: 'Focus',         mins: settings.FOCUS,       color: 'primary'  },
    SHORT_BREAK: { label: 'Short Break',   mins: settings.SHORT_BREAK, color: 'accent'   },
    LONG_BREAK:  { label: 'Long Break',    mins: settings.LONG_BREAK,  color: 'blue-500' },
  };

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const startTsRef       = useRef(parseInt(localStorage.getItem('focus_startTs')) || null);
  const elapsedRef       = useRef(parseInt(localStorage.getItem('focus_elapsed')) || 0);
  const lastTickRef      = useRef(parseInt(localStorage.getItem('focus_lastTick')) || 0);
  const skipTimerRef     = useRef(null);
  // True when transition was intentional (complete/reset/mode-change) — prevents
  // the !running branch from showing the paused notification.
  const sessionEndedRef  = useRef(false);
  // Tracks extra minutes added via +1 Min button during the current session.
  // Resets on every new session start / mode change / reset.
  const addedMinsRef     = useRef(parseInt(localStorage.getItem('focus_addedMins')) || 0);
  // Prevents stopAlarm() firing spuriously on first mount.
  const hasMountedRef    = useRef(false);

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('study_buddy_tasks');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      // ── Backward-compat migration: recurring(bool) → recurrence, reminder.datetime → reminder.time
      return parsed.map(t => {
        const migrated = { ...t };
        // Migrate recurrence field
        if ('recurring' in migrated && !('recurrence' in migrated)) {
          migrated.recurrence = migrated.recurring ? 'daily' : null;
        }
        // Ensure notifIds is always an array
        if (!Array.isArray(migrated.notifIds)) migrated.notifIds = [];
        // Migrate reminder.datetime → reminder.time
        if (migrated.reminder && migrated.reminder.datetime && !migrated.reminder.time) {
          try {
            const d = new Date(migrated.reminder.datetime);
            const pad = n => String(n).padStart(2, '0');
            migrated.reminder = {
              ...migrated.reminder,
              time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            };
          } catch {}
        }
        return migrated;
      });
    } catch { return []; }
  });
  const [newTask, setNewTask] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [reminderModalTask, setReminderModalTask] = useState(null); // task being edited, or null
  const [repeatOffConfirm, setRepeatOffConfirm]   = useState(null); // taskId or null

  // ── Derived values ────────────────────────────────────────────────────────────
  const isStopwatch   = settings.isStopwatch;
  // Total duration for the current session including added minutes.
  const baseDuration  = MODES[activeMode].mins * 60;
  const durationSecs  = isStopwatch ? Infinity : baseDuration + addedMinsRef.current * 60;
  const color         = MODES[activeMode].color;

  // ── Persist to localStorage ───────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('focus_running',    running.toString());
    localStorage.setItem('focus_activeMode', activeMode);
    localStorage.setItem('focus_startTs',    startTsRef.current ? startTsRef.current.toString() : '');
    localStorage.setItem('focus_lastTick',   lastTickRef.current.toString());
    localStorage.setItem('focus_addedMins',  addedMinsRef.current.toString());
  }, [running, activeMode]);
  useEffect(() => localStorage.setItem('study_buddy_tasks',  JSON.stringify(tasks)),    [tasks]);
  useEffect(() => localStorage.setItem('focusSettings',       JSON.stringify(settings)), [settings]);
  useEffect(() => localStorage.setItem('study_buddy_stats',   JSON.stringify(localStats)), [localStats]);

  // ── Firebase Live Sync ────────────────────────────────────────────────────────
  useEffect(() => {
    const roomId = localStorage.getItem('study_buddy_room');
    const myId = localStorage.getItem('study_buddy_device_id');
    if (!roomId || !myId) return;

    // Throttle the write using a timeout to avoid spamming Firebase on every single tick
    const timeout = setTimeout(() => {
      // Calculate current streak
      const history = getHistory();
      let streak = 0;
      if (history.length > 0) {
        let i = history.length - 1;
        const msPerDay = 1000 * 60 * 60 * 24;
        let expectedDate = new Date(); // Start checking backwards from today/yesterday
        expectedDate.setHours(0,0,0,0);
        
        const lastEntry = new Date(history[i].date);
        lastEntry.setHours(0,0,0,0);
        
        // If the last entry isn't today or yesterday, streak is 0
        const diffDays = Math.round((expectedDate - lastEntry) / msPerDay);
        if (diffDays <= 1) {
          expectedDate = lastEntry;
          while (i >= 0) {
            const entryDate = new Date(history[i].date);
            entryDate.setHours(0,0,0,0);
            if (expectedDate.getTime() === entryDate.getTime()) {
              streak++;
              expectedDate = new Date(expectedDate.getTime() - msPerDay);
              i--;
            } else {
              break;
            }
          }
        }
      }

      update(ref(db, `rooms/${roomId}/members/${myId}/liveStats`), {
        timerRunning: running && activeMode === 'FOCUS',
        todayStudySeconds: localStats.todaySeconds || 0,
        completedTasks: tasks.filter(t => t.completed).length,
        totalTasks: tasks.length,
        streak: streak
      }).catch(err => console.warn('Firebase Sync Failed:', err));
    }, 2000);

    return () => clearTimeout(timeout);
  }, [running, activeMode, localStats.todaySeconds, tasks]);

  // ── On-mount catch-up: if app was closed while timer was running ──────────────
  useEffect(() => {
    // BUG FIX: If elapsed was at durationSecs (i.e. timer had already completed
    // but user never dismissed the modal), reset it so pressing Play doesn't
    // immediately re-trigger completion.
    const savedElapsed   = parseInt(localStorage.getItem('focus_elapsed')) || 0;
    const savedRunning   = localStorage.getItem('focus_running') === 'true';
    const savedMode      = localStorage.getItem('focus_activeMode') || 'FOCUS';
    const savedAdded     = parseInt(localStorage.getItem('focus_addedMins')) || 0;
    const savedDuration  = (settings[savedMode] || 25) * 60 + savedAdded * 60;

    if (savedRunning && startTsRef.current) {
      const trueElapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
      const savedLastTick = parseInt(localStorage.getItem('focus_lastTick')) || 0;
      const targetSecs = !settings.isStopwatch ? Math.min(trueElapsed, savedDuration) : trueElapsed;
      const uncredited = Math.max(0, targetSecs - savedLastTick);
      if (uncredited > 0) {
        commitSessionDelta({
          deltaSeconds: uncredited,
          isBreak: savedMode !== 'FOCUS',
          isPartnerStudying,
          sessionStartMs: startTsRef.current + savedLastTick * 1000,
        });
      }
      lastCreditedRef.current = targetSecs;

      if (!settings.isStopwatch && trueElapsed >= savedDuration) {
        // Completed while away — show prompt but don't auto-reset elapsed to 0
        elapsedRef.current = savedDuration;
        setElapsed(savedDuration);
        setRunning(false);
        localStorage.setItem('focus_running', 'false');
        setCompletedMode(savedMode);
        setShowCompletePrompt(true);
        commitSessionComplete(savedMode);
      } else {
        elapsedRef.current = trueElapsed;
        setElapsed(trueElapsed);
      }
    } else if (!savedRunning && savedElapsed > 0 && savedElapsed >= savedDuration && !settings.isStopwatch) {
      // Timer was at completion state when app closed — reset to 0 so it doesn't
      // immediately re-fire completion on next Play press. Session is already done.
      elapsedRef.current = 0;
      lastTickRef.current = 0;
      setElapsed(0);
      localStorage.setItem('focus_elapsed', '0');
      localStorage.setItem('focus_lastTick', '0');
    }
  }, []);

  // ── Stop alarm when completion modal is dismissed ─────────────────────────────
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (!showCompletePrompt) {
      stopAlarm();
    }
  }, [showCompletePrompt]);

  // ── Notification channels ─────────────────────────────────────────────────────
  const requestNotificationPermission = async () => {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
      await LocalNotifications.createChannel({
        id: 'study_focus_channel_v1', name: 'Focus Timer',
        description: 'Ongoing Study Timer Notification',
        importance: 4, visibility: 1, vibration: false, lights: false
      });
      await LocalNotifications.createChannel({
        id: 'session_complete_channel', name: 'Session Complete Alerts',
        description: 'Alerts when a focus or break session finishes',
        importance: 5, visibility: 1, vibration: true, lights: true
      });
      // Channels for partner signals — distinct custom sounds and separate in notification shade
      await LocalNotifications.createChannel({
        id: 'nudge_channel_v2', name: 'Focus Reminders',
        description: 'Reminders to keep your focus sessions on track',
        importance: 4, visibility: 1, vibration: true, lights: true,
        sound: 'nudge_sound.wav'
      });
      await LocalNotifications.createChannel({
        id: 'checkin_channel_v2', name: 'Session Check-Ins',
        description: 'Mid-session check-ins from Moment',
        importance: 4, visibility: 1, vibration: false, lights: true,
        sound: 'checkin_sound.wav'
      });
    } catch (e) { console.warn('Notification setup warning:', e); }
  };

  // ── Live midnight rollover & timer reset ───────────────────────────────────────
  const performMidnightCheck = () => {
    const today        = new Date().toDateString();
    const lastTaskDate = localStorage.getItem('study_buddy_task_date') || today;

    if (lastTaskDate !== today) {
      // ── Midnight timer check & wall-clock delta commit (Pillar 1) ───────────
      const wasRunning    = localStorage.getItem('focus_running') === 'true';
      const savedMode     = localStorage.getItem('focus_activeMode') || 'FOCUS';
      const savedAdded    = parseInt(localStorage.getItem('focus_addedMins')) || 0;
      const savedDuration = (settings[savedMode] || 25) * 60 + savedAdded * 60;
      const trueElapsed   = startTsRef.current ? Math.floor((Date.now() - startTsRef.current) / 1000) : elapsedRef.current;
      const targetSecs    = (!settings.isStopwatch && savedDuration > 0) ? Math.min(trueElapsed, savedDuration) : trueElapsed;
      const uncredited    = Math.max(0, targetSecs - lastCreditedRef.current);

      if (uncredited > 0) {
        commitSessionDelta({
          deltaSeconds: uncredited,
          isBreak: savedMode !== 'FOCUS' && !settings.isStopwatch,
          isPartnerStudying,
          sessionStartMs: startTsRef.current ? startTsRef.current + lastCreditedRef.current * 1000 : undefined,
        });
        lastCreditedRef.current = targetSecs;
      }

      // If timer was completed, or was NOT running, reset it cleanly for the new day
      if (!wasRunning || (!settings.isStopwatch && trueElapsed >= savedDuration)) {
        if (!settings.isStopwatch && trueElapsed >= savedDuration && wasRunning) {
          commitSessionComplete(savedMode);
        }
        localStorage.setItem('focus_running',   'false');
        localStorage.setItem('focus_elapsed',   '0');
        localStorage.setItem('focus_lastTick',  '0');
        localStorage.setItem('focus_startTs',   '');
        localStorage.setItem('focus_addedMins', '0');
        setRunning(false);
        setElapsed(0);
        elapsedRef.current      = 0;
        lastTickRef.current     = 0;
        addedMinsRef.current    = 0;
        lastCreditedRef.current = 0;

        // Cleanly dismiss any completion prompt or alarm carried over from yesterday
        setShowCompletePrompt(false);
        stopAlarm();

        if (wasRunning) {
          TimerNotification.hideTimer().catch(() => {});
        }

        const freshStats = { date: today, todaySeconds: 0 };
        setLocalStats(freshStats);
        localStorage.setItem('study_buddy_stats', JSON.stringify(freshStats));
      } else {
        // Was running and still active within session duration across midnight!
        // The session continues running. Calculate today's portion for localStats.
        const midnightMs = new Date().setHours(0, 0, 0, 0);
        const todayPortion = Math.max(0, Math.floor((Date.now() - midnightMs) / 1000));
        const freshStats = { date: today, todaySeconds: todayPortion };
        setLocalStats(freshStats);
        localStorage.setItem('study_buddy_stats', JSON.stringify(freshStats));
      }

      // ── Task rollover ─────────────────────────────────────────────────────
      const todayDay = new Date().toLocaleDateString('en-US', { weekday: 'short' });

      let currentTasks;
      try {
        const raw = localStorage.getItem('study_buddy_tasks');
        currentTasks = raw ? JSON.parse(raw) : [];
      } catch { currentTasks = []; }

      const updatedTasks = currentTasks
        // Done one-time tasks (no recurrence) are auto-deleted at midnight.
        // Undone one-time tasks survive — they may still be relevant today.
        .filter(t => t.recurrence || !t.done)
        .map(t => {
          const rec = t.recurrence;
          if (!rec) return t; // undone one-time task: keep as-is, not reset
          const shouldReset = rec === 'daily'
            || (Array.isArray(rec) && rec.includes(todayDay));
          if (!shouldReset) return t;
          // Reset done; clear notifIds if done (will reschedule below)
          return { ...t, done: false, notifIds: t.done ? [] : (t.notifIds || []) };
        });

      setTasks(updatedTasks);
      localStorage.setItem('study_buddy_task_date', today);

      // Reschedule reminders for tasks that were reset and had their IDs cleared
      updatedTasks.forEach(t => {
        if (t.recurrence && t.reminder && !(t.notifIds?.length)) {
          scheduleTaskReminder(t)
            .then(ids => {
              if (ids.length > 0) {
                setTasks(prev => prev.map(t2 =>
                  t2.id === t.id ? { ...t2, notifIds: ids } : t2
                ));
              }
            })
            .catch(() => {});
        }
      });
    } else if (!localStorage.getItem('study_buddy_task_date')) {
      localStorage.setItem('study_buddy_task_date', today);
    }
  };

  useEffect(() => {
    performMidnightCheck();
    requestNotificationPermission();

    // Check whenever app returns from background or tab becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performMidnightCheck();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check periodically so overnight open sessions rollover live at 00:00
    const midnightInterval = setInterval(performMidnightCheck, 30000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(midnightInterval);
    };
  }, []);


  // ── Formatters ────────────────────────────────────────────────────────────────
  const formatTime = (totalSecs) => {
    const s = isStopwatch ? totalSecs : Math.max(durationSecs - totalSecs, 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rs = s % 60;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${rs.toString().padStart(2, '0')}`;
  };

  const formatStatsTime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // ── Hardware notification sync ────────────────────────────────────────────────
  const syncHardwareNotification = async (baseStartTs, partnerActive, isTimerRunning = true, overrideDI = undefined) => {
    if (!baseStartTs && isTimerRunning) return;
    const modeLabel = isStopwatch ? 'Stopwatch' : (activeMode === 'FOCUS' ? 'In the Moment' : MODES[activeMode].label);
    const led = partnerActive ? '\u{1F7E2}' : '\u26AA';
    // For countdown, `setWhen` is the END timestamp so the chronometer counts down.
    const targetMs = isStopwatch
      ? baseStartTs
      : (baseStartTs ? baseStartTs + durationSecs * 1000 : Date.now());
    // overrideDI lets the caller pass the new DI value immediately after setState
    // (React state updates are async so settings.dynamicIslandEnabled may still be stale)
    const diEnabled = overrideDI !== undefined ? overrideDI : settings.dynamicIslandEnabled !== false;
    try {
      await TimerNotification.showTimer({
        title:         `${led} ${modeLabel}`,
        body:          isTimerRunning ? 'Session in progress' : 'Paused \u00B7 Tap to resume',
        timestamp:     targetMs,
        countDown:     !isStopwatch,
        isRunning:     isTimerRunning,
        dynamicIsland: diEnabled,
      });
    } catch (err) { console.warn('TimerNotification update failed:', err); }
  };

  const hideHardwareNotification = () => {
    TimerNotification.hideTimer().catch(() => {});
  };

  // ── Native notification action listener ───────────────────────────────────────
  const latestRefs = useRef({ baseDuration, activeMode, isStopwatch, isPartnerStudying, dynamicIslandEnabled: settings.dynamicIslandEnabled !== false });
  useEffect(() => {
    latestRefs.current = { baseDuration, activeMode, isStopwatch, isPartnerStudying, dynamicIslandEnabled: settings.dynamicIslandEnabled !== false };
  }, [baseDuration, activeMode, isStopwatch, isPartnerStudying, settings.dynamicIslandEnabled]);

  useEffect(() => {
    let handle = null;
    const bindListener = async () => {
      try {
        handle = await TimerNotification.addListener('onNotificationAction', (data) => {
          if (!data) return;

          if (data.action === 'toggle') {
            setRunning(prev => {
              const next = !prev;
              localStorage.setItem('focus_running', next.toString());
              return next;
            });
          }

          if (data.action === 'addMinute') {
            // Only valid when timer has a start timestamp
            if (startTsRef.current) {
              const { baseDuration, activeMode, isStopwatch, isPartnerStudying, dynamicIslandEnabled } = latestRefs.current;
              
              addedMinsRef.current += 1;
              localStorage.setItem('focus_addedMins', addedMinsRef.current.toString());
              
              const currentElapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
              elapsedRef.current  = currentElapsed;
              lastTickRef.current = currentElapsed;
              setElapsed(currentElapsed);
              localStorage.setItem('focus_elapsed',   currentElapsed.toString());
              localStorage.setItem('focus_lastTick',  currentElapsed.toString());
              
              const isRunningNow = localStorage.getItem('focus_running') === 'true';
              const newDuration = baseDuration + addedMinsRef.current * 60;
              const endTarget   = startTsRef.current + newDuration * 1000;
              
              TimerNotification.showTimer({
                title:         `${isPartnerStudying ? '\u{1F7E2}' : '\u26AA'} ${isStopwatch ? 'Stopwatch' : (activeMode === 'FOCUS' ? 'In the Moment' : MODES[activeMode].label)}`,
                body:          isRunningNow ? 'Session in progress' : 'Paused \u00B7 Tap to resume',
                timestamp:     endTarget,
                countDown:     !isStopwatch,
                isRunning:     isRunningNow,
                dynamicIsland: dynamicIslandEnabled !== false,
              }).catch(() => {});
            }
          }

          if (data.action === 'dismissModal') {
            setShowCompletePrompt(false);
          }
        });
      } catch (err) { console.warn('Failed to attach notification listener:', err); }
    };
    bindListener();
    return () => { if (handle && typeof handle.remove === 'function') handle.remove(); };
  }, []);

  // Re-sync notification LED when partner state or mode changes
  useEffect(() => {
    if (running && startTsRef.current) {
      syncHardwareNotification(startTsRef.current, isPartnerStudying, true);
    }
  }, [isPartnerStudying, running, activeMode, isStopwatch, durationSecs]);

  // ── Session complete ──────────────────────────────────────────────────────────
  const handleSessionComplete = (mode) => {
    sessionEndedRef.current = true;
    setRunning(false);
    localStorage.setItem('focus_running', 'false');
    hideHardwareNotification();
    triggerHaptic(NotificationType.Success, true);

    // Wall-clock delta logging (Pillar 1)
    const isBreak = mode !== 'FOCUS' && !isStopwatch;
    const finalElapsed = isStopwatch ? elapsedRef.current : durationSecs;
    const uncredited = Math.max(0, finalElapsed - lastCreditedRef.current);
    if (uncredited > 0) {
      commitSessionDelta({
        deltaSeconds: uncredited,
        isBreak,
        isPartnerStudying,
        sessionStartMs: startTsRef.current ? startTsRef.current + lastCreditedRef.current * 1000 : undefined,
      });
    }
    commitSessionComplete(mode);
    lastCreditedRef.current = 0;

    const alertSetting = mode === 'FOCUS' ? settings.focusAlert : settings.breakAlert;
    const title = mode === 'FOCUS' ? '\u{1F389} Moment Complete!' : '\u26A1 Break Complete!';
    const body  = mode === 'FOCUS' ? 'Great work! Time for a short break.' : 'Ready for your next moment?';

    if (alertSetting === 'notification') {
      try {
        LocalNotifications.schedule({ notifications: [{ id: Math.floor(Date.now() / 1000), title, body, channelId: 'session_complete_channel' }] });
      } catch (e) {}
    } else if (alertSetting === 'alarm') {
      startAlarm(title, body);
    }

    setCompletedMode(mode);
    setShowCompletePrompt(true);
  };

  // ── Drift-free wall-clock timer useEffect ─────────────────────────────────────
  // SACRED: Do not change the timing math. Only side-effects may be modified.
  useEffect(() => {
    if (!running) {
      // Wall-clock delta logging on pause (Pillar 1)
      const currentElapsed = elapsedRef.current;
      const uncredited = Math.max(0, currentElapsed - lastCreditedRef.current);
      if (uncredited > 0) {
        commitSessionDelta({
          deltaSeconds: uncredited,
          isBreak: activeMode !== 'FOCUS' && !isStopwatch,
          isPartnerStudying,
          sessionStartMs: startTsRef.current ? startTsRef.current + lastCreditedRef.current * 1000 : undefined,
        });
        lastCreditedRef.current = currentElapsed;
      }

      lastTickRef.current = elapsedRef.current;
      localStorage.setItem('focus_elapsed',  elapsedRef.current.toString());
      localStorage.setItem('focus_lastTick', lastTickRef.current.toString());

      if (!sessionEndedRef.current && elapsedRef.current > 0) {
        // Manual pause — keep sticky paused notification
        syncHardwareNotification(startTsRef.current, isPartnerStudying, false);
      } else {
        // Reset / complete / never started — hide notification
        hideHardwareNotification();
      }
      sessionEndedRef.current = false;
      return;
    }

    // Resume / start: anchor startTs from current wall-clock minus already-elapsed
    startTsRef.current = Date.now() - elapsedRef.current * 1000;
    localStorage.setItem('focus_startTs', startTsRef.current.toString());
    localStorage.setItem('focus_elapsed', elapsedRef.current.toString());
    syncHardwareNotification(startTsRef.current, isPartnerStudying, true);

    const interval = setInterval(() => {
      const newElapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
      localStorage.setItem('focus_elapsed', newElapsed.toString());

      // Accumulate local focus stats
      if (activeMode === 'FOCUS' || isStopwatch) {
        const delta = newElapsed - lastTickRef.current;
        if (delta > 0) {
          setLocalStats(prev => {
            const today = new Date().toDateString();
            if (prev.date !== today) return { date: today, todaySeconds: delta };
            return { ...prev, todaySeconds: prev.todaySeconds + delta };
          });
          lastTickRef.current = newElapsed;
        }
      }

      // Check completion — use durationSecs from closure (includes addedMins at time of start)
      if (!isStopwatch && newElapsed >= durationSecs) {
        if (activeMode === 'FOCUS') {
          const finalDelta = durationSecs - lastTickRef.current;
          if (finalDelta > 0) {
            setLocalStats(prev => {
              const today = new Date().toDateString();
              if (prev.date !== today) return { date: today, todaySeconds: finalDelta };
              return { ...prev, todaySeconds: prev.todaySeconds + finalDelta };
            });
          }
        }
        setElapsed(durationSecs);
        elapsedRef.current = durationSecs;
        clearInterval(interval);
        handleSessionComplete(activeMode);
      } else {
        setElapsed(newElapsed);
        elapsedRef.current = newElapsed;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [running, durationSecs, activeMode, isStopwatch]);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const toggleTimer = () => {
    triggerHaptic(ImpactStyle.Light);
    if (!running) {
      requestNotificationPermission();
    }
    setRunning(!running);
    setShowModeSelector(false);
  };

  const resetTimer = () => {
    // Commit any uncredited wall-clock delta before reset (Pillar 1)
    const currentElapsed = elapsedRef.current;
    const uncredited = Math.max(0, currentElapsed - lastCreditedRef.current);
    if (uncredited > 0) {
      commitSessionDelta({
        deltaSeconds: uncredited,
        isBreak: activeMode !== 'FOCUS' && !isStopwatch,
        isPartnerStudying,
        sessionStartMs: startTsRef.current ? startTsRef.current + lastCreditedRef.current * 1000 : undefined,
      });
    }
    sessionEndedRef.current = true;
    addedMinsRef.current    = 0;
    lastCreditedRef.current = 0;
    localStorage.setItem('focus_addedMins', '0');
    setRunning(false);
    setElapsed(0);
    elapsedRef.current  = 0;
    lastTickRef.current = 0;
    localStorage.setItem('focus_elapsed',  '0');
    localStorage.setItem('focus_lastTick', '0');
    hideHardwareNotification();
  };

  const changeMode = (key) => {
    triggerHaptic(ImpactStyle.Light);
    setActiveMode(key);
    resetTimer();
    setShowModeSelector(false);
  };

  // Helper used by completion modal buttons to start the next session cleanly
  const startNextSession = (mode) => {
    addedMinsRef.current    = 0;
    lastCreditedRef.current = 0;
    localStorage.setItem('focus_addedMins', '0');
    setShowCompletePrompt(false);
    setActiveMode(mode);
    setElapsed(0);
    elapsedRef.current  = 0;
    lastTickRef.current = 0;
    localStorage.setItem('focus_elapsed',  '0');
    localStorage.setItem('focus_lastTick', '0');
    setRunning(true);
  };

  const skipBreak = () => {
    changeMode(activeMode === 'FOCUS' ? 'SHORT_BREAK' : 'FOCUS');
    triggerHaptic(ImpactStyle.Heavy);
  };

  // Hold-to-skip
  const startSkipPress = (e) => {
    e.preventDefault();
    if (running) { triggerHaptic(NotificationType.Warning, true); return; }
    let progress = 0;
    triggerHaptic(ImpactStyle.Light);
    skipTimerRef.current = setInterval(() => {
      progress += 10;
      setSkipProgress(progress);
      if (progress >= 100) {
        clearInterval(skipTimerRef.current);
        setSkipProgress(0);
        skipBreak();
      }
    }, 70);
  };
  const cancelSkipPress = () => {
    clearInterval(skipTimerRef.current);
    setSkipProgress(0);
  };

  // ── Task controls ─────────────────────────────────────────────────────────────
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setTasks([{
      id: Date.now(), text: newTask.trim(), done: false,
      recurrence: 'daily', notifIds: [],   // default: daily recurring
    }, ...tasks]);
    setNewTask('');
    setIsAdding(false);
    triggerHaptic(ImpactStyle.Light);
  };

  const toggleTask = (id) => {
    setTasks(tasks.map(t => {
      if (t.id !== id) return t;
      const next = !t.done;
      if (next) {
        triggerHaptic(NotificationType.Success, true);
        commitTaskCompleted();
      } else {
        triggerHaptic(ImpactStyle.Light);
        commitTaskUncompleted();
      }

      if (next && t.recurrence && t.notifIds?.length > 0) {
        // ── Early completion of recurring task ──
        // Cancel TODAY's pending alarm, preserve reminder data so it reschedules on rollover
        cancelTaskReminder(t.notifIds).catch(() => {});
        return { ...t, done: true, notifIds: [] }; // reminder stays intact
      }
      if (next && !t.recurrence && t.notifIds?.length > 0) {
        // ── One-time task completed ── cancel permanently
        cancelTaskReminder(t.notifIds).catch(() => {});
        return { ...t, done: true, notifIds: [], reminder: null };
      }
      if (!next && t.reminder && (!t.notifIds || t.notifIds.length === 0)) {
        // ── Task unchecked (restored to undone) ──
        // Reschedule reminder so alert is restored for today
        scheduleTaskReminder(t).then(ids => {
          if (ids && ids.length > 0) {
            setTasks(prev => prev.map(t2 => t2.id === id ? { ...t2, notifIds: ids } : t2));
          }
        }).catch(() => {});
      }
      return { ...t, done: next };
    }));
  };

  // Action A / C: toggle repeat (recurrence) on a task
  const toggleRecurrence = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.recurrence) {
      // Turning OFF — Action C: intercept if reminder is active
      if (task.reminder) {
        triggerHaptic(ImpactStyle.Medium);
        setRepeatOffConfirm(id);
        return;
      }
      // No reminder → silently turn off
      triggerHaptic(ImpactStyle.Medium);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, recurrence: null } : t));
    } else {
      // Turning ON — Action A: set recurrence daily, no reminder change
      triggerHaptic(ImpactStyle.Medium);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, recurrence: 'daily' } : t));
    }
  };

  // Confirmed from Action C dialog: turn off repeat AND cancel reminders
  const confirmRepeatOff = async () => {
    const id   = repeatOffConfirm;
    const task = tasks.find(t => t.id === id);
    if (task?.notifIds?.length > 0) {
      await cancelTaskReminder(task.notifIds).catch(() => {});
    }
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, recurrence: null, reminder: null, notifIds: [] } : t
    ));
    setRepeatOffConfirm(null);
  };

  const deleteTask = (id) => {
    triggerHaptic(ImpactStyle.Medium);
    const task = tasks.find(t => t.id === id);
    if (task?.notifIds?.length > 0) cancelTaskReminder(task.notifIds).catch(() => {});
    setTasks(tasks.filter(t => t.id !== id));
  };
  const clearCompleted = () => {
    triggerHaptic(ImpactStyle.Heavy);
    // Cancel reminders for done non-recurring tasks (they're being permanently deleted)
    tasks
      .filter(t => t.done && !t.recurrence && t.notifIds?.length > 0)
      .forEach(t => cancelTaskReminder(t.notifIds).catch(() => {}));

    // Permanently delete done non-recurring tasks.
    // Done recurring tasks remain completed for today with progress preserved.
    setTasks(prev => prev.filter(t => !(t.done && !t.recurrence)));
  };

  // ── Reminder save / remove ─────────────────────────────────────────────────────
  const handleReminderSave = async (reminderData) => {
    const task = reminderModalTask;
    if (!task) return;
    triggerHaptic(ImpactStyle.Light);

    // Cancel any existing reminder IDs first
    if (task.notifIds?.length > 0) await cancelTaskReminder(task.notifIds).catch(() => {});

    // ── Action B: auto-sync recurrence to encompass alert days ──
    let newRecurrence = task.recurrence;
    const alertDays   = Array.isArray(reminderData.days) ? reminderData.days : [];
    if (alertDays.length > 0) {
      if (!newRecurrence) {
        // No recurrence → set it to the alert days
        newRecurrence = alertDays;
      } else if (newRecurrence !== 'daily') {
        // Merge: recurrence must be superset of alert days
        const existing = Array.isArray(newRecurrence) ? newRecurrence : [];
        const merged   = [...new Set([...existing, ...alertDays])];
        newRecurrence  = merged;
      }
      // If already 'daily', daily is always a superset — leave it
    }

    const updatedTask = { ...task, recurrence: newRecurrence, reminder: reminderData };
    const notifIds    = await scheduleTaskReminder(updatedTask).catch(() => []);

    setTasks(prev => prev.map(t =>
      t.id === task.id
        ? { ...t, recurrence: newRecurrence, reminder: reminderData, notifIds: notifIds || [] }
        : t
    ));
    setReminderModalTask(null);
  };

  const handleReminderRemove = async () => {
    const task = reminderModalTask;
    if (!task) return;
    triggerHaptic(ImpactStyle.Medium);
    if (task.notifIds?.length > 0) await cancelTaskReminder(task.notifIds).catch(() => {});
    setTasks(prev => prev.map(t => {
      if (t.id !== task.id) return t;
      return {
        ...t,
        reminder: null,
        notifIds: [],
        // Specific-day arrays are set exclusively via Action B (reminder day auto-sync).
        // Removing the reminder means those days are orphaned — reset to 'daily'.
        // A plain 'daily' recurrence (set via the Repeat toggle) is unaffected.
        recurrence: Array.isArray(t.recurrence) ? 'daily' : t.recurrence,
      };
    }));
    setReminderModalTask(null);
  };


  const sortedTasks           = [...tasks].sort((a, b) => (a.done === b.done) ? 0 : a.done ? 1 : -1);
  const completedCount        = tasks.filter(t => t.done).length;
  const completedOneTimeCount = tasks.filter(t => t.done && !t.recurrence).length;
  const totalCount            = tasks.length;
  const progressPct           = totalCount === 0 ? 0 : (completedCount / totalCount) * 100;

  // ── Ring calculations ─────────────────────────────────────────────────────────
  // BUG FIX: Use durationSecs (which includes addedMins) so ring never goes negative.
  // When addMinute extends duration, the ring correctly shows the remaining portion.
  const safeDuration    = isStopwatch || durationSecs === Infinity ? 1 : durationSecs;
  const timerPct        = isStopwatch ? 100 : Math.min(Math.max((elapsed / safeDuration) * 100, 0), 100);
  const ringR           = 140;
  const ringCirc        = 2 * Math.PI * ringR;
  // For countdown display: filled portion = remaining time. strokeDashoffset controls fill.
  // remaining fraction = (durationSecs - elapsed) / durationSecs = 1 - timerPct/100
  const strokeDashoffset = isStopwatch ? 0 : ringCirc * (1 - timerPct / 100);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full relative bg-background">

      {/* ── Settings Modal ─────────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-xl animate-fade-in flex flex-col">
          <div className="px-6 pt-16 pb-5 flex items-center justify-between border-b border-white/10">
            <h2 className="text-2xl font-bold text-white tracking-tight">Settings</h2>
            <button onClick={() => setShowSettings(false)} className="p-2 bg-surfaceHighlight rounded-full text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-7 pb-24">

            {/* Stats Card */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic(ImpactStyle.Light);
                setShowStatsModal(true);
              }}
              className="w-full text-left bg-surface/60 hover:bg-surface/80 active:scale-[0.98] transition-all rounded-3xl p-5 border border-white/10 hover:border-primary/40 relative overflow-hidden group shadow-lg"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 blur-3xl rounded-full group-hover:bg-primary/30 transition-all" />
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                  <BarChart2 className="text-primary" size={18} />
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
                    Today's Moments
                  </h3>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-primary/80 group-hover:text-primary transition-colors">
                  <span>Details</span>
                  <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
              <p className="text-4xl font-mono font-bold text-white tracking-tighter mt-1">
                {formatStatsTime(localStats.todaySeconds)}
              </p>
              <p className="text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors mt-1">
                Accumulated across all sessions today · Tap for full analytics
              </p>
            </button>

            {/* ── Timer Durations ─────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 mb-3">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Session Lengths</h3>
                {running && <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">Locked while running</span>}
              </div>
              <div className={`rounded-3xl overflow-hidden border border-white/5 divide-y divide-white/5 transition-opacity ${running ? 'opacity-40 pointer-events-none' : ''}`}>
                {Object.keys(MODES).map((key) => (
                  <DurationRow
                    key={key}
                    label={MODES[key].label}
                    value={settings[key]}
                    disabled={running}
                    hapticsEnabled={settings.hapticsEnabled}
                    onChange={(val) => {
                      setSettings({ ...settings, [key]: val });
                      if (activeMode === key) resetTimer();
                    }}
                  />
                ))}
              </div>
            </div>

            {/* ── End-of-Session Alert ────────────────────────────────────── */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">When Session Ends</h3>
              <div className={`rounded-3xl overflow-hidden border border-white/5 divide-y divide-white/5 transition-opacity ${running ? 'opacity-40 pointer-events-none' : ''}`}>
                <AlertRow
                  label="Focus"
                  sublabel="End of every focus block"
                  value={settings.focusAlert}
                  hapticsEnabled={settings.hapticsEnabled}
                  onChange={(v) => setSettings({ ...settings, focusAlert: v })}
                />
                <AlertRow
                  label="Break"
                  sublabel="End of every break"
                  value={settings.breakAlert}
                  hapticsEnabled={settings.hapticsEnabled}
                  onChange={(v) => setSettings({ ...settings, breakAlert: v })}
                />
              </div>
            </div>

            {/* ── Behaviour ───────────────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">Behaviour</h3>

              {/* Count-Up Mode */}
              <div className={`bg-surfaceHighlight rounded-3xl p-4 border border-white/5 flex items-center justify-between transition-opacity ${running ? 'opacity-40 pointer-events-none' : ''}`}>
                <div>
                  <span className="font-medium text-white block">Count-Up Mode</span>
                  <span className="text-xs text-gray-400 block mt-0.5">Timer runs as an infinite stopwatch</span>
                </div>
                <button
                  onClick={() => {
                    if (running) return;
                    triggerHaptic(ImpactStyle.Medium);
                    setSettings({ ...settings, isStopwatch: !settings.isStopwatch });
                    resetTimer();
                  }}
                  className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${settings.isStopwatch ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${settings.isStopwatch ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Haptic Feedback */}
              <div className="bg-surfaceHighlight rounded-3xl p-4 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-medium text-white block">Haptic Feedback</span>
                  <span className="text-xs text-gray-400 block mt-0.5">Tactile response on button taps and completions</span>
                </div>
                <button
                  onClick={() => {
                    const next = settings.hapticsEnabled === false;
                    if (next) {
                      try { Haptics.impact({ style: ImpactStyle.Light }); } catch (_) {}
                    }
                    setSettings({ ...settings, hapticsEnabled: next });
                  }}
                  className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${settings.hapticsEnabled !== false ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${settings.hapticsEnabled !== false ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Dynamic Island / Live Activity — only shown on Android 16+ */}
              {supportsLiveUpdates && (
                <div
                  className={`rounded-3xl p-4 border flex items-center justify-between transition-all duration-500 ${
                    settings.dynamicIslandEnabled !== false
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-surfaceHighlight border-white/5'
                  }`}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <span className="font-semibold text-white block mb-0.5">Dynamic Island</span>
                    <span className="text-xs text-gray-400 leading-snug block">
                      {settings.dynamicIslandEnabled !== false
                        ? 'Live Capsule Active'
                        : 'Promote to live capsule when supported'}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      triggerHaptic(ImpactStyle.Medium);
                      const next = settings.dynamicIslandEnabled === false;
                      setSettings({ ...settings, dynamicIslandEnabled: next });
                      if (running && startTsRef.current) {
                        // Pass `next` directly — setSettings is async so
                        // settings.dynamicIslandEnabled is still the old value here
                        syncHardwareNotification(startTsRef.current, isPartnerStudying, true, next);
                      }
                    }}
                    className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${
                      settings.dynamicIslandEnabled !== false ? 'bg-primary' : 'bg-gray-700'
                    }`}
                    aria-label={`Dynamic Island ${settings.dynamicIslandEnabled !== false ? 'enabled' : 'disabled'}`}
                  >
                    <div
                      className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${
                        settings.dynamicIslandEnabled !== false ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* ── Task Reminders ───────────────────────────────────────────── */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest px-1 mb-3">Task Reminders</h3>

              {/* Daily Reminder Toggle */}
              <div className="bg-surfaceHighlight rounded-3xl p-4 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="font-medium text-white block">Daily Check-In</span>
                  <span className="text-xs text-gray-400 block mt-0.5">Remind when tasks are incomplete at day's end</span>
                </div>
                <button
                  onClick={() => {
                    triggerHaptic(ImpactStyle.Medium);
                    const next = !settings.dailyRemindersEnabled;
                    setSettings({ ...settings, dailyRemindersEnabled: next });
                    if (!next) {
                      cancelDailyMotivational().catch(() => {});
                    } else {
                      const times = Array.isArray(settings.dailyReminderTimes) ? settings.dailyReminderTimes : ['20:00', '23:00'];
                      try {
                        const rawTasks = localStorage.getItem('study_buddy_tasks');
                        const tasks = rawTasks ? JSON.parse(rawTasks) : [];
                        scheduleDailyMotivational(times, tasks).catch(() => {});
                      } catch {}
                    }
                  }}
                  className={`w-14 h-8 rounded-full p-1 transition-colors duration-300 relative flex-shrink-0 ${settings.dailyRemindersEnabled ? 'bg-primary' : 'bg-gray-700'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 ${settings.dailyRemindersEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Time Pickers — only shown when daily reminders are enabled */}
              {settings.dailyRemindersEnabled && (
                <div className="bg-surfaceHighlight rounded-3xl border border-white/5 overflow-hidden divide-y divide-white/5 animate-fade-in">
                  {(Array.isArray(settings.dailyReminderTimes) ? settings.dailyReminderTimes : ['20:00', '23:00']).map((timeVal, idx) => (
                    <div key={idx} className="px-5 py-4 flex items-center justify-between">
                      <span className="font-medium text-white text-sm">
                        {idx === 0 ? 'First reminder' : 'Second reminder'}
                      </span>
                      <div className="relative">
                        <input
                          type="time"
                          value={timeVal}
                          onChange={(e) => {
                            const newTimes = [...(Array.isArray(settings.dailyReminderTimes) ? settings.dailyReminderTimes : ['20:00', '23:00'])];
                            newTimes[idx] = e.target.value;
                            setSettings({ ...settings, dailyReminderTimes: newTimes });
                            // Reschedule with new times
                            try {
                              const rawTasks = localStorage.getItem('study_buddy_tasks');
                              const tasks = rawTasks ? JSON.parse(rawTasks) : [];
                              scheduleDailyMotivational(newTimes, tasks).catch(() => {});
                            } catch {}
                          }}
                          className="bg-background text-white font-mono font-bold rounded-xl pl-3 py-1.5 pr-8 border border-white/10 outline-none focus:border-primary transition-colors text-sm appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                          style={{ colorScheme: 'dark' }}
                        />
                        <ChevronDown
                          size={14}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Timer Area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-between p-4 pt-10 sm:pt-14 relative z-10 pb-4 max-w-md mx-auto w-full">

        {/* Top Header */}
        <div className="w-full flex items-center justify-between px-3 mb-1">
          {/* Partner Live Dot */}
          <div
            className="p-3 bg-surfaceHighlight/80 border border-white/10 rounded-full shadow-lg flex items-center justify-center transition-all duration-500"
            title={isPartnerStudying ? 'Partner is focusing' : 'Partner is away'}
          >
            <span className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
              isPartnerStudying ? 'bg-accent shadow-glow shadow-accent animate-pulse' : 'bg-gray-600'
            }`} />
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-3 bg-surfaceHighlight/80 border border-white/10 rounded-full shadow-lg hover:bg-white/10 text-white transition-colors"
          >
            <Settings2 size={20} />
          </button>
        </div>

        {/* ── Timer Ring ───────────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center w-72 h-72 sm:w-80 sm:h-80 my-auto">
          {/* Ambient glow behind ring */}
          <div className={`absolute inset-0 rounded-full blur-3xl transition-all duration-1000 ${
            running
              ? (color === 'accent' ? 'bg-accent/30 scale-110' : color === 'blue-500' ? 'bg-blue-500/30 scale-110' : 'bg-primary/30 scale-110')
              : (color === 'accent' ? 'bg-accent/10'            : color === 'blue-500' ? 'bg-blue-500/10'            : 'bg-primary/10')
          }`} />

          <svg className="absolute inset-0 w-full h-full -rotate-90 transform drop-shadow-2xl" viewBox="0 0 320 320">
            {/* Track */}
            <circle cx="160" cy="160" r={ringR} className="stroke-surfaceHighlight/40 fill-none" strokeWidth="4" />
            {/* Progress arc — inline style transition only on stroke-dashoffset for smooth, jitter-free animation */}
            <circle
              cx="160" cy="160" r={ringR}
              className={`fill-none ${
                color === 'accent' ? 'stroke-accent' : color === 'blue-500' ? 'stroke-blue-500' : 'stroke-primary'
              }`}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={ringCirc}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.85s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>

          {/* Center content */}
          <div
            className="flex flex-col items-center z-10 select-none"
            onClick={() => !running && setShowModeSelector(!showModeSelector)}
          >
            {/* Timer digits */}
            <span className={`font-mono font-bold tracking-tighter text-white drop-shadow-xl cursor-pointer hover:scale-105 transition-transform ${
              isStopwatch || elapsed >= 3600 ? 'text-5xl' : 'text-6xl'
            }`}>
              {formatTime(elapsed)}
            </span>

            {/* Today focus time — Phase 3: surface below mode label */}
            {localStats.todaySeconds >= 300 && !running && (
              <p className="text-[11px] text-gray-500 font-semibold mt-1 tracking-wide animate-fade-in">
                {formatStatsTime(localStats.todaySeconds)} today
              </p>
            )}

            {/* Mode pill */}
            <div className={`flex items-center gap-1.5 mt-2 px-4 py-1 rounded-full cursor-pointer hover:opacity-80 transition-all shadow-glow ${
              color === 'accent'   ? 'text-accent   bg-accent/10   shadow-accent/20'   :
              color === 'blue-500' ? 'text-blue-500 bg-blue-500/10 shadow-blue-500/20' :
                                     'text-primary  bg-primary/10  shadow-primary/20'
            }`}>
              <span className="text-xs font-bold tracking-[0.25em] uppercase">
                {isStopwatch ? 'Stopwatch' : MODES[activeMode].label}
                {addedMinsRef.current > 0 && !isStopwatch && (
                  <span className="ml-1.5 opacity-60">+{addedMinsRef.current}m</span>
                )}
              </span>
              {!running && !isStopwatch && <ChevronRight size={14} />}
            </div>
          </div>
        </div>

        {/* ── Controls Row ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-8 mt-3 mb-2 z-10 relative">
          {/* Reset */}
          <button
            onClick={() => { if (elapsed > 0 || running) setShowResetConfirm(true); }}
            className="p-4 text-gray-500 hover:text-white transition-colors bg-surfaceHighlight/50 hover:bg-surfaceHighlight rounded-full shadow-lg"
          >
            <RotateCcw size={24} />
          </button>

          {/* Play / Pause */}
          <button
            onClick={toggleTimer}
            className={`p-6 rounded-full shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all duration-300 transform hover:scale-105 ${
              running
                ? 'bg-surfaceHighlight text-primary shadow-primary/20 border border-white/10'
                : (color === 'accent'   ? 'bg-accent   text-black shadow-glow shadow-accent/40'   :
                   color === 'blue-500' ? 'bg-blue-500 text-white shadow-glow shadow-blue-500/40' :
                                          'bg-primary  text-black shadow-glow shadow-primary/40')
            } relative`}
          >
            {running ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1.5" />}
          </button>

          {/* Skip (hold) */}
          {!isStopwatch ? (
            <button
              onTouchStart={startSkipPress}
              onTouchEnd={cancelSkipPress}
              onMouseDown={startSkipPress}
              onMouseUp={cancelSkipPress}
              onMouseLeave={cancelSkipPress}
              className={`p-4 text-gray-500 transition-colors rounded-full shadow-lg animate-fade-in group relative select-none ${
                running ? 'opacity-30 cursor-not-allowed bg-surfaceHighlight/30' : 'hover:text-white bg-surfaceHighlight/50 hover:bg-surfaceHighlight'
              }`}
            >
              {skipProgress > 0 && !running && (
                <svg className="absolute top-0 left-0 w-full h-full -rotate-90 scale-125 pointer-events-none" viewBox="0 0 56 56">
                  <circle cx="28" cy="28" r="26" className="stroke-primary fill-none transition-all duration-75"
                    strokeWidth="3" strokeDasharray="163" strokeDashoffset={163 - (skipProgress / 100) * 163} />
                </svg>
              )}
              <FastForward size={24} className={skipProgress > 0 && !running ? 'text-primary' : (running ? '' : 'group-hover:text-primary transition-colors')} />
            </button>
          ) : (
            <div className="w-[56px] h-[56px]" />
          )}

          {/* Mode selector popup */}
          {showModeSelector && !running && !isStopwatch && (
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 glass-panel p-1.5 rounded-full flex items-center space-x-2 z-30 shadow-2xl border border-white/10 w-max bg-surfaceHighlight/95 backdrop-blur-xl">
              {Object.keys(MODES).map((key) => {
                const isActive = activeMode === key;
                const activeClasses =
                  MODES[key].color === 'accent'   ? 'bg-accent/20   text-accent   border border-accent/30   shadow-glow shadow-accent/20'   :
                  MODES[key].color === 'blue-500'  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-glow shadow-blue-500/20' :
                                                     'bg-primary/20  text-primary  border border-primary/30  shadow-glow shadow-primary/20';
                return (
                  <button
                    key={key}
                    onClick={() => changeMode(key)}
                    className={`text-[11px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap ${
                      isActive ? activeClasses : 'text-gray-400 hover:text-gray-200 border border-transparent'
                    }`}
                  >
                    {MODES[key].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Session Complete Modal ──────────────────────────────────────────────── */}
      {showCompletePrompt && (
        <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-surfaceHighlight border border-white/10 p-7 rounded-[2rem] w-full max-w-sm shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className={`absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full blur-[50px] pointer-events-none ${
              completedMode === 'FOCUS' ? 'bg-accent/30' : 'bg-primary/30'
            }`} />
            <div className={`w-20 h-20 rounded-3xl border-2 flex items-center justify-center mb-5 relative z-10 shadow-glow ${
              completedMode === 'FOCUS' ? 'border-accent/40 bg-accent/10 shadow-accent/30' : 'border-primary/40 bg-primary/10 shadow-primary/30'
            }`}>
              <span className="text-4xl filter drop-shadow-md">
                {completedMode === 'FOCUS' ? '\u{1F389}' : '\u26A1'}
              </span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2 tracking-tight relative z-10">
              {completedMode === 'FOCUS' ? 'Session Complete!' : 'Break Finished!'}
            </h3>
            <p className="text-gray-400 text-sm mb-7 leading-relaxed relative z-10">
              {completedMode === 'FOCUS'
                ? `You crushed ${settings.FOCUS + addedMinsRef.current} minutes of deep focus. Ready to recharge?`
                : `Break over. Let's get back to it.`}
            </p>

            <div className="w-full space-y-3 relative z-10">
              {completedMode === 'FOCUS' ? (
                <>
                  <button
                    onClick={() => { startNextSession('SHORT_BREAK'); triggerHaptic(ImpactStyle.Heavy); }}
                    className="w-full py-4 bg-accent hover:opacity-90 text-black font-bold rounded-2xl shadow-glow shadow-accent/30 transition-all active:scale-98 flex items-center justify-center space-x-2 text-base"
                  >
                    <span>Start Break ({settings.SHORT_BREAK}m)</span>
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => { startNextSession('LONG_BREAK'); triggerHaptic(ImpactStyle.Medium); }}
                      className="flex-1 py-3 bg-surface/70 hover:bg-surface border border-white/10 text-gray-300 font-semibold rounded-xl text-xs transition-colors"
                    >
                      Long Break ({settings.LONG_BREAK}m)
                    </button>
                    <button
                      onClick={() => { startNextSession('FOCUS'); triggerHaptic(ImpactStyle.Medium); }}
                      className="flex-1 py-3 bg-surface/70 hover:bg-surface border border-white/10 text-gray-300 font-semibold rounded-xl text-xs transition-colors"
                    >
                      Moment Again ({settings.FOCUS}m)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { startNextSession('FOCUS'); triggerHaptic(ImpactStyle.Heavy); }}
                    className="w-full py-4 bg-primary hover:opacity-90 text-black font-bold rounded-2xl shadow-glow shadow-primary/30 transition-all active:scale-98 flex items-center justify-center space-x-2 text-base"
                  >
                    <span>Start Moment ({settings.FOCUS}m)</span>
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                  <button
                    onClick={() => { startNextSession(activeMode); triggerHaptic(ImpactStyle.Medium); }}
                    className="w-full py-3 bg-surface/70 hover:bg-surface border border-white/10 text-gray-300 font-semibold rounded-xl text-xs transition-colors"
                  >
                    Extend Break (+{settings[activeMode]}m)
                  </button>
                </>
              )}
              <button
                onClick={() => { setShowCompletePrompt(false); resetTimer(); triggerHaptic(ImpactStyle.Light); }}
                className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-xs font-semibold tracking-wider uppercase transition-colors"
              >
                Done for Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Confirm Modal ─────────────────────────────────────────────────── */}
      {showResetConfirm && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-surfaceHighlight border border-white/10 p-8 rounded-[2rem] w-full max-w-sm shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5">
              <RotateCcw size={32} className="text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">Reset Timer?</h3>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              You will lose your current timer progress.<br />
              <span className="text-gray-300 font-medium">Your accumulated focus time for today is safely stored.</span>
            </p>
            <div className="flex w-full gap-4">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-4 rounded-2xl bg-surface text-white font-bold hover:bg-surface/80 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { resetTimer(); setShowResetConfirm(false); triggerHaptic(ImpactStyle.Heavy); }}
                className="flex-1 py-4 rounded-2xl bg-red-500/20 text-red-400 font-bold hover:bg-red-500/30 transition-colors border border-red-500/20"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tasks Panel ─────────────────────────────────────────────────────── */}
      <div className="h-[44%] bg-surface/40 backdrop-blur-3xl rounded-t-[36px] px-4 pt-3 overflow-y-auto no-scrollbar relative pb-24 z-20 shadow-[0_-8px_40px_rgba(0,0,0,0.4)] border-t border-white/5">
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-4" />

        {/* Task Header */}
        <div className="mb-3 px-1">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[17px] font-bold tracking-tight text-white">Tasks</h2>
              {totalCount > 0 && (
                <span className="text-[11px] text-gray-500 font-medium">
                  {completedCount}/{totalCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {completedOneTimeCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="h-8 w-8 rounded-full bg-white/5 text-gray-500 hover:text-white transition-colors flex items-center justify-center"
                  title="Clear completed one-time tasks"
                >
                  <CheckCircle2 size={15} />
                </button>
              )}
              <button
                onClick={() => setIsAdding(!isAdding)}
                className={`h-8 w-8 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                  isAdding ? 'bg-white/10 text-gray-300' : 'bg-primary text-black shadow-glow shadow-primary/30'
                }`}
                title="Add task"
              >
                <Plus size={16} strokeWidth={3} />
              </button>
            </div>
          </div>

          {totalCount > 0 && (
            <div className="w-full h-[2px] bg-white/5 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-primary/70 transition-all duration-700 ease-out rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        {/* Add Task Input */}
        {isAdding && (
          <form onSubmit={handleAddTask} className="mb-2.5 animate-fade-in">
            <input
              type="text"
              autoFocus
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="What needs to get done?"
              className="w-full bg-white/5 text-white placeholder-gray-600 rounded-xl px-4 py-3 text-[15px] outline-none focus:ring-1 focus:ring-primary/40 transition-all border border-white/10"
            />
          </form>
        )}

        {/* Task List */}
        <div className="space-y-1.5">
          {sortedTasks.length === 0 && !isAdding && (
            <div className="flex flex-col items-center gap-2 mt-10 opacity-30">
              <div className="w-8 h-8 rounded-full border border-dashed border-gray-500 flex items-center justify-center">
                <Plus className="text-gray-500" size={14} />
              </div>
              <p className="text-gray-400 text-[11px] font-medium tracking-widest uppercase">No tasks</p>
            </div>
          )}

          {sortedTasks.map((task) => {
            // Meta line: shows recurrence label + reminder time.
            // 'Daily' appears when recurring, disappears when repeat is off.
            // Reminder time appended when bell is active → text reacts to both icons.
            const metaDays = !task.done && task.recurrence
              ? (task.recurrence === 'daily'
                  ? 'Daily'
                  : Array.isArray(task.recurrence)
                    ? task.recurrence.join(' · ')
                    : null)
              : null;
            const metaTime = task.reminder && !task.done ? task.reminder.time : null;
            const hasMeta  = metaDays || metaTime;

            return (
              <div
                key={task.id}
                className={`flex gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 ${
                  hasMeta ? 'items-start' : 'items-center'
                } ${
                  task.done
                    ? 'opacity-40 border-transparent bg-transparent'
                    : 'bg-surfaceHighlight border-white/5 hover:border-white/10'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                    hasMeta ? 'mt-[2px]' : ''
                  } ${
                    task.done
                      ? 'w-[22px] h-[22px] rounded-full bg-accent'
                      : 'w-[22px] h-[22px] rounded-full ring-1 ring-gray-500 hover:ring-primary'
                  }`}
                >
                  {task.done && (
                    <svg className="w-[11px] h-[11px] text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>

                {/* Text + optional meta line */}
                <div className="flex-1 min-w-0">
                  <span className={`block text-[15px] font-medium leading-snug ${
                    task.done ? 'text-gray-600 line-through' : 'text-gray-100'
                  }`}>
                    {task.text}
                  </span>
                  {hasMeta && (
                    <span className="block text-[11px] text-gray-500 mt-1 leading-none">
                      {[metaDays, metaTime].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>

                {/* Right actions */}
                <div className={`flex items-center gap-0.5 flex-shrink-0 ${hasMeta ? 'mt-[2px]' : ''}`}>
                  <button
                    onClick={() => toggleRecurrence(task.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      task.recurrence ? 'text-primary' : 'text-gray-700 hover:text-gray-400'
                    }`}
                    title={task.recurrence ? 'Recurring · tap to turn off' : 'Make recurring'}
                  >
                    <Repeat size={15} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => { triggerHaptic(ImpactStyle.Light); setReminderModalTask(task); }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      task.reminder ? 'text-primary' : 'text-gray-700 hover:text-gray-400'
                    }`}
                    title={task.reminder ? 'Edit reminder' : 'Add reminder'}
                  >
                    <Bell size={15} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-1.5 rounded-lg text-gray-700 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Task Reminder Modal ─────────────────────────────────────────────────── */}
      {reminderModalTask && (
        <TaskReminderModal
          task={reminderModalTask}
          triggerHaptic={triggerHaptic}
          onSave={handleReminderSave}
          onRemove={handleReminderRemove}
          onClose={() => setReminderModalTask(null)}
        />
      )}

      {/* ── Repeat-off Confirm Dialog (Action C) ─────────────────────────────── */}
      {repeatOffConfirm && (
        <div className="absolute inset-0 z-[70] bg-background/80 backdrop-blur-md flex items-center justify-center px-8 animate-fade-in">
          <div className="bg-surface rounded-3xl p-7 border border-white/10 shadow-2xl w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-2 text-center">Turn Off Repeat?</h3>
            <p className="text-gray-400 text-sm text-center leading-relaxed mb-7">
              Turning off repeat will also cancel your scheduled reminders. Continue?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { triggerHaptic(ImpactStyle.Light); setRepeatOffConfirm(null); }}
                className="flex-1 py-3.5 rounded-2xl bg-surfaceHighlight text-gray-300 font-semibold border border-white/5 hover:bg-white/5 transition-colors"
              >
                Keep It
              </button>
              <button
                onClick={() => { triggerHaptic(ImpactStyle.Medium); confirmRepeatOff(); }}
                className="flex-1 py-3.5 rounded-2xl bg-red-500/20 text-red-400 font-bold border border-red-500/20 hover:bg-red-500/30 transition-colors"
              >
                Turn Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Statistics & Insights Page Modal ─────────────────────────────────── */}
      {showStatsModal && (
        <StatsModal
          onClose={() => setShowStatsModal(false)}
          triggerHaptic={triggerHaptic}
          liveTodaySeconds={localStats.todaySeconds}
        />
      )}
    </div>
  );
}
