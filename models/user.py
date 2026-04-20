from pydantic import BaseModel
from enum import Enum
from typing import Optional
from datetime import datetime


class UserRole(str, Enum):
    doctor = "doctor"
    patient = "patient"


class UserCreate(BaseModel):
    email: str
    full_name: str
    role: UserRole


class UserRecord(BaseModel):
    id: str
    email: str
    full_name: str
    role: UserRole
    consent_given_at: Optional[datetime] = (
        None  # default value is None, meaning consent not given
    )
    created_at: datetime
