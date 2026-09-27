import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    triage_provider: str = os.getenv("TRIAGE_PROVIDER", "rules")

settings = Settings()