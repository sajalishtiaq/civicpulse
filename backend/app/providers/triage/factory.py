import time
from app.config import settings
from app.providers.triage.base import TriageProvider, TriageResult
from app.providers.triage.rules import RuleBasedTriage
from app.providers.triage.simulated import SimulatedTriage, AlwaysFailsTriage, AlwaysMalformedTriage


def get_triage_provider() -> TriageProvider:
    provider = settings.triage_provider

    if provider == "rules":
        return RuleBasedTriage()
    elif provider == "simulated":
        return SimulatedTriage()
    elif provider == "llm":
        from app.providers.triage.llm import LLMTriage
        return LLMTriage()
    elif provider == "always_fails":
        return AlwaysFailsTriage()
    elif provider == "always_malformed":
        return AlwaysMalformedTriage()
    else:
        raise ValueError(f"Unknown TRIAGE_PROVIDER: {provider}")


def triage_with_fallback(text: str, location: str) -> tuple[TriageResult, str, int]:
    provider = get_triage_provider()
    start = time.monotonic()
    try:
        result = provider.triage(text, location)
        if not isinstance(result, TriageResult):
            raise TypeError(f"Provider {provider.name} returned invalid type: {type(result)}")
        latency_ms = int((time.monotonic() - start) * 1000)
        return result, provider.name, latency_ms
    except Exception:
        fallback = RuleBasedTriage()
        result = fallback.triage(text, location)
        latency_ms = int((time.monotonic() - start) * 1000)
        return result, "rules:fallback", latency_ms