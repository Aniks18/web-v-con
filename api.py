"""REST API endpoints for room management."""
from fastapi import APIRouter, HTTPException, Header, status
from typing import Optional
from models import RoomCreateRequest, RoomCreateResponse, RoomInfoResponse
from room_manager import room_manager
from config import settings


router = APIRouter(prefix="/api", tags=["rooms"])


def verify_api_key(x_api_key: Optional[str] = Header(None)) -> bool:
    """Verify API key from header."""
    if not x_api_key or x_api_key != settings.API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key"
        )
    return True


@router.post("/rooms", response_model=RoomCreateResponse)
async def create_room(
    request: RoomCreateRequest,
    x_api_key: Optional[str] = Header(None)
):
    """
    Create a new room (requires API key).
    
    This endpoint is for programmatic room creation - for example,
    a teacher creating a scheduled session.
    """
    verify_api_key(x_api_key)
    
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
