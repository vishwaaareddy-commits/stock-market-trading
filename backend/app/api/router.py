from fastapi import APIRouter

from app.api.routes import admin, auth, health, market_data, upstox_auth, wallet_paper

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(wallet_paper.router)
api_router.include_router(admin.router)
api_router.include_router(upstox_auth.router)
api_router.include_router(market_data.router)
