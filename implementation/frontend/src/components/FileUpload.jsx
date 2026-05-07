import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { validateFile } from '../utils/validateFile';
import TransactionsTable from './TransactionsTable';

const UPLOAD_URL = 'http://localhost:8000/upload';
const ACCEPT = '.pdf,.csv,.xlsx,.jpg,.jpeg,.png,.txt,.docx';


// status: idle | validating | ready | error | uploading | processing | done | failed
function createEntry(file) {
  return { id: crypto.randomUUID(), file, status: 'idle', errors: [], progress: 0 };
}

export default function FileUpload() {
  const [entries, setEntries] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [transactions, setTransactions] = useState(null);
  const inputRef = useRef(null);
  const cancelTokens = useRef({});

  const patch = (id, update) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...update } : e)));

  const addFiles = useCallback(async (files) => {
    const newEntries = Array.from(files).map(createEntry);
    setEntries((prev) => [...prev, ...newEntries]);

    for (const entry of newEntries) {
      patch(entry.id, { status: 'validating' });
      const errors = await validateFile(entry.file);
      patch(entry.id, { status: errors.length ? 'error' : 'ready', errors });
    }
  }, []);

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); };
  const onInputChange = (e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; };

  const removeEntry = (id) => {
    cancelTokens.current[id]?.abort();
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const uploadEntry = async (entry) => {
    const controller = new AbortController();
    cancelTokens.current[entry.id] = controller;
    patch(entry.id, { status: 'uploading', progress: 0 });

    const form = new FormData();
    form.append('files', entry.file);

    try {
      patch(entry.id, { status: 'processing', progress: 100 });
      const res = await axios.post(UPLOAD_URL, form, {
        signal: controller.signal,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          patch(entry.id, { progress: pct });
        },
      });
      patch(entry.id, { status: 'done', progress: 100 });
      if (res.data.transactions) {
        setTransactions((prev) => prev ? [...prev, ...res.data.transactions] : res.data.transactions);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      const msg = err.response?.data?.detail ?? err.message ?? 'Upload failed';
      patch(entry.id, { status: 'failed', errors: [msg] });
    } finally {
      delete cancelTokens.current[entry.id];
    }
  };

  const uploadAll = async () => {
    const ready = entries.filter((e) => e.status === 'ready');
    if (!ready.length) return;

    const controller = new AbortController();
    ready.forEach((e) => {
      cancelTokens.current[e.id] = controller;
      patch(e.id, { status: 'uploading', progress: 0 });
    });

    const form = new FormData();
    ready.forEach((e) => form.append('files', e.file));

    try {
      ready.forEach((e) => patch(e.id, { status: 'processing', progress: 100 }));
      const res = await axios.post(UPLOAD_URL, form, {
        signal: controller.signal,
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => {
          const pct = ev.total ? Math.round((ev.loaded / ev.total) * 100) : 0;
          ready.forEach((e) => patch(e.id, { progress: pct }));
        },
      });
      ready.forEach((e) => patch(e.id, { status: 'done', progress: 100 }));
      if (res.data.transactions) {
        setTransactions((prev) => prev ? [...prev, ...res.data.transactions] : res.data.transactions);
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      const msg = err.response?.data?.detail ?? err.message ?? 'Upload failed';
      ready.forEach((e) => patch(e.id, { status: 'failed', errors: [msg] }));
    } finally {
      ready.forEach((e) => delete cancelTokens.current[e.id]);
    }
  };

  const readyCount = entries.filter((e) => e.status === 'ready').length;

  return (
    <div className="upload-container">
      <div
        className={`drop-zone${dragging ? ' drop-zone--active' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current.click()}
        aria-label="File upload area"
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={onInputChange} hidden />
        <span className="drop-icon">↑</span>
        <p className="drop-label">Drag & drop files here, or <span className="drop-link">browse</span></p>
        <p className="drop-hint">PDF · CSV · XLSX · JPG · PNG · TXT · DOCX &nbsp;·&nbsp; max 50 MB each</p>
      </div>

      {entries.length > 0 && (
        <ul className="file-list" aria-label="Selected files">
          {entries.map((entry) => (
            <li key={entry.id} className={`file-item file-item--${entry.status}`}>
              <div className="file-row">
                <div className="file-info">
                  <span className="file-name">{entry.file.name}</span>
                  <span className="file-size">{(entry.file.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="file-actions">
                  <StatusBadge entry={entry} />
                  {entry.status === 'ready' && (
                    <button className="btn btn--upload" onClick={() => uploadEntry(entry)}>Upload</button>
                  )}
                  {!['uploading', 'done'].includes(entry.status) && (
                    <button className="btn btn--remove" onClick={() => removeEntry(entry.id)} aria-label="Remove">✕</button>
                  )}
                </div>
              </div>

              {entry.status === 'uploading' && (
                <div className="progress-bar" role="progressbar" aria-valuenow={entry.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="progress-fill" style={{ width: `${entry.progress}%` }} />
                </div>
              )}

              {(entry.status === 'error' || entry.status === 'failed') && (
                <ul className="error-list">
                  {entry.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {readyCount > 1 && (
        <button className="btn btn--upload-all" onClick={uploadAll}>
          Upload all ({readyCount} files)
        </button>
      )}

      {transactions && transactions.length > 0 && (
        <TransactionsTable transactions={transactions} />

)}
    </div>
  );
}

function StatusBadge({ entry }) {
  const map = {
    idle:       ['badge--idle',       '—'],
    validating: ['badge--validating', 'Checking…'],
    ready:      ['badge--ready',      '✓ Ready'],
    error:      ['badge--error',      '✗ Invalid'],
    uploading:  ['badge--uploading',  `${entry.progress}%`],
    processing: ['badge--uploading',  'Processing…'],
    done:       ['badge--done',       '✓ Done'],
    failed:     ['badge--error',      '✗ Failed'],
  };
  const [cls, label] = map[entry.status] ?? ['', entry.status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
