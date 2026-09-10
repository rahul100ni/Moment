import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { Edit2, Check, Flame, Target, Trophy } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import VersionManager from './VersionManager';

const formatTime = (secs) => {
  if (!secs) return '0h 00m';
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
};

function ProgressRing({ percentage, colorClass, label, sublabel, isGlowing }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  // Ensure percentage is between 0 and 100
  const safePercentage = Math.min(100, Math.max(0, percentage));
  const offset = circumference - (safePercentage / 100) * circumference;
  
  return (
    <div className={`relative flex flex-col items-center transition-all duration-700 ${isGlowing ? 'scale-105' : 'scale-100'}`}>
      <div className="relative w-28 h-28 flex items-center justify-center mb-3">
        {/* Glow effect */}
        {isGlowing && (
          <div className={`absolute inset-0 rounded-full blur-xl opacity-30 ${colorClass.replace('text-', 'bg-')}`}></div>
        )}
        <svg className="w-full h-full transform -rotate-90 relative z-10">
          <circle cx="56" cy="56" r={radius} className="stroke-white/10" strokeWidth="8" fill="none" />
          <circle 
            cx="56" 
            cy="56" 
            r={radius} 
            className={`stroke-current ${colorClass} transition-all duration-1000 ease-in-out`} 
            strokeWidth="8" 
            fill="none" 
            strokeDasharray={circumference} 
            strokeDashoffset={offset} 
            strokeLinecap="round" 
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center z-20">
          <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-0.5">{sublabel}</span>
          <span className="text-lg font-bold text-white tracking-tight">{label}</span>
        </div>
      </div>
    </div>
  );
}

