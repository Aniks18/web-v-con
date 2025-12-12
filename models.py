"""Data models for rooms and participants."""
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from pydantic import BaseModel, Field


class Participant(BaseModel):
    """Represents a participant in a room."""
    socket_id: str
    display_name: Optional[str] = None
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None
    last_seen: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Room(BaseModel):
    """Represents a video conference room."""
    room_code: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime
    owner_socket_id: Optional[str] = None
    state: str = "open"  # open | closed | expired
    max_participants: int = 50
    participants: Dict[str, Participant] = Field(default_factory=dict)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
    
    def add_participant(self, socket_id: str, display_name: Optional[str] = None, user_id: Optional[str] = None) -> bool:
        """Add a participant to the room."""
        if len(self.participants) >= self.max_participants:
            return False
        
        if socket_id not in self.participants:
            self.participants[socket_id] = Participant(
                socket_id=socket_id,
                display_name=display_name,
                user_id=user_id
            )
            return True
        return False
    
    def remove_participant(self, socket_id: str) -> bool:
        """Remove a participant from the room."""
        if socket_id in self.participants:
            del self.participants[socket_id]
            return True
        return False
    
    def get_participant_list(self) -> List[dict]:
        """Get list of all participants."""
        return [
            {
                "socket_id": p.socket_id,
                "display_name": p.display_name,
                "joined_at": p.joined_at.isoformat()
            }
            for p in self.participants.values()
        ]
    
    def is_expired(self) -> bool:
        """Check if room has expired."""
        return datetime.utcnow() >= self.expires_at or self.state == "expired"
    
    def close(self):
        """Close the room."""
        self.state = "closed"


class RoomCreateRequest(BaseModel):
    """Request model for creating a room."""
    owner_id: Optional[str] = None
    max_participants: Optional[int] = 50
    ttl_hours: Optional[int] = 24


class RoomCreateResponse(BaseModel):
    """Response model for room creation."""
    room_code: str
    created_at: str
    expires_at: str
    owner_id: Optional[str] = None


class RoomInfoResponse(BaseModel):
    """Response model for room information."""
    room_code: str
    created_at: str
    expires_at: str
    state: str
    participant_count: int
    max_participants: int
    participants: List[dict]


# WebSocket message models
class WSMessage(BaseModel):
    """Base WebSocket message."""
    type: str
    payload: dict = Field(default_factory=dict)


class JoinRoomMessage(BaseModel):
    """Message to join a room."""
    room_code: str
    display_name: Optional[str] = None


class SignalMessage(BaseModel):
    """Signaling message (SDP/ICE)."""
    to: str  # target socket_id
    signal_type: str  # offer | answer | candidate
    payload: dict  # SDP or ICE candidate data
