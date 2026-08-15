import pytest

from varemi_go.domain import InvalidBarcodeError, normalize_gtin


def test_normalize_gtin_accepts_supported_lengths_and_separators() -> None:
    assert normalize_gtin("789 000000001-7") == "7890000000017"
    assert normalize_gtin("96385074") == "96385074"


@pytest.mark.parametrize("barcode", ["", "abc", "7890000000018", "1234567", "123456789012345"])
def test_normalize_gtin_rejects_invalid_values(barcode: str) -> None:
    with pytest.raises(InvalidBarcodeError):
        normalize_gtin(barcode)
