"""Room management and code generation utilities."""
import secrets
from datetime import datetime, timedelta
from typing import Optional
from models import Room
from storage import storage
from config import settings


class RoomManager:
    """Manages room creation, retrieval, and lifecycle."""
    
    def __init__(self):
        self.storage = storage
    
    def generate_room_code(self) -> str:
        """Generate a unique 6-character room code using base62."""
        charset = settings.ROOM_CODE_CHARSET
        max_attempts = 100
        
        for _ in range(max_attempts):
            # Generate cryptographically secure random code
            code = ''.join(
                secrets.choice(charset) 
                for _ in range(settings.ROOM_CODE_LENGTH)
            )
            
            # Check if code already exists
            if not self.storage.get_room(code):
                return code
        
        # Fallback with timestamp suffix if all attempts fail (extremely unlikely)
        code = ''.join(secrets.choice(charset) for _ in range(5))
        code += str(int(datetime.utcnow().timestamp()) % 62)
        return code[:settings.ROOM_CODE_LENGTH]
    
    def create_room(
        self, 
        owner_id: Optional[str] = None,
        ttl_hours: Optional[int] = None,
        max_participants: Optional[int] = None
    ) -> Room:
        """Create a new room with a unique code."""
        room_code = self.generate_room_code()
        
        if ttl_hours is None:
            ttl_hours = settings.ROOM_TTL_HOURS
        
        if max_participants is None:
            max_participants = settings.MAX_PARTICIPANTS_PER_ROOM
        
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        
        room = Room(
            room_code=room_code,
            expires_at=expires_at,
            owner_socket_id=owner_id,
            max_participants=max_participants,
            state="open"
        )
        
        self.storage.save_room(room)
        return room
    
    def get_room(self, room_code: str) -> Optional[Room]:
        """Get a room by code."""
        room = self.storage.get_room(room_code)
        
        if room and room.is_expired():
            room.state = "expired"
            self.storage.save_room(room)
        
        return room
    
    def update_room(self, room: Room) -> bool:
        """Update room state."""
        return self.storage.save_room(room)
    
    def delete_room(self, room_code: str) -> bool:
        """Delete a room."""
        return self.storage.delete_room(room_code)
    
    def add_participant(
        self, 
        room_code: str, 
        socket_id: str, 
        display_name: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> Optional[Room]:
        """Add a participant to a room."""
        room = self.get_room(room_code)
        
        if not room:
            return None
        
        if room.is_expired():
            return None
        
        if room.state != "open":
            return None
        
        success = room.add_participant(socket_id, display_name, user_id)
        
        if success:
            self.storage.save_room(room)
            return room
        
        return None
    
    def remove_participant(self, room_code: str, socket_id: str) -> Optional[Room]:
        """Remove a participant from a room."""
        room = self.get_room(room_code)
        
        if not room:
            return None
        
        success = room.remove_participant(socket_id)
        
        if success:
            # If no participants left, can optionally delete or mark for cleanup
            if len(room.participants) == 0:
                # Keep room for a bit in case of reconnection, cleanup job will handle it
                pass
            
            self.storage.save_room(room)
            return room
        
        return None
    
    def cleanup_expired_rooms(self) -> int:
        """Clean up expired rooms."""
        return self.storage.cleanup_expired_rooms()
    
    def get_participant_room(self, socket_id: str) -> Optional[tuple[str, Room]]:
        """Find which room a participant is in."""
        all_rooms = self.storage.get_all_rooms()
        
        for room in all_rooms:
            if socket_id in room.participants:
                return (room.room_code, room)
        
        return None


# Global room manager instance
room_manager = RoomManager()
