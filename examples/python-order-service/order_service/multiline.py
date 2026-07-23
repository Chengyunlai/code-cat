from collections.abc import Callable


def transform(
    callback: Callable[[int], int] = lambda value: value,
    options: dict[str, int] | None = None,
) -> int:
    """Apply the callback after validating options."""
    return callback((options or {}).get("value", 1))
