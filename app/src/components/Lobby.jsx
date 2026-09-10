import { useState, useEffect } from 'react';
import { Users, Plus, LogIn, ArrowRight, ChevronLeft, Loader2, Link2 } from 'lucide-react';
import { ref, set, get, update, onValue, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export default function Lobby({ onPairSuccess }) {
  const [view, setView] = useState('select'); // 'select' | 'create' | 'join'
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Initialize Local Device ID
  const [deviceId] = useState(() => {
    let id = localStorage.getItem('study_buddy_device_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'dev_' + Date.now() + Math.random().toString(36).substring(2);
      localStorage.setItem('study_buddy_device_id', id);
    }
    return id;
  });

  const triggerHaptic = (style = ImpactStyle.Light) => {
    try { Haptics.impact({ style }); } catch (_) {}
  };

  // CREATE ROOM LOGIC
  const handleCreateClick = async () => {
    triggerHaptic(ImpactStyle.Medium);
    setError('');
    
    // Generate 6 digit code (e.g., 839-204)
    const rawNum = Math.floor(100000 + Math.random() * 900000).toString();
    const formattedCode = `${rawNum.substring(0, 3)}-${rawNum.substring(3, 6)}`;
    setRoomCode(formattedCode);
    setView('create');

    // Create Firebase Node
    const roomRef = ref(db, `rooms/${formattedCode}`);
    await set(roomRef, {
      createdAt: serverTimestamp(),
      members: {
        [deviceId]: {
          role: 'creator',
          joinedAt: serverTimestamp(),
          liveStats: { timerRunning: false }
        }
      }
    });
  };

  // Listen for partner joining if we are in 'create' view
  useEffect(() => {
    if (view === 'create' && roomCode) {
      const membersRef = ref(db, `rooms/${roomCode}/members`);
      const unsubscribe = onValue(membersRef, (snapshot) => {
        if (snapshot.exists()) {
          const members = snapshot.val();
          if (Object.keys(members).length >= 2) {
            triggerHaptic(ImpactStyle.Heavy);
            onPairSuccess(roomCode);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [view, roomCode, onPairSuccess]);

  // JOIN ROOM LOGIC
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const code = joinInput.trim().replace(/[^0-9-]/g, '');
    
    if (!/^\d{3}-\d{3}$/.test(code)) {
      setError('Code must be format XXX-XXX');
      triggerHaptic(ImpactStyle.Light);
      return;
    }

    setIsJoining(true);
    triggerHaptic(ImpactStyle.Medium);

    try {
      const roomRef = ref(db, `rooms/${code}`);
      const snapshot = await get(roomRef);
      
      if (!snapshot.exists()) {
        setError('Room not found. Check your code.');
        triggerHaptic(ImpactStyle.Heavy);
        setIsJoining(false);
        return;
      }

      const roomData = snapshot.val();
      const membersCount = roomData.members ? Object.keys(roomData.members).length : 0;

      if (membersCount >= 2 && !roomData.members[deviceId]) {
        setError('This room is already full (2/2).');
        triggerHaptic(ImpactStyle.Heavy);
        setIsJoining(false);
        return;
      }

      // Join the room
      await update(ref(db, `rooms/${code}/members/${deviceId}`), {
        role: 'partner',
        joinedAt: serverTimestamp(),
        liveStats: { timerRunning: false }
      });

      triggerHaptic(ImpactStyle.Heavy);
      onPairSuccess(code);

    } catch (err) {
      setError('Connection error. Try again.');
      setIsJoining(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-background relative overflow-hidden items-center justify-center p-6">
      
      {/* Background Decorative Blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* Header Header */}
        <div className="mb-10 flex flex-col items-center animate-tab-in">
          <div className="w-16 h-16 rounded-2xl bg-surfaceHighlight border border-white/10 flex items-center justify-center mb-4 shadow-glow">
            <Link2 className="text-primary w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 text-center">Moment</h1>
          <p className="text-gray-400 text-center text-sm px-4">
            A synchronized deep-work space for you and your study partner.
          </p>
        </div>

        {/* =========================================
            VIEW 1: SELECT
        ========================================= */}
        {view === 'select' && (
          <div className="w-full space-y-4 animate-tab-in">
            <button 
              onClick={handleCreateClick}
              className="w-full glass-panel relative overflow-hidden group p-5 rounded-2xl flex items-center gap-4 transition-all active:scale-95"
            >
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors"></div>
              <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center flex-shrink-0">
                <Plus strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-white font-semibold text-lg">Create a Room</h3>
                <p className="text-gray-400 text-xs mt-0.5">Generate a code to invite someone</p>
              </div>
            </button>

            <button 
              onClick={() => { triggerHaptic(); setView('join'); }}
              className="w-full glass-panel relative overflow-hidden group p-5 rounded-2xl flex items-center gap-4 transition-all active:scale-95"
            >
              <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors"></div>
              <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center flex-shrink-0">
                <LogIn strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-white font-semibold text-lg">Join a Partner</h3>
                <p className="text-gray-400 text-xs mt-0.5">Enter a 6-digit code</p>
              </div>
            </button>
          </div>
        )}

        {/* =========================================
            VIEW 2: CREATE ROOM (WAITING)
        ========================================= */}
        {view === 'create' && (
          <div className="w-full flex flex-col items-center animate-tab-in">
            <p className="text-gray-400 text-sm mb-3">Your Room Code</p>
            <div className="glass-panel px-8 py-4 rounded-2xl mb-8 relative">
              <div className="absolute inset-0 border border-primary/30 rounded-2xl animate-pulse"></div>
              <h2 className="text-4xl font-mono tracking-widest text-white font-bold">{roomCode}</h2>
            </div>
            
            <div className="flex items-center gap-3 text-primary mb-12">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium tracking-wide">Waiting for partner...</span>
            </div>

            <button 
              onClick={() => { triggerHaptic(); setView('select'); }}
              className="text-gray-500 text-sm font-medium py-2 px-4 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* =========================================
            VIEW 3: JOIN ROOM
        ========================================= */}
        {view === 'join' && (
          <form onSubmit={handleJoinSubmit} className="w-full flex flex-col items-center animate-tab-in">
            <div className="w-full mb-6">
              <label className="text-gray-400 text-xs uppercase font-bold tracking-wider mb-2 block ml-1">Room Code</label>
              <div className="glass-panel p-2 rounded-xl flex items-center">
                <input 
                  type="text" 
                  value={joinInput}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9-]/g, '');
                    // Auto-insert hyphen
                    if (val.length === 3 && joinInput.length < val.length && !val.includes('-')) {
                      val += '-';
                    }
                    if (val.length <= 7) setJoinInput(val);
                  }}
                  placeholder="XXX-XXX"
                  className="bg-transparent w-full px-4 py-3 text-2xl font-mono text-center tracking-widest text-white placeholder-gray-600 outline-none"
                  autoFocus
                />
              </div>
              {error && <p className="text-red-400 text-xs mt-2 ml-1 animate-tab-in">{error}</p>}
            </div>

            <button 
              type="submit"
              disabled={isJoining || joinInput.length !== 7}
              className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                joinInput.length === 7 && !isJoining
                  ? 'bg-primary text-white shadow-glow'
                  : 'bg-surfaceHighlight text-gray-500 cursor-not-allowed'
              }`}
            >
              {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {isJoining ? 'Joining...' : 'Enter Room'}
            </button>

            <button 
              type="button"
              onClick={() => { triggerHaptic(); setView('select'); setError(''); setJoinInput(''); }}
              className="mt-6 flex items-center gap-1 text-gray-500 text-sm font-medium hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
