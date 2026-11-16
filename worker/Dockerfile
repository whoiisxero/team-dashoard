FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/requirements.txt worker/constraints.txt /app/worker/
COPY worker/vendor /app/worker/vendor
RUN pip install --no-cache-dir -r /app/worker/requirements.txt -c /app/worker/constraints.txt && useradd --create-home --uid 10001 quest && mkdir /data && chown quest:quest /data
COPY worker /app/worker
RUN chmod -R a+rX /app/worker && chmod 755 /app/worker/chromium_launcher.py
USER quest
ENV Q_RESEARCH_DATA=/data QUEST_BROWSER_EXECUTABLE=/app/worker/chromium_launcher.py PYTHONUNBUFFERED=1
VOLUME ["/data"]
EXPOSE 8080
CMD ["python", "-m", "worker.start"]
