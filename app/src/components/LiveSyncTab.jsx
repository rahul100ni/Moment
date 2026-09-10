import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { Edit2, Check, Users, Copy, CheckCheck, LogOut, Flame, Sparkles } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import VersionManager from './VersionManager';

export default function LiveSyncTab({ roomId, roomMembers, partnerStats, isPartnerStudying, onConnectPartner }) {
  const [internalStats, setInternalStats] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const [partnerName, setPartnerName] = useState(() => localStorage.getItem('study_buddy_partner_name') || 'Partner');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(partnerName);
  const [copiedCode, setCopiedCode] = useState(false);

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

  const currentRoom = roomId || localStorage.getItem('study_buddy_room');
  const myId = localStorage.getItem('study_buddy_device_id');

  // Fallback direct room listener if roomMembers wasn't passed down
  const [fallbackMembers, setFallbackMembers] = useState(null);
  useEffect(() => {
    if (roomMembers || !currentRoom || currentRoom === 'solo') return;
    let timeout;
    const membersRef = ref(db, `rooms/${currentRoom}/members`);
    const unsubscribe = onValue(membersRef, (snapshot) => {
      clearTimeout(timeout);
      if (snapshot.exists()) {
        const members = snapshot.val();
        setFallbackMembers(members);
        const partnerId = Object.keys(members).find(id => id !== myId);
        if (partnerId && members[partnerId]?.liveStats) {
          setInternalStats(members[partnerId].liveStats);
        } else {
          setInternalStats(null);
        }
      } else {
        setFallbackMembers(null);
        setInternalStats(null);
      }
      setTimedOut(false);
    });
    timeout = setTimeout(() => setTimedOut(true), 10000);
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [roomMembers, currentRoom, myId]);

  const activeMembers = roomMembers || fallbackMembers;
  const stats = partnerStats || internalStats;
  const memberCount = activeMembers ? Object.keys(activeMembers).length : 0;
  const myStats = activeMembers?.[myId]?.liveStats || {};

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

  const handleCopyCode = async () => {
    triggerHaptic(ImpactStyle.Medium);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentRoom);
      }
    } catch (_) {}
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleDisconnect = () => {
    triggerHaptic(ImpactStyle.Heavy);
    if (window.confirm("Leave this study room?")) {
      localStorage.removeItem('study_buddy_room');
      if (onConnectPartner) {
        onConnectPartner();
      } else {
        window.location.reload();
      }
    }
  };

  const formatTime = (secs) => {
    if (!secs) return '0:00';
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    return `${mins}m`;
  };

  const formatSubject = (id) => {
    if (!id) return null;
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

  // ── STATE 1: SOLO MODE ────────────────────────────────────────────────────────
  if (!currentRoom || currentRoom === 'solo') {
    return (
      <div className="flex flex-col h-full w-full px-5 pt-10 pb-20 max-w-md mx-auto relative overflow-y-auto no-scrollbar bg-background">
        <div className="flex items-center justify-between mb-8 px-1">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Live Sync</h1>
            <p className="text-gray-400 text-xs mt-1">Multiplayer Deep Work</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surfaceHighlight border border-white/10 text-gray-400">
            Solo Session
          </span>
        </div>

        {/* Connect Partner Card */}
        <div className="glass-panel rounded-3xl p-6 mb-6 relative overflow-hidden border border-primary/20">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center mb-4">
            <Users className="text-primary w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-1.5">Deep Work Is Better Together</h2>
          <p className="text-gray-400 text-xs leading-relaxed mb-6">
            Pair with a friend or study buddy to unlock synchronized live timers, mutual focus velocity, and shared streaks.
          </p>
          <button
            onClick={() => {
              triggerHaptic(ImpactStyle.Medium);
              if (onConnectPartner) onConnectPartner();
            }}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-bold text-xs tracking-wider uppercase shadow-glow shadow-primary/30 active:scale-98 transition-all flex items-center justify-center gap-2"
          >
            <Users size={16} />
            Connect with a Partner
          </button>
        </div>

        {/* Solo Focus Stats preview */}
        <div className="glass-panel rounded-2xl p-5 mb-4">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-3">Your Focus Today</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Time in Moment</p>
              <p className="text-white font-mono font-bold text-xl mt-0.5">
                {formatTime(JSON.parse(localStorage.getItem('study_buddy_stats') || '{}').todaySeconds || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Tasks Completed</p>
              <p className="text-white font-mono font-bold text-xl mt-0.5">
                {JSON.parse(localStorage.getItem('study_buddy_tasks') || '[]').filter(t => t.done).length}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4 pb-6 flex flex-col items-center space-y-4 opacity-40">
          <div className="flex items-center space-x-1.5">
            <div className="w-1 h-1 rounded-full bg-primary" />
            <p className="text-[9px] font-bold text-white tracking-[0.2em] uppercase">Moment Engine Active</p>
          </div>
          <button onClick={handleVersionClick} className="text-[10px] text-gray-500 font-mono tracking-widest bg-transparent border-none focus:outline-none select-none">
            Model: M-v2.0.0
          </button>
        </div>

        {showVersionManager && <VersionManager onClose={() => setShowVersionManager(false)} />}
      </div>
    );
  }

  // ── STATE 2: WAITING FOR PARTNER TO JOIN ──────────────────────────────────────
  if (memberCount < 2) {
    return (
      <div className="flex flex-col h-full w-full px-5 pt-10 pb-20 max-w-md mx-auto relative overflow-y-auto no-scrollbar bg-background">
        <div className="flex items-center justify-between mb-8 px-1">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Live Sync</h1>
            <p className="text-gray-400 text-xs mt-1">Conjoined Space</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 border border-primary/30 text-primary animate-pulse">
            Waiting for Partner
          </span>
        </div>

        <div className="glass-panel rounded-3xl p-6 mb-6 flex flex-col items-center text-center relative overflow-hidden border border-white/10">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-3">Room Code</p>
          <div className="bg-surfaceHighlight px-6 py-3.5 rounded-2xl border border-white/10 mb-4 flex items-center gap-3">
            <span className="font-mono text-3xl font-bold text-white tracking-widest">{currentRoom}</span>
            <button
              onClick={handleCopyCode}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 active:scale-90 transition-transform"
              title="Copy Code"
            >
              {copiedCode ? <CheckCheck size={18} className="text-accent" /> : <Copy size={18} />}
            </button>
          </div>

          <p className="text-gray-400 text-xs max-w-xs leading-relaxed mb-6">
            Share this 6-digit code with your partner. When they enter it in Moment, your dashboards will immediately conjoin in real time.
          </p>

          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
            <span>Listening for partner connection...</span>
          </div>
        </div>

        <div className="mt-auto pt-4 pb-6 flex flex-col items-center space-y-4">
          <button
            onClick={handleDisconnect}
            className="text-xs text-red-400/80 hover:text-red-400 font-medium tracking-wider uppercase border border-red-500/20 px-4 py-2.5 rounded-xl active:scale-95 transition-all flex items-center gap-1.5"
          >
            <LogOut size={13} />
            Cancel Room
          </button>
        </div>
      </div>
    );
  }

  // ── STATE 3: FULL CONJOINED DASHBOARD (PAIRED) ────────────────────────────────
  const isFocusing = !!stats?.timerRunning;
  const isMeFocusing = !!myStats?.timerRunning;
  const bothFocusing = isFocusing && isMeFocusing;

  const todaySecs = stats?.todayStudySeconds || 0;
  const streak = stats?.streak || 0;
  const partnerTasksDone = stats?.completedTasks || 0;
  const partnerTasksTotal = stats?.totalTasks || 0;

  const myTodaySecs = myStats?.todayStudySeconds || (JSON.parse(localStorage.getItem('study_buddy_stats') || '{}').todaySeconds || 0);
  const myTasksDone = JSON.parse(localStorage.getItem('study_buddy_tasks') || '[]').filter(t => t.done).length;

  const activeTask = stats?.activeTask || formatSubject(stats?.activeSubject) || (isFocusing ? 'Deep Focus Session' : 'Resting');

  // Dynamic contextual quote
  const getContextMessage = () => {
    const hrs = todaySecs / 3600;
    if (isFocusing) {
      if (hrs >= 3) return 'Locked in unbreakable flow.';
      if (hrs >= 1.5) return 'Deep in the zone.';
      if (hrs < 0.5) return 'Just started a focus block.';
      return 'In the zone.';
    } else {
      if (hrs >= 3) return 'Well-earned rest.';
      if (hrs > 0) return 'Taking a breather.';
      return 'Not started yet today.';
    }
  };

  // Co-study focus split calculation
  const totalFocusSecs = myTodaySecs + todaySecs;
  const mySplitPercent = totalFocusSecs > 0 ? Math.round((myTodaySecs / totalFocusSecs) * 100) : 50;
  const partnerSplitPercent = 100 - mySplitPercent;

  return (
    <div className="flex flex-col h-full w-full px-5 pt-10 pb-20 max-w-md mx-auto relative overflow-y-auto no-scrollbar bg-background">
      
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6 px-1">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Live Sync</h1>
          {isEditingName ? (
            <div className="flex items-center space-x-2 mt-2 bg-surfaceHighlight p-1 pl-3 rounded-full border border-primary/30 w-max">
              <span className="text-gray-400 text-xs">Partner:</span>
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
          bothFocusing
            ? 'bg-accent/15 border-accent/40 text-accent shadow-glow shadow-accent/20'
            : isFocusing
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'bg-surfaceHighlight border-white/5 text-gray-400'
        }`}>
          <span className={`w-2 h-2 rounded-full transition-colors duration-700 ease-in-out ${isFocusing ? 'bg-accent animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-[10px] font-bold tracking-widest uppercase transition-colors duration-700 ease-in-out">
            {bothFocusing ? 'Both Locked In' : isFocusing ? 'Focusing' : 'Away'}
          </span>
        </div>
      </div>

      {/* ── Hero: The Iconic Signature Squircle Avatar ────────────────────────── */}
      <div className="relative flex flex-col items-center py-6 mb-3">
        {/* Ambient glow */}
        <div className={`absolute inset-0 rounded-3xl transition-all duration-1000 ${
          bothFocusing 
            ? 'bg-accent/10 blur-3xl' 
            : isFocusing 
              ? 'bg-accent/8 blur-2xl' 
              : 'bg-transparent'
        }`} />

        {/* Avatar squircle ring */}
        <div className="relative">
          {isFocusing && (
            <>
              <div className="absolute inset-0 rounded-[28px] bg-accent/20 animate-ping" style={{ animationDuration: '2.5s' }} />
              <div className="absolute inset-0 rounded-[28px] bg-accent/10 animate-ping" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }} />
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
        <div className="mt-3.5 text-center relative z-10">
          <p className="text-white font-bold text-xl tracking-tight">
            {isFocusing ? `${partnerName} is studying` : `${partnerName} is away`}
          </p>
          <p className="text-gray-400 text-sm mt-1 font-medium">{getContextMessage()}</p>
        </div>

        {/* Synchronized Aura Pill when both in the zone */}
        {bothFocusing && (
          <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-[11px] font-semibold animate-pulse">
            <Sparkles size={12} />
            <span>Synchronized Flow — Both In Deep Work</span>
          </div>
        )}
      </div>

      {/* ── Active Task / Subject Banner ──────────────────────────────────────── */}
      <div className={`rounded-2xl px-5 py-3.5 mb-4 border transition-all duration-500 ${
        isFocusing
          ? 'bg-primary/10 border-primary/25'
          : 'bg-surfaceHighlight border-white/5'
      }`}>
        <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-1">
          {isFocusing ? 'Currently Focusing On' : 'Last Focus Focus'}
        </p>
        <p className={`text-base font-semibold tracking-tight truncate ${isFocusing ? 'text-white' : 'text-gray-300'}`}>
          {activeTask}
        </p>
      </div>

      {/* ── Co-Study Velocity Split Track (Linear Style) ──────────────────────── */}
      <div className="glass-panel rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-500 text-[9px] font-bold uppercase tracking-widest">Focus Velocity Split</span>
          <span className="text-[10px] font-mono text-gray-400 font-medium">
            {myTodaySecs > todaySecs
              ? `You lead by ${formatTime(myTodaySecs - todaySecs)}`
              : todaySecs > myTodaySecs
                ? `${partnerName} leads by ${formatTime(todaySecs - myTodaySecs)}`
                : 'Evenly Matched'}
          </span>
        </div>

        {/* Minimalist Split Progress Bar */}
        <div className="w-full h-2 bg-surfaceHighlight rounded-full overflow-hidden flex">
          <div 
            className="bg-primary h-full transition-all duration-700 ease-out" 
            style={{ width: `${mySplitPercent}%` }}
            title={`You: ${mySplitPercent}%`}
          />
          <div 
            className="bg-accent h-full transition-all duration-700 ease-out" 
            style={{ width: `${partnerSplitPercent}%` }}
            title={`${partnerName}: ${partnerSplitPercent}%`}
          />
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between text-xs mt-2.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-gray-300 font-medium">You:</span>
            <span className="text-white font-mono font-bold">{formatTime(myTodaySecs)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <span className="text-gray-300 font-medium">{partnerName}:</span>
            <span className="text-white font-mono font-bold">{formatTime(todaySecs)}</span>
          </div>
        </div>
      </div>

      {/* ── Side-by-Side Metric Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Partner Time</p>
          <p className="text-white font-mono font-bold text-lg leading-none">{formatTime(todaySecs)}</p>
        </div>

        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Tasks Done</p>
          <div className="flex items-baseline gap-1">
            <p className="text-white font-mono font-bold text-lg leading-none">{partnerTasksDone}</p>
            <span className="text-gray-500 text-xs font-mono">/ {partnerTasksTotal}</span>
          </div>
        </div>

        <div className="bg-surfaceHighlight rounded-2xl p-4 border border-white/5 flex flex-col">
          <p className="text-gray-500 text-[9px] font-bold uppercase tracking-widest mb-2">Streak</p>
          <div className="flex items-center gap-1">
            <Flame size={16} className="text-orange-400 leading-none flex-shrink-0" />
            <p className="text-white font-mono font-bold text-lg leading-none">{streak}</p>
          </div>
        </div>
      </div>

      {/* ── Footer / Hidden Version Trigger ──────────────────────────────────── */}
      <div className="mt-auto pt-4 pb-6 flex flex-col items-center space-y-4 opacity-50">
        <button
          onClick={handleDisconnect}
          className="text-xs text-red-400 font-medium tracking-wider uppercase border border-red-400/20 px-4 py-2 rounded-lg active:scale-95 transition-transform"
        >
          Leave Room
        </button>

        <div className="flex items-center space-x-1.5 opacity-60">
          <div className="w-1 h-1 rounded-full bg-primary" />
          <p className="text-[9px] font-bold text-white tracking-[0.2em] uppercase">Live Cloud Sync</p>
        </div>
        <button
          onClick={handleVersionClick}
          className="text-[10px] text-gray-500 font-mono tracking-widest bg-transparent border-none focus:outline-none select-none"
        >
          Model: M-v2.0.0
        </button>
      </div>

      {showVersionManager && <VersionManager onClose={() => setShowVersionManager(false)} />}
    </div>
  );
}
