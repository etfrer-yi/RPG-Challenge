from processor.agents.base import BaseAgent
from processor.config import AGENT_CONFIG

_cfg = AGENT_CONFIG["spreadsheet"]


class SpreadsheetAgent(BaseAgent):
    model = _cfg["model"]
    system_prompt = _cfg["system_prompt"]

    def user_message(self) -> str:
        return (
            f"Extract all completed (paid) financial transactions from this spreadsheet: {self.file_path}\n"
            "Follow the steps in your instructions exactly: preview, read all columns, filter unpaid rows, clean values, then dump."
        )
