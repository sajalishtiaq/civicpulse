from sqlalchemy.orm import Session
from uuid import UUID
from app.models import Complaint, Status
from app.repositories import complaint_repository as repo

class NotFoundError(Exception):
    pass

class InvalidTransitionError(Exception):
    def __init__(self, current: Status, attempted: Status):
        self.current = current
        self.attempted = attempted

ALLOWED_TRANSITIONS = {
    Status.open: {Status.in_progress, Status.rejected},
    Status.in_progress: {Status.resolved, Status.rejected},
    Status.resolved: set(),
    Status.rejected: set(),
}

def create_complaint(db: Session, text: str, location: str, reporter_contact: str | None) -> Complaint:
    category, priority, summary, triaged_by, latency_ms = _stub_triage(text)

    complaint = Complaint(
        text=text,
        location=location,
        reporter_contact=reporter_contact,
        category=category,
        priority=priority,
        ai_summary=summary,
        triaged_by=triaged_by,
        triage_latency_ms=latency_ms,
        status=Status.open,
    )
    return repo.create_complaint(db, complaint)

def _stub_triage(text: str):
    from app.models import Category, Priority
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
    priority = Priority.high if "urgent" in lowered or "flood" in lowered else Priority.normal
    summary = text[:137] + "..." if len(text) > 140 else text
    return category, priority, summary, "rules", 0

def get_complaint(db: Session, complaint_id: UUID) -> Complaint:
    complaint = repo.get_complaint(db, complaint_id)
    if not complaint:
        raise NotFoundError()
    return complaint

def transition_status(db: Session, complaint_id: UUID, new_status: Status) -> Complaint:
    complaint = get_complaint(db, complaint_id)
    if new_status not in ALLOWED_TRANSITIONS[complaint.status]:
        raise InvalidTransitionError(complaint.status, new_status)
    return repo.update_status(db, complaint, new_status)