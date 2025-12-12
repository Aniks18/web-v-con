"""Main FastAPI application."""
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import asyncio
import uuid
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
    title="WebRTC Signaling Server",
    description="WebRTC video conferencing with 6-char room codes",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


@app.get("/")
async def root():
    """Root endpoint - serves test client."""
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>WebRTC Signaling Server</h1><p>Static files not found. Server is running.</p>",
            status_code=200
        )


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "active_connections": len(connection_manager.active_connections),
        "active_rooms": len(room_manager.storage.get_all_rooms())
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


# Mount static files (for test client)
try:
    app.mount("/static", StaticFiles(directory="static"), name="static")
except Exception:
    print("Warning: static directory not found. Test client won't be available.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
