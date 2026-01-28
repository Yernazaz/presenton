from fastapi import APIRouter

from api.v1.auth.endpoints.auth import AUTH_ROUTER


API_V1_AUTH_ROUTER = APIRouter(prefix="/api/v1/auth")
API_V1_AUTH_ROUTER.include_router(AUTH_ROUTER)

