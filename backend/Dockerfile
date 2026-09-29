# ---------- builder ----------
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ---------- final ----------
FROM python:3.12-slim

RUN groupadd -r civicpulse && useradd -r -g civicpulse civicpulse

WORKDIR /app

COPY --from=builder /root/.local /home/civicpulse/.local
COPY . .

RUN chown -R civicpulse:civicpulse /app
USER civicpulse

ENV PATH=/home/civicpulse/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]