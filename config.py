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
        
        # Validate API key
        if not self.API_KEY:
            print("\n" + "="*70)
            print("⚠️  WARNING: No API_KEY set in environment!")
            print("="*70)
            print("For development, you can run:")
            dev_key = self._generate_secure_key()[:16]
            print(f"\n  $env:API_KEY=\"dev-key-{dev_key}\"; python start.py")
            print("\nFor production (Render), generate a secure key:")
            print("\n  python -c \"import secrets; print(secrets.token_urlsafe(32))\"")
            print("\nThen set it in your Render environment variables.")
            print("="*70 + "\n")
            
            # In development, allow but warn. In production (Render), this will fail.
            if os.getenv("RENDER"):  # Render sets this env var
                raise ValueError("API_KEY environment variable is required for production")
            else:
                print("⚠️  Continuing in DEVELOPMENT mode with weak security...")
                print("⚠️  DO NOT use in production!\n")
                # Set a development-only key
                self.API_KEY = f"dev-insecure-key-{self._generate_secure_key()[:16]}"
                print(f"📝 Development API Key: {self.API_KEY}\n")
    
    @staticmethod
    def _generate_secure_key() -> str:
        """Generate a secure random API key."""
        return secrets.token_urlsafe(32)

settings = Settings()
