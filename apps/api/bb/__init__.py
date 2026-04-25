"""Local wrapper around the Backboard SDK.

The SDK package is also called ``backboard``; this module is named ``bb`` so
the two never collide on the import path.
"""
from .client import get_client

__all__ = ["get_client"]
