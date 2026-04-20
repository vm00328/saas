from pydantic import BaseModel
from enum import Enum


# restricting safety flag types to the three approved values from the PRD via enums
class FlagType(str, Enum):
    unclear_language = "unclear_language"
    missing_follow_up = "missing_follow_up"
    risky_interpretation = "risky_interpretation"


# A SafetyFlag represents one specific issue in the generated summary
class SafetyFlag(BaseModel):
    type: FlagType
    description: str


# grouping all safety-related information together
class SafetyFlags(BaseModel):
    has_flags: bool
    flags: list[
        SafetyFlag
    ]  # holds the detaield list of issues, which may be empty when no concerns are detected


# defines the email content that will eventually be sent to the patient
class PatientEmailDraft(BaseModel):
    subject: str
    body: str


# the core summary object for one consultation
class VisitSummary(BaseModel):
    doctor_summary: str  # the clinical recap meant for the doctor’s records
    next_steps_for_doctor: list[str]  # checklist of follow-up actions
    patient_email_draft: PatientEmailDraft  # the patient-friendly communication
    safety_flags: SafetyFlags  # captures AI safety concerns in the same payload


# the top-level wrapper around the entire response
class StructuredOutput(BaseModel):
    visit_summary: VisitSummary
