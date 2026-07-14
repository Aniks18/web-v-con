"""Main FastAPI application."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
import asyncio
import uuid
from pathlib import Path
from contextlib import asynccontextmanager

from config import settings
from api import router as api_router
from websocket_manager import connection_manager
from room_manager import room_manager


# Background cleanup task
async def cleanup_task():
    """Periodically cleanup expired rooms."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            count = room_manager.cleanup_expired_rooms()
            if count > 0:
                print(f"Cleaned up {count} expired rooms")
        except Exception as e:
            print(f"Error in cleanup task: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    print("Starting WebRTC signaling server...")
    print(f"Server will listen on {settings.HOST}:{settings.PORT}")
    
    # Start background cleanup task
    cleanup_task_handle = asyncio.create_task(cleanup_task())
    
    yield
    
    # Shutdown
    print("Shutting down...")
    cleanup_task_handle.cancel()
    try:
        await cleanup_task_handle
    except asyncio.CancelledError:
        pass


# Create FastAPI app
app = FastAPI(
    title="WebRTC Signaling API",
    description="""Production-ready WebRTC signaling server with API key authentication.
    
    This service provides:
    - Room creation and management
    - WebSocket signaling for WebRTC connections
    - Real-time participant management
    - Automatic room cleanup
    
    All REST API endpoints require X-API-Key header authentication.
    WebSocket connections authenticate during the join-room flow.
    """,
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware. Auth is via the X-API-Key header (not cookies), so
# allow_credentials stays False — that lets a wildcard origin ("*") actually
# work for cross-origin REST callers instead of being blocked by browsers.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


INDEX_HTML = Path(__file__).parent / "static" / "index.html"


@app.get("/")
async def root():
    """Serve the web client if present, else return API information."""
    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))
    return JSONResponse({
        "service": "WebRTC Signaling API",
        "version": "2.0.0",
        "status": "operational",
        "endpoints": {
            "documentation": "/api/docs",
            "health": "/health",
            "api": "/api/*",
            "websocket": "/ws"
        },
        "authentication": "All API endpoints require X-API-Key header",
        "integration_docs": "See API_INTEGRATION.md for complete integration guide"
    })


@app.get("/api/ice-servers")
async def ice_servers():
    """Public: WebRTC ICE (STUN/TURN) config for the browser client.

    No API key — the web client needs this to establish peer connections.
    TURN entries come from TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL env vars.
    """
    return {"iceServers": settings.get_ice_servers()}


@app.get("/health")
async def health_check():
    """Health check endpoint - returns service status and metrics."""
    from datetime import datetime
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "metrics": {
            "active_websocket_connections": len(connection_manager.active_connections),
            "active_rooms": len(room_manager.storage.get_all_rooms()),
            "api_authentication": "enabled"
        },
        "environment": {
            "max_participants_per_room": settings.MAX_PARTICIPANTS_PER_ROOM,
            "room_ttl_hours": settings.ROOM_TTL_HOURS
        }
    }


@app.get("/readiness")
async def readiness_check():
    """Readiness check for Render."""
    return {"status": "ready"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for signaling."""
    socket_id = str(uuid.uuid4())
    
    await connection_manager.connect(websocket, socket_id)
    
    try:
        # Send connection confirmation
        await connection_manager.send_message(socket_id, {
            "type": "connected",
            "payload": {"socket_id": socket_id}
        })
        
        # Handle messages
        while True:
            data = await websocket.receive_text()
            await connection_manager.handle_message(socket_id, data)
    
    except WebSocketDisconnect:
        connection_manager.disconnect(socket_id)
    except Exception as e:
        print(f"WebSocket error for {socket_id}: {e}")
        connection_manager.disconnect(socket_id)


# Mount static files (web client). Uses an absolute path so it works
# regardless of the process working directory.
try:
    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
        print(f"Info: Static web client available at /static/ ({static_dir})")
except Exception as e:
    print(f"Info: Static files not mounted: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
