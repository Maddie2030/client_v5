FROM python:3.12-slim

WORKDIR /app

COPY services/catalog_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY services/catalog_service .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
