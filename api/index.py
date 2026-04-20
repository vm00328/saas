import os
from fastapi import FastAPI
from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer
from routers import consultations, users, patients

app = FastAPI(
    title="MediNotes Pro API",
    description="Backend API for the MediNotes Pro healthcare consultation assistant.",
    version="1.0.0",
)

# Clerk authentication (One ClerkHTTPBearer instance is created here and injected into all routers)
clerk_config = ClerkConfig(jwks_url=os.getenv("CLERK_JWKS_URL"))
clerk_guard = ClerkHTTPBearer(clerk_config)

# Injecting the guard into routers
consultations.clerk_guard = clerk_guard
users.clerk_guard = clerk_guard
patients.clerk_guard = clerk_guard

# Router registration
app.include_router(users.router)
app.include_router(patients.router)
app.include_router(consultations.router)
