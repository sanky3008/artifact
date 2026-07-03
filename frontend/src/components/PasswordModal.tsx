import { useState } from 'react';
import { Modal, Input, Button } from './ui';

interface PasswordModalProps {
  onSuccess: () => void;
  onClose: () => void;
  login: (password: string) => Promise<boolean>;
  dismissable?: boolean;
}

export function PasswordModal({ onSuccess, onClose, login, dismissable = true }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    const ok = await login(password);
    if (ok) {
      onSuccess();
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <Modal title="Authentication required" onClose={dismissable ? onClose : () => {}} width={380}>
      <p className="modal__desc">Enter the shared password to continue.</p>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <Input
            type="password"
            value={password}
            onChange={v => { setPassword(v); setError(false); }}
            placeholder="Password"
            autoFocus
            className={error ? 'input-wrap--error' : ''}
          />
          {error && <p className="input-error">Incorrect password. Try again.</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {dismissable && <Button onClick={onClose}>Cancel</Button>}
          <Button variant="primary" onClick={() => handleSubmit()} disabled={loading || !password}>
            {loading ? 'Checking...' : 'Unlock'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
