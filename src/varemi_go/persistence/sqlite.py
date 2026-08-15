from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from varemi_go.domain.models import Cart, CartItem, CartState, CatalogQuote, Store, utc_now


class StoreNotFoundError(LookupError):
    pass


class SessionNotFoundError(LookupError):
    pass


class SessionUnauthorizedError(PermissionError):
    pass


class CartExpiredError(RuntimeError):
    pass


class ItemNotFoundError(LookupError):
    pass


class IdempotencyConflictError(RuntimeError):
    pass


class SqliteCartRepository:
    def __init__(self, database_path: Path, *, session_ttl_seconds: int = 86_400) -> None:
        self._database_path = database_path
        self._session_ttl_seconds = session_ttl_seconds

    def migrate(self) -> None:
        self._database_path.parent.mkdir(parents=True, exist_ok=True)
        migration_path = Path(__file__).with_name("migrations") / "0001_initial.sql"
        with self._connection() as connection:
            connection.executescript(migration_path.read_text(encoding="utf-8"))
            connection.execute(
                "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                (1, _serialize_datetime(utc_now())),
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO stores(id, slug, name, provider_key)
                VALUES (?, ?, ?, ?)
                """,
                ("store-demo-market", "demo-market", "Mercado Demo", "demo-v1"),
            )

    def get_store_by_slug(self, slug: str) -> Store:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, slug, name, provider_key FROM stores WHERE slug = ?", (slug,)
            ).fetchone()
        if row is None:
            raise StoreNotFoundError(slug)
        return _store_from_row(row)

    def create_session(self, store: Store, *, now: datetime | None = None) -> tuple[Cart, str]:
        created_at = now or utc_now()
        token = secrets.token_urlsafe(32)
        session_id = str(uuid4())
        expires_at = created_at + timedelta(seconds=self._session_ttl_seconds)
        with self._transaction() as connection:
            connection.execute(
                """
                INSERT INTO cart_sessions(
                    id, store_id, token_hash, state, created_at, updated_at, expires_at
                ) VALUES (?, ?, ?, 'active', ?, ?, ?)
                """,
                (
                    session_id,
                    store.id,
                    _hash_token(token),
                    _serialize_datetime(created_at),
                    _serialize_datetime(created_at),
                    _serialize_datetime(expires_at),
                ),
            )
            cart = self._load_cart(connection, session_id)
        return cart, token

    def get_authorized_cart(
        self,
        session_id: str,
        token: str,
        *,
        now: datetime | None = None,
    ) -> Cart:
        current_time = now or utc_now()
        with self._transaction() as connection:
            self._authorize(connection, session_id, token)
            self._expire_if_needed(connection, session_id, current_time)
            cart = self._load_cart(connection, session_id)
        if cart.state is CartState.EXPIRED:
            raise CartExpiredError(session_id)
        return cart

    def add_item(
        self,
        session_id: str,
        token: str,
        quote: CatalogQuote,
        *,
        idempotency_key: str,
        request_hash: str,
        now: datetime | None = None,
    ) -> Cart:
        current_time = now or utc_now()
        with self._transaction() as connection:
            self._authorize(connection, session_id, token)
            self._require_active(connection, session_id, current_time)
            existing_request = connection.execute(
                """
                SELECT operation, request_hash FROM idempotency_requests
                WHERE session_id = ? AND idempotency_key = ?
                """,
                (session_id, idempotency_key),
            ).fetchone()
            if existing_request is not None:
                if existing_request["operation"] != "add-item" or not hmac.compare_digest(
                    existing_request["request_hash"], request_hash
                ):
                    raise IdempotencyConflictError(idempotency_key)
                return self._load_cart(connection, session_id)

            existing_item = connection.execute(
                """
                SELECT quantity FROM cart_items WHERE session_id = ? AND barcode = ?
                """,
                (session_id, quote.barcode),
            ).fetchone()
            if existing_item is None:
                connection.execute(
                    """
                    INSERT INTO cart_items(
                        session_id, barcode, product_id, product_name, quantity,
                        unit_price_cents, currency, promotion_label, price_source,
                        price_effective_at, updated_at
                    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        session_id,
                        quote.barcode,
                        quote.product_id,
                        quote.name,
                        quote.unit_price_cents,
                        quote.currency,
                        quote.promotion_label,
                        quote.price_source,
                        _serialize_datetime(quote.price_effective_at),
                        _serialize_datetime(current_time),
                    ),
                )
            else:
                connection.execute(
                    """
                    UPDATE cart_items
                    SET quantity = quantity + 1,
                        product_id = ?, product_name = ?, unit_price_cents = ?, currency = ?,
                        promotion_label = ?, price_source = ?, price_effective_at = ?, updated_at = ?
                    WHERE session_id = ? AND barcode = ?
                    """,
                    (
                        quote.product_id,
                        quote.name,
                        quote.unit_price_cents,
                        quote.currency,
                        quote.promotion_label,
                        quote.price_source,
                        _serialize_datetime(quote.price_effective_at),
                        _serialize_datetime(current_time),
                        session_id,
                        quote.barcode,
                    ),
                )
            connection.execute(
                "UPDATE cart_sessions SET updated_at = ? WHERE id = ?",
                (_serialize_datetime(current_time), session_id),
            )
            connection.execute(
                """
                INSERT INTO idempotency_requests(
                    session_id, idempotency_key, operation, request_hash, created_at
                ) VALUES (?, ?, 'add-item', ?, ?)
                """,
                (
                    session_id,
                    idempotency_key,
                    request_hash,
                    _serialize_datetime(current_time),
                ),
            )
            return self._load_cart(connection, session_id)

    def set_quantity(
        self,
        session_id: str,
        token: str,
        barcode: str,
        quantity: int,
        *,
        now: datetime | None = None,
    ) -> Cart:
        current_time = now or utc_now()
        with self._transaction() as connection:
            self._authorize(connection, session_id, token)
            self._require_active(connection, session_id, current_time)
            cursor = connection.execute(
                """
                UPDATE cart_items SET quantity = ?, updated_at = ?
                WHERE session_id = ? AND barcode = ?
                """,
                (quantity, _serialize_datetime(current_time), session_id, barcode),
            )
            if cursor.rowcount == 0:
                raise ItemNotFoundError(barcode)
            connection.execute(
                "UPDATE cart_sessions SET updated_at = ? WHERE id = ?",
                (_serialize_datetime(current_time), session_id),
            )
            return self._load_cart(connection, session_id)

    def remove_item(
        self,
        session_id: str,
        token: str,
        barcode: str,
        *,
        now: datetime | None = None,
    ) -> Cart:
        current_time = now or utc_now()
        with self._transaction() as connection:
            self._authorize(connection, session_id, token)
            self._require_active(connection, session_id, current_time)
            cursor = connection.execute(
                "DELETE FROM cart_items WHERE session_id = ? AND barcode = ?",
                (session_id, barcode),
            )
            if cursor.rowcount == 0:
                raise ItemNotFoundError(barcode)
            connection.execute(
                "UPDATE cart_sessions SET updated_at = ? WHERE id = ?",
                (_serialize_datetime(current_time), session_id),
            )
            return self._load_cart(connection, session_id)

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self._database_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
            except Exception:
                connection.rollback()
                raise

    def _authorize(self, connection: sqlite3.Connection, session_id: str, token: str) -> None:
        row = connection.execute(
            "SELECT token_hash FROM cart_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if row is None:
            raise SessionNotFoundError(session_id)
        if not hmac.compare_digest(row["token_hash"], _hash_token(token)):
            raise SessionUnauthorizedError(session_id)

    def _require_active(
        self, connection: sqlite3.Connection, session_id: str, now: datetime
    ) -> None:
        self._expire_if_needed(connection, session_id, now)
        row = connection.execute(
            "SELECT state FROM cart_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if row is None:
            raise SessionNotFoundError(session_id)
        if row["state"] != CartState.ACTIVE.value:
            raise CartExpiredError(session_id)

    def _expire_if_needed(
        self, connection: sqlite3.Connection, session_id: str, now: datetime
    ) -> None:
        row = connection.execute(
            "SELECT state, expires_at FROM cart_sessions WHERE id = ?", (session_id,)
        ).fetchone()
        if row is None:
            raise SessionNotFoundError(session_id)
        if row["state"] == CartState.ACTIVE.value and _parse_datetime(row["expires_at"]) <= now:
            connection.execute(
                "UPDATE cart_sessions SET state = 'expired', updated_at = ? WHERE id = ?",
                (_serialize_datetime(now), session_id),
            )

    def _load_cart(self, connection: sqlite3.Connection, session_id: str) -> Cart:
        session = connection.execute(
            """
            SELECT
                c.id, c.state, c.created_at, c.updated_at, c.expires_at,
                s.id AS store_id, s.slug, s.name, s.provider_key
            FROM cart_sessions c
            JOIN stores s ON s.id = c.store_id
            WHERE c.id = ?
            """,
            (session_id,),
        ).fetchone()
        if session is None:
            raise SessionNotFoundError(session_id)
        item_rows = connection.execute(
            """
            SELECT barcode, product_id, product_name, quantity, unit_price_cents, currency,
                   price_source, price_effective_at, promotion_label
            FROM cart_items WHERE session_id = ? ORDER BY product_name, barcode
            """,
            (session_id,),
        ).fetchall()
        items = tuple(
            CartItem(
                barcode=row["barcode"],
                product_id=row["product_id"],
                name=row["product_name"],
                quantity=row["quantity"],
                unit_price_cents=row["unit_price_cents"],
                currency=row["currency"],
                price_source=row["price_source"],
                price_effective_at=_parse_datetime(row["price_effective_at"]),
                promotion_label=row["promotion_label"],
            )
            for row in item_rows
        )
        return Cart(
            id=session["id"],
            store=Store(
                id=session["store_id"],
                slug=session["slug"],
                name=session["name"],
                provider_key=session["provider_key"],
            ),
            state=CartState(session["state"]),
            created_at=_parse_datetime(session["created_at"]),
            updated_at=_parse_datetime(session["updated_at"]),
            expires_at=_parse_datetime(session["expires_at"]),
            items=items,
        )


def _store_from_row(row: sqlite3.Row) -> Store:
    return Store(id=row["id"], slug=row["slug"], name=row["name"], provider_key=row["provider_key"])


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _serialize_datetime(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(UTC)
