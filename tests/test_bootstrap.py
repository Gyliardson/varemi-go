from fastapi.testclient import TestClient

from apps.api.main import app
from varemi_go import __version__


def test_package_version_is_defined() -> None:
    assert __version__ == "0.1.0"


def test_health_endpoint() -> None:
    response = TestClient(app).get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
