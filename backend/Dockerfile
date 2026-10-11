FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend backend
COPY data data
RUN chmod +x backend/entrypoint.sh && useradd --create-home app && chown -R app /app
USER app

EXPOSE 8000
ENTRYPOINT ["backend/entrypoint.sh"]
