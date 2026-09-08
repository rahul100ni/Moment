/**
 * statsManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Local-first, privacy-respecting statistics and historical tracking engine.
 *
 * PILLAR 1 ENFORCEMENT:
 * All time accumulation is calculated via wall-clock timestamp deltas,
 * NEVER periodic interval ticks, ensuring 100% accuracy even through
 * deep Doze mode, locked screens, and OS backgrounding.
 *
 * PILLAR 2 ENFORCEMENT:
 * Shared moments are tracked anonymously ("in sync with partner") with
 * zero hardcoded personal names.
 *
 * localStorage key: 'study_buddy_history'
 * Array of DailyHistoryRecord objects.
 */

const HISTORY_KEY = 'study_buddy_history';

/**
 * Format a Date object to 'YYYY-MM-DD' in local timezone.
 */
export function formatLocalDateKey(date = new Date()) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get all historical records from localStorage.
 * Automatically migrates existing 'study_buddy_stats' if history is not yet initialized.
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    let history = raw ? JSON.parse(raw) : [];

    // Migrate from legacy single-day study_buddy_stats if history is empty
    if (!Array.isArray(history) || history.length === 0) {
      history = [];
      const legacyRaw = localStorage.getItem('study_buddy_stats');
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw);
          const todayKey = formatLocalDateKey();
          if (legacy.todaySeconds > 0) {
            history.push({
              date: todayKey,
              dateString: new Date().toDateString(),
              focusSeconds: legacy.todaySeconds,
              breakSeconds: 0,
              sessionsCount: Math.max(1, Math.round(legacy.todaySeconds / 1500)),
              tasksCompleted: 0,
              timeOfDaySeconds: {
                morning:   Math.round(legacy.todaySeconds * 0.3),
                afternoon: Math.round(legacy.todaySeconds * 0.4),
                evening:   Math.round(legacy.todaySeconds * 0.3),
                night:     0,
              },
              sharedFocusSeconds: Math.round(legacy.todaySeconds * 0.5),
            });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
          }
        } catch (_) {}
      }
    }

    return history;
  } catch {
    return [];
  }
}

/**
 * Persist history array to localStorage.
 */
function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('[statsManager] Failed to save history:', e);
  }
}

/**
 * Get or create today's record in the history array.
 */
function getOrCreateRecord(history, dateKey = formatLocalDateKey()) {
  let record = history.find(r => r.date === dateKey);
  if (!record) {
    const parts = dateKey.split('-').map(Number);
    const recDate = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date();
    record = {
      date: dateKey,
      dateString: recDate.toDateString(),
      focusSeconds: 0,
      breakSeconds: 0,
      sessionsCount: 0,
      tasksCompleted: 0,
      timeOfDaySeconds: {
        morning:   0,
        afternoon: 0,
        evening:   0,
        night:     0,
      },
      sharedFocusSeconds: 0,
    };
    history.push(record);
  }
  return record;
}

/**
 * Helper: credit `sliceSeconds` of time into a specific day's history record.
 * Uses `hour` (the local hour at the START of that slice) for quadrant allocation.
 */
function _creditSliceToDate(history, dateKey, sliceSeconds, hour, isBreak, isPartnerStudying) {
  const record = getOrCreateRecord(history, dateKey);

  if (isBreak) {
    record.breakSeconds = (record.breakSeconds || 0) + sliceSeconds;
  } else {
    record.focusSeconds = (record.focusSeconds || 0) + sliceSeconds;

    if (!record.timeOfDaySeconds) {
      record.timeOfDaySeconds = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    }

    if (hour >= 6 && hour < 12) {
      record.timeOfDaySeconds.morning   = (record.timeOfDaySeconds.morning   || 0) + sliceSeconds;
    } else if (hour >= 12 && hour < 18) {
      record.timeOfDaySeconds.afternoon = (record.timeOfDaySeconds.afternoon || 0) + sliceSeconds;
    } else if (hour >= 18 && hour < 24) {
      record.timeOfDaySeconds.evening   = (record.timeOfDaySeconds.evening   || 0) + sliceSeconds;
    } else {
      record.timeOfDaySeconds.night     = (record.timeOfDaySeconds.night     || 0) + sliceSeconds;
    }

    if (isPartnerStudying) {
      record.sharedFocusSeconds = (record.sharedFocusSeconds || 0) + sliceSeconds;
    }
  }
}

