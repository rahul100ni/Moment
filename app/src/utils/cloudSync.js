import { 
  signInAnonymously, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  linkWithPopup, 
  signInWithPopup, 
  signOut 
} from 'firebase/auth';
import { ref, set, get, serverTimestamp } from 'firebase/database';
import { auth, db } from '../firebase';

const LAST_BACKUP_KEY = 'study_buddy_last_backup_ts';

/**
 * Initialize persistent authentication.
 * Automatically signs the user in anonymously if they aren't logged in.
 */
export function initAuth(onUserChange) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (typeof onUserChange === 'function') onUserChange(user);
    } else {
      // Zero-friction anonymous sign-in
      signInAnonymously(auth).catch((err) => {
        console.warn('[CloudSync] Silent anonymous sign-in error:', err);
      });
    }
  });
}

/**
 * Upgrade anonymous account to permanent Google account.
 */
export async function linkGoogleAccount(currentUser) {
  const provider = new GoogleAuthProvider();
  try {
    if (currentUser && currentUser.isAnonymous) {
      const result = await linkWithPopup(currentUser, provider);
      return { success: true, user: result.user };
    } else {
      const result = await signInWithPopup(auth, provider);
      return { success: true, user: result.user };
    }
  } catch (err) {
    // If credential already in use by another account, sign into that account directly
    if (err.code === 'auth/credential-already-in-use') {
      const result = await signInWithPopup(auth, provider);
      return { success: true, user: result.user, existingAccount: true };
    }
    console.error('[CloudSync] Google linking error:', err);
    throw err;
  }
}

/**
 * Sign out of current account and revert to anonymous
 */
export async function signOutUser() {
  await signOut(auth);
  await signInAnonymously(auth);
}

/**
 * Back up local study history, tasks, and preferences to Firebase.
 */
export async function backupUserData(uid) {
  if (!uid) return { success: false, error: 'No UID provided' };

  try {
    const rawHistory  = localStorage.getItem('study_buddy_history');
    const rawTasks    = localStorage.getItem('study_buddy_tasks');
    const rawStats    = localStorage.getItem('study_buddy_stats');
    const rawSettings = localStorage.getItem('focusSettings');
    const rawRoom     = localStorage.getItem('study_buddy_room');

    const backupPayload = {
      updatedAt: Date.now(),
      history:  rawHistory  ? JSON.parse(rawHistory)  : [],
      tasks:    rawTasks    ? JSON.parse(rawTasks)    : [],
      stats:    rawStats    ? JSON.parse(rawStats)    : null,
      settings: rawSettings ? JSON.parse(rawSettings) : null,
      room:     rawRoom || null,
      clientVersion: 'Moment-v2.0.0',
    };

    const backupRef = ref(db, `users/${uid}/backup`);
    await set(backupRef, backupPayload);

    const now = Date.now();
    localStorage.setItem(LAST_BACKUP_KEY, now.toString());

    return { success: true, timestamp: now };
  } catch (err) {
    console.error('[CloudSync] Backup error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch and restore backup from Firebase to local device.
 */
export async function restoreUserData(uid) {
  if (!uid) return { success: false, error: 'No UID provided' };

  try {
    const backupRef = ref(db, `users/${uid}/backup`);
    const snapshot = await get(backupRef);

    if (!snapshot.exists()) {
      return { success: false, error: 'No cloud backup found for this account.' };
    }

    const data = snapshot.val();

    if (Array.isArray(data.history) && data.history.length > 0) {
      localStorage.setItem('study_buddy_history', JSON.stringify(data.history));
    }
    if (Array.isArray(data.tasks)) {
      localStorage.setItem('study_buddy_tasks', JSON.stringify(data.tasks));
    }
    if (data.stats) {
      localStorage.setItem('study_buddy_stats', JSON.stringify(data.stats));
    }
    if (data.settings) {
      localStorage.setItem('focusSettings', JSON.stringify(data.settings));
    }
    if (data.room) {
      localStorage.setItem('study_buddy_room', data.room);
    }

    return { 
      success: true, 
      restoredAt: data.updatedAt || Date.now(),
      historyCount: data.history ? data.history.length : 0,
      tasksCount: data.tasks ? data.tasks.length : 0
    };
  } catch (err) {
    console.error('[CloudSync] Restore error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get timestamp of the last successful backup.
 */
export function getLastBackupTime() {
  try {
    const val = localStorage.getItem(LAST_BACKUP_KEY);
    return val ? parseInt(val, 10) : null;
  } catch {
    return null;
  }
}
