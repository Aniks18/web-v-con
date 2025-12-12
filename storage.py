"""JSON file-based storage with thread-safe operations."""
import json
import threading
from pathlib import Path
from typing import Optional, Dict, List
from datetime import datetime
from models import Room, Participant
from config import settings


class JSONStorage:
    """Thread-safe JSON file storage for rooms."""
    
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self.lock = threading.Lock()
        self._ensure_file_exists()
    
    def _ensure_file_exists(self):
        """Create the data file if it doesn't exist."""
        if not self.file_path.exists():
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            self._write_data({"rooms": {}})
    
    def _read_data(self) -> dict:
        """Read data from JSON file."""
        with self.lock:
            try:
                with open(self.file_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                return {"rooms": {}}
    
    def _write_data(self, data: dict):
        """Write data to JSON file."""
        with self.lock:
            with open(self.file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, default=str)
    
    def save_room(self, room: Room) -> bool:
        """Save or update a room."""
        data = self._read_data()
        data["rooms"][room.room_code] = room.model_dump(mode='json')
        self._write_data(data)
        return True
    
    def get_room(self, room_code: str) -> Optional[Room]:
        """Get a room by code."""
        data = self._read_data()
        room_data = data["rooms"].get(room_code)
        
        if not room_data:
            return None
        
        # Convert datetime strings back to datetime objects
        room_data["created_at"] = datetime.fromisoformat(room_data["created_at"])
        room_data["expires_at"] = datetime.fromisoformat(room_data["expires_at"])
        
        # Convert participants
        participants = {}
        for socket_id, p_data in room_data.get("participants", {}).items():
            p_data["joined_at"] = datetime.fromisoformat(p_data["joined_at"])
            p_data["last_seen"] = datetime.fromisoformat(p_data["last_seen"])
            participants[socket_id] = Participant(**p_data)
        
        room_data["participants"] = participants
        return Room(**room_data)
    
    def delete_room(self, room_code: str) -> bool:
        """Delete a room."""
        data = self._read_data()
        if room_code in data["rooms"]:
            del data["rooms"][room_code]
            self._write_data(data)
            return True
        return False
    
    def get_all_rooms(self) -> List[Room]:
        """Get all rooms."""
        data = self._read_data()
        rooms = []
        
        for room_data in data["rooms"].values():
            try:
                room_data["created_at"] = datetime.fromisoformat(room_data["created_at"])
                room_data["expires_at"] = datetime.fromisoformat(room_data["expires_at"])
                
                participants = {}
                for socket_id, p_data in room_data.get("participants", {}).items():
                    p_data["joined_at"] = datetime.fromisoformat(p_data["joined_at"])
                    p_data["last_seen"] = datetime.fromisoformat(p_data["last_seen"])
                    participants[socket_id] = Participant(**p_data)
                
                room_data["participants"] = participants
                rooms.append(Room(**room_data))
            except Exception as e:
                print(f"Error loading room: {e}")
                continue
        
        return rooms
    
    def cleanup_expired_rooms(self) -> int:
        """Remove expired rooms. Returns count of removed rooms."""
        data = self._read_data()
        rooms_to_delete = []
        
        for room_code, room_data in data["rooms"].items():
            try:
                expires_at = datetime.fromisoformat(room_data["expires_at"])
                if datetime.utcnow() >= expires_at:
                    rooms_to_delete.append(room_code)
            except Exception:
                rooms_to_delete.append(room_code)
        
        for room_code in rooms_to_delete:
            del data["rooms"][room_code]
        
        if rooms_to_delete:
            self._write_data(data)
        
        return len(rooms_to_delete)


# Global storage instance
storage = JSONStorage(settings.DATA_FILE)
