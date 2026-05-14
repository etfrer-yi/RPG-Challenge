export default function FilesUploaded({ entries, onUpload, onUploadAll, onRemove }) {
  if (!entries.length) return null;

  const readyCount = entries.filter((e) => e.status === 'ready').length;

  return (
    <>
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
                  <button className="btn btn--upload" onClick={() => onUpload(entry)}>Upload</button>
                )}
                {!['uploading', 'done'].includes(entry.status) && (
                  <button className="btn btn--remove" onClick={() => onRemove(entry.id)} aria-label="Remove">✕</button>
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

      {readyCount > 1 && (
        <button className="btn btn--upload-all" onClick={onUploadAll}>
          Upload all ({readyCount} files)
        </button>
      )}
    </>
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
