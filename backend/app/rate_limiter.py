import time
from app.redis_client import redis_client

RATE_LIMIT_MAX_REQUESTS = 10
RATE_LIMIT_WINDOW_SECONDS = 60


def check_rate_limit(client_ip: str) -> tuple[bool, int]:
    key = f"ratelimit:{client_ip}"
    current = redis_client.incr(key)
    if current == 1:
        redis_client.expire(key, RATE_LIMIT_WINDOW_SECONDS)

    if current > RATE_LIMIT_MAX_REQUESTS:
        ttl = redis_client.ttl(key)
        retry_after = ttl if ttl > 0 else RATE_LIMIT_WINDOW_SECONDS
        return False, retry_after

    return True, 0