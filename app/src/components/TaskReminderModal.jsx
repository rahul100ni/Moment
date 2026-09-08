/**
 * TaskReminderModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Bottom-sheet modal for configuring a per-task alert schedule.
 * Separated from task lifecycle (recurrence) — purely controls WHEN the
 * notification fires, not whether the task respawns.
 *
 * Props:
 *   task       {Object}   — the task being edited (read-only context only)
 *   onSave     {Function} — called with { time, days, modality }
 *   onRemove   {Function} — called when user removes the existing reminder
 *   onClose    {Function} — called when user dismisses without saving
 */

import { useState } from 'react';
import { X, Bell, Clock, Repeat2, ChevronDown } from 'lucide-react';
import { ImpactStyle } from '@capacitor/haptics';
import { ALL_DAYS } from '../utils/taskNotifications';

/** Zero-pad a number to 2 digits */
const pad = n => String(n).padStart(2, '0');

/** Default time: 1 hour from now, rounded to nearest 5 min */
function defaultTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const m = Math.round(d.getMinutes() / 5) * 5 % 60;
  return `${pad(d.getHours())}:${pad(m)}`;
}

export default function TaskReminderModal({ task, triggerHaptic, onSave, onRemove, onClose }) {
  const existing = task?.reminder;

  const [time,     setTime]     = useState(() => existing?.time || defaultTime());
  const [days,     setDays]     = useState(() => existing?.days || []);
  const [modality, setModality] = useState(() => existing?.modality || 'notify');
  const [error,    setError]    = useState('');

  const toggleDay = (day) => {
    triggerHaptic?.(ImpactStyle.Light);
    setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSave = () => {
    setError('');
    // One-time reminder (no recurrence, no repeat days): time must be in the future
    if (days.length === 0 && !task?.recurrence) {
      const [h, m] = time.split(':').map(Number);
      const fireTime = new Date();
      fireTime.setHours(h, m, 0, 0);
      // If it's already past, it schedules for tomorrow — that's fine, no error needed
    }
    onSave({ time, days, modality });
  };

  return (
    <div
      className="absolute inset-0 z-[60] bg-background/80 backdrop-blur-md flex items-end justify-center animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-surface border-t border-white/10 rounded-t-[2rem] p-6 pb-10 shadow-2xl">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Bell size={17} className="text-primary" />
            <h3 className="text-base font-bold text-white tracking-tight">Set Reminder</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Task name: read-only bold label ─────────────────────────────────── */}
        <p className="text-white font-bold text-lg leading-snug mb-6 px-1 truncate" title={task?.text}>
          {task?.text}
        </p>

        {/* ── Time picker ─────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Clock size={12} className="text-gray-500" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Alert Time</span>
          </div>
          <div className="relative">
            <input
              type="time"
              value={time}
              onChange={(e) => { setTime(e.target.value); setError(''); }}
              className="w-full bg-surfaceHighlight text-white font-mono font-bold rounded-2xl px-4 py-4 pr-11 border border-white/10 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all text-base appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
              style={{ colorScheme: 'dark' }}
            />
            <ChevronDown
              size={18}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
          </div>
          {error && <p className="text-red-400 text-xs mt-2 px-1">{error}</p>}
        </div>

        {/* ── Repeat days ─────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Repeat2 size={12} className="text-gray-500" />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Repeat on days</span>
          </div>

          {/* 7 day pills */}
          <div className="flex gap-1.5">
            {ALL_DAYS.map(day => {
              const active = days.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-200 border ${
                    active
                      ? 'bg-primary text-black border-primary shadow-glow shadow-primary/30'
                      : 'bg-surfaceHighlight text-gray-500 border-white/5 hover:text-gray-300 hover:border-white/10'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="text-gray-600 text-[11px] mt-2 px-1">
            {days.length === 0
              ? 'No days selected — inherits task recurrence, or fires once'
              : 'Alert fires weekly on highlighted days, regardless of task recurrence'}
          </p>
        </div>

        {/* ── Alert type: compact segmented control ───────────────────────────── */}
        <div className="mb-7">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1 mb-2 block">Alert Type</span>
          <div className="flex bg-surfaceHighlight rounded-full p-1 border border-white/10 gap-1">
            <button
              onClick={() => { triggerHaptic?.('LIGHT'); setModality('notify'); }}
              className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all duration-200 ${
                modality === 'notify'
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Notify
            </button>
            <button
              onClick={() => { triggerHaptic?.('LIGHT'); setModality('alarm'); }}
              className={`flex-1 py-2.5 rounded-full text-sm font-bold transition-all duration-200 ${
                modality === 'alarm'
                  ? 'bg-primary text-black shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Alarm
            </button>
          </div>
        </div>

        {/* ── Action buttons ───────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <button
            onClick={handleSave}
            className="w-full py-4 bg-primary text-black font-bold rounded-2xl shadow-glow shadow-primary/30 hover:opacity-90 transition-all active:scale-[0.98] text-base"
          >
            Save Reminder
          </button>

          {existing && (
            <button
              onClick={onRemove}
              className="w-full py-3 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold rounded-2xl hover:bg-red-500/20 transition-colors text-sm"
            >
              Remove Reminder
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-sm font-semibold tracking-wider uppercase transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
