from app.redis_client import redis_client
from sqlalchemy.orm import Session
from uuid import UUID
from app.models import Complaint, Status
from app.repositories import complaint_repository as repo
from app.providers.triage.factory import triage_with_fallback

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
    result, triaged_by, latency_ms = triage_with_fallback(text, location)

    complaint = Complaint(
        text=text,
        location=location,
        reporter_contact=reporter_contact,
        category=result.category,
        priority=result.priority,
        ai_summary=result.summary,
        triaged_by=triaged_by,
        triage_latency_ms=latency_ms,
        status=Status.open,
    )
    created = repo.create_complaint(db, complaint)
    redis_client.delete("stats:aggregate")  # invalidate cache so new complaint appears immediately
    return created

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