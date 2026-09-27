from fastapi import APIRouter
from app.config import settings

router = APIRouter(prefix="/api/meta", tags=["meta"])

@router.get("/providers")
def providers():
    return {"active_provider": settings.triage_provider, "recent_outcomes": []}