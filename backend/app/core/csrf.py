"""Origin check for state-changing requests (defence in depth on top of SameSite=Lax cookies).

Browsers always send an Origin header on cross-site POST/PUT/PATCH/DELETE. If it is present and
not one of our own frontend origins, the request is refused. Requests without Origin (curl,
server-to-server, tests) are not browser-initiated cross-site requests and are allowed; they still
need a valid session cookie.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.config import get_settings

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def origin_check_middleware(request: Request, call_next):
    if request.method in UNSAFE_METHODS:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in get_settings().allowed_origins:
            return JSONResponse({"detail": "Cross-origin request blocked"}, status_code=403)
    return await call_next(request)
