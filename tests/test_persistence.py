from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier, Event

import pytest

import varemi_go.persistence.sqlite as sqlite_module
from varemi_go.catalog import DemoCatalogProvider
from varemi_go.domain import CatalogQuote
from varemi_go.persistence import (
    CartExpiredError,
    IdempotencyConflictError,
    QuantityConflictError,
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
    cart = repository.set_quantity(cart.id, token, quote_a.barcode, 3, 1)

    assert cart.total_cents == 3 * 2799 + 649
    assert repository.get_authorized_cart(cart.id, token).total_cents == cart.total_cents

    cart = repository.remove_item(cart.id, token, quote_b.barcode)
    assert cart.total_cents == 3 * 2799


def test_remove_item_retry_converges_to_item_absent(repository: SqliteCartRepository) -> None:
    cart, token = _session(repository)
    provider = DemoCatalogProvider()
    quote_a = provider.get_quote(cart.store, "7890000000017")
    quote_b = provider.get_quote(cart.store, "7890000000024")
    cart = repository.add_item(
        cart.id, token, quote_a, idempotency_key="remove-0001", request_hash="remove-a"
    )
    cart = repository.add_item(
        cart.id, token, quote_b, idempotency_key="remove-0002", request_hash="remove-b"
    )

    first = repository.remove_item(cart.id, token, quote_b.barcode)
    retry = repository.remove_item(cart.id, token, quote_b.barcode)
    persisted = repository.get_authorized_cart(cart.id, token)

    assert [item.barcode for item in first.items] == [quote_a.barcode]
    assert [item.barcode for item in retry.items] == [quote_a.barcode]
    assert [item.barcode for item in persisted.items] == [quote_a.barcode]
    assert first.total_cents == 2799
    assert retry.total_cents == 2799
    assert persisted.total_cents == 2799


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
    cart = repository.set_quantity(cart.id, token, original.barcode, 2, 1)
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


def test_stale_quantity_update_conflicts_after_concurrent_scan(
    repository: SqliteCartRepository,
) -> None:
    cart, token = _session(repository)
    quote = DemoCatalogProvider().get_quote(cart.store, "7890000000017")
    cart = repository.add_item(
        cart.id, token, quote, idempotency_key="quantity-0001", request_hash="quantity-a"
    )
    assert cart.items[0].quantity == 1

    scanned = repository.add_item(
        cart.id, token, quote, idempotency_key="quantity-0002", request_hash="quantity-b"
    )
    assert scanned.items[0].quantity == 2

    with pytest.raises(QuantityConflictError):
        repository.set_quantity(cart.id, token, quote.barcode, 2, 1)

    persisted = repository.get_authorized_cart(cart.id, token)
    assert persisted.items[0].quantity == 2
    assert persisted.total_cents == 2 * 2799

    sequential = repository.set_quantity(cart.id, token, quote.barcode, 3, 2)
    assert sequential.items[0].quantity == 3
    assert sequential.total_cents == 3 * 2799


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


def test_expiry_is_checked_after_waiting_for_write_lock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "expiry-lock.db"
    repository = SqliteCartRepository(database, session_ttl_seconds=1)
    repository.migrate()
    start = datetime(2026, 8, 15, 12, 0, tzinfo=UTC)
    store = repository.get_store_by_slug("demo-market")
    cart, token = repository.create_session(store, now=start)
    quote = DemoCatalogProvider().get_quote(cart.store, "7890000000017")
    cart = repository.add_item(
        cart.id,
        token,
        quote,
        idempotency_key="expiry-lock-add",
        request_hash="expiry-lock-hash",
        now=start + timedelta(milliseconds=100),
    )
    assert cart.items[0].quantity == 1

    current_time = [start + timedelta(milliseconds=500)]

    def controlled_utc_now() -> datetime:
        return current_time[0]

    monkeypatch.setattr(sqlite_module, "utc_now", controlled_utc_now)
    lock_attempted = Event()
    original_transaction = repository._transaction

    @contextmanager
    def signaling_transaction():
        lock_attempted.set()
        with original_transaction() as connection:
            yield connection

    monkeypatch.setattr(repository, "_transaction", signaling_transaction)

    holder = sqlite3.connect(database, timeout=5.0)
    holder.execute("BEGIN IMMEDIATE")
    try:
        assert current_time[0] < cart.expires_at
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                repository.set_quantity,
                cart.id,
                token,
                quote.barcode,
                2,
                1,
            )
            assert lock_attempted.wait(timeout=2)
            current_time[0] = cart.expires_at + timedelta(seconds=1)
            holder.commit()
            with pytest.raises(CartExpiredError):
                future.result(timeout=2)
    finally:
        if holder.in_transaction:
            holder.rollback()
        holder.close()

    connection = sqlite3.connect(database)
    try:
        quantity = connection.execute(
            "SELECT quantity FROM cart_items WHERE session_id = ? AND barcode = ?",
            (cart.id, quote.barcode),
        ).fetchone()
    finally:
        connection.close()
    assert quantity == (1,)


def test_concurrent_same_idempotency_key_commits_once(
    repository: SqliteCartRepository,
) -> None:
    cart, token = _session(repository)
    quote = DemoCatalogProvider().get_quote(cart.store, "7890000000017")
    barrier = Barrier(2)

    def add_once(_index: int) -> int:
        barrier.wait()
        result = repository.add_item(
            cart.id,
            token,
            quote,
            idempotency_key="request-concurrent",
            request_hash="same-concurrent-hash",
        )
        return result.items[0].quantity

    with ThreadPoolExecutor(max_workers=2) as pool:
        quantities = list(pool.map(add_once, range(2)))

    assert quantities == [1, 1]
    persisted = repository.get_authorized_cart(cart.id, token)
    assert persisted.items[0].quantity == 1
