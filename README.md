# WebRTC Signaling API

Production-ready WebRTC signaling server with API key authentication for video conferencing integration.

## 🚀 Features

- ✅ **API-First Design** - REST API for room management
- ✅ **WebSocket Signaling** - Real-time WebRTC signaling
- ✅ **API Key Authentication** - Secure endpoint access
- ✅ **Automatic Cleanup** - Expired room management
- ✅ **Room Management** - Create, join, monitor rooms
- ✅ **Production Ready** - Designed for Render deployment
- ✅ **Full Documentation** - API docs & integration guides

## 📡 Quick Start

### 1. Generate API Key

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 2. Set Environment Variable

```bash
export API_KEY="your-generated-api-key"
```

### 3. Install & Run

```bash
pip install -r requirements.txt
python start.py
```

### 4. Test

```bash
# Check health
curl http://localhost:8000/health

# Create room
curl -X POST http://localhost:8000/api/rooms \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"owner_id":"test","ttl_hours":1}'
```

## 📚 Documentation

- **[API Integration Guide](./API_INTEGRATION.md)** - Complete API reference for your ed-tech platform
- **[Render Deployment Guide](./RENDER_DEPLOYMENT.md)** - Deploy to Render in 5 minutes
- **[API Docs (Swagger)](http://localhost:8000/api/docs)** - Interactive API documentation
- **[ReDoc](http://localhost:8000/api/redoc)** - Alternative API documentation

## 🔑 Core Endpoints

### REST API (requires X-API-Key header)

```
POST   /api/rooms              - Create new room
GET    /api/rooms/{code}       - Get room info
GET    /api/rooms              - List all rooms
DELETE /api/rooms/{code}       - Delete room
GET    /api/statistics         - Get platform statistics
GET    /health                 - Health check (no auth)
```

### WebSocket

```
ws://localhost:8000/ws         - WebRTC signaling
```

## 🌐 Deploy to Render

### Quick Deploy

1. **Push to GitHub**
2. **Connect to Render** - It will detect `render.yaml`
3. **Set API_KEY** in environment variables
4. **Deploy** - Done! 🎉

See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for detailed instructions.

## 🔧 Configuration

### Required Environment Variables

```env
API_KEY=your-secure-api-key-here
```

### Optional Environment Variables

```env
ALLOWED_ORIGINS=*                    # CORS origins (comma-separated)
ROOM_TTL_HOURS=24                    # Room lifetime
MAX_PARTICIPANTS_PER_ROOM=50         # Max participants
PORT=8000                            # Server port
HOST=0.0.0.0                         # Server host
```

## 📱 Integration Example

### Create Room from Your Backend

```javascript
const response = await fetch('https://your-app.onrender.com/api/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': process.env.SIGNALING_API_KEY
  },
  body: JSON.stringify({
    owner_id: teacherId,
    ttl_hours: 2,
    max_participants: 30
  })
});

const { room_code } = await response.json();
// Share room_code with students
```

### Connect from Frontend

```javascript
const ws = new WebSocket('wss://your-app.onrender.com/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'join',
    payload: {
      room_code: 'a7x9k2',
      display_name: 'John Doe',
      user_id: 'student_123'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // Handle signaling messages
};
```

## 🛡️ Security

- **API Key Authentication** - All endpoints require X-API-Key header
- **CORS Protection** - Configure allowed origins
- **Room Expiration** - Automatic cleanup of expired rooms
- **User Tracking** - Associate participants with user IDs

## 📊 Monitoring

### Health Check

```bash
curl https://your-app.onrender.com/health
```

Returns:
```json
{
  "status": "healthy",
  "metrics": {
    "active_websocket_connections": 15,
    "active_rooms": 3,
    "api_authentication": "enabled"
  }
}
```

### Statistics

```bash
curl -H "X-API-Key: your-key" \
     https://your-app.onrender.com/api/statistics
```

## 🏗️ Architecture

```
Your Ed-Tech Platform
    ↓ (HTTP/REST)
WebRTC Signaling API (This Service)
    ↓ (WebSocket)
Frontend Clients (Students/Teachers)
    ↓ (WebRTC P2P)
Direct Video/Audio Connection
```

## 🎯 Use Cases

- **Live Classes** - Teachers conduct video lessons
- **Tutoring Sessions** - 1-on-1 or small group tutoring
- **Study Groups** - Student-led video study rooms
- **Office Hours** - Instructor office hours
- **Parent-Teacher Meetings** - Video conferences

## 📦 Tech Stack

- **FastAPI** - Modern Python web framework
- **WebSockets** - Real-time communication
- **Uvicorn** - ASGI server
- **Pydantic** - Data validation
- **Python 3.11+** - Latest Python features

## 🤝 Integration Support

This API is designed to integrate seamlessly with:
- React / Next.js frontends
- Vue.js applications
- Angular applications
- Mobile apps (React Native, Flutter)
- Any platform that supports WebSockets and WebRTC

## 📝 License

MIT License - Use freely in your ed-tech platform

## 🆘 Support

- **Issues**: Check logs in Render dashboard
- **API Docs**: Visit `/api/docs` on your deployment
- **Integration Help**: See [API_INTEGRATION.md](./API_INTEGRATION.md)

---

**Ready to integrate video conferencing into your ed-tech platform? Start with [API_INTEGRATION.md](./API_INTEGRATION.md)!** 🚀
