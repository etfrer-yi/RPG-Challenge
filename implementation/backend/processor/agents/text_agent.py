from processor.agents.base import BaseAgent
from processor.config import AGENT_CONFIG

_cfg = AGENT_CONFIG["text"]


class TextAgent(BaseAgent):
    model = _cfg["model"]
    system_prompt = _cfg["system_prompt"]
