import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode, type KeyboardEvent as ReactKeyboardEvent, type AnchorHTMLAttributes } from 'react';
import { XIcon, ChevronRightIcon, HomeIcon } from './Icons';
import { browseUrl, isPlainClick } from '../nav';

// ═══════════════════════════════════════
// NAV LINK — a real <a href> so cmd/ctrl/middle-click and "open in new tab"
// work natively; plain left-clicks are intercepted for SPA navigation.
// ═══════════════════════════════════════
interface NavLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  onNavigate: () => void;
}

export function NavLink({ href, onNavigate, children, ...rest }: NavLinkProps) {
  return (
    <a
      href={href}
      draggable={false} // don't hijack row drag-and-drop with the anchor's native URL drag
      onClick={e => {
        if (!isPlainClick(e)) return; // let the browser open a new tab/window
        e.preventDefault();
        onNavigate();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// ═══════════════════════════════════════
// BUTTON
// ═══════════════════════════════════════
interface ButtonProps {
  children?: ReactNode;
  variant?: 'secondary' | 'primary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  icon?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function Button({ children, variant = 'secondary', size = 'medium', icon, onClick, disabled, className = '', title }: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-disabled={disabled}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      {children && <span className="btn__content">{children}</span>}
    </button>
  );
}

// ═══════════════════════════════════════
// INPUT
// ═══════════════════════════════════════
interface InputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
  autoFocus?: boolean;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}

export function Input({ value, onChange, placeholder, type = 'text', icon, autoFocus, onKeyDown, className = '' }: InputProps) {
  return (
    <div className={`input-wrap ${className}`}>
      {icon && <span className="input-wrap__icon">{icon}</span>}
      <input
        className="input-wrap__input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

// ═══════════════════════════════════════
// MODAL
// ═══════════════════════════════════════
interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number;
}

export function Modal({ title, children, onClose, width = 400 }: ModalProps) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">{title}</h3>
          <button className="modal__close" onClick={onClose}><XIcon width={16} height={16} /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// TOAST
// ═══════════════════════════════════════
const ToastContext = createContext<((msg: string, kind?: 'error') => void) | null>(null);

interface Toast {
  id: number;
  message: string;
  kind?: 'error';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, kind?: 'error') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), kind === 'error' ? 6000 : 2500);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast--error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ═══════════════════════════════════════
// BREADCRUMB
// ═══════════════════════════════════════
interface BreadcrumbProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const parts = path === '/' ? [''] : path.split('/');
  return (
    <nav className="breadcrumb">
      {parts.map((part, i) => {
        const target = i === 0 ? '/' : '/' + parts.slice(1, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <ChevronRightIcon width={14} height={14} className="breadcrumb__sep" />}
            <NavLink
              href={browseUrl(target)}
              className={`breadcrumb__item ${isLast ? 'breadcrumb__item--active' : ''}`}
              onNavigate={() => onNavigate(target)}
            >
              {i === 0 ? <HomeIcon width={15} height={15} /> : part}
            </NavLink>
          </span>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════
export interface ContextMenuItem {
  label?: string;
  icon?: ReactNode;
  action?: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use mousedown so it fires before contextmenu — avoids the race
    // where the window listener closes a menu that onContextMenu just opened.
    window.addEventListener('mousedown', handleClickOutside);
    return () => { window.removeEventListener('mousedown', handleClickOutside); };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (x + rect.width > vw) left = x - rect.width;
    if (y + rect.height > vh) top = y - rect.height;
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    setPos({ left, top });
  }, [x, y]);

  return (
    <div className="context-menu" ref={ref} style={{ left: pos.left, top: pos.top }}>
      {items.map((item, i) =>
        item.divider ? <div key={i} className="context-menu__divider"></div> :
        <button key={i} className={`context-menu__item ${item.danger ? 'context-menu__item--danger' : ''}`} onClick={() => { item.action?.(); onClose(); }}>
          {item.icon && <span className="context-menu__icon">{item.icon}</span>}
          {item.label}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// EMPTY STATE
// ═══════════════════════════════════════
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <p className="empty-state__title">{title}</p>
      {subtitle && <p className="empty-state__sub">{subtitle}</p>}
    </div>
  );
}
