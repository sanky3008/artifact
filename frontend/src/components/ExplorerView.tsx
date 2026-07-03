import { useState, useEffect, useMemo, useRef, type DragEvent } from 'react';
import type { FileItem, TreeNode } from '../types';
import { FolderIcon, FolderOpenIcon, FileHtmlIcon, ChevronRightIcon, ChevronDownIcon, MoreIcon, LinkIcon, ExternalLinkIcon, EditIcon, TrashIcon, PlusIcon, UploadIcon } from './Icons';
import { Button, Breadcrumb, ContextMenu, EmptyState, NavLink, type ContextMenuItem } from './ui';
import { browseUrl, isPlainClick } from '../nav';

interface ExplorerViewProps {
  currentPath: string;
  folders: string[];
  files: FileItem[];
  tree: TreeNode[];
  onNavigate: (path: string) => void;
  onOpenFile: (file: FileItem) => void;
  onAction: (action: string, item?: { name: string; type: string }) => void;
  onMove: (name: string, fromPath: string, toPath: string) => void;
}

// ─── Sidebar Tree Item ───
function SidebarTreeItem({ node, currentPath, onNavigate, depth = 0, onDrop }: {
  node: TreeNode;
  currentPath: string;
  onNavigate: (p: string) => void;
  depth?: number;
  onDrop: (targetPath: string, e: DragEvent) => void;
}) {
  const isActive = currentPath === node.path;
  const isParent = currentPath.startsWith(node.path + '/');
  const [expanded, setExpanded] = useState(isActive || isParent);
  const [dragOver, setDragOver] = useState(false);
  const hasChildren = node.children.length > 0;

  useEffect(() => {
    if (isActive || isParent) setExpanded(true);
  }, [isActive, isParent]);

  return (
    <div>
      <NavLink
        href={browseUrl(node.path)}
        className={`sidebar-item ${isActive ? 'sidebar-item--active' : ''} ${dragOver ? 'sidebar-item--drag-over' : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onNavigate={() => { onNavigate(node.path); setExpanded(true); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(node.path, e); }}
      >
        <span className="sidebar-item__chevron" onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); }}>
          {hasChildren ? (expanded ? <ChevronDownIcon width={14} height={14} /> : <ChevronRightIcon width={14} height={14} />) : <span style={{ width: 14 }}></span>}
        </span>
        {isActive || isParent ? <FolderOpenIcon width={16} height={16} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <FolderIcon width={16} height={16} style={{ flexShrink: 0 }} />}
        <span className="sidebar-item__name">{node.name}</span>
      </NavLink>
      {expanded && hasChildren && node.children.map(child => (
        <SidebarTreeItem
          key={child.path}
          node={child}
          currentPath={currentPath}
          onNavigate={onNavigate}
          depth={depth + 1}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
}

export function ExplorerView({ currentPath, folders, files, tree, onNavigate, onOpenFile, onAction, onMove }: ExplorerViewProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'size'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ name: string; type: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingItem && renameRef.current) {
      renameRef.current.focus();
      const dotIndex = renameValue.lastIndexOf('.');
      renameRef.current.setSelectionRange(0, dotIndex > 0 ? dotIndex : renameValue.length);
    }
  }, [renamingItem]);

  const handleSort = (field: 'name' | 'size') => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('asc'); }
  };

  const sortedFiles = useMemo(() => {
    const arr = [...files];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'name') return dir * a.name.localeCompare(b.name);
      if (sortBy === 'size') return dir * (a.bytes - b.bytes);
      return 0;
    });
    return arr;
  }, [files, sortBy, sortDir]);

  const handleContextMenu = (e: React.MouseEvent, item: { name: string; type: string }) => {
    e.preventDefault();
    const items: ContextMenuItem[] = [
      { label: 'Copy link', icon: <LinkIcon width={14} height={14} />, action: () => onAction('copy-link', item) },
      ...(item.type === 'file' ? [{ label: 'Open in new tab', icon: <ExternalLinkIcon width={14} height={14} />, action: () => onAction('open-tab', item) }] : []),
      { divider: true },
      { label: 'Rename', icon: <EditIcon width={14} height={14} />, action: () => startRename(item) },
      { label: 'Delete', icon: <TrashIcon width={14} height={14} />, action: () => onAction('delete', item), danger: true },
    ];
    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const startRename = (item: { name: string; type: string }) => {
    setRenamingItem(item);
    setRenameValue(item.name);
  };

  const commitRename = () => {
    if (renamingItem && renameValue.trim() && renameValue !== renamingItem.name) {
      onAction('rename', { ...renamingItem, name: renamingItem.name, newName: renameValue.trim() } as any);
    }
    setRenamingItem(null);
  };

  const cancelRename = () => {
    setRenamingItem(null);
  };

  const handleDragStart = (e: DragEvent, name: string, type: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ name, type, fromPath: currentPath }));
    setDraggingItem(name);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverFolder(null);
  };

  const handleFolderRowDrop = (folderName: string, e: DragEvent) => {
    e.preventDefault();
    setDragOverFolder(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.name === folderName) return;
      const targetPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
      onMove(data.name, data.fromPath, targetPath);
    } catch {}
  };

  const handleSidebarDrop = (targetPath: string, e: DragEvent) => {
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.fromPath === targetPath) return;
      onMove(data.name, data.fromPath, targetPath);
    } catch {}
  };

  const SortArrow = ({ field }: { field: string }) => {
    if (sortBy !== field) return null;
    return <span style={{ marginLeft: 4, opacity: 0.5 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const rootNode: TreeNode = { name: '/', path: '/', children: tree };

  return (
    <div className="explorer">
      <div className="explorer__sidebar">
        <div className="explorer__sidebar-header">
          <span className="explorer__sidebar-label">Folders</span>
        </div>
        <div className="explorer__sidebar-tree">
          <SidebarTreeItem
            node={rootNode}
            currentPath={currentPath}
            onNavigate={onNavigate}
            depth={0}
            onDrop={handleSidebarDrop}
          />
        </div>
      </div>
      <div className="explorer__content">
        <div className="explorer__toolbar">
          <Breadcrumb path={currentPath} onNavigate={onNavigate} />
          <div className="explorer__toolbar-actions">
            <Button size="small" icon={<PlusIcon width={15} height={15} />} onClick={() => onAction('new-folder')}>
              New folder
            </Button>
            <Button size="small" variant="primary" icon={<UploadIcon width={15} height={15} />} onClick={() => onAction('upload')}>
              Upload
            </Button>
          </div>
        </div>
        <div className="explorer__table-wrap">
          <table className="explorer__table">
            <thead>
              <tr>
                <th className="explorer__th explorer__th--name" onClick={() => handleSort('name')}>
                  Name <SortArrow field="name" />
                </th>
                <th className="explorer__th explorer__th--size" onClick={() => handleSort('size')}>
                  Size <SortArrow field="size" />
                </th>
                <th className="explorer__th explorer__th--modified">Modified</th>
                <th className="explorer__th explorer__th--actions"></th>
              </tr>
            </thead>
            <tbody>
              {folders.map(folder => {
                const folderPath = currentPath === '/' ? `/${folder}` : `${currentPath}/${folder}`;
                const isRenaming = renamingItem?.name === folder && renamingItem?.type === 'folder';
                return (
                  <tr key={folder}
                    className={`explorer__row explorer__row--folder ${dragOverFolder === folder ? 'explorer__row--drag-over' : ''} ${draggingItem === folder ? 'explorer__row--dragging' : ''}`}
                    onClick={e => { if (e.detail === 1 && !isRenaming && isPlainClick(e)) onNavigate(folderPath); }}
                    onContextMenu={e => handleContextMenu(e, { name: folder, type: 'folder' })}
                    draggable={!isRenaming}
                    onDragStart={e => handleDragStart(e, folder, 'folder')}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => { e.preventDefault(); setDragOverFolder(folder); }}
                    onDragLeave={() => setDragOverFolder(null)}
                    onDrop={e => handleFolderRowDrop(folder, e)}
                  >
                    <td className="explorer__td explorer__td--name">
                      <FolderIcon width={16} height={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      {isRenaming ? (
                        <input
                          ref={renameRef}
                          className="inline-rename"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                          onBlur={commitRename}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <NavLink href={browseUrl(folderPath)} className="explorer__name-link" onNavigate={() => onNavigate(folderPath)}>
                          {folder}
                        </NavLink>
                      )}
                    </td>
                    <td className="explorer__td explorer__td--size">&mdash;</td>
                    <td className="explorer__td explorer__td--modified">&mdash;</td>
                    <td className="explorer__td explorer__td--actions">
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); handleContextMenu(e, { name: folder, type: 'folder' }); }}>
                        <MoreIcon width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedFiles.map(file => {
                const isRenaming = renamingItem?.name === file.name && renamingItem?.type === 'file';
                return (
                  <tr key={file.name}
                    className={`explorer__row explorer__row--file ${draggingItem === file.name ? 'explorer__row--dragging' : ''}`}
                    onDoubleClick={() => !isRenaming && onOpenFile(file)}
                    onContextMenu={e => handleContextMenu(e, { name: file.name, type: 'file' })}
                    draggable={!isRenaming}
                    onDragStart={e => handleDragStart(e, file.name, 'file')}
                    onDragEnd={handleDragEnd}
                  >
                    <td className="explorer__td explorer__td--name">
                      <FileHtmlIcon width={16} height={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      {isRenaming ? (
                        <input
                          ref={renameRef}
                          className="inline-rename"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') cancelRename(); }}
                          onBlur={commitRename}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <NavLink href={browseUrl(currentPath, file.name)} className="explorer__name-link" onNavigate={() => onOpenFile(file)}>
                          {file.name}
                        </NavLink>
                      )}
                    </td>
                    <td className="explorer__td explorer__td--size">{file.size}</td>
                    <td className="explorer__td explorer__td--modified">{file.modified}</td>
                    <td className="explorer__td explorer__td--actions">
                      <button className="icon-btn" onClick={e => { e.stopPropagation(); handleContextMenu(e, { name: file.name, type: 'file' }); }}>
                        <MoreIcon width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {folders.length === 0 && files.length === 0 && (
                <tr><td colSpan={4}>
                  <EmptyState
                    icon={<FolderIcon width={32} height={32} />}
                    title="This folder is empty"
                    subtitle="Upload HTML files or create a subfolder"
                  />
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}
