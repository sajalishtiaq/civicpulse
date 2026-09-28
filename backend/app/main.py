import logging
import json
import uuid
from fastapi import FastAPI, Request
from app.routes import complaints, health, stats, meta
from fastapi.middleware.cors import CORSMiddleware


class JsonFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "level": record.levelname,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
        })

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler])
logger = logging.getLogger("civicpulse")

app = FastAPI(title="CivicPulse")

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    logger.info(f"{request.method} {request.url.path}", extra={"request_id": request_id})
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache", "Retry-After", "X-Request-ID"],
)

app.include_router(complaints.router)
app.include_router(health.router)
app.include_router(stats.router)
app.include_router(meta.router)