FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips libvips-tools && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/image_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared /shared
RUN pip install --no-cache-dir -e /shared

COPY services/image_service .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
