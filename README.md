# WebRTC Video Conferencing Server

A Python-based WebRTC signaling server with 6-character room codes for easy video conferencing.

## Features

- **Simple Room Creation**: Generate 6-character room codes (e.g., `6a18t3`)
- **WebRTC Signaling**: Full peer-to-peer connection management
- **REST API**: Programmatic room creation with API key authentication
- **WebSocket**: Real-time signaling for SDP/ICE exchange
- **JSON Storage**: Lightweight file-based persistence (easily upgradable to Supabase)
- **Test Client**: Built-in HTML/JS client for testing

## Architecture

- **Backend**: Python FastAPI with WebSocket support
- **Storage**: Thread-safe JSON file storage
- **Protocol**: WebRTC (STUN for NAT traversal, add TURN for production)
- **Deployment**: Render-ready with Docker support

## Quick Start

### 1. Install Dependencies

```bash
# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Activate (Linux/Mac)
source venv/bin/activate

# Install packages
pip install -r requirements.txt
```

### 2. Configuration

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```env
API_KEY=your-secret-api-key-here
```

### 3. Run Locally

```bash
python main.py
```

Or with uvicorn:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Test

Open your browser and navigate to:

```
http://localhost:8000
```

- Click "Create New Room" to generate a room code
- Open another browser tab/window and enter the code to join
- Grant camera/microphone permissions

## API Documentation

### REST Endpoints (Require API Key)

#### Create Room

```bash
POST /api/rooms
Headers: X-API-Key: your-api-key

Body:
{
  "owner_id": "optional",
  "ttl_hours": 24,
  "max_participants": 50
}

Response:
{
  "room_code": "6a18t3",
  "created_at": "2025-12-12T10:00:00",
  "expires_at": "2025-12-13T10:00:00"
}
```

#### Get Room Info

```bash
GET /api/rooms/{room_code}
Headers: X-API-Key: your-api-key

Response:
{
  "room_code": "6a18t3",
  "state": "open",
  "participant_count": 2,
  "participants": [...]
}
```

#### Delete Room

```bash
DELETE /api/rooms/{room_code}
Headers: X-API-Key: your-api-key
```

### WebSocket Signaling

Connect to: `ws://localhost:8000/ws`

#### Client → Server Messages

**Join Room:**
```json
{
  "type": "join_room",
  "payload": {
    "room_code": "6a18t3",
    "display_name": "John"
  }
}
```

**Signal (SDP/ICE):**
```json
{
  "type": "signal",
  "payload": {
    "to": "socket-id",
    "signal_type": "offer|answer|candidate",
    "payload": { ... }
  }
}
```

**Leave Room:**
```json
{
  "type": "leave_room",
  "payload": {}
}
```

#### Server → Client Messages

**Connected:**
```json
{
  "type": "connected",
  "payload": {
    "socket_id": "uuid"
  }
}
```

**Joined:**
```json
{
  "type": "joined",
  "payload": {
    "room_code": "6a18t3",
    "your_socket_id": "uuid",
    "peers": [{"socket_id": "...", "display_name": "..."}]
  }
}
```

**Peer Joined:**
```json
{
  "type": "peer_joined",
  "payload": {
    "socket_id": "uuid",
    "display_name": "John"
  }
}
```

**Signal:**
```json
{
  "type": "signal",
  "payload": {
    "from": "socket-id",
    "signal_type": "offer|answer|candidate",
    "payload": { ... }
  }
}
```

## Project Structure

```
web-v-con/
├── main.py                 # FastAPI application entry point
├── config.py              # Configuration management
├── models.py              # Pydantic models
├── storage.py             # JSON file storage
├── room_manager.py        # Room lifecycle management
├── websocket_manager.py   # WebSocket connection handling
├── api.py                 # REST API endpoints
├── requirements.txt       # Python dependencies
├── .env.example          # Environment template
├── Dockerfile            # Docker configuration
├── Procfile              # Render deployment
├── static/
│   ├── index.html        # Test client UI
│   └── webrtc-client.js  # WebRTC client logic
└── data/
    └── rooms.json        # Room storage (auto-created)
```

## Deployment to Render

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_REPO_URL
git push -u origin main
```

### Step 2: Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: web-v-con
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Step 3: Set Environment Variables

In Render dashboard, add:

```
API_KEY=your-production-api-key
ALLOWED_ORIGINS=https://your-app.onrender.com
```

### Step 4: Deploy

Render will automatically build and deploy. Access at:

```
https://your-app.onrender.com
```

## Production Considerations

### TURN Server

For production, add TURN servers for reliable connectivity:

1. **Self-hosted**: Deploy [coturn](https://github.com/coturn/coturn)
2. **Managed**: Use Twilio, Xirsys, or Agora

Update `static/webrtc-client.js`:

```javascript
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:your-turn-server:3478',
            username: 'user',
            credential: 'pass'
        }
    ]
};
```

### Scaling

For multiple server instances:

1. Use Redis for room storage instead of JSON
2. Implement Redis pub/sub for cross-instance signaling
3. Use sticky sessions or consistent hashing for WebSocket routing

### Security

- Change default API key in production
- Use HTTPS/WSS (Render provides this automatically)
- Implement rate limiting
- Add user authentication if needed
- Validate room code access patterns

### Migration to Supabase

To migrate from JSON to Supabase:

1. Install Supabase client:
   ```bash
   pip install supabase
   ```

2. Create tables in Supabase:
   ```sql
   CREATE TABLE rooms (
     room_code VARCHAR(6) PRIMARY KEY,
     created_at TIMESTAMP,
     expires_at TIMESTAMP,
     state VARCHAR(20),
     max_participants INT,
     participants JSONB
   );
   ```

3. Replace `storage.py` methods with Supabase queries

## Testing

### Local Testing

1. Open two browser tabs to `http://localhost:8000`
2. Create room in first tab
3. Copy code and join in second tab

### API Testing

```bash
# Create room
curl -X POST http://localhost:8000/api/rooms \
  -H "X-API-Key: dev-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{"ttl_hours": 24}'

# Get room info
curl -X GET http://localhost:8000/api/rooms/XXXXXX \
  -H "X-API-Key: dev-api-key-change-in-production"
```

### Health Check

```bash
curl http://localhost:8000/health
```

## Troubleshooting

### Camera/Microphone Not Working

- Ensure HTTPS in production (required for getUserMedia)
- Check browser permissions
- Test with `chrome://webrtc-internals`

### Peers Not Connecting

- Check firewall settings
- Verify STUN server is accessible
- Add TURN server for NAT traversal
- Check browser console for ICE connection states

### WebSocket Connection Failing

- Verify server is running
- Check CORS settings in `.env`
- Ensure firewall allows WebSocket connections

## License

MIT

## Support

For issues and questions, please open a GitHub issue.