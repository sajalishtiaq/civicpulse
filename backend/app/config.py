import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    triage_provider: str = os.getenv("TRIAGE_PROVIDER", "rules")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

settings = Settings()