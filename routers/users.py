from fastapi import APIRouter, Depends, HTTPException
from fastapi_clerk_auth import ClerkHTTPBearer, HTTPAuthorizationCredentials
from models.user import UserCreate, UserRecord
from services.supabase import get_supabase
from middleware.auth import get_current_user_id

router = APIRouter(prefix="/api/users", tags=["users"])
# clerk_guard is assigned in index.py after the ClerkHTTPBearer instance is created, and injected here to avoid circular imports.
clerk_guard: ClerkHTTPBearer = None


@router.get("/me", response_model=UserRecord | None)
def get_me(creds: HTTPAuthorizationCredentials = Depends(clerk_guard)):
    """
    Returns the current user's profile from the users table.

    Returns null (HTTP 200) rather than 404 when the user has not yet
    registered. This is intentional - the frontend uses a null response
    as the signal to redirect to the onboarding screen, and a 404 would
    require extra error handling on the client side.
    """
    user_id = get_current_user_id(creds)
    db = get_supabase()

    result = db.table("users").select("*").eq("id", user_id).execute()
    if not result.data:
        return None
    return result.data[0]


@router.post("/register", response_model=UserRecord, status_code=201)
def register(
    payload: UserCreate,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    """
    Creates a new user record on first sign-in.

    The user's id is taken from the verified Clerk JWT (sub claim), not
    from the request body, so it cannot be spoofed by the client.

    Returns 409 if a record already exists for this Clerk user_id.
    """
    user_id = get_current_user_id(creds)
    db = get_supabase()

    # Checking whether this Clerk user has already registered.
    existing = db.table("users").select("id").eq("id", user_id).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="User already registered")

    record = {
        "id": user_id,  # Clerk user_id — TEXT, not UUID
        "email": payload.email,
        "full_name": payload.full_name,
        "role": payload.role.value,
        # consent_given_at is intentionally omitted here; it is set separately via POST /api/users/consent for patient accounts.
    }
    result = db.table("users").insert(record).execute()
    return result.data[0]


@router.post("/consent", status_code=200)
def record_consent(creds: HTTPAuthorizationCredentials = Depends(clerk_guard)):
    """
    Records the UTC timestamp at which a patient accepted the Terms & Conditions. Sets users.consent_given_at to the current time.
    This endpoint must be called after /register. It is a no-op if called for a doctor account (the role filter in the query ensures no rows are updated).
    No patient health data may be stored or transmitted until this endpoint has been called successfully.
    This is enforced in routers/patients.py at the point of linking a patient to a doctor.
    """
    user_id = get_current_user_id(creds)
    db = get_supabase()
    db.table("users").update({"consent_given_at": "now()"}).eq("id", user_id).eq(
        "role", "patient"
    ).execute()
    return {"status": "consent_recorded"}
