from sqlalchemy import Column, String, Integer, DateTime, Enum, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.db import Base
import enum

class Category(str, enum.Enum):
    water = "water"
    electricity = "electricity"
    sanitation = "sanitation"
    roads = "roads"
    streetlights = "streetlights"
    other = "other"

class Priority(str, enum.Enum):
    high = "high"
    normal = "normal"
    low = "low"

class Status(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"
    rejected = "rejected"

class Complaint(Base):
    __tablename__ = "complaints"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    text = Column(String(2000), nullable=False)
    location = Column(String(200), nullable=False)
    reporter_contact = Column(String(200), nullable=True)
    category = Column(Enum(Category, name="category_enum"), nullable=False)
    priority = Column(Enum(Priority, name="priority_enum"), nullable=False)
    status = Column(Enum(Status, name="status_enum"), nullable=False, default=Status.open)
    ai_summary = Column(String(140), nullable=True)
    triaged_by = Column(String(50), nullable=True)
    triage_latency_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())