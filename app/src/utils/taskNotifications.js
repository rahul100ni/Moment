/**
 * taskNotifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure notification utility for the dual-layer task notification system.
 * No React, no side-effects outside LocalNotifications + localStorage.
 *
 * Notification ID space:
 *   1337, 1338  → Native timer / alarm (Java — do not use)
 *   7001, 7002  → Partner nudge / checkin (do not use)
 *   8001        → Daily motivational slot 1 (8 PM or user-configured time 1)
 *   8002        → Daily motivational slot 2 (11 PM or user-configured time 2)
 *   10000–89999 → Per-task reminder IDs (random, one per repeat day)
 *   1.7B+       → Session-complete one-shots (Date.now()/1000, no conflict)
 */

import { LocalNotifications } from '@capacitor/local-notifications';

// ── Constants ─────────────────────────────────────────────────────────────────
export const DAILY_MOTIV_ID_1 = 8001;
export const DAILY_MOTIV_ID_2 = 8002;
const DAILY_META_KEY = 'daily_motivational_meta';

/**
 * Capacitor LocalNotifications weekday values:
 * Sunday=1, Monday=2, Tuesday=3, Wednesday=4, Thursday=5, Friday=6, Saturday=7
 */
export const DAY_LABEL_TO_CAPACITOR = {
  Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7,
};

/** All 7 day labels in display order (Mon first for UI) */
export const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomNotifId() {
  // 5-digit range 10000–89999, safe from all reserved IDs
  return Math.floor(Math.random() * 80000) + 10000;
}

function getTodayMeta() {
  try {
    const raw = localStorage.getItem(DAILY_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTodayMeta(meta) {
  try { localStorage.setItem(DAILY_META_KEY, JSON.stringify(meta)); } catch {}
}

// ── Action Type Registration ──────────────────────────────────────────────────

/**
 * Register notification action types.
 * Must be called once on app boot before scheduling any notifications.
 */
export async function registerNotifActionTypes() {
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'DAILY_MOTIV_ACTIONS',
          actions: [
            { id: 'remind_again', title: 'Remind Again', foreground: false },
          ],
        },
      ],
    });
  } catch (e) {
    console.warn('[taskNotif] registerActionTypes failed:', e);
  }
}

// ── Daily Motivational ────────────────────────────────────────────────────────

/**
 * (Re)schedule both daily motivational notifications at the configured times.
 * Respects the 2-fires-per-day limit for auto-scheduling.
 *
 * @param {string[]} times  — e.g. ['20:00', '23:00']
 * @param {Array}    tasks  — full task array (to compute incomplete count)
 */
export async function scheduleDailyMotivational(times, tasks) {
  const today = new Date().toDateString();
  const meta = getTodayMeta();

  // Already hit auto-fire limit today → don't reschedule
  if (meta && meta.date === today && (meta.fireCount || 0) >= 2) return;

  const incomplete = tasks.filter(t => !t.done);
  if (incomplete.length === 0) return; // Nothing to remind about

  const now = new Date();
  const slots = [DAILY_MOTIV_ID_1, DAILY_MOTIV_ID_2];

  // Cancel any stale notifications first (idempotent)
  try {
    await LocalNotifications.cancel({ notifications: slots.map(id => ({ id })) });
  } catch {}

  const toSchedule = [];

  times.slice(0, 2).forEach((timeStr, idx) => {
    const [h, m] = timeStr.split(':').map(Number);
    const fireTime = new Date();
    fireTime.setHours(h, m, 0, 0);
    if (fireTime <= now) return; // Already passed today — skip

    toSchedule.push({
      id: slots[idx],
      title: '✅ Task Check-In',
      body: `You have ${incomplete.length} task${incomplete.length > 1 ? 's' : ''} left today. Let's finish strong!`,
      channelId: 'daily_motivational_channel_v1',
      schedule: { at: fireTime, allowWhileIdle: true },
      actionTypeId: 'DAILY_MOTIV_ACTIONS',
      extra: { type: 'daily_motivational', slotId: slots[idx] },
    });
  });

  if (toSchedule.length === 0) return;

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (e) {
    console.warn('[taskNotif] scheduleDailyMotivational error:', e);
  }
}

/**
 * Cancel both daily motivational notifications.
 */
export async function cancelDailyMotivational() {
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: DAILY_MOTIV_ID_1 }, { id: DAILY_MOTIV_ID_2 }],
    });
  } catch {}
}

/**
 * On app open: if all tasks are done, cancel pending daily motivationals.
 * @param {Array} tasks
 */
export async function syncDailyMotivationalOnOpen(tasks) {
  if (tasks.length === 0) return;
  const allDone = tasks.every(t => t.done);
  if (allDone) await cancelDailyMotivational();
}

/**
 * Reschedule a single daily motivational slot 30 minutes from now.
 * This is the "Remind Again" action — does NOT count against the daily fire limit.
 *
 * @param {number} slotId        — DAILY_MOTIV_ID_1 or DAILY_MOTIV_ID_2
 * @param {number} incompleteCount — used to build the body text
 */
