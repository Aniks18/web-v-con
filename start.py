#!/usr/bin/env python3
"""
WebRTC Video Conference Server - One-Click Starter
Run this file to start everything: python start.py
"""

import sys
import os
import subprocess
from pathlib import Path
import shutil


def print_header():
    """Print welcome banner."""
    print("\n" + "=" * 60)
    print("🎥  WebRTC Video Conference Server")
    print("=" * 60 + "\n")


def check_python_version():
    """Check if Python version is compatible."""
    print("✓ Checking Python version...")
    if sys.version_info < (3, 8):
        print("❌ Error: Python 3.8 or higher is required")
        print(f"   Current version: {sys.version}")
        sys.exit(1)
    print(f"  Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")


def check_dependencies():
    """Check if required packages are installed."""
    print("\n✓ Checking dependencies...")
    required_packages = [
        'fastapi',
        'uvicorn',
        'pydantic',
        'python-dotenv',
        'websockets'
    ]
    
    missing = []
    for package in required_packages:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing.append(package)
    
    if missing:
        print(f"❌ Missing packages: {', '.join(missing)}")
        print("\n📦 Installing dependencies...")
        try:
            subprocess.check_call([
                sys.executable, 
                "-m", 
                "pip", 
                "install", 
                "-r", 
                "requirements.txt"
            ])
            print("✓ Dependencies installed successfully")
        except subprocess.CalledProcessError:
            print("❌ Failed to install dependencies")
            print("   Please run manually: pip install -r requirements.txt")
            sys.exit(1)
    else:
        print("  All packages installed")


def setup_environment():
    """Create .env file if it doesn't exist."""
    print("\n✓ Setting up environment...")
    
    env_file = Path(".env")
    env_example = Path(".env.example")
    
    if not env_file.exists():
        if env_example.exists():
            shutil.copy(env_example, env_file)
            print("  Created .env file from template")
            print("  ⚠️  Remember to update API_KEY in .env for production!")
        else:
            # Create basic .env
            with open(env_file, 'w') as f:
                f.write("# Server Configuration\n")
                f.write("HOST=0.0.0.0\n")
                f.write("PORT=8000\n\n")
                f.write("# API Authentication\n")
                f.write("API_KEY=dev-api-key-change-in-production\n\n")
                f.write("# Storage\n")
                f.write("DATA_FILE=data/rooms.json\n\n")
                f.write("# Room Settings\n")
                f.write("ROOM_TTL_HOURS=24\n")
                f.write("MAX_PARTICIPANTS_PER_ROOM=50\n\n")
                f.write("# CORS\n")
                f.write("ALLOWED_ORIGINS=http://localhost:8000,http://localhost:3000\n")
            print("  Created .env file with defaults")
    else:
        print("  .env file exists")


def create_directories():
    """Create necessary directories."""
    print("\n✓ Creating directories...")
    
    directories = ['data', 'static']
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("  Directories ready")


def check_static_files():
    """Check if static files exist."""
    print("\n✓ Checking static files...")
    
    static_files = ['static/index.html', 'static/webrtc-client.js']
    missing_files = [f for f in static_files if not Path(f).exists()]
    
    if missing_files:
        print(f"  ⚠️  Warning: Missing files: {', '.join(missing_files)}")
        print("     Test client may not work properly")
    else:
        print("  Static files ready")


def start_server():
    """Start the FastAPI server."""
    print("\n" + "=" * 60)
    print("🚀 Starting server...")
    print("=" * 60)
    print("\n📍 Server will be available at:")
    print("   http://localhost:8000")
    print("\n📚 API Documentation:")
    print("   http://localhost:8000/docs")
    print("\n⚡ Press CTRL+C to stop the server\n")
    print("=" * 60 + "\n")
    
    try:
        # Import here to ensure dependencies are installed first
        import uvicorn
        from config import settings
        
        uvicorn.run(
            "main:app",
            host=settings.HOST,
            port=settings.PORT,
            reload=True,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped. Goodbye!")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure all files are in place")
        print("2. Check if port 8000 is already in use")
        print("3. Verify all dependencies are installed: pip install -r requirements.txt")
        sys.exit(1)


def main():
    """Main startup routine."""
    # Change to script directory
    os.chdir(Path(__file__).parent)
    
    print_header()
    check_python_version()
    check_dependencies()
    setup_environment()
    create_directories()
    check_static_files()
    start_server()


if __name__ == "__main__":
    main()
