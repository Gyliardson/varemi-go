from __future__ import annotations


class InvalidBarcodeError(ValueError):
    """Raised when a value is not a supported, valid GTIN."""


def normalize_gtin(value: str) -> str:
    normalized = "".join(character for character in value if character not in " -")
    if not normalized.isdigit() or len(normalized) not in {8, 12, 13, 14}:
        raise InvalidBarcodeError("Barcode must be a valid GTIN-8, GTIN-12, GTIN-13, or GTIN-14")
    if not _has_valid_check_digit(normalized):
        raise InvalidBarcodeError("Barcode check digit is invalid")
    return normalized


def _has_valid_check_digit(gtin: str) -> bool:
    digits = [int(value) for value in gtin]
    body = digits[:-1]
    check_digit = digits[-1]
    weighted_sum = sum(
        digit * (3 if (len(body) - index) % 2 == 1 else 1)
        for index, digit in enumerate(body)
    )
    expected = (10 - (weighted_sum % 10)) % 10
    return expected == check_digit
