"""Configuration management for WebRTC signaling server."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Settings:
    """Application settings."""
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Security
    API_KEY: str = os.getenv("API_KEY", "dev-api-key-change-in-production")
    ALLOWED_ORIGINS: list = os.getenv(
        "ALLOWED_ORIGINS", 
        "http://localhost:8000,http://localhost:3000"
    ).split(",")
    
    # Storage
    DATA_FILE: str = os.getenv("DATA_FILE", "data/rooms.json")
    
    # Room settings
    ROOM_TTL_HOURS: int = int(os.getenv("ROOM_TTL_HOURS", "24"))
    MAX_PARTICIPANTS_PER_ROOM: int = int(os.getenv("MAX_PARTICIPANTS_PER_ROOM", "50"))
    
    # Code generation
    ROOM_CODE_LENGTH: int = 6
    ROOM_CODE_CHARSET: str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    
    def __init__(self):
        """Ensure data directory exists."""
        data_path = Path(self.DATA_FILE).parent
        data_path.mkdir(parents=True, exist_ok=True)

settings = Settings()
