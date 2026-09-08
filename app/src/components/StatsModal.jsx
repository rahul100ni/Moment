import React, { useState, useMemo } from 'react';
import { ChevronLeft, Flame, CheckCircle2, Radio, Sun, Sunset, Moon, Sunrise, Target, Sparkles, BarChart2 } from 'lucide-react';
import { ImpactStyle } from '@capacitor/haptics';
import { getStatsSummary } from '../utils/statsManager';

/**
 * Format total seconds into human-readable hours and minutes.
 */
function formatHoursMins(totalSecs) {
  if (!totalSecs || totalSecs <= 0) return '0m';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function StatsModal({ onClose, triggerHaptic, liveTodaySeconds = 0 }) {
  const [range, setRange] = useState('week'); // 'week' | 'month' | 'all'
  const [selectedDayKey, setSelectedDayKey] = useState(null);

  // Compute fresh summary based on selected range and live today seconds
  const summary = useMemo(() => {
    return getStatsSummary(range, liveTodaySeconds);
  }, [range, liveTodaySeconds]);

  // Handle range change
  const handleRangeChange = (newRange) => {
    if (newRange === range) return;
    triggerHaptic?.(ImpactStyle.Light);
    setRange(newRange);
    setSelectedDayKey(null);
  };

  // Currently inspected day in the 7-day bar chart
  const inspectedDay = useMemo(() => {
    if (!summary.dayBars) return null;
    if (selectedDayKey) {
      return summary.dayBars.find(d => d.dateKey === selectedDayKey) || null;
    }
    // Default to today
    return summary.dayBars.find(d => d.isToday) || summary.dayBars[summary.dayBars.length - 1];
  }, [summary.dayBars, selectedDayKey]);

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col h-full w-full overflow-y-auto no-scrollbar animate-fade-in text-white selection:bg-primary/30">

      {/* ── Sticky Top Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/5 px-4 sm:px-5 pt-8 pb-4 flex flex-col gap-4 max-w-md mx-auto w-full">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              triggerHaptic?.(ImpactStyle.Light);
              onClose();
            }}
            className="p-2.5 bg-surfaceHighlight hover:bg-white/10 rounded-full text-white transition-colors flex items-center justify-center border border-white/5 active:scale-95"
            title="Back to Settings"
          >
            <ChevronLeft size={20} />
          </button>

          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart2 size={18} className="text-primary" />
            Statistics & Insights
          </h1>

          <div className="w-10" /> {/* Spacer balance */}
        </div>

        {/* ── Time-Range Pill Switcher ────────────────────────────────────────── */}
        <div className="flex bg-surfaceHighlight p-1 rounded-full border border-white/5">
          {[
            { id: 'week',  label: 'This Week' },
            { id: 'month', label: 'Month'     },
            { id: 'all',   label: 'All Time'  },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleRangeChange(tab.id)}
              className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
                range === tab.id
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable Body Content ───────────────────────────────────────────── */}
      <div className="flex-1 px-4 sm:px-5 pt-4 pb-28 max-w-md mx-auto w-full space-y-5">

        {/* ── SECTION 1: HERO VITALS ─────────────────────────────────────────── */}
        <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-6 border border-white/5 relative overflow-hidden shadow-xl">
          {/* Top-right ambient glow */}
          <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/20 blur-3xl rounded-full pointer-events-none" />
          {/* Bottom-left ambient glow — NEW */}
          <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-primary/10 blur-2xl rounded-full pointer-events-none" />

          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Total Time In The Moment
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-mono font-bold tracking-tight text-white">
              {formatHoursMins(summary.totalFocusSeconds)}
            </span>
          </div>

          {/* Floating submetric containers */}
          <div className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-primary/20 text-center">
            <div className="bg-background/40 rounded-2xl p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Daily Avg</p>
              <p className="text-sm font-mono font-bold text-gray-200">
                {formatHoursMins(summary.dailyAverageSeconds)}
              </p>
            </div>
            <div className="bg-background/40 rounded-2xl p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Streak</p>
              <p className="text-sm font-mono font-bold text-white flex items-center justify-center gap-1">
                <Flame size={14} className="text-amber-400 fill-amber-400" />
                {summary.currentStreak} {summary.currentStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
            <div className="bg-background/40 rounded-2xl p-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sessions</p>
              <p className="text-sm font-mono font-bold text-gray-200">
                {summary.totalSessions}
              </p>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: 7-DAY WEEKLY HORIZON BAR CHART ──────────────────────── */}
        <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-6 border border-white/5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Weekly Horizon</h2>
              <p className="text-xs text-gray-400 mt-0.5">Distribution across Monday – Sunday</p>
            </div>
            <span className="text-[11px] font-mono text-primary font-bold px-2.5 py-1 bg-primary/10 rounded-full border border-primary/20">
              {range === 'week' ? 'Active Week' : 'Current Week'}
            </span>
          </div>

          {/* Pure Tailwind/CSS Bar Chart */}
          <div className="flex items-end justify-between gap-2 h-44 pt-6 pb-2 px-1">
            {summary.dayBars.map((day) => {
              const isSelected = inspectedDay?.dateKey === day.dateKey;
              return (
                <div
                  key={day.dateKey}
                  onClick={() => {
                    triggerHaptic?.(ImpactStyle.Light);
                    setSelectedDayKey(day.dateKey);
                  }}
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                >
                  {/* Hours label */}
                  <span className={`text-[10px] font-mono mb-1.5 transition-all duration-200 ${
                    isSelected ? 'text-primary font-bold scale-110' : 'text-gray-600 group-hover:text-gray-400'
                  }`}>
                    {day.focusSeconds > 0 ? `${day.hoursDisplay}h` : '—'}
                  </span>

                  {/* Bar Pillar Track — pressed-glass look + today ring */}
                  <div className={`w-full max-w-[28px] h-28 rounded-full flex flex-col justify-end p-1 transition-all shadow-inner ${
                    day.isToday
                      ? 'bg-white/[0.04] ring-1 ring-primary/40'
                      : 'bg-white/[0.04] group-hover:bg-white/10'
                  }`}>
                    <div
                      style={{ height: `${day.barHeightPct}%` }}
                      className={`w-full rounded-full transition-all duration-500 ${
                        day.isToday
                          ? 'bg-gradient-to-t from-primary via-primary to-violet-400 shadow-glow shadow-primary/30'
                          : isSelected
                            ? 'bg-primary'
                            : day.focusSeconds > 0
                              ? 'bg-white/25 group-hover:bg-gradient-to-t group-hover:from-white/20 group-hover:to-white/30'
                              : 'bg-white/10'
                      }`}
                    />
                  </div>

                  {/* Day Name Label */}
                  <span className={`text-[11px] font-bold mt-2 transition-colors ${
                    day.isToday
                      ? 'text-primary'
                      : isSelected
                        ? 'text-white'
                        : 'text-gray-500'
                  }`}>
                    {day.dayLabel}
                  </span>

                  {/* Today dot */}
                  <div className="h-1 mt-0.5 flex items-center justify-center">
                    {day.isToday && (
                      <span className="w-1 h-1 rounded-full bg-primary" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Day Inspection Card — colored on selection */}
          {inspectedDay && (
            <div className={`mt-4 p-3.5 rounded-2xl flex items-center justify-between text-xs animate-fade-in transition-colors ${
              selectedDayKey
                ? 'bg-primary/5 border border-primary/20'
                : 'bg-background/60 border border-white/5'
            }`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="font-bold text-gray-200">
                  {inspectedDay.dayLabel}, {inspectedDay.monthLabel} {inspectedDay.dateNumber}
                  {inspectedDay.isToday ? ' (Today)' : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-gray-400 font-mono">
                <span>{formatHoursMins(inspectedDay.focusSeconds)}</span>
                <span>·</span>
                <span>{inspectedDay.sessionsCount} sessions</span>
                <span>·</span>
                <span>{inspectedDay.tasksCompleted} tasks</span>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 3: TIME-OF-DAY RHYTHM (PEAK FOCUS) ────────────────────── */}
        <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-6 border border-white/5 shadow-xl space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white tracking-tight">Time-of-Day Rhythm</h2>
              {summary.peakWindow && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles size={10} /> Peak: {summary.peakWindow.label}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">When your deep focus naturally peaks</p>
          </div>

          <div className="space-y-3 pt-1">
            {summary.timeOfDay.map((slot) => {
              const isPeak = summary.peakWindow?.key === slot.key;
              const Icon = slot.key === 'morning' ? Sunrise : slot.key === 'afternoon' ? Sun : slot.key === 'evening' ? Sunset : Moon;
              return (
                <div
                  key={slot.key}
                  className={`space-y-1.5 rounded-2xl transition-colors ${isPeak ? 'bg-primary/[0.03] px-2 py-1.5 -mx-2' : ''}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className={isPeak ? 'text-primary' : 'text-gray-500'} />
                      <span className={`font-semibold ${isPeak ? 'text-white' : 'text-gray-400'}`}>
                        {slot.label}
                      </span>
                      <span className="text-[10px] text-gray-600 font-mono">({slot.window})</span>
                    </div>
                    <span className="font-mono text-xs text-gray-400 font-bold">
                      {formatHoursMins(slot.seconds)} ({slot.pct}%)
                    </span>
                  </div>

                  {/* Progress Meter Bar */}
                  <div className="h-2 w-full bg-background rounded-full overflow-hidden p-0.5 border border-white/5">
                    <div
                      style={{ width: `${Math.max(slot.pct, slot.seconds > 0 ? 4 : 0)}%` }}
                      className={`h-full rounded-full transition-all duration-700 ${
                        isPeak
                          ? 'bg-gradient-to-r from-primary to-violet-400'
                          : 'bg-white/15'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SECTION 4: FOCUS VS REST RATIO ─────────────────────────────────── */}
        <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-6 border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Focus & Rest Balance</h2>
              <p className="text-xs text-gray-400 mt-0.5">Work-to-break ratio</p>
            </div>
            <span className="text-xs font-mono font-bold text-gray-300">
              {summary.focusRatioPct > 0 || summary.breakRatioPct > 0
                ? `${summary.focusRatioPct}% · ${summary.breakRatioPct}%`
                : 'No session data'}
            </span>
          </div>

          {/* Dual Segmented Progress Bar — gradient segments with a visible gap */}
          <div className="h-3 w-full bg-background rounded-full p-0.5 border border-white/5 flex gap-0.5 overflow-hidden">
            {summary.focusRatioPct > 0 && (
              <div
                style={{ width: `${summary.focusRatioPct}%` }}
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500 transition-all duration-700"
                title={`Focus: ${summary.focusRatioPct}%`}
              />
            )}
            {summary.breakRatioPct > 0 && (
              <div
                style={{ width: `${summary.breakRatioPct}%` }}
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-accent transition-all duration-700"
                title={`Break: ${summary.breakRatioPct}%`}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm" />
              <span>Deep Focus ({formatHoursMins(summary.totalFocusSeconds)})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent shadow-sm" />
              <span>Restorative ({formatHoursMins(summary.totalBreakSeconds)})</span>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: TASK EXECUTION VELOCITY ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Tasks Done card — emerald ambient */}
          <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-5 border border-white/5 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-16 h-16 bg-accent/30 blur-2xl rounded-full opacity-50 pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tasks Done</span>
              <CheckCircle2 size={16} className="text-accent" />
            </div>
            <p className="text-3xl font-mono font-bold text-white">
              {summary.totalTasksDone}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Cleared in this period</p>
          </div>

          {/* Efficiency card — purple ambient */}
          <div className="bg-surfaceHighlight rounded-3xl p-4 sm:p-5 border border-white/5 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute -top-4 -right-4 w-16 h-16 bg-primary/30 blur-2xl rounded-full opacity-50 pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Efficiency</span>
              <Target size={16} className="text-primary" />
            </div>
            <p className="text-3xl font-mono font-bold text-white">
              {summary.totalTasksDone > 0
                ? `${Math.round(summary.totalFocusSeconds / 60 / summary.totalTasksDone)}m`
                : '—'}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Avg focus per task</p>
          </div>
        </div>

        {/* ── SECTION 6: SHARED MOMENTS (PILLAR 2: DISCREET & AMBIENT) ────────── */}
        <div className="bg-surfaceHighlight/50 border border-white/5 rounded-3xl p-4 sm:p-5 flex items-start gap-3.5 shadow-lg">
          {/* Gradient icon container */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0 mt-0.5">
            <Radio size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white tracking-tight">
              Shared Moments
            </p>
            {/* Emerald glow-drop-shadow on co-study time */}
            <p
              className="text-xl font-mono font-bold text-accent mt-0.5"
              style={{ filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.4))' }}
            >
              {formatHoursMins(summary.sharedFocusSecs)} co-study time
            </p>
            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
              Studied in sync alongside partner without distraction.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
