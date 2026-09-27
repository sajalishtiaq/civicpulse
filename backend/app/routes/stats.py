from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.repositories import complaint_repository as repo

router = APIRouter(prefix="/api/stats", tags=["stats"])

@router.get("")
def get_stats(db: Session = Depends(get_db)):
    by_category, by_priority = repo.stats_by_category_and_priority(db)
    return {"by_category": by_category, "by_priority": by_priority}