from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Annotated, Any

from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from varemi_go.catalog import CatalogProvider, DemoCatalogProvider, ProductNotFoundError
from varemi_go.domain import Cart, InvalidBarcodeError, normalize_gtin
from varemi_go.persistence import (
    CartExpiredError,
    IdempotencyConflictError,
    ItemNotFoundError,
    SessionNotFoundError,
    SessionUnauthorizedError,
    SqliteCartRepository,
    StoreNotFoundError,
)


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ErrorBody(ApiModel):
    code: str
    message: str


class StoreResponse(ApiModel):
    slug: str
    name: str


class CartItemResponse(ApiModel):
    barcode: str
    product_id: str = Field(serialization_alias="productId")
    name: str
    quantity: int
    unit_price_cents: int = Field(serialization_alias="unitPriceCents")
    line_total_cents: int = Field(serialization_alias="lineTotalCents")
    currency: str
    promotion_label: str | None = Field(serialization_alias="promotionLabel")
    price_source: str = Field(serialization_alias="priceSource")
    price_effective_at: str = Field(serialization_alias="priceEffectiveAt")


class CartResponse(ApiModel):
    id: str
    store: StoreResponse
    state: str
    expires_at: str = Field(serialization_alias="expiresAt")
    updated_at: str = Field(serialization_alias="updatedAt")
    items: list[CartItemResponse]
    total_cents: int = Field(serialization_alias="totalCents")
    currency: str = "BRL"


class SessionCreatedResponse(ApiModel):
    cart: CartResponse


class AddItemRequest(ApiModel):
    barcode: str = Field(min_length=1, max_length=64)


class QuantityRequest(ApiModel):
    quantity: int = Field(ge=1, le=999)


class HealthResponse(ApiModel):
    status: str


class RequestContext:
    def __init__(self, repository: SqliteCartRepository, provider: CatalogProvider) -> None:
        self.repository = repository
        self.provider = provider


