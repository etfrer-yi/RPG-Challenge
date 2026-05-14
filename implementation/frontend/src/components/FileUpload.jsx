import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { validateFile } from '../utils/validateFile';
import FileUploadWidget from './FileUploadWidget';
import FilesUploaded from './FilesUploaded';

const UPLOAD_URL = 'http://localhost:8000/upload';

// status: idle | validating | ready | error | uploading | processing | done | failed
function createEntry(file) {
  return { id: crypto.randomUUID(), file, status: 'idle', errors: [], progress: 0 };
}

export default function FileUpload({ onTransactions }) {
  const [entries, setEntries] = useState([]);
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
      if (res.data.transactions) onTransactions(res.data.transactions);
    } catch (err) {
      if (axios.isCancel(err)) return;
      patch(entry.id, { status: 'failed', errors: [err.response?.data?.detail ?? err.message ?? 'Upload failed'] });
    } finally {
      delete cancelTokens.current[entry.id];
    }
  };

  const uploadAll = async () => {
    const ready = entries.filter((e) => e.status === 'ready');
    if (!ready.length) return;
    const controller = new AbortController();
    ready.forEach((e) => { cancelTokens.current[e.id] = controller; patch(e.id, { status: 'uploading', progress: 0 }); });
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
      if (res.data.transactions) onTransactions(res.data.transactions);
    } catch (err) {
      if (axios.isCancel(err)) return;
      const msg = err.response?.data?.detail ?? err.message ?? 'Upload failed';
      ready.forEach((e) => patch(e.id, { status: 'failed', errors: [msg] }));
    } finally {
      ready.forEach((e) => delete cancelTokens.current[e.id]);
    }
  };

  return (
    <div className="upload-container">
      <FileUploadWidget onFiles={addFiles} />
      <FilesUploaded entries={entries} onUpload={uploadEntry} onUploadAll={uploadAll} onRemove={removeEntry} />
    </div>
  );
}