/**
 * Wall-clock delta logging (PILLAR 1) — Midnight-boundary aware.
 *
 * Recursively slices the elapsed delta across calendar day boundaries so that
 * time is always credited to the correct DailyHistoryRecord.
 *
 * Example: A session starting at 11:45 PM (23:45) committing a 30-minute
 * (1800 s) delta at 12:15 AM:
 *   • sessionStartMs = commitTime - 1800_000  → anchored at 23:45
 *   • midnight boundary is 900 s from the anchor
 *   • Slice 1: 900 s → yesterday's record, Night quadrant
 *   • Slice 2: 900 s → today's record, Night quadrant
 *
 * @param {Object}  params
 * @param {number}  params.deltaSeconds        - Total wall-clock seconds for this commit
 * @param {boolean} params.isBreak             - Break vs. focus session
 * @param {boolean} params.isPartnerStudying   - Ambient co-study flag
 * @param {number}  [params.sessionStartMs]    - ms timestamp of session start.
 *                                               Defaults to (Date.now() - deltaSeconds*1000).
 *                                               Pass startTsRef.current from FocusTab for precision.
 */
export function commitSessionDelta({
  deltaSeconds,
  isBreak           = false,
  isPartnerStudying = false,
  sessionStartMs,
}) {
  if (!deltaSeconds || deltaSeconds <= 0) return;

  const history      = getHistory();
  const commitTimeMs = Date.now();
  const startMs      = sessionStartMs ?? (commitTimeMs - deltaSeconds * 1000);

  // Walk from startMs forward, slicing at every midnight boundary
  let cursor = startMs;
  while (cursor < commitTimeMs) {
    const cursorDate   = new Date(cursor);
    const dateKey      = formatLocalDateKey(cursorDate);
    const hour         = cursorDate.getHours();

    // Next midnight in local time after cursor
    const nextMidnight = new Date(cursorDate);
    nextMidnight.setHours(24, 0, 0, 0);

    const sliceEndMs = Math.min(commitTimeMs, nextMidnight.getTime());
    const sliceSecs  = Math.round((sliceEndMs - cursor) / 1000);

    if (sliceSecs > 0) {
      _creditSliceToDate(history, dateKey, sliceSecs, hour, isBreak, isPartnerStudying);
    }

    cursor = sliceEndMs;
    if (cursor >= commitTimeMs) break; // guard against float drift
  }

  saveHistory(history);
}

/**
 * Increment completed focus session counter for today.
 */
export function commitSessionComplete(mode) {
  if (mode !== 'FOCUS') return;
  const history = getHistory();
  const record  = getOrCreateRecord(history);
  record.sessionsCount = (record.sessionsCount || 0) + 1;
  saveHistory(history);
}

/**
 * Increment task completion counter for today.
 */
export function commitTaskCompleted() {
  const history = getHistory();
  const record  = getOrCreateRecord(history);
  record.tasksCompleted = (record.tasksCompleted || 0) + 1;
  saveHistory(history);
}

/**
 * Decrement task completion counter (if user unchecks a task).
 */
export function commitTaskUncompleted() {
  const history = getHistory();
  const record  = getOrCreateRecord(history);
  record.tasksCompleted = Math.max(0, (record.tasksCompleted || 0) - 1);
  saveHistory(history);
}

/**
 * Compute the start of the current week (Monday at 00:00:00).
 */
