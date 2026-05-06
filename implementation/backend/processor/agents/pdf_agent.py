from processor.agents.base import BaseAgent
from processor.config import AGENT_CONFIG

_cfg = AGENT_CONFIG["pdf"]


class PDFAgent(BaseAgent):
    model = _cfg["model"]
    system_prompt = _cfg["system_prompt"]

    def user_message(self) -> str:
        return f"Extract all financial transactions from: {self.file_path}"
