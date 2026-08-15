from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from varemi_go.api import create_app
from varemi_go.catalog import DemoCatalogProvider
from varemi_go.persistence import SqliteCartRepository


@pytest.fixture
def repository(tmp_path: Path) -> SqliteCartRepository:
    repo = SqliteCartRepository(tmp_path / "test.db")
    repo.migrate()
    return repo


@pytest.fixture
def client(repository: SqliteCartRepository) -> Iterator[TestClient]:
    with TestClient(create_app(repository=repository, provider=DemoCatalogProvider())) as test_client:
        yield test_client
