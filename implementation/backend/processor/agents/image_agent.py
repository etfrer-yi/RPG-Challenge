from pathlib import Path
from fastmcp import Client
from google.genai import types
from processor.config import AGENT_CONFIG
from processor.agents.base import _gemini

_cfg = AGENT_CONFIG["image"]
_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}


class ImageAgent:
    model = _cfg["model"]
    system_prompt = _cfg["system_prompt"]

    def __init__(self, file_path: str, mcp_client: Client):
        self.file_path = file_path
        self.mcp_client = mcp_client

    async def run(self) -> None:
        path = Path(self.file_path)
        mime = _MIME.get(path.suffix.lower(), "image/jpeg")
        image_part = types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)

        await _gemini.aio.models.generate_content(
            model=self.model,
            contents=[
                image_part,
                f"This is {path.name}. Identify all financial transactions and store each with df_dump_row.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=self.system_prompt,
                tools=[self.mcp_client.session],
            ),
        )
