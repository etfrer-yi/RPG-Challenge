import asyncio
from pathlib import Path
import pandas as pd
from fastmcp import Client
from processor.agents.base import _mcp_transport, DF_COLUMNS
from processor.agents.pdf_agent import PDFAgent
from processor.agents.text_agent import TextAgent
from processor.agents.image_agent import ImageAgent
from processor.agents.spreadsheet_agent import SpreadsheetAgent

DATA_DIR = Path("/app/data")

AGENT_MAP = {
    ".pdf":  PDFAgent,
    ".txt":  TextAgent,
    ".docx": TextAgent,
    ".jpg":  ImageAgent,
    ".jpeg": ImageAgent,
    ".png":  ImageAgent,
    ".csv":  SpreadsheetAgent,
    ".xlsx": SpreadsheetAgent,
}


MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Magic byte signatures: (offset, bytes)
_MAGIC: dict[str, tuple[int, bytes]] = {
    ".pdf":  (0, b"%PDF"),
    ".png":  (0, b"\x89PNG"),
    ".jpg":  (0, b"\xff\xd8\xff"),
    ".jpeg": (0, b"\xff\xd8\xff"),
    ".xlsx": (0, b"PK\x03\x04"),
    ".docx": (0, b"PK\x03\x04"),
}

# Expected MIME types per extension (mirrors frontend ALLOWED map)
_EXT_MIME: dict[str, str] = {
    ".pdf":  "application/pdf",
    ".csv":  "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".txt":  "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _check_magic(f: Path, ext: str) -> bool:
    sig = _MAGIC.get(ext)
    if sig is None:
        return True  # no magic check for .txt / .csv
    offset, signature = sig
    with f.open("rb") as fh:
        fh.seek(offset)
        return fh.read(len(signature)) == signature


def _check_csv(f: Path) -> bool:
    try:
        text = f.read_bytes()[:4096].decode("utf-8", errors="replace")
    except OSError:
        return False
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 2:
        return False
    col_count = len(lines[0].split(","))
    if col_count < 2:
        return False
    return all(abs(len(l.split(",")) - col_count) <= 1 for l in lines[1:6])


def _check_mime(f: Path, ext: str) -> bool:
    """Best-effort MIME check using python-magic when available."""
    try:
        import magic  # python-magic (optional)
        detected = magic.from_file(str(f), mime=True)
        expected = _EXT_MIME.get(ext)
        # Allow text/x-csv as alias for text/csv
        if expected == "text/csv" and detected in ("text/csv", "text/x-csv", "text/plain"):
            return True
        return expected is None or detected == expected
    except ImportError:
        return True  # skip if library not installed


def validate_file(f: Path) -> str | None:
    """Returns an error string if invalid, else None."""
    ext = f.suffix.lower()
    if ext not in AGENT_MAP:
        return f"unsupported extension '{f.suffix}'"
    size = f.stat().st_size
    if size == 0:
        return "file is empty"
    if size > MAX_FILE_SIZE:
        return f"file exceeds 50 MB limit ({size} bytes)"
    if not _check_magic(f, ext):
        return f"file content does not match expected format for {ext}"
    if not _check_mime(f, ext):
        return f"MIME type does not match extension {ext}"
    if ext == ".csv" and not _check_csv(f):
        return "CSV does not appear to have consistent delimited columns"
    return None


async def main():
    all_files = [f for f in DATA_DIR.iterdir() if f.is_file()]
    if not all_files:
        print("No files found in /app/data", flush=True)

    files: list[Path] = []
    for f in all_files:
        err = validate_file(f)
        if err:
            print(f"Skipping {f.name}: {err}", flush=True)
        else:
            files.append(f)

    async with Client(_mcp_transport()) as mcp_client:
        for f in files:
            agent_cls = AGENT_MAP[f.suffix.lower()]
            await agent_cls(str(f), mcp_client).run()

        result = await mcp_client.call_tool("df_get_all", {})
        raw = result.content[0].text if result.content else "[]"

    df = pd.read_json(raw)
    if df.empty:
        df = pd.DataFrame(columns=DF_COLUMNS)

    print("\n=== TRANSACTIONS ===")
    print(df.to_string(index=False))
    out = Path("/app/data/transactions.csv")
    df.to_csv(out, index=False)
    print(f"\nSaved to {out}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())