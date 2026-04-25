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


@lru_cache
def get_settings() -> Settings:
    return Settings()
