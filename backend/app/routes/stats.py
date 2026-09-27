import json
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session
from app.db import get_db
from app.repositories import complaint_repository as repo
from app.redis_client import redis_client

router = APIRouter(prefix="/api/stats", tags=["stats"])

STATS_CACHE_KEY = "stats:aggregate"
STATS_CACHE_TTL_SECONDS = 30


@router.get("")
def get_stats(response: Response, db: Session = Depends(get_db)):
    cached = redis_client.get(STATS_CACHE_KEY)
    if cached is not None:
        response.headers["X-Cache"] = "HIT"
        return json.loads(cached)

    by_category, by_priority = repo.stats_by_category_and_priority(db)
    result = {"by_category": by_category, "by_priority": by_priority}

    redis_client.setex(STATS_CACHE_KEY, STATS_CACHE_TTL_SECONDS, json.dumps(result))

    response.headers["X-Cache"] = "MISS"
    return result