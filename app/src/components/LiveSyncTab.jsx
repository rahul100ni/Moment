import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { Edit2, Check } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import VersionManager from './VersionManager';

export default function LiveSyncTab({ partnerStats }) {
  const [internalStats, setInternalStats] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [partnerName, setPartnerName] = useState(() => localStorage.getItem('study_buddy_partner_name') || 'Partner');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(partnerName);

  // Developer menu trigger
  const [showVersionManager, setShowVersionManager] = useState(false);
  const [versionTapCount, setVersionTapCount] = useState(0);

  const handleVersionClick = () => {
    const newCount = versionTapCount + 1;
    setVersionTapCount(newCount);
    if (newCount >= 5) {
      setShowVersionManager(true);
      setVersionTapCount(0);
    }
  };

  useEffect(() => {
    if (partnerStats) return;
    let timeout;
    const roomId = localStorage.getItem('study_buddy_room');
    const myId = localStorage.getItem('study_buddy_device_id');
    if (!roomId) return;
    
    const membersRef = ref(db, `rooms/${roomId}/members`);
    const unsubscribe = onValue(membersRef, (snapshot) => {
      clearTimeout(timeout);
      if (snapshot.exists()) {
        const members = snapshot.val();
        const partnerId = Object.keys(members).find(id => id !== myId);
        if (partnerId && members[partnerId].liveStats) {
          setInternalStats(members[partnerId].liveStats);
        } else {
          setInternalStats({});
        }
      } else {
        setInternalStats({});
      }
      setTimedOut(false);
    });
    timeout = setTimeout(() => setTimedOut(true), 10000);
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [partnerStats]);

  const stats = partnerStats || internalStats;

  const triggerHaptic = (style = ImpactStyle.Light) => {
    try {
      const raw = localStorage.getItem('focusSettings');
      const settings = raw ? JSON.parse(raw) : null;
      if (settings && settings.hapticsEnabled === false) return;
      Haptics.impact({ style });
    } catch (_) {}
  };

  const saveName = () => {
    const finalName = tempName.trim() || 'Partner';
    setPartnerName(finalName);
    localStorage.setItem('study_buddy_partner_name', finalName);
    setIsEditingName(false);
    triggerHaptic(ImpactStyle.Light);
  };

  const formatTime = (secs) => {
    if (!secs) return '0:00';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    return `${mins}m`;
  };

  const formatSubject = (id) => {
    if (!id) return 'Nothing yet';
    const map = {
      'engmaths': 'Engineering Maths',
      'algorithms': 'Algorithms',
      'toc': 'Theory of Computation',
      'os': 'Operating Systems',
      'dbms': 'Database Management',
      'cn': 'Computer Networks',
      'ds': 'Data Structures',
      'aptitude': 'General Aptitude',
      'digital': 'Digital Logic',
      'coa': 'Computer Org & Arch',
      'compiler': 'Compiler Design'
    };
    return map[id] || id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // ── Loading / Offline states ────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center relative bg-background">
        {timedOut ? (
          <div className="flex flex-col items-center px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surfaceHighlight border border-white/10 flex items-center justify-center mb-5">
              <span className="text-2xl">{"\u{1F4F5}"}</span>
            </div>
            <p className="text-white font-bold text-lg tracking-tight">Can't reach {partnerName}</p>
            <p className="text-gray-500 text-sm mt-1.5">Check your internet connection</p>
            <button
              onClick={() => {
                triggerHaptic(ImpactStyle.Light);
                setTimedOut(false);
                setInternalStats(null);
              }}
              className="mt-7 px-6 py-2.5 rounded-full bg-surfaceHighlight border border-white/10 text-gray-300 text-sm font-semibold active:scale-95 transition-transform"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-surfaceHighlight border-t-primary rounded-full animate-spin" />
            <p className="text-gray-500 font-medium mt-6 tracking-widest uppercase text-xs">Connecting…</p>
          </div>
        )}
        <div className="absolute bottom-10 text-center w-full">
          <button onClick={handleVersionClick} className="text-[10px] text-gray-700 font-mono tracking-widest bg-transparent border-none focus:outline-none select-none">
            Model: M-v1.0.24
          </button>
        </div>
        {showVersionManager && <VersionManager onClose={() => setShowVersionManager(false)} />}
      </div>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────
  const isFocusing = !!stats.timerRunning;
  const todaySecs = stats.todayStudySeconds || 0;
  const streak = stats.streak || 0;

  let totalContentMins = 0;
  let totalLecturesDone = 0;
  let otherTopics = [];

  if (stats.subjects) {
    Object.entries(stats.subjects).forEach(([id, sub]) => {
      totalContentMins += (sub.todayCourseMins || 0);
      totalLecturesDone += (sub.completedToday?.length || 0);
      if (id !== stats.activeSubject && ((sub.todayStudySecs > 0) || (sub.completedToday?.length > 0))) {
        otherTopics.push(formatSubject(id));
      }
    });
  }

  // Dynamic contextual message — the "warmth" line per the plan
  const getContextMessage = () => {
    const hrs = todaySecs / 3600;
    if (isFocusing) {
      if (hrs >= 2) return 'Deep in it.';
      if (hrs < 0.5) return 'Just getting started.';
      return 'In the zone.';
    } else {
      if (hrs >= 3) return 'Earned the break.';
      if (hrs > 0) return 'Taking a breather.';
      return 'Not started yet.';
    }
  };

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full px-5 pt-10 pb-20 max-w-md mx-auto relative overflow-y-auto no-scrollbar bg-background">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-1">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Live Sync</h1>
          {isEditingName ? (
            <div className="flex items-center space-x-2 mt-2 bg-surfaceHighlight p-1 pl-3 rounded-full border border-primary/30 w-max">
              <span className="text-gray-400 text-xs">Connected to</span>
              <input
                autoFocus
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                className="bg-transparent text-white font-bold outline-none w-24 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button onClick={saveName} className="p-1 bg-primary text-black rounded-full">
                <Check size={12} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 mt-1.5 group cursor-pointer w-max" onClick={() => setIsEditingName(true)}>
              <p className="text-gray-400 text-xs font-medium">
                Connected to <span className="text-white font-bold">{partnerName}</span>
              </p>
              <Edit2 size={11} className="text-gray-600 group-hover:text-primary transition-colors" />
            </div>
          )}
        </div>

        {/* Live Status Pill */}
        <div className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full border transition-all duration-700 ease-in-out ${
          isFocusing
            ? 'bg-accent/15 border-accent/40 text-accent'
            : 'bg-surfaceHighlight border-white/5 text-gray-400'
        }`}>
          <span className={`w-2 h-2 rounded-full transition-colors duration-700 ease-in-out ${isFocusing ? 'bg-accent animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs font-bold tracking-widest uppercase transition-colors duration-700 ease-in-out">
            {isFocusing ? 'Focusing' : 'Away'}
          </span>
        </div>
      </div>

      {/* ── Hero: Breathing Avatar + Context ──────────────────────────────────── */}
      <div className="relative flex flex-col items-center py-8 mb-4">
        {/* Ambient glow — breathes when focusing */}
        <div className={`absolute inset-0 rounded-3xl transition-all duration-1000 ${
          isFocusing ? 'bg-accent/8 blur-2xl' : 'bg-transparent'
        }`} />

        {/* Avatar ring — pulses when focusing */}
        <div className="relative">
          {isFocusing && (
            <>
              <div className="absolute inset-0 rounded-3xl bg-accent/20 animate-ping rounded-[28px]" style={{ animationDuration: '2.5s' }} />
              <div className="absolute inset-0 rounded-3xl bg-accent/10 animate-ping rounded-[28px]" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
            </>
          )}
          <div className={`relative w-24 h-24 rounded-[28px] flex items-center justify-center text-5xl border-2 transition-all duration-700 ${
            isFocusing
              ? 'border-accent/60 bg-accent/10 shadow-lg shadow-accent/20'
              : 'border-white/10 bg-surfaceHighlight'
          }`}>
            {"\u{1F468}\u{200D}\u{1F4BB}"}
          </div>
          {isFocusing && (
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-accent rounded-full border-2 border-background animate-pulse" />
          )}
        </div>

        {/* Name + Context message */}
        <div className="mt-4 text-center relative z-10">
          <p className="text-white font-bold text-xl tracking-tight">
            {isFocusing ? `${partnerName} is studying` : `${partnerName} is away`}
          </p>
          <p className="text-gray-400 text-sm mt-1 font-medium">{getContextMessage()}</p>
        </div>
      </div>

      {/* ── Current Focus Banner ────────────────────────────────────────────────── */}
      <div className={`rounded-2xl px-5 py-4 mb-4 border transition-all duration-500 ${
        isFocusing
          ? 'bg-primary/10 border-primary/25'
          : 'bg-surfaceHighlight border-white/5'
      }`}>
        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">Currently Studying</p>
        <p className={`text-lg font-bold tracking-tight truncate ${isFocusing ? 'text-white' : 'text-gray-300'}`}>
          {formatSubject(stats.activeSubject)}
        </p>
      </div>

      {/* ── Stats Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Time in Moment</p>
          <p className="text-white font-mono font-bold text-lg leading-none">{formatTime(todaySecs)}</p>
        </div>
        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Content</p>
          <p className="text-white font-mono font-bold text-lg leading-none">{formatTime(totalContentMins * 60)}</p>
        </div>
        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Streak</p>
          <div className="flex items-center gap-1">
            <span className="text-base leading-none">{"\u{1F525}"}</span>
            <p className="text-white font-mono font-bold text-lg leading-none">{streak}</p>
          </div>
        </div>
      </div>

      {/* ── Other Topics Studied ─────────────────────────────────────────────── */}
      {otherTopics.length > 0 && (
        <div className="mb-4">
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2 px-1">Also studied today</p>
          <div className="flex flex-wrap gap-2">
            {otherTopics.map((topic, i) => (
              <span key={i} className="px-3 py-1.5 rounded-full bg-surfaceHighlight text-gray-300 text-xs font-medium border border-white/5">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer / Hidden Version Trigger ──────────────────────────────────── */}
      <div className="mt-auto pt-4 pb-6 flex flex-col items-center space-y-4 opacity-50">
        <button
          onClick={() => {
            if (window.confirm("Disconnect from partner?")) {
              localStorage.removeItem('study_buddy_room');
              window.location.reload();
            }
          }}
          className="text-xs text-red-400 font-medium tracking-wider uppercase border border-red-400/20 px-4 py-2 rounded-lg"
        >
          Disconnect
        </button>

        <div className="flex items-center space-x-1.5 opacity-60">
          <div className="w-1 h-1 rounded-full bg-primary" />
          <p className="text-[9px] font-bold text-white tracking-[0.2em] uppercase">Live Cloud Sync</p>
        </div>
        <button
          onClick={handleVersionClick}
          className="text-[10px] text-gray-500 font-mono tracking-widest bg-transparent border-none focus:outline-none select-none"
        >
          Model: M-v1.0.24
        </button>
      </div>

      {showVersionManager && <VersionManager onClose={() => setShowVersionManager(false)} />}
    </div>
  );
}
