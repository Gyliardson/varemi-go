from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from varemi_go.catalog import DemoCatalogProvider
from varemi_go.domain import CatalogQuote
from varemi_go.persistence import (
    CartExpiredError,
    IdempotencyConflictError,
    ItemNotFoundError,
    SessionUnauthorizedError,
    SqliteCartRepository,
)


def _session(repo: SqliteCartRepository):
    store = repo.get_store_by_slug("demo-market")
    return repo.create_session(store)


def test_migration_creates_schema_and_demo_store(tmp_path: Path) -> None:
    database = tmp_path / "schema.db"
    repo = SqliteCartRepository(database)
    repo.migrate()
    repo.migrate()

    assert repo.get_store_by_slug("demo-market").provider_key == "demo-v1"
    connection = sqlite3.connect(database)
    try:
        version = connection.execute("SELECT version FROM schema_migrations").fetchone()
    finally:
        connection.close()
    assert version == (1,)


def test_cart_persists_add_quantity_remove_and_total(repository: SqliteCartRepository) -> None:
    cart, token = _session(repository)
    provider = DemoCatalogProvider()
    quote_a = provider.get_quote(cart.store, "7890000000017")
    quote_b = provider.get_quote(cart.store, "7890000000024")

    cart = repository.add_item(
        cart.id, token, quote_a, idempotency_key="request-0001", request_hash="hash-a"
    )
    cart = repository.add_item(
        cart.id, token, quote_b, idempotency_key="request-0002", request_hash="hash-b"
    )
    cart = repository.set_quantity(cart.id, token, quote_a.barcode, 3)

    assert cart.total_cents == 3 * 2799 + 649
    assert repository.get_authorized_cart(cart.id, token).total_cents == cart.total_cents

    cart = repository.remove_item(cart.id, token, quote_b.barcode)
    assert cart.total_cents == 3 * 2799
    with pytest.raises(ItemNotFoundError):
        repository.remove_item(cart.id, token, quote_b.barcode)


def test_idempotent_add_does_not_double_increment(repository: SqliteCartRepository) -> None:
    cart, token = _session(repository)
    quote = DemoCatalogProvider().get_quote(cart.store, "7890000000017")

    first = repository.add_item(
        cart.id, token, quote, idempotency_key="request-repeat", request_hash="same-hash"
    )
    retry = repository.add_item(
        cart.id, token, quote, idempotency_key="request-repeat", request_hash="same-hash"
    )

    assert first.items[0].quantity == 1
    assert retry.items[0].quantity == 1
    with pytest.raises(IdempotencyConflictError):
        repository.add_item(
            cart.id,
            token,
            quote,
            idempotency_key="request-repeat",
            request_hash="different-hash",
        )



def test_rescanning_existing_item_reprices_the_whole_line(repository: SqliteCartRepository) -> None:
    cart, token = _session(repository)
    original = DemoCatalogProvider().get_quote(cart.store, "7890000000017")
    cart = repository.add_item(
        cart.id, token, original, idempotency_key="price-0001", request_hash="price-a"
    )
    cart = repository.set_quantity(cart.id, token, original.barcode, 2)
    changed = CatalogQuote(
        product_id=original.product_id,
        barcode=original.barcode,
        name=original.name,
        unit_price_cents=2999,
        currency=original.currency,
        price_source="demo-catalog:v2",
        price_effective_at=original.price_effective_at + timedelta(minutes=5),
    )

    cart = repository.add_item(
        cart.id, token, changed, idempotency_key="price-0002", request_hash="price-b"
    )

    assert cart.items[0].quantity == 3
    assert cart.items[0].unit_price_cents == 2999
    assert cart.items[0].price_source == "demo-catalog:v2"
    assert cart.total_cents == 3 * 2999

def test_session_id_is_not_authorization(repository: SqliteCartRepository) -> None:
    cart, _token = _session(repository)

    with pytest.raises(SessionUnauthorizedError):
        repository.get_authorized_cart(cart.id, "wrong-secret")


def test_expired_cart_is_explicit(repository: SqliteCartRepository) -> None:
    start = datetime(2026, 8, 15, 12, 0, tzinfo=UTC)
    store = repository.get_store_by_slug("demo-market")
    cart, token = repository.create_session(store, now=start)

    with pytest.raises(CartExpiredError):
        repository.get_authorized_cart(cart.id, token, now=start + timedelta(days=2))