export default function LiveSyncTab() {
  const [roomMembers, setRoomMembers] = useState(null);
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
    let timeout;
    const roomId = localStorage.getItem('study_buddy_room');
    if (!roomId) return;
    
    const membersRef = ref(db, `rooms/${roomId}/members`);
    const unsubscribe = onValue(membersRef, (snapshot) => {
      clearTimeout(timeout);
      if (snapshot.exists()) {
        setRoomMembers(snapshot.val());
      } else {
        setRoomMembers(null);
      }
      setTimedOut(false);
    });
    timeout = setTimeout(() => setTimedOut(true), 10000);
    return () => { unsubscribe(); clearTimeout(timeout); };
  }, []);

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

  // ── Derived state ────────────────────────────────────────────────────────────
  const myId = localStorage.getItem('study_buddy_device_id');
  const partnerId = Object.keys(roomMembers || {}).find(id => id !== myId);
  
  const myStats = roomMembers?.[myId]?.liveStats || {};
  const partnerStats = roomMembers?.[partnerId]?.liveStats || {};

  const myFocusing = !!myStats.timerRunning;
  const partnerFocusing = !!partnerStats.timerRunning;
  const bothFocusing = myFocusing && partnerFocusing;

  const mySecs = myStats.todayStudySeconds || 0;
  const partnerSecs = partnerStats.todayStudySeconds || 0;
  const maxSecs = Math.max(mySecs, partnerSecs, 1); // Avoid division by 0
  
  const myTasks = myStats.completedTasks || 0;
  const partnerTasks = partnerStats.completedTasks || 0;

  const myStreak = myStats.streak || 0;
  const partnerStreak = partnerStats.streak || 0;

  // ── Loading / Offline states ────────────────────────────────────────────────
  if (!roomMembers) {
    return (
      <div className="flex flex-col h-full w-full items-center justify-center relative bg-background">
        {timedOut ? (
          <div className="flex flex-col items-center px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surfaceHighlight border border-white/10 flex items-center justify-center mb-5">
              <span className="text-2xl">📡</span>
            </div>
            <p className="text-white font-bold text-lg tracking-tight">Can't reach {partnerName}</p>
            <p className="text-gray-500 text-sm mt-1.5">Check your internet connection</p>
            <button
              onClick={() => {
                triggerHaptic(ImpactStyle.Light);
                setTimedOut(false);
                setRoomMembers(null);
              }}
              className="mt-7 px-6 py-2.5 rounded-full bg-surfaceHighlight border border-white/10 text-gray-300 text-sm font-semibold active:scale-95 transition-transform"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-surfaceHighlight border-t-primary rounded-full animate-spin" />
            <p className="text-gray-500 font-medium mt-6 tracking-widest uppercase text-xs">Syncing Space…</p>
          </div>
        )}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col h-full w-full px-5 pt-10 pb-20 max-w-md mx-auto relative overflow-y-auto no-scrollbar transition-colors duration-1000 ${bothFocusing ? 'bg-[#05100a]' : 'bg-background'}`}>
      
      {/* Background Breathing Glow when Both Focusing */}
      {bothFocusing && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden flex items-center justify-center">
          <div className="absolute w-[150%] h-[150%] bg-accent/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '4s' }}></div>
        </div>
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 px-1">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Co-Study Space</h1>
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
                  Partner: <span className="text-white font-bold">{partnerName}</span>
                </p>
                <Edit2 size={11} className="text-gray-600 group-hover:text-primary transition-colors" />
              </div>
            )}
          </div>

          {/* Joint Status Pill */}
          <div className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full border transition-all duration-700 ease-in-out ${
            bothFocusing
              ? 'bg-accent/15 border-accent/40 text-accent shadow-glow-accent'
              : myFocusing || partnerFocusing
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-surfaceHighlight border-white/5 text-gray-400'
          }`}>
            <span className={`w-2 h-2 rounded-full transition-colors duration-700 ease-in-out ${bothFocusing ? 'bg-accent animate-pulse' : (myFocusing || partnerFocusing) ? 'bg-primary animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs font-bold tracking-widest uppercase transition-colors duration-700 ease-in-out">
              {bothFocusing ? 'Locked In' : myFocusing ? 'You Focusing' : partnerFocusing ? 'Partner Focusing' : 'Away'}
            </span>
          </div>
        </div>

        {/* ── Today's Focus Rings ────────────────────────────────────────────── */}
        <div className="glass-panel rounded-3xl p-6 mb-4 relative overflow-hidden">
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-6 text-center">Today's Focus Velocity</p>
          <div className="flex justify-around items-end">
            <div className="flex flex-col items-center">
              <ProgressRing 
                percentage={(mySecs / maxSecs) * 100} 
                colorClass="text-primary" 
                label={formatTime(mySecs)} 
                sublabel="You"
                isGlowing={myFocusing}
              />
              {mySecs > partnerSecs && mySecs > 0 && <Trophy size={14} className="text-yellow-500 mt-3 animate-bounce" />}
            </div>

            <div className="w-px h-24 bg-white/5 mx-2"></div>

            <div className="flex flex-col items-center">
              <ProgressRing 
                percentage={(partnerSecs / maxSecs) * 100} 
                colorClass="text-accent" 
                label={formatTime(partnerSecs)} 
                sublabel={partnerName}
                isGlowing={partnerFocusing}
              />
              {partnerSecs > mySecs && partnerSecs > 0 && <Trophy size={14} className="text-yellow-500 mt-3 animate-bounce" />}
            </div>
          </div>
        </div>

        {/* ── Tasks & Streaks ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          
          {/* Tasks Completed Bar */}
          <div className="glass-panel rounded-3xl p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Target size={16} className="text-blue-400" />
              <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Tasks Done</p>
            </div>
            
            <div className="space-y-4 mt-auto">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-300 font-medium">You</span>
                  <span className="text-white font-bold">{myTasks}</span>
                </div>
                <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (myTasks / Math.max(1, Math.max(myTasks, partnerTasks))) * 100)}%` }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-gray-300 font-medium">{partnerName}</span>
                  <span className="text-white font-bold">{partnerTasks}</span>
                </div>
                <div className="w-full bg-background rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (partnerTasks / Math.max(1, Math.max(myTasks, partnerTasks))) * 100)}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Co-Study Streaks */}
          <div className="glass-panel rounded-3xl p-5 flex flex-col items-center justify-center text-center relative overflow-hidden">
            {bothFocusing && <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-50"></div>}
            <Flame size={24} className={`${bothFocusing ? 'text-orange-500 animate-pulse' : 'text-gray-500'} mb-2`} />
            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">Co-Study Streak</p>
            <div className="flex items-end gap-1">
              <span className="text-3xl font-black text-white">{Math.min(myStreak, partnerStreak)}</span>
              <span className="text-gray-500 font-medium text-sm mb-1">days</span>
            </div>
            {myStreak !== partnerStreak && (
              <p className="text-[9px] text-gray-500 mt-2 font-medium">
                (You: {myStreak} | {partnerName}: {partnerStreak})
              </p>
            )}
          </div>
        </div>

        {/* ── Footer / Hidden Version Trigger ──────────────────────────────────── */}
        <div className="mt-8 pt-4 pb-6 flex flex-col items-center space-y-4 opacity-50">
          <button
            onClick={() => {
              if (window.confirm("Disconnect from partner?")) {
                localStorage.removeItem('study_buddy_room');
                window.location.reload();
              }
            }}
            className="text-xs text-red-400 font-medium tracking-wider uppercase border border-red-400/20 px-4 py-2 rounded-lg active:scale-95 transition-transform"
          >
            Leave Room
          </button>

          <div className="flex items-center space-x-1.5 opacity-60">
            <div className="w-1 h-1 rounded-full bg-primary" />
            <p className="text-[9px] font-bold text-white tracking-[0.2em] uppercase">Multiplayer Sync Active</p>
          </div>
          <button
            onClick={handleVersionClick}
            className="text-[10px] text-gray-500 font-mono tracking-widest bg-transparent border-none focus:outline-none select-none"
          >
            Model: Moment-v2.0.0
          </button>
        </div>

        {showVersionManager && <VersionManager onClose={() => setShowVersionManager(false)} />}
      </div>
    </div>
  );
}
