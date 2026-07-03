export const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

// URL scheme: /browse/<dir>?f=<file.html> — the file lives in a query param
// because folder names may legally end in .html.
export const browseUrl = (dir: string, file?: string | null) =>
  `/browse${dir === '/' ? '' : encodePath(dir)}${file ? `?f=${encodeURIComponent(file)}` : ''}`;

export function locationFromUrl(): { dir: string; file: string | null } {
  const m = window.location.pathname.match(/^\/browse(\/.*)?$/);
  const dir = m?.[1]
    ? m[1].split('/').map(decodeURIComponent).join('/').replace(/\/+$/, '') || '/'
    : '/';
  return { dir, file: new URLSearchParams(window.location.search).get('f') };
}

// True when the browser should NOT handle the click itself (new tab / new
// window / download): plain left-click with no modifier keys.
export const isPlainClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button?: number }) =>
  !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (e.button ?? 0) === 0;