def create_app(
    *,
    repository: SqliteCartRepository | None = None,
    provider: CatalogProvider | None = None,
    serve_web: bool | None = None,
) -> FastAPI:
    database_path = Path(os.getenv("VAREMI_DATABASE_PATH", ".var/varemi-go.db"))
    session_ttl_seconds = int(os.getenv("VAREMI_SESSION_TTL_SECONDS", "86400"))
    resolved_repository = repository or SqliteCartRepository(
        database_path, session_ttl_seconds=session_ttl_seconds
    )
    resolved_provider = provider or DemoCatalogProvider()
    resolved_repository.migrate()
    context = RequestContext(resolved_repository, resolved_provider)

    app = FastAPI(
        title="Varemi Go API",
        version="0.1.0",
        description="Authoritative session, catalog quote, and cart API for the Varemi Go MVP.",
    )
    app.state.context = context

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok")

    @app.get(
        "/api/stores/{store_slug}",
        response_model=StoreResponse,
        responses={404: {"model": ErrorBody}},
    )
    def get_store(store_slug: str) -> StoreResponse:
        try:
            store = context.repository.get_store_by_slug(store_slug)
        except StoreNotFoundError as error:
            raise _http_error(404, "STORE_NOT_FOUND", "Store was not found") from error
        return StoreResponse(slug=store.slug, name=store.name)

    @app.post(
        "/api/stores/{store_slug}/sessions",
        response_model=SessionCreatedResponse,
        status_code=status.HTTP_201_CREATED,
        responses={404: {"model": ErrorBody}},
    )
    def create_session(store_slug: str, response: Response) -> SessionCreatedResponse:
        try:
            store = context.repository.get_store_by_slug(store_slug)
        except StoreNotFoundError as error:
            raise _http_error(404, "STORE_NOT_FOUND", "Store was not found") from error
        cart, token = context.repository.create_session(store)
        response.set_cookie(
            key="varemi_session_token",
            value=token,
            max_age=max(0, int((cart.expires_at - cart.created_at).total_seconds())),
            httponly=True,
            secure=os.getenv("VAREMI_SECURE_COOKIES", "0") == "1",
            samesite="strict",
            path=f"/api/sessions/{cart.id}",
        )
        return SessionCreatedResponse(cart=_cart_response(cart))

    @app.get(
        "/api/sessions/{session_id}",
        response_model=CartResponse,
        responses={401: {"model": ErrorBody}, 404: {"model": ErrorBody}, 410: {"model": ErrorBody}},
    )
    def get_session(
        session_id: str, token: Annotated[str, Depends(_session_token)]
    ) -> CartResponse:
        return _authorized_cart(context, session_id, token)

    @app.post(
        "/api/sessions/{session_id}/items",
        response_model=CartResponse,
        responses={
            401: {"model": ErrorBody},
            404: {"model": ErrorBody},
            409: {"model": ErrorBody},
            410: {"model": ErrorBody},
            422: {"model": ErrorBody},
        },
    )
    def add_item(
        session_id: str,
        request: AddItemRequest,
        token: Annotated[str, Depends(_session_token)],
        idempotency_key: Annotated[
            str, Header(alias="Idempotency-Key", min_length=8, max_length=128)
        ],
    ) -> CartResponse:
        try:
            barcode = normalize_gtin(request.barcode)
        except InvalidBarcodeError as error:
            raise _http_error(422, "INVALID_BARCODE", str(error)) from error

        try:
            cart = context.repository.get_authorized_cart(session_id, token)
            quote = context.provider.get_quote(cart.store, barcode)
            request_hash = _request_fingerprint({"barcode": barcode})
            updated_cart = context.repository.add_item(
                session_id,
                token,
                quote,
                idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
        except ProductNotFoundError as error:
            raise _http_error(
                404, "PRODUCT_NOT_FOUND", "Barcode is not in this store catalog"
            ) from error
        except IdempotencyConflictError as error:
            raise _http_error(
                409,
                "IDEMPOTENCY_KEY_REUSED",
                "Idempotency key was already used for a different request",
            ) from error
        except (SessionNotFoundError, SessionUnauthorizedError, CartExpiredError) as error:
            raise _session_http_error(error) from error
        return _cart_response(updated_cart)

    @app.patch(
        "/api/sessions/{session_id}/items/{barcode}",
        response_model=CartResponse,
        responses={
            401: {"model": ErrorBody},
            404: {"model": ErrorBody},
            410: {"model": ErrorBody},
            422: {"model": ErrorBody},
        },
    )
    def set_quantity(
        session_id: str,
        barcode: str,
        request: QuantityRequest,
        token: Annotated[str, Depends(_session_token)],
    ) -> CartResponse:
        try:
            normalized = normalize_gtin(barcode)
            cart = context.repository.set_quantity(session_id, token, normalized, request.quantity)
        except InvalidBarcodeError as error:
            raise _http_error(422, "INVALID_BARCODE", str(error)) from error
        except ItemNotFoundError as error:
            raise _http_error(404, "ITEM_NOT_FOUND", "Cart item was not found") from error
        except (SessionNotFoundError, SessionUnauthorizedError, CartExpiredError) as error:
            raise _session_http_error(error) from error
        return _cart_response(cart)

    @app.delete(
        "/api/sessions/{session_id}/items/{barcode}",
        response_model=CartResponse,
        responses={401: {"model": ErrorBody}, 404: {"model": ErrorBody}, 410: {"model": ErrorBody}},
    )
    def remove_item(
        session_id: str,
        barcode: str,
        token: Annotated[str, Depends(_session_token)],
    ) -> CartResponse:
        try:
            normalized = normalize_gtin(barcode)
            cart = context.repository.remove_item(session_id, token, normalized)
        except InvalidBarcodeError as error:
            raise _http_error(422, "INVALID_BARCODE", str(error)) from error
        except ItemNotFoundError as error:
            raise _http_error(404, "ITEM_NOT_FOUND", "Cart item was not found") from error
        except (SessionNotFoundError, SessionUnauthorizedError, CartExpiredError) as error:
            raise _session_http_error(error) from error
        return _cart_response(cart)

    should_serve_web = serve_web if serve_web is not None else os.getenv("VAREMI_SERVE_WEB") == "1"
    if should_serve_web:
        web_root = Path(__file__).resolve().parents[3] / "apps" / "web"
        app.mount("/src", StaticFiles(directory=web_root / "src"), name="web-src")

        @app.get("/{path:path}", include_in_schema=False)
        def web_app(path: str) -> FileResponse:
            del path
            return FileResponse(web_root / "index.html")

    return app


def _session_token(
    authorization: Annotated[str | None, Header()] = None,
    cookie_token: Annotated[str | None, Cookie(alias="varemi_session_token")] = None,
) -> str:
    if authorization is not None and authorization.startswith("Bearer "):
        bearer = authorization.removeprefix("Bearer ").strip()
        if bearer:
            return bearer
    if cookie_token:
        return cookie_token
    raise _http_error(401, "SESSION_UNAUTHORIZED", "A session credential is required")


def _authorized_cart(context: RequestContext, session_id: str, token: str) -> CartResponse:
    try:
        cart = context.repository.get_authorized_cart(session_id, token)
    except (SessionNotFoundError, SessionUnauthorizedError, CartExpiredError) as error:
        raise _session_http_error(error) from error
    return _cart_response(cart)


def _session_http_error(error: Exception) -> HTTPException:
    if isinstance(error, CartExpiredError):
        return _http_error(410, "CART_EXPIRED", "Cart session has expired")
    if isinstance(error, SessionNotFoundError):
        return _http_error(404, "SESSION_NOT_FOUND", "Cart session was not found")
    return _http_error(401, "SESSION_UNAUTHORIZED", "Session token is invalid")


def _cart_response(cart: Cart) -> CartResponse:
    return CartResponse(
        id=cart.id,
        store=StoreResponse(slug=cart.store.slug, name=cart.store.name),
        state=cart.state.value,
        expires_at=cart.expires_at.isoformat(),
        updated_at=cart.updated_at.isoformat(),
        items=[
            CartItemResponse(
                barcode=item.barcode,
                product_id=item.product_id,
                name=item.name,
                quantity=item.quantity,
                unit_price_cents=item.unit_price_cents,
                line_total_cents=item.line_total_cents,
                currency=item.currency,
                promotion_label=item.promotion_label,
                price_source=item.price_source,
                price_effective_at=item.price_effective_at.isoformat(),
            )
            for item in cart.items
        ],
        total_cents=cart.total_cents,
    )


def _request_fingerprint(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message})
