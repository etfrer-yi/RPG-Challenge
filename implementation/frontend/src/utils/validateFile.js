const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED = {
  'application/pdf':                          { exts: ['pdf'] },
  'text/csv':                                 { exts: ['csv'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { exts: ['xlsx'] },
  'image/jpeg':                               { exts: ['jpg', 'jpeg'] },
  'image/png':                                { exts: ['png'] },
  'text/plain':                               { exts: ['txt'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { exts: ['docx'] },
};

// Magic byte signatures: [offset, bytes[]]
const MAGIC = {
  pdf:  [0, [0x25, 0x50, 0x44, 0x46]],          // %PDF
  png:  [0, [0x89, 0x50, 0x4e, 0x47]],           // \x89PNG
  jpg:  [0, [0xff, 0xd8, 0xff]],                  // JFIF/EXIF
  // XLSX and DOCX are ZIP archives
  xlsx: [0, [0x50, 0x4b, 0x03, 0x04]],           // PK\x03\x04
  docx: [0, [0x50, 0x4b, 0x03, 0x04]],           // PK\x03\x04
};

function readBytes(file, length) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(new Uint8Array(e.target.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(0, length));
  });
}

function matchesMagic(bytes, [offset, signature]) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

async function checkMagicBytes(file, ext) {
  const sig = MAGIC[ext];
  if (!sig) return true; // no magic check for txt/csv — they're plain text
  const bytes = await readBytes(file, sig[0] + sig[1].length);
  return matchesMagic(bytes, sig);
}

async function checkCsv(file) {
  const text = await file.slice(0, 4096).text();
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false; // need at least a header + one row
  const colCount = lines[0].split(',').length;
  if (colCount < 2) return false; // single-column is suspicious
  // Check that most rows have the same column count
  const consistent = lines.slice(1, 6).every((l) => {
    const c = l.split(',').length;
    return Math.abs(c - colCount) <= 1; // allow ±1 for trailing commas
  });
  return consistent;
}

export async function validateFile(file) {
  const errors = [];

  // 1. Size
  if (file.size > MAX_SIZE_BYTES) {
    errors.push(`File exceeds 50 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    return errors; // no point continuing
  }

  // 2. Extension
  const ext = file.name.split('.').pop().toLowerCase();
  const mimeEntry = ALLOWED[file.type];
  const extAllowed = Object.values(ALLOWED).some((v) => v.exts.includes(ext));

  if (!extAllowed) {
    errors.push(`Extension .${ext} is not allowed`);
    return errors;
  }

  // 3. MIME vs extension consistency
  if (mimeEntry && !mimeEntry.exts.includes(ext)) {
    errors.push(`MIME type "${file.type}" does not match extension .${ext}`);
  }

  // 4. Magic bytes
  const magicOk = await checkMagicBytes(file, ext);
  if (!magicOk) {
    errors.push(`File content does not match expected format for .${ext}`);
  }

  // 5. CSV structure heuristic
  if (ext === 'csv') {
    const csvOk = await checkCsv(file);
    if (!csvOk) {
      errors.push('CSV does not appear to have consistent delimited columns');
    }
  }

  return errors;
}
