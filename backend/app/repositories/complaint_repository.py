from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import Optional
from app.models import Complaint, Category, Priority, Status

def create_complaint(db: Session, complaint: Complaint) -> Complaint:
    db.add(complaint)
    db.commit()
    db.refresh(complaint)
    return complaint

def get_complaint(db: Session, complaint_id: UUID) -> Optional[Complaint]:
    return db.query(Complaint).filter(Complaint.id == complaint_id).first()

def list_complaints(
    db: Session,
    category: Optional[Category],
    priority: Optional[Priority],
    status: Optional[Status],
    page: int,
    page_size: int,
):
    query = db.query(Complaint)
    if category:
        query = query.filter(Complaint.category == category)
    if priority:
        query = query.filter(Complaint.priority == priority)
    if status:
        query = query.filter(Complaint.status == status)
    total = query.count()
    items = query.order_by(Complaint.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return items, total

def update_status(db: Session, complaint: Complaint, new_status: Status) -> Complaint:
    complaint.status = new_status
    db.commit()
    db.refresh(complaint)
    return complaint

def stats_by_category_and_priority(db: Session):
    by_category = dict(db.query(Complaint.category, func.count()).group_by(Complaint.category).all())
    by_priority = dict(db.query(Complaint.priority, func.count()).group_by(Complaint.priority).all())
    return by_category, by_priority