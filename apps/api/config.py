from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    backboard_api_key: str = ""
    llm_provider: str = "anthropic"
    llm_model_name: str = "claude-sonnet-4-5"
    app_env: str = "development"
    # Set once after running scripts/upload_corpus.py for the first time.
    # When empty, search_research falls back to a stub response.
    corpus_assistant_id: str = ""

    # --- Clerk auth ---
    # When empty, auth falls back to DEMO_USER_ID so local smoke scripts and
    # curl-against-/docs keep working without a real sign-in. Set both keys in
    # production. ``clerk_jwt_issuer`` is the Frontend API URL Clerk shows on
    # the dashboard (e.g. https://trusted-marmoset-42.clerk.accounts.dev) —
    # we fetch JWKS from ``{issuer}/.well-known/jwks.json``.
    clerk_secret_key: str = ""
    clerk_jwt_issuer: str = ""
    demo_user_id: str = "demo-user-1"


@lru_cache
def get_settings() -> Settings:
    return Settings()
