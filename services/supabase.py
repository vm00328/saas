import os
from supabase import (
    create_client,
    Client,
)  # imports the Supabase Python client constructor and its type annotation


def get_supabase() -> Client:
    """
    Returns a configured Supabase client instance that the rest of the API can use for database operations.
    """
    # Reading Supabase connection details from environment variables
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    # Fail fast if the backend is missing required configuration
    if not url or not key:
        raise RuntimeError("Supabase credentials not configured")

    # Creates and returns a Supabase client using the service role key. This client is intended for backend use only.
    return create_client(url, key)