export async function remindAgainIn30(slotId, incompleteCount) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: slotId }] });
    const fireTime = new Date(Date.now() + 30 * 60 * 1000);
    await LocalNotifications.schedule({
      notifications: [{
        id: slotId,
        title: '✅ Task Check-In',
        body: `${incompleteCount} task${incompleteCount > 1 ? 's' : ''} still waiting. You've got this!`,
        channelId: 'daily_motivational_channel_v1',
        schedule: { at: fireTime, allowWhileIdle: true },
        actionTypeId: 'DAILY_MOTIV_ACTIONS',
        extra: { type: 'daily_motivational', slotId },
      }],
    });
  } catch (e) {
    console.warn('[taskNotif] remindAgainIn30 error:', e);
  }
}

/**
 * Increment the auto-fire counter for today (capped at 2).
 * Call this when a daily motivational notification fires (not Remind Again).
 */
export function recordDailyMotivationalFire() {
  const today = new Date().toDateString();
  const meta = getTodayMeta();
  const count = (meta && meta.date === today ? meta.fireCount || 0 : 0) + 1;
  saveTodayMeta({ date: today, fireCount: Math.min(count, 2) });
}

// ── Per-Task Reminders ────────────────────────────────────────────────────────

/**
 * Schedule a task reminder. Supports one-time and multi-day repeating.
 * Returns an array of notification IDs so they can be stored on the task.
 *
 * reminder shape: { time: "HH:MM", days: string[], modality: 'notify'|'alarm' }
 * recurrence:     null | 'daily' | string[]
 *
 * Scheduling matrix:
 *   reminder.days non-empty                         → weekly on those specific days
 *   reminder.days empty + recurrence 'daily'        → daily repeating at time
 *   reminder.days empty + recurrence string[]       → weekly on recurrence days
 *   reminder.days empty + recurrence null           → one-time at next occurrence of time
 *
 * @param {Object} task — { id, text, recurrence, reminder: { time, days, modality } }
 * @returns {Promise<number[]>} notifIds
 */
export async function scheduleTaskReminder(task) {
  const { reminder, recurrence } = task;
  if (!reminder || !reminder.time) return [];

  const [hour, minute]  = reminder.time.split(':').map(Number);
  const isAlarm         = reminder.modality === 'alarm';
  const channelId       = isAlarm ? 'task_alarm_channel_v1' : 'task_reminder_channel_v1';
  const title           = isAlarm ? '⏰ Task Alarm' : '📋 Task Reminder';
  const body            = task.text;
  const extra           = { type: 'task_reminder', taskId: task.id, modality: reminder.modality };

  const toSchedule = [];
  const notifIds   = [];

  const alertDays    = Array.isArray(reminder.days) ? reminder.days : [];
  const hasAlertDays = alertDays.length > 0;

  if (hasAlertDays) {
    // ── Case 1: Specific alert days — weekly repeating on those days ──────────
    for (const dayLabel of alertDays) {
      const weekday = DAY_LABEL_TO_CAPACITOR[dayLabel];
      if (!weekday) continue;
      const id = randomNotifId();
      notifIds.push(id);
      toSchedule.push({
        id, title, body, channelId,
        schedule: { on: { weekday, hour, minute }, repeats: true, allowWhileIdle: true },
        extra: { ...extra, day: dayLabel },
      });
    }
  } else if (recurrence === 'daily') {
    // ── Case 2: Daily recurrence + no alert days → alert fires every day ──────
    const id = randomNotifId();
    notifIds.push(id);
    toSchedule.push({
      id, title, body, channelId,
      schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
      extra,
    });
  } else if (Array.isArray(recurrence) && recurrence.length > 0) {
    // ── Case 3: Specific recurrence days + no alert days → alert on all recurrence days
    for (const dayLabel of recurrence) {
      const weekday = DAY_LABEL_TO_CAPACITOR[dayLabel];
      if (!weekday) continue;
      const id = randomNotifId();
      notifIds.push(id);
      toSchedule.push({
        id, title, body, channelId,
        schedule: { on: { weekday, hour, minute }, repeats: true, allowWhileIdle: true },
        extra: { ...extra, day: dayLabel },
      });
    }
  } else {
    // ── Case 4: No recurrence + no alert days → one-time at next occurrence ───
    const fireTime = new Date();
    fireTime.setHours(hour, minute, 0, 0);
    if (fireTime <= new Date()) {
      fireTime.setDate(fireTime.getDate() + 1); // Time passed today — push to tomorrow
    }
    const id = randomNotifId();
    notifIds.push(id);
    toSchedule.push({
      id, title, body, channelId,
      schedule: { at: fireTime, allowWhileIdle: true },
      extra,
    });
  }

  if (toSchedule.length === 0) return [];

  try {
    await LocalNotifications.schedule({ notifications: toSchedule });
  } catch (e) {
    console.warn('[taskNotif] scheduleTaskReminder error:', e);
    return [];
  }

  return notifIds;
}

/**
 * Cancel task reminder notifications by their IDs.
 * @param {number|number[]} notifIds
 */
export async function cancelTaskReminder(notifIds) {
  const ids = (Array.isArray(notifIds) ? notifIds : [notifIds]).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map(id => ({ id })) });
  } catch (e) {
    console.warn('[taskNotif] cancelTaskReminder error:', e);
  }
}
