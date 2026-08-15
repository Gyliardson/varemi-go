from __future__ import annotations

from fastapi.testclient import TestClient


def _create_session(client: TestClient) -> str:
    response = client.post("/api/stores/demo-market/sessions")
    assert response.status_code == 201
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    payload = response.json()
    assert "sessionToken" not in payload
    return payload["cart"]["id"]


def test_health_and_store(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/stores/demo-market").json() == {
        "slug": "demo-market",
        "name": "Mercado Demo",
    }
    response = client.get("/api/stores/missing")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "STORE_NOT_FOUND"


def test_full_cart_api_flow_is_authoritative_and_recoverable(client: TestClient) -> None:
    session_id = _create_session(client)

    added = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-request-0001"},
        json={"barcode": "7890000000017"},
    )
    assert added.status_code == 200
    assert added.json()["totalCents"] == 2799

    retry = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-request-0001"},
        json={"barcode": "7890000000017"},
    )
    assert retry.json()["items"][0]["quantity"] == 1

    second = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-request-0002"},
        json={"barcode": "7890000000024"},
    )
    assert second.json()["totalCents"] == 3448

    quantity = client.patch(f"/api/sessions/{session_id}/items/7890000000017", json={"quantity": 2})
    assert quantity.json()["totalCents"] == 6247

    removed = client.delete(f"/api/sessions/{session_id}/items/7890000000024")
    assert removed.json()["totalCents"] == 5598

    recovered = client.get(f"/api/sessions/{session_id}")
    assert recovered.status_code == 200
    assert recovered.json()["totalCents"] == 5598
    assert recovered.json()["items"][0]["priceSource"] == "demo-catalog:v1"


def test_api_rejects_client_errors_and_unknown_catalog_entries(client: TestClient) -> None:
    session_id = _create_session(client)

    invalid = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-invalid-001"},
        json={"barcode": "123"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "INVALID_BARCODE"

    unknown = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-unknown-001"},
        json={"barcode": "7890000000994"},
    )
    assert unknown.status_code == 404
    assert unknown.json()["detail"]["code"] == "PRODUCT_NOT_FOUND"

    isolated = TestClient(client.app)
    unauthorized = isolated.get(f"/api/sessions/{session_id}")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["detail"]["code"] == "SESSION_UNAUTHORIZED"


def test_api_detects_idempotency_key_reuse(client: TestClient) -> None:
    session_id = _create_session(client)
    headers = {"Idempotency-Key": "api-conflict-001"}
    assert (
        client.post(
            f"/api/sessions/{session_id}/items",
            headers=headers,
            json={"barcode": "7890000000017"},
        ).status_code
        == 200
    )
    conflict = client.post(
        f"/api/sessions/{session_id}/items",
        headers=headers,
        json={"barcode": "7890000000024"},
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_KEY_REUSED"
