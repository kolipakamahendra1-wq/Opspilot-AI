FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# The mock service reuses the shared SQLAlchemy models.
COPY backend backend
COPY mock_service mock_service
RUN useradd --create-home app
USER app

EXPOSE 8001
CMD ["uvicorn", "mock_service.main:app", "--host", "0.0.0.0", "--port", "8001"]
