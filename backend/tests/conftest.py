import os
import shutil
import sys
import tempfile
from pathlib import Path

# main.py / mcp_server.py read these at import time — set before importing.
_upload_dir = tempfile.mkdtemp(prefix="artifact-test-uploads-")
_frontend_dir = tempfile.mkdtemp(prefix="artifact-test-frontend-")
Path(_frontend_dir, "index.html").write_text("<html>SPA</html>")
# A secret file OUTSIDE the frontend dir, target for traversal tests.
Path(_frontend_dir).parent.joinpath("artifact-test-secret.txt").write_text("secret-marker")

os.environ["ARTIFACT_UPLOAD_DIR"] = _upload_dir
os.environ["ARTIFACT_FRONTEND_DIR"] = _frontend_dir
os.environ["ARTIFACT_PASSWORD"] = "test-password"
os.environ["ARTIFACT_MCP_TOKEN"] = "test-mcp-token"
os.environ["ARTIFACT_AUTH_MODE"] = "password"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402


@pytest.fixture(autouse=True)
def upload_dir():
    d = Path(_upload_dir)
    d.mkdir(parents=True, exist_ok=True)
    yield d
    for item in d.iterdir():
        shutil.rmtree(item) if item.is_dir() else item.unlink()
    main.active_sessions.clear()


@pytest.fixture()
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture()
def auth_client(client):
    res = client.post("/api/auth/login", json={"password": "test-password"})
    assert res.status_code == 200
    return client
