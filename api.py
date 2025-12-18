"""REST API endpoints for room management."""
from fastapi import APIRouter, HTTPException, Header, status
from typing import Optional
from models import RoomCreateRequest, RoomCreateResponse, RoomInfoResponse
from room_manager import room_manager
from config import settings


router = APIRouter(prefix="/api", tags=["rooms"])


def verify_api_key(x_api_key: Optional[str] = Header(None)) -> bool:
    """Verify API key from header."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Include X-API-Key header with your request.",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    if x_api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key. Check your API key and try again.",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    return True


@router.post("/rooms", response_model=RoomCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    request: RoomCreateRequest,
    x_api_key: Optional[str] = Header(None)
):
    """
    Create a new video conference room.
    
    **Authentication:** Requires X-API-Key header
    
    **Use Case:** Create a room for a scheduled class, meeting, or tutoring session.
    
    **Example:**
    ```
    POST /api/rooms
    X-API-Key: your-api-key
    
    {
        "owner_id": "teacher_123",
        "ttl_hours": 2,
        "max_participants": 30
    }
    ```
    
    **Returns:** Room code and metadata for participants to join.
    """
    verify_api_key(x_api_key)
    
    # Validate request
    if request.max_participants and (request.max_participants < 2 or request.max_participants > 100):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="max_participants must be between 2 and 100"
        )
    
    if request.ttl_hours and (request.ttl_hours < 1 or request.ttl_hours > 168):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ttl_hours must be between 1 and 168 (7 days)"
        )
    
    room = room_manager.create_room(
        owner_id=request.owner_id,
        ttl_hours=request.ttl_hours,
        max_participants=request.max_participants
    )
    
    return RoomCreateResponse(
        room_code=room.room_code,
        created_at=room.created_at.isoformat(),
        expires_at=room.expires_at.isoformat(),
        owner_id=request.owner_id
    )


@router.get("/rooms/{room_code}", response_model=RoomInfoResponse)
async def get_room_info(
    room_code: str,
    x_api_key: Optional[str] = Header(None)
):
    """
    Get information about a room (requires API key).
    
    Returns room metadata including participant count and state.
    """
    verify_api_key(x_api_key)
    
    room = room_manager.get_room(room_code)
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return RoomInfoResponse(
        room_code=room.room_code,
        created_at=room.created_at.isoformat(),
        expires_at=room.expires_at.isoformat(),
        state=room.state,
        participant_count=len(room.participants),
        max_participants=room.max_participants,
        participants=room.get_participant_list()
    )


@router.delete("/rooms/{room_code}")
async def delete_room(
    room_code: str,
    x_api_key: Optional[str] = Header(None)
):
    """
    Delete a room (requires API key).
    
    This closes the room and removes it from storage.
    """
    verify_api_key(x_api_key)
    
    room = room_manager.get_room(room_code)
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    room.close()
    room_manager.delete_room(room_code)
    
    return {"message": f"Room {room_code} deleted successfully"}


@router.post("/rooms/_cleanup")
async def cleanup_expired_rooms(x_api_key: Optional[str] = Header(None)):
    """
    Manually trigger cleanup of expired rooms (requires API key).
    
    This is automatically done periodically, but can be triggered manually.
    """
    verify_api_key(x_api_key)
    
    count = room_manager.cleanup_expired_rooms()
    
    return {"message": f"Cleaned up {count} expired rooms"}


@router.get("/rooms")
async def list_rooms(
    x_api_key: Optional[str] = Header(None),
    state: Optional[str] = None
):
    """
    List all rooms with optional state filtering.
    
    **Authentication:** Requires X-API-Key header
    
    **Parameters:**
    - state: Filter by room state (open, closed, expired)
    
    **Returns:** List of rooms with basic information.
    """
    verify_api_key(x_api_key)
    
    rooms = room_manager.storage.get_all_rooms()
    
    if state:
        rooms = [r for r in rooms if r.state == state]
    
    return {
        "rooms": [
            {
                "room_code": r.room_code,
                "state": r.state,
                "participant_count": len(r.participants),
                "max_participants": r.max_participants,
                "created_at": r.created_at.isoformat(),
                "expires_at": r.expires_at.isoformat()
            }
            for r in rooms
        ],
        "total": len(rooms)
    }


@router.get("/statistics")
async def get_statistics(x_api_key: Optional[str] = Header(None)):
    """
    Get platform-wide statistics.
    
    **Authentication:** Requires X-API-Key header
    
    **Returns:** Aggregated statistics about rooms and participants.
    """
    verify_api_key(x_api_key)
    
    rooms = room_manager.storage.get_all_rooms()
    
    total_participants = sum(len(r.participants) for r in rooms)
    open_rooms = [r for r in rooms if r.state == "open"]
    
    return {
        "statistics": {
            "total_rooms": len(rooms),
            "open_rooms": len(open_rooms),
            "closed_rooms": len([r for r in rooms if r.state == "closed"]),
            "expired_rooms": len([r for r in rooms if r.state == "expired"]),
            "total_participants": total_participants,
            "active_participants": sum(len(r.participants) for r in open_rooms)
        }
    }
