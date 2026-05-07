import os
import shutil
import tempfile
import uuid

import docker
from fastapi import FastAPI, HTTPException, UploadFile, File
from typing import List
from fastapi.middleware.cors import CORSMiddleware
import logging

logger = logging.getLogger(__name__)
app = FastAPI()


@app.on_event("startup")
def verify_docker():
    logger.info("Verifying Docker access")
    try:
        client = docker.from_env()
        client.ping()
        logger.info("Docker installed")
    except Exception as e:
        raise RuntimeError(f"Docker is not available — cannot start server: {e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

PROCESSING_IMAGE = "doc-processor:latest"
CONTAINER_DATA_DIR = "/app/data"

ALLOWED_EXTENSIONS = {".pdf", ".csv", ".xlsx", ".jpg", ".jpeg", ".png", ".txt", ".docx"}


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    for file in files:
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed: {file.filename}")

    tmp_dir = tempfile.mkdtemp(prefix="upload_")
    try:
        for file in files:
            dest = os.path.join(tmp_dir, file.filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(file.file, f)

        client = docker.from_env()

        container = client.containers.run(
            image=PROCESSING_IMAGE,
            name=f"processor-{uuid.uuid4().hex[:8]}",
            volumes={tmp_dir: {"bind": CONTAINER_DATA_DIR, "mode": "rw"}},
            environment={"GOOGLE_API_KEY": os.environ.get("GOOGLE_API_KEY", "")},
            detach=True,
            remove=False,
        )

        return {
            "files": [f.filename for f in files],
            "container_id": container.short_id,
            "status": "container_started",
        }

    except HTTPException:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise
    except docker.errors.ImageNotFound:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Docker image '{PROCESSING_IMAGE}' not found. Build it first: docker build -t {PROCESSING_IMAGE} .",
        )
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))
