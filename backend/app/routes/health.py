from fastapi import APIRouter, Response
from sqlalchemy import text
from app.db import SessionLocal

router = APIRouter()

@router.get("/health")
def health():
    return {"status": "alive"}

@router.get("/ready")
def ready(response: Response):
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception:
        response.status_code = 503
        return {"status": "not ready", "reason": "database unreachable"}
    return {"status": "ready"}