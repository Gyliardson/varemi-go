from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from varemi_go.api import create_app
from varemi_go.catalog import DemoCatalogProvider
from varemi_go.domain import CatalogQuote, Store
from varemi_go.persistence import SqliteCartRepository


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
    assert response.json()["code"] == "STORE_NOT_FOUND"


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

    quantity = client.patch(
        f"/api/sessions/{session_id}/items/7890000000017",
        json={"quantity": 2, "expectedQuantity": 1},
    )
    assert quantity.json()["totalCents"] == 6247

    removed = client.delete(f"/api/sessions/{session_id}/items/7890000000024")
    assert removed.status_code == 200
    assert removed.json()["totalCents"] == 5598

    remove_retry = client.delete(f"/api/sessions/{session_id}/items/7890000000024")
    assert remove_retry.status_code == 200
    assert remove_retry.json()["totalCents"] == 5598
    assert all(item["barcode"] != "7890000000024" for item in remove_retry.json()["items"])

    recovered = client.get(f"/api/sessions/{session_id}")
    assert recovered.status_code == 200
    assert recovered.json()["totalCents"] == 5598
    assert recovered.json()["items"][0]["priceSource"] == "demo-catalog:v1"


def test_quantity_compare_and_set_rejects_stale_snapshot(client: TestClient) -> None:
    session_id = _create_session(client)
    barcode = "7890000000017"

    initial = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-quantity-0001"},
        json={"barcode": barcode},
    )
    assert initial.status_code == 200
    assert initial.json()["items"][0]["quantity"] == 1

    concurrent_scan = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-quantity-0002"},
        json={"barcode": barcode},
    )
    assert concurrent_scan.status_code == 200
    assert concurrent_scan.json()["items"][0]["quantity"] == 2

    stale_patch = client.patch(
        f"/api/sessions/{session_id}/items/{barcode}",
        json={"quantity": 2, "expectedQuantity": 1},
    )
    assert stale_patch.status_code == 409
    assert stale_patch.json() == {
        "code": "QUANTITY_CONFLICT",
        "message": "Cart item quantity changed; recover authoritative cart state",
    }

    authoritative = client.get(f"/api/sessions/{session_id}")
    assert authoritative.status_code == 200
    assert authoritative.json()["items"][0]["quantity"] == 2
    assert authoritative.json()["totalCents"] == 2 * 2799

    sequential = client.patch(
        f"/api/sessions/{session_id}/items/{barcode}",
        json={"quantity": 3, "expectedQuantity": 2},
    )
    assert sequential.status_code == 200
    assert sequential.json()["items"][0]["quantity"] == 3
    assert sequential.json()["totalCents"] == 3 * 2799


def test_api_rejects_client_errors_and_unknown_catalog_entries(client: TestClient) -> None:
    session_id = _create_session(client)

    invalid = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-invalid-001"},
        json={"barcode": "123"},
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_BARCODE"

    unknown = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-unknown-001"},
        json={"barcode": "7890000000994"},
    )
    assert unknown.status_code == 404
    assert unknown.json()["code"] == "PRODUCT_NOT_FOUND"

    isolated = TestClient(client.app)
    unauthorized = isolated.get(f"/api/sessions/{session_id}")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["code"] == "SESSION_UNAUTHORIZED"


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
    assert conflict.json()["code"] == "IDEMPOTENCY_KEY_REUSED"


class ToggleCatalogProvider:
    def __init__(self) -> None:
        self._delegate = DemoCatalogProvider()
        self.available = True
        self.calls = 0

    def get_quote(self, store: Store, barcode: str) -> CatalogQuote:
        self.calls += 1
        if not self.available:
            raise RuntimeError("provider unavailable")
        return self._delegate.get_quote(store, barcode)


def test_completed_idempotent_replay_does_not_call_provider_again(
    repository: SqliteCartRepository,
) -> None:
    provider = ToggleCatalogProvider()
    with TestClient(create_app(repository=repository, provider=provider)) as replay_client:
        session_id = _create_session(replay_client)
        headers = {"Idempotency-Key": "api-replay-0001"}
        first = replay_client.post(
            f"/api/sessions/{session_id}/items",
            headers=headers,
            json={"barcode": "7890000000017"},
        )
        assert first.status_code == 200
        assert first.json()["items"][0]["quantity"] == 1
        assert provider.calls == 1

        provider.available = False
        replay = replay_client.post(
            f"/api/sessions/{session_id}/items",
            headers=headers,
            json={"barcode": "7890000000017"},
        )
        assert replay.status_code == 200
        assert replay.json()["items"][0]["quantity"] == 1
        assert provider.calls == 1

        conflict = replay_client.post(
            f"/api/sessions/{session_id}/items",
            headers=headers,
            json={"barcode": "7890000000024"},
        )
        assert conflict.status_code == 409
        assert conflict.json() == {
            "code": "IDEMPOTENCY_KEY_REUSED",
            "message": "Idempotency key was already used for a different request",
        }
        assert provider.calls == 1


def test_error_wire_contract_and_openapi_match(
    client: TestClient, repository: SqliteCartRepository
) -> None:
    missing_store = client.get("/api/stores/missing")
    assert missing_store.status_code == 404
    assert missing_store.json()["code"] == "STORE_NOT_FOUND"

    store = repository.get_store_by_slug("demo-market")
    expired_cart, token = repository.create_session(store, now=datetime(2020, 1, 1, tzinfo=UTC))
    expired = client.get(
        f"/api/sessions/{expired_cart.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert expired.status_code == 410
    assert expired.json()["code"] == "CART_EXPIRED"

    session_id = _create_session(client)
    unauthorized = TestClient(client.app).get(f"/api/sessions/{session_id}")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["code"] == "SESSION_UNAUTHORIZED"

    validation = client.post(
        f"/api/sessions/{session_id}/items",
        headers={"Idempotency-Key": "api-validation-001"},
        json={"barcode": "7890000000017", "price": 1},
    )
    assert validation.status_code == 422
    assert validation.json() == {
        "code": "VALIDATION_ERROR",
        "message": "Request validation failed",
    }

    headers = {"Idempotency-Key": "api-contract-conflict"}
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
    assert conflict.json()["code"] == "IDEMPOTENCY_KEY_REUSED"

    openapi = client.get("/openapi.json").json()
    add_responses = openapi["paths"]["/api/sessions/{session_id}/items"]["post"]["responses"]
    for status_code in ("401", "404", "409", "410", "422"):
        schema = add_responses[status_code]["content"]["application/json"]["schema"]
        assert schema["$ref"] == "#/components/schemas/ErrorBody"

    patch_responses = openapi["paths"]["/api/sessions/{session_id}/items/{barcode}"]["patch"][
        "responses"
    ]
    for status_code in ("401", "404", "409", "410", "422"):
        schema = patch_responses[status_code]["content"]["application/json"]["schema"]
        assert schema["$ref"] == "#/components/schemas/ErrorBody"
