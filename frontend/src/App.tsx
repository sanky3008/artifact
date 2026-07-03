import { useState, useEffect, useCallback } from 'react';
import type { FileItem, TreeNode, AuthStatus } from './types';
import * as api from './api';
import { encodePath, browseUrl, locationFromUrl } from './nav';
import { ToastProvider, useToast } from './components/ui';
import { LockIcon, UnlockIcon, SettingsIcon } from './components/Icons';
import { ExplorerView } from './components/ExplorerView';
import { FileViewer } from './components/FileViewer';
import { SettingsPopover } from './components/SettingsPopover';
import { PasswordModal } from './components/PasswordModal';
import { UploadModal } from './components/UploadModal';
import { NewFolderModal } from './components/NewFolderModal';
import { DeleteModal } from './components/DeleteModal';
import { GoogleLoginPage } from './components/GoogleLoginPage';

const STORAGE_KEY = 'artifact-settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { theme: 'light', accentColor: '#F54E00' };
}

function saveSettings(s: { theme: string; accentColor: string }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function AppInner() {
  const saved = loadSettings();
  const [theme, setTheme] = useState(saved.theme);
  const [accentColor, setAccentColor] = useState(saved.accentColor);
  const [showSettings, setShowSettings] = useState(false);

  const [loc, setLoc] = useState(locationFromUrl);
  const { dir: currentPath, file: viewingFile } = loc;

  const navigate = useCallback((dir: string, file: string | null = null) => {
    const url = browseUrl(dir, file);
    // Idempotent: repeated navigation to the current URL (e.g. the second
    // click of a double-click on a folder row) is dropped.
    if (url === window.location.pathname + window.location.search) return;
    history.pushState(null, '', url);
    setLoc({ dir, file });
  }, []);

  useEffect(() => {
    if (!window.location.pathname.startsWith('/browse')) {
      history.replaceState(null, '', '/browse');
    }
    const onPop = () => setLoc(locationFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = viewingFile ? `${viewingFile} — Artifact` : currentPath === '/' ? 'Artifact' : `${currentPath} — Artifact`;
  }, [currentPath, viewingFile]);

  const [isAuth, setIsAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'password' | 'google'>('password');
  const [googleClientId, setGoogleClientId] = useState('');
  const [allowedDomain, setAllowedDomain] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showDelete, setShowDelete] = useState<{ name: string; type: string } | null>(null);

  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  // The path the current folders/files were fetched for. Row paths are computed
  // from this, not from currentPath — while a navigation's fetch is in flight,
  // the displayed rows still belong to the previous folder.
  const [listingPath, setListingPath] = useState('/');
  const [filesLoading, setFilesLoading] = useState(true);

  const toast = useToast();

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveSettings({ theme, accentColor });
  }, [theme, accentColor]);

  // Apply accent
  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-hover', accentColor);
  }, [accentColor]);

  // Check auth on mount
  useEffect(() => {
    api.checkAuth().then((status: AuthStatus) => {
      setIsAuth(status.authenticated);
      setAuthMode(status.authMode);
      if (status.googleClientId) setGoogleClientId(status.googleClientId);
      if (status.allowedDomain) setAllowedDomain(status.allowedDomain);
      if (status.email) setUserEmail(status.email);
      setAuthLoading(false);
    }).catch(() => {
      setAuthLoading(false);
    });
  }, []);

  // Fetch files when path changes
  const refreshFiles = useCallback(async () => {
    try {
      const [listing, treeData] = await Promise.all([
        api.listFiles(currentPath),
        api.getTree(),
      ]);
      setFolders(listing.folders);
      setFiles(listing.files);
      setTree(treeData.tree);
      setListingPath(currentPath);
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
        setIsAuth(false);
      } else {
        toast('Failed to load files', 'error');
      }
    } finally {
      setFilesLoading(false);
    }
  }, [currentPath, toast]);

  useEffect(() => {
    if (authLoading || !isAuth) return;
    refreshFiles();
  }, [refreshFiles, authLoading, isAuth]);

  const handleAction = (action: string, item?: any) => {
    switch (action) {
      case 'upload':
        setShowUpload(true);
        break;
      case 'new-folder':
        setShowNewFolder(true);
        break;
      case 'delete':
        setShowDelete(item);
        break;
      case 'rename':
        (async () => {
          try {
            await api.renameItem(listingPath, item.name, item.newName);
            toast(`Renamed "${item.name}" to "${item.newName}"`);
            refreshFiles();
          } catch (err: any) {
            if (err.message === 'AUTH_REQUIRED') {
              setIsAuth(false);
              toast('Session expired. Please authenticate again.');
            } else {
              toast(`Failed to rename: ${err.message}`);
            }
          }
        })();
        break;
      case 'copy-link': {
        const path = listingPath === '/' ? '' : listingPath;
        const url = `${window.location.origin}${encodePath(`/v${path}/${item.name}`)}`;
        navigator.clipboard.writeText(url).catch(() => {});
        toast('Link copied to clipboard');
        break;
      }
      case 'open-tab': {
        const path = listingPath === '/' ? '' : listingPath;
        window.open(encodePath(`/v${path}/${item.name}`), '_blank');
        break;
      }
    }
  };

  const handleUpload = async (uploadFiles: File[]): Promise<boolean> => {
    try {
      const result = await api.uploadFiles(listingPath, uploadFiles);
      toast(`Uploaded ${result.count} file(s)`);
      setShowUpload(false);
      refreshFiles();
      return true;
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
        setIsAuth(false);
        toast('Session expired. Please authenticate again.', 'error');
        setShowUpload(false);
      } else {
        toast(`Upload failed: ${err.message}`, 'error');
      }
      return false;
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      await api.createFolder(listingPath, name);
      toast(`Created folder "${name}"`);
      refreshFiles();
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
        setIsAuth(false);
        toast('Session expired. Please authenticate again.');
      } else {
        toast(`Failed: ${err.message}`);
      }
    }
  };

  const handleDelete = async () => {
    if (!showDelete) return;
    try {
      await api.deleteItem(listingPath, showDelete.name, showDelete.type as 'file' | 'folder');
      toast(`Deleted "${showDelete.name}"`);
      refreshFiles();
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
        setIsAuth(false);
        toast('Session expired. Please authenticate again.');
      } else {
        toast(`Failed: ${err.message}`);
      }
    }
  };

  const handleMove = async (name: string, fromPath: string, toPath: string) => {
    try {
      await api.moveItem(fromPath, name, toPath);
      toast(`Moved "${name}" to ${toPath}`);
      refreshFiles();
    } catch (err: any) {
      if (err.message === 'AUTH_REQUIRED') {
        setIsAuth(false);
        toast('Session expired. Please authenticate again.');
      } else {
        toast(`Failed to move: ${err.message}`);
      }
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setIsAuth(false);
    setUserEmail(null);
  };

  if (authLoading) {
    return null;
  }

  if (authMode === 'google' && !isAuth) {
    return (
      <GoogleLoginPage
        clientId={googleClientId}
        allowedDomain={allowedDomain}
        onSuccess={(email) => {
          setIsAuth(true);
          setUserEmail(email);
          refreshFiles();
        }}
      />
    );
  }

  if (viewingFile) {
    return <FileViewer fileName={viewingFile} path={currentPath} onBack={() => navigate(currentPath)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__left">
          <div className="app-header__logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="20" height="20" rx="4" fill="var(--accent)"></rect>
              <path d="M8 7h3l1 5-1 5H8l1-5-1-5z" fill="white" opacity="0.9"></path>
              <path d="M13 7h3l1 5-1 5h-3l1-5-1-5z" fill="white" opacity="0.6"></path>
            </svg>
            <span className="app-header__title">Artifact</span>
          </div>
        </div>
        <div className="app-header__right">
          {authMode === 'google' ? (
            <button className="auth-badge auth-badge--unlocked" onClick={handleLogout}>
              <UnlockIcon width={14} height={14} />
              <span>{userEmail || 'Signed in'}</span>
            </button>
          ) : (
            <button
              className={`auth-badge ${isAuth ? 'auth-badge--unlocked' : ''}`}
              onClick={() => { if (isAuth) handleLogout(); }}
            >
              {isAuth ? <UnlockIcon width={14} height={14} /> : <LockIcon width={14} height={14} />}
              <span>{isAuth ? 'Unlocked' : 'Locked'}</span>
            </button>
          )}

          <div className="settings-trigger-wrap">
            <button
              className={`icon-btn ${showSettings ? 'icon-btn--active' : ''}`}
              onClick={() => setShowSettings(v => !v)}
              title="Settings"
            >
              <SettingsIcon width={17} height={17} />
            </button>
            {showSettings && (
              <SettingsPopover
                theme={theme}
                accent={accentColor}
                onThemeChange={setTheme}
                onAccentChange={setAccentColor}
                onClose={() => setShowSettings(false)}
              />
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {isAuth && filesLoading && (
          <div className="empty-state"><p className="empty-state__title">Loading…</p></div>
        )}
        {isAuth && !filesLoading && (
          <ExplorerView
            currentPath={listingPath}
            folders={folders}
            files={files}
            tree={tree}
            onNavigate={navigate}
            onOpenFile={file => navigate(listingPath, file.name)}
            onAction={handleAction}
            onMove={handleMove}
          />
        )}
      </main>

      {!isAuth && (
        <PasswordModal
          onSuccess={() => setIsAuth(true)}
          onClose={() => {}}
          dismissable={false}
          login={api.login}
        />
      )}
      {showNewFolder && <NewFolderModal onClose={() => setShowNewFolder(false)} onCreate={handleCreateFolder} />}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUpload={handleUpload}
          existingNames={files.map(f => f.name)}
        />
      )}
      {showDelete && (
        <DeleteModal
          itemName={showDelete.name}
          itemType={showDelete.type as 'file' | 'folder'}
          onClose={() => setShowDelete(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
