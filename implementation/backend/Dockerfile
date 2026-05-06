FROM python:3.12-slim

WORKDIR /app
RUN mkdir -p /app/data

COPY processor/requirements.txt ./processor/requirements.txt
RUN pip install --no-cache-dir -r processor/requirements.txt

COPY processor/ ./processor/

CMD ["python", "-m", "processor.main_processor"]
