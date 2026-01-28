from fastapi import APIRouter

from api.v1.teacher.endpoints.settings import SETTINGS_ROUTER
from api.v1.teacher.endpoints.templates import TEMPLATES_ROUTER


API_V1_TEACHER_ROUTER = APIRouter(prefix="/api/v1/teacher")
API_V1_TEACHER_ROUTER.include_router(SETTINGS_ROUTER)
API_V1_TEACHER_ROUTER.include_router(TEMPLATES_ROUTER)

