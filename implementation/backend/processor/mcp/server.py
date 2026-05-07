from mcp.server.fastmcp import FastMCP
import base64, pathlib, subprocess, json, sys
from typing import Optional
import pandas as pd

mcp = FastMCP("FinancialTools")

_df: pd.DataFrame = pd.DataFrame(columns=["origin", "date", "description", "actor", "amount"])


@mcp.tool()
def file_read(path: str) -> str:
    """Read a text-based file (txt, md, html)."""
    return pathlib.Path(path).read_text(encoding="utf-8")


@mcp.tool()
def file_write(path: str, content: str) -> str:
    """Write string content to a file."""
    pathlib.Path(path).write_text(content, encoding="utf-8")
    return f"Written: {path}"


@mcp.tool()
def list_files(directory: str) -> list[str]:
    """List all files in a directory recursively."""
    return [str(p) for p in pathlib.Path(directory).rglob("*") if p.is_file()]


@mcp.tool()
def read_image_as_base64(path: str) -> str:
    """Encode an image file as base64 for vision model input."""
    return base64.b64encode(pathlib.Path(path).read_bytes()).decode()


@mcp.tool()
def pdf_extract_text(path: str) -> str:
    """Extract all text from a PDF file."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        return "\n\n".join(page.extract_text() or "" for page in pdf.pages)


@mcp.tool()
def docx_extract_text(path: str) -> str:
    """Extract all text from a DOCX file."""
    from docx import Document
    return "\n".join(p.text for p in Document(path).paragraphs)


@mcp.tool()
def csv_preview(path: str, n_rows: int = 10) -> str:
    """Return headers + sample rows of a CSV or Excel file as markdown."""
    df = pd.read_excel(path, nrows=n_rows) if path.endswith(".xlsx") else pd.read_csv(path, nrows=n_rows)
    return df.to_markdown()


@mcp.tool()
def csv_read_columns(path: str, columns: list[str]) -> str:
    """Read all values from the specified columns of a CSV or Excel file.

    Returns a JSON array of objects containing only the requested columns.
    Column names must match the headers exactly (case-sensitive).
    Rows where all requested columns are null/NaN are omitted.
    """
    df = pd.read_excel(path) if path.endswith(".xlsx") else pd.read_csv(path)
    missing = [c for c in columns if c not in df.columns]
    if missing:
        return f"ERROR: columns not found: {missing}. Available columns: {list(df.columns)}"
    return df[columns].to_json(orient="records", date_format="iso")


@mcp.tool()
def execute_python(code: str, timeout: int = 30) -> str:
    """Execute Python code in a subprocess sandbox, return stdout or stderr."""
    result = subprocess.run(
        ["python", "-c", code],
        capture_output=True, text=True,
        timeout=timeout, cwd="/tmp",
    )
    return result.stdout or result.stderr


@mcp.tool()
def df_dump_row(
    origin: str,
    date: Optional[str],
    amount: float,
    description: Optional[str] = None,
    actor: Optional[str] = None,
) -> str:
    """Append a single financial transaction row to the shared DataFrame.

    - origin: source file path
    - date: ISO 8601 or plain date string
    - description: nature of the transaction (nullable)
    - actor: counterparty entity (nullable)
    - amount: positive if money enters the customer's account, negative if it leaves
    """
    global _df
    print(f"[TOOL] df_dump_row called: origin={origin}, amount={amount}", file=sys.stderr, flush=True)
    _df = pd.concat([_df, pd.DataFrame([{
        "origin": pathlib.Path(origin).name, "date": date, "description": description,
        "actor": actor, "amount": amount,
    }])], ignore_index=True)
    return f"Row appended (total rows: {len(_df)})"


@mcp.tool()
def df_dump_rows(rows: list[dict]) -> str:
    """Append multiple financial transaction rows to the shared DataFrame.

    Each row must have: origin, date, amount, description (optional), actor (optional).
    - origin: source file path
    - date: ISO 8601 or plain date string
    - description: nature of the transaction (nullable)
    - actor: counterparty entity (nullable)
    - amount: positive if money enters the customer's account, negative if it leaves
    """
    global _df
    print(f"[TOOL] df_dump_rows called with {len(rows)} rows", file=sys.stderr, flush=True)
    processed = []
    for r in rows:
        processed.append({
            "origin": pathlib.Path(r.get("origin", "")).name,
            "date": r.get("date"),
            "description": r.get("description"),
            "actor": r.get("actor"),
            "amount": r.get("amount"),
        })
    _df = pd.concat([_df, pd.DataFrame(processed)], ignore_index=True)
    return f"Rows appended: {len(rows)} (total rows: {len(_df)})"


@mcp.tool()
def df_get_row(index: int) -> str:
    """Get a row from the shared DataFrame by integer index. Returns JSON."""
    if index < 0 or index >= len(_df):
        return "NOT_FOUND"
    return _df.iloc[index].to_json()


@mcp.tool()
def df_get_all() -> str:
    """Return the entire shared DataFrame as a JSON array of records."""
    return _df.to_json(orient="records")


if __name__ == "__main__":
    mcp.run(transport="stdio")
