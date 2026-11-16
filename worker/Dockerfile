FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker /app/worker
RUN pip install --no-cache-dir -r /app/worker/requirements.txt -c /app/worker/constraints.txt && useradd --create-home --uid 10001 quest && mkdir /data && chown quest:quest /data
USER quest
ENV Q_RESEARCH_DATA=/data QUEST_BROWSER_EXECUTABLE=/usr/bin/chromium PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8080
CMD ["uvicorn", "worker.app:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
