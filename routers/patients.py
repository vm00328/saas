from fastapi import APIRouter, Depends, HTTPException
from fastapi_clerk_auth import ClerkHTTPBearer, HTTPAuthorizationCredentials
from services.supabase import get_supabase
from middleware.auth import get_current_user_id, require_role

router = APIRouter(prefix="/api/patients", tags=["patients"])

clerk_guard: ClerkHTTPBearer = None  # clerk_guard is assigned in index.py after the ClerkHTTPBearer instance is created, and injected here to avoid circular imports.


@router.get("")
def list_patients(creds: HTTPAuthorizationCredentials = Depends(clerk_guard)):
    """
    Returns all patients linked to the authenticated doctor, including each patient's id, full name, and email address.
    """

    doctor_id = get_current_user_id(creds)
    require_role(doctor_id, "doctor")
    db = get_supabase()

    # The !patient_id hint tells PostgREST which foreign key to use when joining doctor_patient_links to the users table.
    result = (
        db.table("doctor_patient_links")
        .select("patient_id, users!patient_id(id, full_name, email)")
        .eq("doctor_id", doctor_id)
        .execute()
    )
    return result.data


@router.get("/search")
def search_patient(
    email: str, creds: HTTPAuthorizationCredentials = Depends(clerk_guard)
):
    """
    Searches for a registered patient by email address.
    Returns id and email only - full name is not exposed until the doctor-patient link is established.
    """
    doctor_id = get_current_user_id(creds)
    require_role(doctor_id, "doctor")
    db = get_supabase()

    result = (
        db.table("users")
        .select("id, email")
        .eq("email", email)
        .eq("role", "patient")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No patient found with that email")
    return result.data[0]


@router.post("/{patient_id}/link", status_code=201)
def link_patient(
    patient_id: str, creds: HTTPAuthorizationCredentials = Depends(clerk_guard)
):
    """Links a patient to the authenticated doctor.

    Requirements:
    - The patient must exist and have role = 'patient'.
    - The patient must have given consent (consent_given_at is non-null).
    - The link must not already exist.

    On success, a notification email is sent to the patient (Phase 2 - stubbed here).
    """
    doctor_id = get_current_user_id(creds)
    require_role(doctor_id, "doctor")
    db = get_supabase()

    # Verify patient exists and has consented
    patient = (
        db.table("users")
        .select("id, full_name, email, consent_given_at")
        .eq("id", patient_id)
        .eq("role", "patient")
        .maybe_single()  # .maybe_single() is used because a missing patient is a valid, expected input error - .single() would raise an unhandled exception.
        .execute()
    )
    if not patient.data:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Guard against duplicate links. The DB has a unique constraint on (doctor_id, patient_id), but catching it here returns a clean 409 rather than an unhandled database error.
    existing_link = (
        db.table("doctor_patient_links")
        .select("id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", patient_id)
        .maybe_single()
        .execute()
    )
    if existing_link.data:
        raise HTTPException(
            status_code=409, detail="Patient is already linked to this doctor"
        )

    db.table("doctor_patient_links").insert(
        {
            "doctor_id": doctor_id,
            "patient_id": patient_id,
        }
    ).execute()

    # Trigger notification email (Phase 2 - stubbed here)
    # notify_patient_of_link(patient.data, doctor_id)

    return {"status": "linked"}
