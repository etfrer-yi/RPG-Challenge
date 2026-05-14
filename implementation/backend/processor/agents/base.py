import os
from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from google import genai
from google.genai import types
import sys


DF_COLUMNS = ["origin", "date", "description", "actor", "amount"]

def _get_gemini() -> genai.Client:
    return genai.Client(api_key=os.environ["GOOGLE_API_KEY"])

def _mcp_transport() -> StdioTransport:
    return StdioTransport(
        command=sys.executable,
        args=["-m", "processor.mcp.server"],
        env={"GOOGLE_API_KEY": os.environ.get("GOOGLE_API_KEY", "")},
    )

class BaseAgent:
    model: str = "gemini-2.5-flash"
    system_prompt: str = ""

    def __init__(self, file_path: str, mcp_client: Client):
        self.file_path = file_path
        self.mcp_client = mcp_client

    def user_message(self) -> str:
        return f"Process this file: {self.file_path}"

    async def run(self) -> None:
        import pathlib
        import json
        fname = pathlib.Path(self.file_path).name
        print(f"\n[LLM] Invoking {self.__class__.__name__} for {fname}", flush=True)
        try:
            result = await _get_gemini().aio.models.generate_content(
                model=self.model,
                contents=self.user_message(),
                config=types.GenerateContentConfig(
                    system_instruction=self.system_prompt,
                    tools=[self.mcp_client.session],
                ),
            )
            
            print(f"[LLM] Completed {fname}: {result}", flush=True)
            return result
        except Exception as e:
            print(f"[LLM] Error processing {fname}: {e}", flush=True)
            raise
