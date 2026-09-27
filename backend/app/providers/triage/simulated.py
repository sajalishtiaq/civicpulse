from app.providers.triage.base import TriageResult
from app.models import Category, Priority


class SimulatedTriage:
    """Deterministic fake for CI — no network calls."""
    name = "simulated"

    def triage(self, text: str, location: str) -> TriageResult:
        return TriageResult(
            category=Category.other,
            priority=Priority.normal,
            summary=text[:137] + "..." if len(text) > 140 else text,
            confidence=0.99,
        )


class AlwaysFailsTriage:
    """Test double: always raises, to prove the fallback path works."""
    name = "always_fails"

    def triage(self, text: str, location: str) -> TriageResult:
        raise RuntimeError("Simulated provider failure")


class AlwaysMalformedTriage:
    """Test double: returns something that won't validate against TriageResult."""
    name = "always_malformed"

    def triage(self, text: str, location: str):
        return {"not": "a valid TriageResult"}