from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from app.db import get_db
from app.schemas import ComplaintCreate, ComplaintOut, StatusUpdate
from app.models import Category, Priority, Status
from app.services import complaint_service as service
from app.rate_limiter import check_rate_limit

router = APIRouter(prefix="/api/complaints", tags=["complaints"])
@router.post("", response_model=ComplaintOut, status_code=201)
def create_complaint(payload: ComplaintCreate, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = check_rate_limit(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    
    complaint = service.create_complaint(db, payload.text, payload.location, payload.reporter_contact)
    return complaint

@router.get("/{complaint_id}", response_model=ComplaintOut)
def get_complaint(complaint_id: UUID, db: Session = Depends(get_db)):
    try:
        return service.get_complaint(db, complaint_id)
    except service.NotFoundError:
        raise HTTPException(status_code=404, detail="Complaint not found")

@router.get("", response_model=dict)
def list_complaints(
    category: Optional[Category] = None,
    priority: Optional[Priority] = None,
    status: Optional[Status] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    from app.repositories import complaint_repository as repo
    items, total = repo.list_complaints(db, category, priority, status, page, page_size)
    return {
        "items": [ComplaintOut.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }

@router.patch("/{complaint_id}/status", response_model=ComplaintOut)
def update_status(complaint_id: UUID, payload: StatusUpdate, db: Session = Depends(get_db)):
    try:
        return service.transition_status(db, complaint_id, payload.status)
    except service.NotFoundError:
        raise HTTPException(status_code=404, detail="Complaint not found")
    except service.InvalidTransitionError as e:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot transition from '{e.current.value}' to '{e.attempted.value}'",
        )