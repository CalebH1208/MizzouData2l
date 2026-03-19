import React, { useState, useEffect } from 'react';
import { Configure, GetCurrentConfig } from '../../../wailsjs/go/Backend/Cloud_storage';

const SECRET_PLACEHOLDER = '••••••••';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfigured: () => void;
}

const CloudSetupModal: React.FC<Props> = ({ isOpen, onClose, onConfigured }) => {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('us-east-2');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Pre-populate from current config whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    GetCurrentConfig().then((cfg) => {
      if (cfg.is_configured) {
        setAccessKeyId(cfg.access_key_id);
        setSecretKey(SECRET_PLACEHOLDER);
        setBucket(cfg.bucket_name);
        setRegion(cfg.region);
        setDisplayName(cfg.display_name);
      }
    }).catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!accessKeyId.trim() || !secretKey.trim() || !bucket.trim() || !region.trim() || !displayName.trim()) {
      setError('All fields are required.');
      return;
    }
    // If the secret field still holds the masked placeholder, pass empty string —
    // the backend will keep the existing secret in that case.
    const secretToSend = secretKey === SECRET_PLACEHOLDER ? '' : secretKey.trim();
    setSaving(true);
    setError('');
    try {
      await Configure(accessKeyId.trim(), secretToSend, bucket.trim(), region.trim(), displayName.trim());
      onConfigured();
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 10200,
    }}>
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: 32,
        borderRadius: 12,
        border: '2px solid #F1B82D',
        width: 480,
        maxWidth: '90vw',
      }}>
        <h3 style={{ color: '#F1B82D', marginTop: 0, marginBottom: 8 }}>Configure Cloud Storage</h3>
        <p style={{ color: '#888', fontSize: 12, marginBottom: 20 }}>
          AWS S3 credentials. Leave the secret key masked to keep the existing value.
          Saved to <code style={{ color: '#F1B82D' }}>cloud_config.json</code> next to the executable.
        </p>

        {[
          { label: 'AWS Access Key ID', value: accessKeyId, set: setAccessKeyId, type: 'text', placeholder: 'AKIA...' },
          { label: 'AWS Secret Access Key', value: secretKey, set: setSecretKey, type: 'password', placeholder: SECRET_PLACEHOLDER },
          { label: 'S3 Bucket Name', value: bucket, set: setBucket, type: 'text', placeholder: 'mizzou-racing-telemetry' },
          { label: 'AWS Region', value: region, set: setRegion, type: 'text', placeholder: 'us-east-2' },
          { label: 'Your Display Name', value: displayName, set: setDisplayName, type: 'text', placeholder: 'John Smith' },
        ].map(({ label, value, set, type, placeholder }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', color: '#ccc', fontSize: 12, marginBottom: 4 }}>{label}</label>
            <input
              type={type}
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', boxSizing: 'border-box',
                backgroundColor: '#0a0a0a', color: 'white',
                border: '1px solid #444', borderRadius: 6,
                padding: '8px 10px', fontSize: 13,
              }}
            />
          </div>
        ))}

        {error && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} disabled={saving} style={cancelBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={saveBtn}>
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  );
};

const saveBtn: React.CSSProperties = {
  backgroundColor: '#F1B82D', color: '#0a0a0a', border: 'none',
  borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
};
const cancelBtn: React.CSSProperties = {
  backgroundColor: '#333', color: 'white', border: '2px solid #666',
  borderRadius: 6, padding: '10px 20px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
};

export default CloudSetupModal;
