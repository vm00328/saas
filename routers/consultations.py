from fastapi import APIRouter, Depends, HTTPException
from fastapi_clerk_auth import ClerkHTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from services.supabase import get_supabase
from services.llm import generate_summary
from middleware.auth import get_current_user_id, require_role

router = APIRouter(prefix="/api/consultations", tags=["consultations"])

clerk_guard: ClerkHTTPBearer = None  # clerk_guard is assigned in index.py after the ClerkHTTPBearer instance is created, and injected here to avoid circular imports.


class VisitInput(BaseModel):
    """
    Request body for creating a new consultation.

    patient_id:    The Clerk user_id of the patient (TEXT, not UUID).
    date_of_visit: ISO 8601 date string (e.g. "2026-04-20").
    notes:         The doctor's raw consultation notes.
    """

    patient_id: str
    date_of_visit: str
    notes: str


@router.post("", status_code=201)
def create_consultation(
    payload: VisitInput,
    creds: HTTPAuthorizationCredentials = Depends(clerk_guard),
):
    """
    Creates a visit record and generates a structured AI summary.

    Steps:
    1. Verify the authenticated user is a doctor.
    2. Verify the doctor is linked to the given patient.
    3. Fetch the patient's full name for the LLM prompt.
    4. Persist the visit record.
    5. Generate the structured summary via the LLM.
    6. Persist the summary with status 'pending_review'.
    7. Return the visit id, summary id, and structured output.

    The summary is not sent to the patient here. Sending is a Phase 2 concern that requires doctor review and approval first.

    Raises:
      403 if the doctor is not linked to the patient.
      404 if the patient record cannot be found (defensive - should not occur in normal operation due to FK constraints).
      502 if the LLM fails to generate a valid summary.
    """
    doctor_id = get_current_user_id(creds)
    require_role(doctor_id, "doctor")
    db = get_supabase()

    # Verifying the doctor-patient link exists before proceeding.
    link = (
        db.table("doctor_patient_links")
        .select("id")
        .eq("doctor_id", doctor_id)
        .eq("patient_id", payload.patient_id)
        .execute()
    )
    # Returns 403 rather than 404 deliberately - the doctor should not be able to confirm or deny whether an arbitrary patient_id exists.
    if not link.data:
        raise HTTPException(status_code=403, detail="Patient not linked to this doctor")

    # Fetching the patient's full name for use in the LLM prompt.
    patient = (
        db.table("users")
        .select("full_name")
        .eq("id", payload.patient_id)
        .maybe_single()
        .execute()
    )
    if not patient.data:
        raise HTTPException(status_code=404, detail="Patient record not found")

    # Persists the visit record before calling the LLM so that the doctor's notes are saved even if summary generation fails.
    visit = (
        db.table("visits")
        .insert(
            {
                "doctor_id": doctor_id,
                "patient_id": payload.patient_id,
                "date_of_visit": payload.date_of_visit,
                "notes": payload.notes,
            }
        )
        .execute()
        .data[0]
    )

    # Generates the structured summary. ValueError is raised by generate_summary() with a specific message for each failure mode
    # (response cut off, or content filter triggered). The message is forwarded directly to the caller so it is actionable.
    try:
        structured = generate_summary(
            patient_name=patient.data["full_name"],
            date_of_visit=payload.date_of_visit,
            notes=payload.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Persists the structured summary with status 'pending_review'. The doctor must review and approve before it can be sent.
    summary = (
        db.table("summaries")
        .insert(
            {
                "visit_id": visit["id"],
                "structured_output": structured.model_dump(),
                "status": "pending_review",
            }
        )
        .execute()
        .data[0]
    )

    return {
        "visit_id": visit["id"],
        "summary_id": summary["id"],
        "structured_output": structured.model_dump(),
    }
