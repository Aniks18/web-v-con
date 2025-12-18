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
            is_render = os.getenv("RENDER") or os.getenv("RENDER_SERVICE_NAME")
            
            if is_render:
                # Production (Render) - fail with clear instructions
                print("\n" + "="*70)
                print("❌ DEPLOYMENT FAILED: Missing API_KEY")
                print("="*70)
                print("\n🔧 TO FIX THIS:")
                print("\n1. Go to your Render Dashboard")
                print("2. Select your service")
                print("3. Go to 'Environment' tab")
                print("4. Add a new environment variable:")
                print("   - Key: API_KEY")
                print("   - Value: Generate using command below")
                print("\n5. Generate a secure key:")
                print("   python -c \"import secrets; print(secrets.token_urlsafe(32))\"")
                print("\n6. Save the environment variable")
                print("7. Render will automatically redeploy")
                print("\n" + "="*70 + "\n")
                raise ValueError("API_KEY environment variable is required for production. See instructions above.")
            else:
                # Development mode - allow with warning
                print("\n" + "="*70)
                print("⚠️  WARNING: No API_KEY set in environment!")
                print("="*70)
                print("Running in DEVELOPMENT mode with auto-generated key.")
                print("\nFor production, generate a secure key:")
                print("  python -c \"import secrets; print(secrets.token_urlsafe(32))\"")
                print("="*70 + "\n")
                
                self.API_KEY = f"dev-insecure-key-{self._generate_secure_key()[:16]}"
                print(f"📝 Development API Key: {self.API_KEY}\n")
                print("⚠️  DO NOT use this in production!\n")
    
    @staticmethod
    def _generate_secure_key() -> str:
        """Generate a secure random API key."""
        return secrets.token_urlsafe(32)

settings = Settings()
