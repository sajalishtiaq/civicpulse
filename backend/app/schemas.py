from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.models import Category, Priority, Status

class ComplaintCreate(BaseModel):
    text: str = Field(min_length=10, max_length=2000)
    location: str = Field(min_length=3, max_length=200)
    reporter_contact: Optional[str] = None

class ComplaintOut(BaseModel):
    id: UUID
    text: str
    location: str
    reporter_contact: Optional[str]
    category: Category
    priority: Priority
    status: Status
    ai_summary: Optional[str]
    triaged_by: Optional[str]
    triage_latency_ms: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class StatusUpdate(BaseModel):
    status: Status