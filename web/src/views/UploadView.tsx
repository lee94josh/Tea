import { useRef, useState } from 'react';
import { api } from '../api';
import type { UploadResult } from '@lookback/shared';

export function UploadView({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      // Send raw originals — no client-side resize/re-encode (Requirement 1).
      const res = await api.upload(Array.from(files), setProgress);
      setResult(res);
      setProgress(null);
      if (res.accepted.length > 0) setTimeout(onUploaded, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
      setProgress(null);
    }
  }

  return (
    <div>
      <div
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <p>Tap to choose photos, or drop them here.</p>
        <p className="small">Originals upload untouched — GPS and timestamps are kept.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {progress !== null && (
        <div className="card">
          <div className="small muted">Uploading… {progress}%</div>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <div className="card" style={{ color: 'var(--accent)' }}>{error}</div>}

      {result && (
        <div className="card">
          <p>
            Accepted <strong>{result.accepted.length}</strong>, rejected{' '}
            <strong>{result.rejected.length}</strong>.
          </p>
          <p className="small muted">Analyzing in the background — check Status.</p>
          {result.rejected.length > 0 && (
            <ul className="small muted">
              {result.rejected.map((r, i) => (
                <li key={i}>
                  {r.filename}: {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
