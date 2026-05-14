import { useState, useRef } from 'react';

const ACCEPT = '.pdf,.csv,.xlsx,.jpg,.jpeg,.png,.txt,.docx';

export default function FileUploadWidget({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop      = (e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); };
  const onInputChange = (e) => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ''; };

  return (
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
  );
}
