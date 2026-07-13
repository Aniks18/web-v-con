"""Configuration management for WebRTC signaling server."""
import os
import secrets
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
    API_KEY: str = os.getenv("API_KEY", "")
    ALLOWED_ORIGINS: list = os.getenv(
        "ALLOWED_ORIGINS", 
        "*"  # Changed to allow all origins for Render
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
        """Ensure data directory exists and validate critical settings."""
        data_path = Path(self.DATA_FILE).parent
        data_path.mkdir(parents=True, exist_ok=True)

        # API key only guards the admin REST API. End users create/join rooms
        # over WebSocket without a key, so a missing key must never block boot
        # or deployment. Auto-generate a secure one and warn instead.
        if not self.API_KEY:
            self.API_KEY = self._generate_secure_key()
            print("=" * 70)
            print("WARNING: No API_KEY set in environment.")
            print("An admin API key was auto-generated for this run:")
            print(f"  {self.API_KEY}")
            print("The user-facing app (create/join rooms) works without it.")
            print("Set API_KEY in the environment to use the REST admin API.")
            print("=" * 70)
    
    @staticmethod
    def _generate_secure_key() -> str:
        """Generate a secure random API key."""
        return secrets.token_urlsafe(32)

settings = Settings()
