import { useState, useEffect } from 'react';
import { Timer, Radio } from 'lucide-react';
import { ref, onValue } from 'firebase/database';
import { db } from './firebase';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { registerPlugin } from '@capacitor/core';
import FocusTab from './components/FocusTab';
import LiveSyncTab from './components/LiveSyncTab';
import {
  registerNotifActionTypes,
  scheduleDailyMotivational,
  syncDailyMotivationalOnOpen,
  remindAgainIn30,
  recordDailyMotivationalFire,
  DAILY_MOTIV_ID_1,
  DAILY_MOTIV_ID_2,
} from './utils/taskNotifications';

const TimerNotification = registerPlugin('TimerNotification');

function App() {
  const [activeTab, setActiveTab] = useState('focus'); // 'focus' | 'sync'
  const [partnerStats, setPartnerStats] = useState(null);

  useEffect(() => {
    // Persistent listener across the entire app lifecycle
    // For commercial app: use room-based stats instead of hardcoded 'rahul'
    const roomId = localStorage.getItem('study_buddy_room') || 'default_room';
    const statsRef = ref(db, `rooms/${roomId}/liveStats`);
    const unsubscribe = onValue(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        setPartnerStats(snapshot.val());
      }
    }, (err) => {
      console.error("Firebase sync error:", err);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Initialize OneSignal Push Notifications using the reliable v3 Cordova API
    const initPush = () => {
      try {
        if (typeof window !== 'undefined' && window.plugins && window.plugins.OneSignal) {
          // OneSignal v3 API
          window.plugins.OneSignal.setAppId("c4c07296-6962-40f8-b30d-3e471a8730c0");
          
          // For commercial app: use custom sync ID instead of hardcoded 'partner_phone'
          const syncId = localStorage.getItem('study_buddy_sync_id');
          if (syncId) {
            window.plugins.OneSignal.setExternalUserId(syncId);
          }
          
          window.plugins.OneSignal.promptForPushNotificationsWithUserResponse((accepted) => {
            console.log("User accepted notifications: " + accepted);
          });
        }
      } catch (err) {
        console.warn("OneSignal init error:", err);
      }
    };
    initPush();

    // ── Ensure Notification Channels Exist on Boot ───────────────────────────
    const ensureChannels = async () => {
      try {
        // ── Existing partner-signal channels (unchanged) ──
        await LocalNotifications.createChannel({
          id: 'nudge_channel_v2',
          name: 'Focus Reminders',
          description: 'Reminders to keep your focus sessions on track',
          importance: 4,
          visibility: 1,
          vibration: true,
          lights: true,
          sound: 'nudge_sound.wav'
        });
        await LocalNotifications.createChannel({
          id: 'checkin_channel_v2',
          name: 'Session Check-Ins',
          description: 'Mid-session check-ins from Moment',
          importance: 4,
          visibility: 1,
          vibration: false,
          lights: true,
          sound: 'checkin_sound.wav'
        });

        // ── New: task notification channel group ──────────────────────────────
        try {
          await LocalNotifications.createChannelGroup({
            id: 'task_notifications_group',
            name: 'Tasks & Reminders',
          });
        } catch (_) {}

        // ── New: standard task reminder (Notify modality) ─────────────────────
        await LocalNotifications.createChannel({
          id: 'task_reminder_channel_v1',
          name: 'Task Reminders',
          description: 'Scheduled reminders for your tasks',
          importance: 4,
          visibility: 1,
          vibration: true,
          lights: true,
        });

        // ── New: task alarm (Alarm modality) ──────────────────────────────────
        await LocalNotifications.createChannel({
          id: 'task_alarm_channel_v1',
          name: 'Task Alarms',
          description: 'Alarm-style alerts for time-sensitive tasks',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          sound: 'checkin_sound.wav',  // loud alert sound; MediaPlayer takes over when tapped
        });

        // ── New: daily motivational / completion check-in ─────────────────────
        await LocalNotifications.createChannel({
          id: 'daily_motivational_channel_v1',
          name: 'Daily Task Check-In',
          description: 'End-of-day reminders when tasks are still incomplete',
          importance: 3,
          visibility: 1,
          vibration: false,
          lights: false,
        });

        // ── Register custom action types (Remind Again for daily, etc.) ───────
        await registerNotifActionTypes();
      } catch (e) {
        console.warn('Channel creation warning:', e);
      }
    };
    ensureChannels();

    // ── Intercept incoming data pushes from sender app ──────────────────────
    const bindSenderListener = () => {
      try {
        if (typeof window !== 'undefined' && window.plugins && window.plugins.OneSignal) {
          window.plugins.OneSignal.setNotificationWillShowInForegroundHandler((event) => {
            try {
              const notif = event?.getNotification ? event.getNotification() : event;
              const data = notif?.additionalData || notif?.data;
              if (data && typeof window.handleMomentDataPush === 'function') {
                window.handleMomentDataPush(data);
              }
            } catch (e) {
              console.warn('Error handling foreground notification:', e);
            }
            // Complete event to allow or suppress OneSignal default view
            try { event.complete(null); } catch (_) {}
          });

          window.plugins.OneSignal.setNotificationOpenedHandler((openedEvent) => {
            try {
              const notif = openedEvent?.notification;
              const data = notif?.additionalData || notif?.data;
              if (data && data.type === 'emergency_ring') {
                try { TimerNotification.stopAlarm(); } catch (_) {}
              }
              LocalNotifications.cancel({ notifications: [{ id: 7001 }, { id: 7002 }] });
            } catch (_) {}
          });
        }

        if (typeof window !== 'undefined') {
          window.handleMomentDataPush = (data) => {
            if (!data || !data.type) return;
            if (data.type === 'nudge') {
              LocalNotifications.schedule({
                notifications: [{
                  id: 7001,
                  title: '⏱ Focus Reminder',
                  body: data.body || 'Time to focus!',
                  channelId: 'nudge_channel_v2',
                  ongoing: true,
                  autoCancel: false,
                }]
              }).catch((e) => console.error("Error scheduling nudge:", e));
            } else if (data.type === 'checkin') {
              LocalNotifications.schedule({
                notifications: [{
                  id: 7002,
                  title: '💜 Moment',
                  body: data.body || 'How is your session going?',
                  channelId: 'checkin_channel_v2',
                  ongoing: true,
                  autoCancel: false,
                }]
              }).catch((e) => console.error("Error scheduling checkin:", e));
            } else if (data.type === 'emergency_ring') {
              try {
                TimerNotification.playAlarm({ title: '🎉 Moment Complete!', body: 'Session done — great work!' });
              } catch (e) {
                console.error("Error playing alarm:", e);
              }
            }
          };
        }
      } catch (err) {
        console.warn('Sender listener setup failed:', err);
      }
    };
    bindSenderListener();

    // ── Task Notification Listeners ──────────────────────────────────────────
    // Handles task alarms when app is in foreground and "Remind Again" actions.
    let taskNotifHandle = null;
    let taskActionHandle = null;

    const bindTaskNotifListeners = async () => {
      try {
        // Fires when a local notification arrives while the app is in the foreground
        taskNotifHandle = await LocalNotifications.addListener(
          'localNotificationReceived',
          (notification) => {
            try {
              const extra = notification?.extra;
              if (extra?.type === 'daily_motivational') {
                recordDailyMotivationalFire();
              }
              if (extra?.type === 'task_reminder' && extra?.modality === 'alarm') {
                // Task alarm arrived in foreground → play the native alarm
                try {
                  TimerNotification.playAlarm({
                    title: '⏰ Task Alarm',
                    body: notification.body || 'Your task reminder is due!',
                  });
                } catch (e) {
                  console.warn('[taskNotif] playAlarm foreground failed:', e);
                }
              }
            } catch (_) {}
          }
        );

        // Fires when the user taps a notification or its action button
        taskActionHandle = await LocalNotifications.addListener(
          'localNotificationActionPerformed',
          (result) => {
            try {
              const extra = result?.notification?.extra;
              const action = result?.actionId;

              // ── "Remind Again" on daily motivational ──
              if (extra?.type === 'daily_motivational') {
                recordDailyMotivationalFire();
                if (action === 'remind_again') {
                  try {
                    const rawTasks = localStorage.getItem('study_buddy_tasks');
                    const tasks = rawTasks ? JSON.parse(rawTasks) : [];
                    const incompleteCount = tasks.filter(t => !t.done).length;
                    const slotId = extra.slotId || DAILY_MOTIV_ID_1;
                    remindAgainIn30(slotId, incompleteCount).catch(() => {});
                  } catch (_) {}
                }
              }

              // ── Task alarm notification tapped (background → foreground) ──
              if (extra?.type === 'task_reminder' && extra?.modality === 'alarm') {
                try {
                  TimerNotification.playAlarm({
                    title: '⏰ Task Alarm',
                    body: result?.notification?.body || 'Your task reminder is due!',
                  });
                } catch (e) {
                  console.warn('[taskNotif] playAlarm on tap failed:', e);
                }
              }
            } catch (_) {}
          }
        );
      } catch (e) {
        console.warn('[taskNotif] Failed to bind task notif listeners:', e);
      }
    };
    bindTaskNotifListeners();

    // ── Daily Motivational — Boot Scheduler ─────────────────────────────────
    // On every app open: cancel daily motivationals if all tasks are done,
    // then (re)schedule for today if enabled.
    const bootDailyMotivational = () => {
      try {
        const rawTasks = localStorage.getItem('study_buddy_tasks');
        const tasks = rawTasks ? JSON.parse(rawTasks) : [];
        const rawSettings = localStorage.getItem('focusSettings');
        const settings = rawSettings ? JSON.parse(rawSettings) : {};
        const enabled = settings.dailyRemindersEnabled !== false; // default true
        const times = Array.isArray(settings.dailyReminderTimes)
          ? settings.dailyReminderTimes
          : ['20:00', '23:00'];

        syncDailyMotivationalOnOpen(tasks).catch(() => {});
        if (enabled) {
          scheduleDailyMotivational(times, tasks).catch(() => {});
        }
      } catch (e) {
        console.warn('[taskNotif] bootDailyMotivational error:', e);
      }
    };
    bootDailyMotivational();

    // Cleanup task notification listeners on unmount
    return () => {
      if (taskNotifHandle && typeof taskNotifHandle.remove === 'function') {
        taskNotifHandle.remove();
      }
      if (taskActionHandle && typeof taskActionHandle.remove === 'function') {
        taskActionHandle.remove();
      }
    };
  }, []);

  const triggerNavHaptic = () => {
    try {
      const raw = localStorage.getItem('focusSettings');
      const settings = raw ? JSON.parse(raw) : null;
      if (settings && settings.hapticsEnabled === false) return;
      Haptics.impact({ style: ImpactStyle.Light });
    } catch (_) {}
  };

  const isPartnerStudying = !!partnerStats?.timerRunning;

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden relative selection:bg-primary/30">
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`h-full w-full ${activeTab === 'focus' ? 'block animate-tab-in' : 'hidden'}`}>
          <FocusTab partnerStats={partnerStats} isPartnerStudying={isPartnerStudying} />
        </div>
        <div className={`h-full w-full ${activeTab === 'sync' ? 'block animate-tab-in' : 'hidden'}`}>
          <LiveSyncTab partnerStats={partnerStats} isPartnerStudying={isPartnerStudying} />
        </div>
      </main>

      {/* Sleek Bottom Navigation */}
      <nav className="glass-panel pb-safe pt-2 px-6 flex justify-around items-center z-50">
        <button
          onClick={() => {
            if (activeTab !== 'focus') {
              triggerNavHaptic();
              setActiveTab('focus');
            }
          }}
          className={`flex flex-col items-center p-3 transition-colors duration-300 ${
            activeTab === 'focus' ? 'text-primary' : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          <div className="relative">
            <Timer size={24} strokeWidth={activeTab === 'focus' ? 2.5 : 2} />
            {activeTab === 'focus' && (
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary glow-primary shadow-glow shadow-primary"></span>
            )}
          </div>
          <span className="text-[10px] font-medium mt-1.5 tracking-wide">FOCUS</span>
        </button>

        <button
          onClick={() => {
            if (activeTab !== 'sync') {
              triggerNavHaptic();
              setActiveTab('sync');
            }
          }}
          className={`flex flex-col items-center p-3 transition-colors duration-300 ${
            activeTab === 'sync' ? 'text-accent' : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          <div className="relative">
            <Radio size={24} strokeWidth={activeTab === 'sync' ? 2.5 : 2} />
            {/* Live discreet LED indicator if partner is studying */}
            {isPartnerStudying && (
              <>
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent animate-ping opacity-75"></span>
                <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-accent"></span>
              </>
            )}
            
            {activeTab === 'sync' && (
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent glow-accent shadow-glow shadow-accent"></span>
            )}
          </div>
          <span className="text-[10px] font-medium mt-1.5 tracking-wide">SYNC</span>
        </button>
      </nav>
      
    </div>
  );
}

export default App;
