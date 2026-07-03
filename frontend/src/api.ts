import type { DirectoryListing, TreeNode, AuthStatus } from './types';

const BASE = '';

export async function listFiles(path: string): Promise<DirectoryListing> {
  const res = await fetch(`${BASE}/api/files?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    throw new Error('Failed to list files');
  }
  return res.json();
}

export async function getTree(path = '/'): Promise<{ tree: TreeNode[] }> {
  const res = await fetch(`${BASE}/api/tree?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    throw new Error('Failed to get tree');
  }
  return res.json();
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

export async function googleLogin(credential: string): Promise<{ ok: boolean; email?: string }> {
  const res = await fetch(`${BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Google login failed');
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout`, { method: 'POST' });
}

export async function checkAuth(): Promise<AuthStatus> {
  const res = await fetch(`${BASE}/api/auth/status`);
  return res.json();
}

export async function uploadFiles(path: string, files: File[]): Promise<{ uploaded: string[]; count: number }> {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const res = await fetch(`${BASE}/api/files/upload?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    throw new Error('Upload failed');
  }
  return res.json();
}

export async function createFolder(path: string, name: string): Promise<void> {
  const res = await fetch(`${BASE}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    if (res.status === 409) throw new Error('Folder already exists');
    throw new Error('Failed to create folder');
  }
}

export async function renameItem(path: string, oldName: string, newName: string): Promise<void> {
  const res = await fetch(`${BASE}/api/files/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, oldName, newName }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    throw new Error('Failed to rename');
  }
}

export async function deleteItem(path: string, name: string, type: 'file' | 'folder'): Promise<void> {
  const res = await fetch(`${BASE}/api/files`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, name, type }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    throw new Error('Failed to delete');
  }
}

export async function moveItem(fromPath: string, name: string, toPath: string): Promise<void> {
  const res = await fetch(`${BASE}/api/files/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromPath, name, toPath }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED');
    if (res.status === 409) throw new Error('Item already exists at destination');
    throw new Error('Failed to move');
  }
}
