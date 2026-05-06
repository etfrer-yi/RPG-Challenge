import sys
from fastmcp import Client
from google import genai
from google.genai import types

MCP_SERVER_CMD = [sys.executable, "-m", "processor.mcp.server"]

_gemini = genai.Client()

DF_COLUMNS = ["origin", "date", "description", "actor", "amount"]


class BaseAgent:
    model: str = "gemini-2.5-flash"
    system_prompt: str = ""

    def __init__(self, file_path: str, mcp_client: Client):
        self.file_path = file_path
        self.mcp_client = mcp_client

    def user_message(self) -> str:
        return f"Process this file: {self.file_path}"

    async def run(self) -> None:
        await _gemini.aio.models.generate_content(
            model=self.model,
            contents=self.user_message(),
            config=types.GenerateContentConfig(
                system_instruction=self.system_prompt,
                tools=[self.mcp_client.session],
            ),
        )
