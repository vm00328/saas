from fastapi import HTTPException
from fastapi_clerk_auth import HTTPAuthorizationCredentials
from services.supabase import get_supabase


def get_current_user_id(creds: HTTPAuthorizationCredentials) -> str:
    return creds.decoded["sub"]


def require_role(user_id: str, required_role: str):
    """Raises 403 if the user does not hold the required role."""
    db = get_supabase()
    result = db.table("users").select("role").eq("id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=401, detail="Complete onboarding first")
    if result.data["role"] != required_role:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
