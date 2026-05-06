import sys, os
from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from google import genai
from google.genai import types

def _mcp_transport() -> StdioTransport:
    return StdioTransport(
        command=sys.executable,
        args=["-m", "processor.mcp.server"],
        env={"GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY", "")},
    )

DF_COLUMNS = ["origin", "date", "description", "actor", "amount"]

def _get_gemini() -> genai.Client:
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


class BaseAgent:
    model: str = "gemini-2.5-flash"
    system_prompt: str = ""

    def __init__(self, file_path: str, mcp_client: Client):
        self.file_path = file_path
        self.mcp_client = mcp_client

    def user_message(self) -> str:
        return f"Process this file: {self.file_path}"

    async def run(self) -> None:
        await _get_gemini().aio.models.generate_content(
            model=self.model,
            contents=self.user_message(),
            config=types.GenerateContentConfig(
                system_instruction=self.system_prompt,
                tools=[self.mcp_client.session],
            ),
        )
