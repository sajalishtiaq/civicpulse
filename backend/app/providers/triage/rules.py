from app.providers.triage.base import TriageResult
from app.models import Category, Priority


class RuleBasedTriage:
    name = "rules"

    def triage(self, text: str, location: str) -> TriageResult:
        lowered = text.lower()

        if "water" in lowered or "flood" in lowered:
            category = Category.water
        elif "electric" in lowered or "power" in lowered:
            category = Category.electricity
        elif "road" in lowered or "pothole" in lowered:
            category = Category.roads
        elif "light" in lowered:
            category = Category.streetlights
        elif "sewage" in lowered or "garbage" in lowered or "trash" in lowered:
            category = Category.sanitation
        else:
            category = Category.other

        priority = Priority.high if ("urgent" in lowered or "flood" in lowered) else Priority.normal
        summary = text[:137] + "..." if len(text) > 140 else text

        return TriageResult(
            category=category,
            priority=priority,
            summary=summary,
            confidence=0.5,
        )