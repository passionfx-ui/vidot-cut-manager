"""Project store errors."""


class ConflictError(Exception):
    """Optimistic lock: expected revision does not match current state."""
