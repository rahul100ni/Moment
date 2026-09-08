import React, { useState, useEffect } from 'react';
import { HelpCircle, ChevronLeft, Download, Plus, Trash2, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { ref, onValue, push, remove, update } from 'firebase/database';
import { db } from '../firebase';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch {
    return '—';
  }
}

// Inline editable card for a single version entry
function VersionCard({ ver, isAdmin, isDownloading, onInstall, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ version: ver.version, description: ver.description || '', url: ver.url || '' });

  useEffect(() => {
    setDraft({ version: ver.version, description: ver.description || '', url: ver.url || '' });
  }, [ver.version, ver.description, ver.url]);

  const handleSave = async () => {
    if (!draft.version || !draft.url) return;
    const verRef = ref(db, `system/versions/${ver.id}`);
    await update(verRef, {
      version: draft.version,
      description: draft.description,
      url: draft.url,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft({ version: ver.version, description: ver.description || '', url: ver.url || '' });
    setEditing(false);
  };

  return (
    <div className="bg-surface/60 rounded-2xl p-4 border border-white/5 relative overflow-hidden flex flex-col shadow-lg">
      {editing ? (
        /* ── Edit mode ── */
        <div className="flex flex-col gap-2">
          <input
            value={draft.version}
            onChange={e => setDraft(d => ({ ...d, version: e.target.value }))}
            placeholder="Version (e.g. v1.2.0)"
            className="w-full bg-background p-2.5 rounded-xl text-white text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <input
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            placeholder="Description / Changes"
            className="w-full bg-background p-2.5 rounded-xl text-white text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <input
            value={draft.url}
            onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
            placeholder="Direct APK URL"
            className="w-full bg-background p-2.5 rounded-xl text-white text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-black font-bold py-2.5 rounded-xl text-sm"
            >
              <Check size={14} /> Save
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 flex items-center justify-center gap-1.5 bg-surfaceHighlight border border-white/10 text-gray-300 font-semibold py-2.5 rounded-xl text-sm"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <>
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white tracking-tight">{ver.version}</h3>
              {ver.description ? (
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{ver.description}</p>
              ) : null}
              {/* Date */}
              <p className="text-xs text-gray-600 mt-1.5 font-medium">{formatDate(ver.date)}</p>
            </div>

            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              <button
                onClick={() => window.open(ver.url, '_system')}
                className="text-gray-500 hover:text-white p-2 transition-colors"
                title="Open in browser"
              >
                <ExternalLink size={14} />
              </button>
              {isAdmin && (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="text-gray-400 hover:text-primary p-2 transition-colors"
                    title="Edit this entry"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(ver.id)}
                    className="text-red-400 hover:text-red-300 p-2 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          <button
            onClick={() => onInstall(ver)}
            disabled={isDownloading}
            className="mt-3 w-full bg-surfaceHighlight hover:bg-white/10 border border-white/10 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            <span>Install Release</span>
          </button>
        </>
      )}
    </div>
  );
}

export default function VersionManager({ onClose }) {
  const [versions, setVersions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [helpTapCount, setHelpTapCount] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Admin form state
  const [newVersion, setNewVersion] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    setTimedOut(false);
    setError(null);
    let timeout;
    const versionsRef = ref(db, 'system/versions');
    const unsubscribe = onValue(versionsRef, (snapshot) => {
      clearTimeout(timeout);
      setIsLoading(false);
      setTimedOut(false);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const parsed = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).reverse(); // newest first
        setVersions(parsed);
      } else {
        setVersions([]);
      }
    }, (err) => {
      clearTimeout(timeout);
      setIsLoading(false);
      setError(err.message);
    });

    timeout = setTimeout(() => {
      setTimedOut(true);
      setIsLoading(false);
    }, 10000);

    return () => { unsubscribe(); clearTimeout(timeout); };
  }, [retryTrigger]);

  const handleHelpClick = () => {
    const newCount = helpTapCount + 1;
    setHelpTapCount(newCount);
    if (newCount >= 5) {
      setIsAdmin(true);
      setHelpTapCount(0);
      setShowHelp(false);
    } else {
      setShowHelp(prev => !prev);
    }
  };

  const downloadAndInstall = async (version) => {
    if (!version.url) return;
    try {
      setIsDownloading(true);
      const fileName = `Moment_${version.version.replace(/[^a-zA-Z0-9]/g, '_')}.apk`;
      const downloadResult = await Filesystem.downloadFile({
        url: version.url,
        path: fileName,
        directory: Directory.Cache
      });
      if (downloadResult.path) {
        await FileOpener.openFile({
          path: downloadResult.path,
          mimeType: 'application/vnd.android.package-archive'
        });
      }
    } catch (err) {
      console.error('Install Error:', err);
      alert('Failed to download or open APK. Ensure storage permissions are granted.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAddVersion = () => {
    if (!newVersion || !newUrl) return;
    const versionsRef = ref(db, 'system/versions');
    push(versionsRef, {
      version: newVersion,
      description: newDesc,
      url: newUrl,
      date: new Date().toISOString()
    });
    setNewVersion('');
    setNewDesc('');
    setNewUrl('');
  };

  const handleDelete = (id) => {
    remove(ref(db, `system/versions/${id}`));
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col h-full w-full px-5 py-8 overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <button onClick={onClose} className="p-2 bg-surfaceHighlight rounded-full text-white">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-white tracking-tight">Version Manager</h1>
        <button onClick={handleHelpClick} className="p-2 text-gray-400 focus:outline-none select-none">
          <HelpCircle size={24} />
        </button>
      </div>

      {showHelp && (
        <div className="bg-surfaceHighlight border border-white/10 rounded-2xl px-4 py-3 mb-4 flex items-start gap-3">
          <span className="text-base mt-0.5">{'ℹ️'}</span>
          <p className="text-gray-300 text-sm leading-relaxed">
            View and install different versions of Moment. Tap a version card to download and update.
          </p>
        </div>
      )}

      {/* Admin: Add Release panel */}
      {isAdmin && (
        <div className="bg-surfaceHighlight/50 border border-primary/30 p-4 rounded-2xl mb-6">
          <h2 className="text-primary font-bold mb-3 flex items-center gap-1.5">
            <Plus size={16} /> Admin: Add Release
          </h2>
          <input
            placeholder="Version (e.g. v1.0.2)"
            value={newVersion} onChange={e => setNewVersion(e.target.value)}
            className="w-full bg-background p-3 rounded-xl text-white mb-2 text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <input
            placeholder="Description / Changes"
            value={newDesc} onChange={e => setNewDesc(e.target.value)}
            className="w-full bg-background p-3 rounded-xl text-white mb-2 text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <input
            placeholder="Direct APK URL (Firebase Storage / Dropbox direct link)"
            value={newUrl} onChange={e => setNewUrl(e.target.value)}
            className="w-full bg-background p-3 rounded-xl text-white mb-3 text-sm border border-white/10 focus:border-primary outline-none transition-colors"
          />
          <button onClick={handleAddVersion} className="w-full bg-primary text-black font-bold py-3 rounded-xl">
            Publish Version
          </button>
        </div>
      )}

      {isDownloading && (
        <div className="bg-accent/20 border border-accent/40 p-4 rounded-2xl mb-6 flex items-center justify-between">
          <div className="text-white font-bold text-sm">Downloading & Extracting...</div>
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="space-y-4 pb-20">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center mt-10 space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-center text-sm">Fetching live versions...</p>
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-center justify-center mt-10 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surfaceHighlight border border-white/10 flex items-center justify-center">
              <span className="text-2xl">📵</span>
            </div>
            <p className="text-white font-semibold text-sm">No internet connection</p>
            <p className="text-gray-500 text-xs text-center">Connect to the internet to view and publish versions</p>
            <button
              onClick={() => { setTimedOut(false); setIsLoading(true); setError(null); setRetryTrigger(c => c + 1); }}
              className="mt-2 px-5 py-2 rounded-full bg-surfaceHighlight border border-white/10 text-gray-300 text-xs font-semibold hover:bg-white/10 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : error ? (
          <p className="text-red-500 text-center mt-10">Error: {error}</p>
        ) : versions.length === 0 ? (
          <p className="text-gray-500 text-center mt-10">No versions available.</p>
        ) : (
          versions.map((ver) => (
            <VersionCard
              key={ver.id}
              ver={ver}
              isAdmin={isAdmin}
              isDownloading={isDownloading}
              onInstall={downloadAndInstall}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
