import json
import os
from datetime import datetime, timezone
from io import BytesIO

from flask import Flask, jsonify, request
from minio import Minio

from analyzer import analyze_python


def env_bool(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() == "true"


def env_int(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "127.0.0.1")
MINIO_PORT = env_int("MINIO_PORT", 9000)
MINIO_USE_SSL = env_bool("MINIO_USE_SSL", False)
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "strongpassword")
MINIO_SOURCE_BUCKET = os.getenv("MINIO_SOURCE_BUCKET", "preprocessed")
MINIO_RESULT_BUCKET = os.getenv("MINIO_RESULT_BUCKET", "processed-files")
WORKER_PORT = env_int("WORKER_PY_PORT", 4003)

minio_client = Minio(
    endpoint=f"{MINIO_ENDPOINT}:{MINIO_PORT}",
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_USE_SSL
)

app = Flask(__name__)


def ensure_bucket(bucket_name):
    if not minio_client.bucket_exists(bucket_name):
        minio_client.make_bucket(bucket_name)


def ensure_core_buckets():
    ensure_bucket(MINIO_SOURCE_BUCKET)
    ensure_bucket(MINIO_RESULT_BUCKET)


def read_object(bucket_name, object_key):
    response = minio_client.get_object(bucket_name, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def write_json(bucket_name, object_key, payload):
    body = json.dumps(payload, indent=2).encode("utf-8")
    minio_client.put_object(
        bucket_name,
        object_key,
        BytesIO(body),
        length=len(body),
        content_type="application/json"
    )


@app.get("/health")
def health():
    return jsonify({
        "service": "worker-python",
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat()
    })


@app.post("/process")
def process():
    source_bucket = request.headers.get("x-manager-source-bucket", MINIO_SOURCE_BUCKET)
    result_bucket = request.headers.get("x-manager-result-bucket", MINIO_RESULT_BUCKET)
    task = request.get_json(silent=True) or {}
    artifact = task.get("artifact") or {}
    object_key = artifact.get("objectKey")
    object_hash = artifact.get("hash")

    if not object_key or not object_hash:
        return jsonify({"error": "artifact.objectKey and artifact.hash are required"}), 400

    try:
        code = read_object(source_bucket, object_key).decode("utf-8-sig")
        analysis = analyze_python(code, {
            "objectKey": object_key,
            "originalName": artifact.get("originalName"),
            "hash": object_hash,
        })
        result_object_key = f"{object_hash}.json"

        payload = {
            "jobId": task.get("jobId"),
            "language": task.get("language"),
            "source": artifact,
            "processedAt": datetime.now(timezone.utc).isoformat(),
            "worker": "worker-python",
            "analysis": analysis
        }

        write_json(result_bucket, result_object_key, payload)

        return jsonify({
            "worker": "worker-python",
            "resultObjectKey": result_object_key,
            "analysisSummary": analysis["summary"]
        })
    except Exception as error:
        return jsonify({"error": str(error)}), 500


if __name__ == "__main__":
    ensure_core_buckets()
    app.run(host="0.0.0.0", port=WORKER_PORT)
