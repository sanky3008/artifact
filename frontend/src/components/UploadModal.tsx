import { useState, useRef } from 'react';
import { Modal, Button, useToast } from './ui';
import { UploadIcon, FileHtmlIcon, XIcon } from './Icons';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface UploadModalProps {
  onClose: () => void;
  onUpload: (files: File[]) => Promise<boolean>;
  existingNames?: string[];
}

export function UploadModal({ onClose, onUpload, existingNames = [] }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleFiles = (fileList: FileList) => {
    const htmlFiles = Array.from(fileList).filter(f => f.name.endsWith('.html'));
    const accepted = htmlFiles.filter(f => f.size <= MAX_FILE_SIZE);
    if (accepted.length < htmlFiles.length) {
      toast(`Skipped ${htmlFiles.length - accepted.length} file(s) over 10 MB`, 'error');
    }
    setFiles(prev => [...prev, ...accepted]);
  };

  const handleUpload = async () => {
    setUploading(true);
    const ok = await onUpload(files);
    if (!ok) setUploading(false); // keep the modal open with the selection intact
  };

  return (
    <Modal title="Upload HTML files" onClose={onClose} width={440}>
      <div
        className={`upload-drop-area ${dragActive ? 'upload-drop-area--active' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".html" multiple hidden onChange={e => e.target.files && handleFiles(e.target.files)} />
        <UploadIcon width={28} height={28} style={{ color: 'var(--text-tertiary)' }} />
        <p className="upload-drop-area__text">Click to browse or drag files here</p>
        <p className="upload-drop-area__hint">Only .html files, max 10 MB each</p>
      </div>

      {files.length > 0 && (
        <div className="upload-file-list">
          {files.map((f, i) => (
            <div key={i} className="upload-file-item">
              <FileHtmlIcon width={14} height={14} />
              <span className="upload-file-item__name">{f.name}</span>
              {existingNames.includes(f.name) && (
                <span className="upload-file-item__replaces">replaces existing</span>
              )}
              <span className="upload-file-item__size">{(f.size / 1024).toFixed(0)} KB</span>
              <button className="icon-btn icon-btn--sm" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}>
                <XIcon width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleUpload} disabled={files.length === 0 || uploading}>
          {uploading ? 'Uploading...' : `Upload${files.length > 0 ? ` (${files.length})` : ''}`}
        </Button>
      </div>
    </Modal>
  );
}