function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  // If Sunday (0), go back 6 days; otherwise go back (day - 1) days to Monday
  const diff = d.getDate() - (day === 0 ? 6 : day - 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate streaks from history.
 */
function computeStreaks(history) {
  if (!history || history.length === 0) return { currentStreak: 0, bestStreak: 0 };

  // Sort ascending by date
  const sorted = [...history]
    .filter(r => (r.focusSeconds || 0) >= 300) // Minimum 5 mins to count as active day
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) return { currentStreak: 0, bestStreak: 0 };

  const datesSet = new Set(sorted.map(r => r.date));
  let bestStreak = 1;
  let tempStreak = 1;

  // Compute best streak
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date);
    const curr = new Date(sorted[i].date);
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else if (diffDays > 1) {
      tempStreak = 1;
    }
  }

  // Compute current streak (walking back from today or yesterday)
  const todayKey = formatLocalDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatLocalDateKey(yesterday);

  let currentStreak = 0;
  let checkDate = new Date();

  // If today hasn't met the 5-min threshold yet, start checking from yesterday
  if (!datesSet.has(todayKey)) {
    if (datesSet.has(yesterdayKey)) {
      checkDate = yesterday;
    } else {
      return { currentStreak: 0, bestStreak };
    }
  }

  while (true) {
    const key = formatLocalDateKey(checkDate);
    if (datesSet.has(key)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return { currentStreak, bestStreak: Math.max(bestStreak, currentStreak) };
}

/**
 * Generate full summary and analytics data for the Statistics Modal.
 * Supports 'week' | 'month' | 'all' time ranges.
 * Pure calculation — zero UI dependencies.
 *
 * @param {'week'|'month'|'all'} range
 * @param {number} liveTodaySeconds - optional live today seconds from FocusTab
 */
export function getStatsSummary(range = 'week', liveTodaySeconds = 0) {
  const history = getHistory();
  const todayKey = formatLocalDateKey();

  // Determine current quadrant for live today time allocation
  const curHour = new Date().getHours();
  const curQuad = (curHour >= 6 && curHour < 12) ? 'morning'
                : (curHour >= 12 && curHour < 18) ? 'afternoon'
                : (curHour >= 18 && curHour < 24) ? 'evening'
                : 'night';

  // Merge live today seconds into memory for instant responsiveness
  const mergedHistory = history.map(r => {
    if (r.date === todayKey && liveTodaySeconds > r.focusSeconds) {
      const extra = liveTodaySeconds - r.focusSeconds;
      return {
        ...r,
        focusSeconds: liveTodaySeconds,
        timeOfDaySeconds: {
          morning:   (r.timeOfDaySeconds?.morning   || 0) + (curQuad === 'morning'   ? extra : 0),
          afternoon: (r.timeOfDaySeconds?.afternoon || 0) + (curQuad === 'afternoon' ? extra : 0),
          evening:   (r.timeOfDaySeconds?.evening   || 0) + (curQuad === 'evening'   ? extra : 0),
          night:     (r.timeOfDaySeconds?.night     || 0) + (curQuad === 'night'     ? extra : 0),
        },
      };
    }
    return r;
  });

  // If today is not in history at all but liveTodaySeconds > 0
  if (!mergedHistory.some(r => r.date === todayKey) && liveTodaySeconds > 0) {
    mergedHistory.push({
      date: todayKey,
      dateString: new Date().toDateString(),
      focusSeconds: liveTodaySeconds,
      breakSeconds: 0,
      sessionsCount: 1,
      tasksCompleted: 0,
      timeOfDaySeconds: {
        morning:   curQuad === 'morning'   ? liveTodaySeconds : 0,
        afternoon: curQuad === 'afternoon' ? liveTodaySeconds : 0,
        evening:   curQuad === 'evening'   ? liveTodaySeconds : 0,
        night:     curQuad === 'night'     ? liveTodaySeconds : 0,
      },
      sharedFocusSeconds: 0,
    });
  }

  const now = new Date();
  const startOfWeek = getStartOfWeek(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Filter records based on selected range
  const filtered = mergedHistory.filter(r => {
    const rDate = new Date(r.date);
    if (range === 'week')  return rDate >= startOfWeek;
    if (range === 'month') return rDate >= startOfMonth;
    return true; // 'all'
  });

  // Totals
  const totalFocusSeconds = filtered.reduce((acc, r) => acc + (r.focusSeconds || 0), 0);
  const totalBreakSeconds = filtered.reduce((acc, r) => acc + (r.breakSeconds || 0), 0);
  const totalSessions     = filtered.reduce((acc, r) => acc + (r.sessionsCount || 0), 0);
  const totalTasksDone    = filtered.reduce((acc, r) => acc + (r.tasksCompleted || 0), 0);
  const sharedFocusSecs   = filtered.reduce((acc, r) => acc + (r.sharedFocusSeconds || 0), 0);

  // Active days & daily average
  const activeDays = filtered.filter(r => (r.focusSeconds || 0) > 0).length || 1;
  const dailyAverageSeconds = Math.round(totalFocusSeconds / activeDays);

  // Streaks
  const { currentStreak, bestStreak } = computeStreaks(mergedHistory);

  // ── 7-Day Weekly Horizon Bar Chart (Mon → Sun) ──────────────────────────
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDays = [];
  const startMon = new Date(startOfWeek);

  for (let i = 0; i < 7; i++) {
    const curDate = new Date(startMon);
    curDate.setDate(curDate.getDate() + i);
    const dateKey = formatLocalDateKey(curDate);
    const rec = mergedHistory.find(r => r.date === dateKey);
    const fSecs = rec ? rec.focusSeconds || 0 : 0;
    const bSecs = rec ? rec.breakSeconds || 0 : 0;
    const sCount = rec ? rec.sessionsCount || 0 : 0;
    const tCount = rec ? rec.tasksCompleted || 0 : 0;

    weekDays.push({
      dateKey,
      dayLabel: dayNames[i],
      dateNumber: curDate.getDate(),
      monthLabel: curDate.toLocaleDateString('en-US', { month: 'short' }),
      focusSeconds: fSecs,
      breakSeconds: bSecs,
      sessionsCount: sCount,
      tasksCompleted: tCount,
      isToday: dateKey === todayKey,
      isFuture: curDate > now && dateKey !== todayKey,
    });
  }

  // Calculate bar heights relative to max day
  const maxDaySecs = Math.max(...weekDays.map(d => d.focusSeconds), 3600); // minimum scale: 1 hour
  const dayBars = weekDays.map(d => {
    const pct = (d.focusSeconds / maxDaySecs) * 100;
    return {
      ...d,
      barHeightPct: Math.max(d.focusSeconds > 0 ? 8 : 4, Math.round(pct)), // minimum 8% if has data, 4% if empty
      hoursDisplay: (d.focusSeconds / 3600).toFixed(1),
    };
  });

  // ── Time-of-Day Rhythm (4 Quadrants) ──────────────────────────────────
  const tod = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  filtered.forEach(r => {
    if (r.timeOfDaySeconds) {
      tod.morning   += r.timeOfDaySeconds.morning   || 0;
      tod.afternoon += r.timeOfDaySeconds.afternoon || 0;
      tod.evening   += r.timeOfDaySeconds.evening   || 0;
      tod.night     += r.timeOfDaySeconds.night     || 0;
    }
  });

  const totalTodSeconds = tod.morning + tod.afternoon + tod.evening + tod.night || 1;
  const timeOfDay = [
    { key: 'morning',   label: 'Morning',   window: '6 AM – 12 PM', seconds: tod.morning,   pct: Math.round((tod.morning / totalTodSeconds) * 100) },
    { key: 'afternoon', label: 'Afternoon', window: '12 PM – 6 PM', seconds: tod.afternoon, pct: Math.round((tod.afternoon / totalTodSeconds) * 100) },
    { key: 'evening',   label: 'Evening',   window: '6 PM – 12 AM', seconds: tod.evening,   pct: Math.round((tod.evening / totalTodSeconds) * 100) },
    { key: 'night',     label: 'Night',     window: '12 AM – 6 AM', seconds: tod.night,     pct: Math.round((tod.night / totalTodSeconds) * 100) },
  ];

  // Find peak window
  const peakQuad = [...timeOfDay].sort((a, b) => b.seconds - a.seconds)[0];

  // ── Focus vs Rest Ratio ──────────────────────────────────────────────
  const hasSessionData = (totalFocusSeconds + totalBreakSeconds) > 0;
  const totalCombined  = hasSessionData ? (totalFocusSeconds + totalBreakSeconds) : 1;
  const focusRatioPct  = hasSessionData ? Math.round((totalFocusSeconds / totalCombined) * 100) : 0;
  const breakRatioPct  = hasSessionData ? (100 - focusRatioPct) : 0;

  return {
    range,
    totalFocusSeconds,
    totalBreakSeconds,
    dailyAverageSeconds,
    currentStreak,
    bestStreak,
    totalSessions,
    totalTasksDone,
    sharedFocusSecs,
    dayBars,
    timeOfDay,
    peakWindow: peakQuad.seconds > 0 ? peakQuad : null,
    focusRatioPct,
    breakRatioPct,
  };
}
