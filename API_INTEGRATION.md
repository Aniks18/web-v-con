# WebRTC Signaling API - Integration Guide

## Overview

This is a production-ready WebRTC signaling server API designed to be integrated into your Ed-Tech platform. The service handles all WebRTC signaling, room management, and participant coordination for video conferencing features.

## 🚀 Quick Start

### 1. Deploy to Render

1. Connect your repository to Render
2. Set the environment variable `API_KEY` with a secure random key
3. Deploy the service
4. Save your Render API URL (e.g., `https://your-app.onrender.com`)

### 2. Generate API Key

```bash
# Generate a secure API key (32 bytes, URL-safe)
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Set this as `API_KEY` in your Render environment variables.

### 3. Test Connection

```bash
curl https://your-app.onrender.com/health
```

---

## 📡 API Endpoints

All REST API endpoints require authentication via the `X-API-Key` header.

### Base URL
```
Production: https://your-app.onrender.com
```

### Authentication

Include your API key in every request:

```http
X-API-Key: your-secure-api-key
```

---

## 🔑 Core Endpoints

### 1. Create a Room

**Endpoint:** `POST /api/rooms`

**Use Case:** Create a new video conference room when a teacher schedules a class or starts a session.

**Headers:**
```http
Content-Type: application/json
X-API-Key: your-api-key
```

**Request Body:**
```json
{
  "owner_id": "teacher_123",
  "ttl_hours": 2,
  "max_participants": 30
}
```

**Parameters:**
- `owner_id` (optional): Identifier for the room creator (teacher/host ID)
- `ttl_hours` (optional): Room lifetime in hours (1-168, default: 24)
- `max_participants` (optional): Maximum participants allowed (2-100, default: 50)

**Response (201 Created):**
```json
{
  "room_code": "a7x9k2",
  "created_at": "2025-12-18T10:30:00Z",
  "expires_at": "2025-12-18T12:30:00Z",
  "owner_id": "teacher_123"
}
```

**Integration Example (JavaScript):**
```javascript
async function createVideoRoom(teacherId, duration = 2, maxStudents = 30) {
  const response = await fetch('https://your-app.onrender.com/api/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'
    },
    body: JSON.stringify({
      owner_id: teacherId,
      ttl_hours: duration,
      max_participants: maxStudents
    })
  });
  
  const data = await response.json();
  return data.room_code; // Share this code with students
}
```

---

### 2. Get Room Information

**Endpoint:** `GET /api/rooms/{room_code}`

**Use Case:** Check room status, participant count, and validity before joining.

**Headers:**
```http
X-API-Key: your-api-key
```

**Response (200 OK):**
```json
{
  "room_code": "a7x9k2",
  "created_at": "2025-12-18T10:30:00Z",
  "expires_at": "2025-12-18T12:30:00Z",
  "state": "open",
  "participant_count": 5,
  "max_participants": 30,
  "participants": [
    {
      "socket_id": "abc123",
      "display_name": "John Doe",
      "joined_at": "2025-12-18T10:31:00Z"
    }
  ]
}
```

**Response Codes:**
- `200`: Room found
- `404`: Room not found
- `401`: Invalid API key

---

### 3. List All Rooms

**Endpoint:** `GET /api/rooms?state=open`

**Use Case:** Dashboard to show all active sessions.

**Query Parameters:**
- `state` (optional): Filter by state (`open`, `closed`, `expired`)

**Response:**
```json
{
  "rooms": [
    {
      "room_code": "a7x9k2",
      "state": "open",
      "participant_count": 5,
      "max_participants": 30,
      "created_at": "2025-12-18T10:30:00Z",
      "expires_at": "2025-12-18T12:30:00Z"
    }
  ],
  "total": 1
}
```

---

### 4. Delete a Room

**Endpoint:** `DELETE /api/rooms/{room_code}`

**Use Case:** End a class/session manually.

**Response:**
```json
{
  "message": "Room a7x9k2 deleted successfully"
}
```

---

### 5. Get Statistics

**Endpoint:** `GET /api/statistics`

**Use Case:** Analytics dashboard for your platform.

**Response:**
```json
{
  "statistics": {
    "total_rooms": 10,
    "open_rooms": 3,
    "closed_rooms": 5,
    "expired_rooms": 2,
    "total_participants": 45,
    "active_participants": 15
  }
}
```

---

### 6. Health Check

**Endpoint:** `GET /health`

**Use Case:** Monitor service status (no authentication required).

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-18T10:30:00Z",
  "metrics": {
    "active_websocket_connections": 15,
    "active_rooms": 3,
    "api_authentication": "enabled"
  }
}
```

---

## 🔌 WebSocket Connection

### Endpoint
```
wss://your-app.onrender.com/ws
```

### Connection Flow

1. **Connect to WebSocket**
2. **Server sends connection confirmation:**
```json
{
  "type": "connected",
  "payload": {
    "socket_id": "unique-socket-id"
  }
}
```

3. **Join a room:**
```json
{
  "type": "join",
  "payload": {
    "room_code": "a7x9k2",
    "display_name": "John Doe",
    "user_id": "student_456"
  }
}
```

4. **Receive participant list:**
```json
{
  "type": "room_joined",
  "payload": {
    "room_code": "a7x9k2",
    "participants": [...]
  }
}
```

### WebSocket Message Types

**Client → Server:**
- `join`: Join a room
- `offer`: Send WebRTC offer
- `answer`: Send WebRTC answer
- `ice_candidate`: Send ICE candidate
- `leave`: Leave room

**Server → Client:**
- `connected`: Connection established
- `room_joined`: Successfully joined room
- `participant_joined`: New participant joined
- `participant_left`: Participant left
- `offer`: Receive offer from peer
- `answer`: Receive answer from peer
- `ice_candidate`: Receive ICE candidate
- `error`: Error occurred

---

## 🎯 Integration Patterns

### Pattern 1: Scheduled Class

```javascript
// Teacher schedules a class
const roomCode = await createVideoRoom('teacher_123', 2, 30);

// Save roomCode to your database with class details
await db.classes.update(classId, { 
  video_room_code: roomCode 
});

// Students join using the room code
// Your frontend opens: /class/{classId}?join_video={roomCode}
```

### Pattern 2: Instant Tutoring Session

```javascript
// Student requests tutoring
const roomCode = await createVideoRoom('tutor_456', 1, 2);

// Send notification to tutor with room code
await notifyTutor(tutorId, { roomCode });

// Both join the room immediately
```

### Pattern 3: Group Study Room

```javascript
// Student creates study room
const roomCode = await createVideoRoom('student_789', 4, 10);

// Share code with study group
await shareWithGroup(groupId, roomCode);
```

---

## 🛡️ Security Best Practices

### 1. Secure Your API Key

- **Never** commit API keys to version control
- Store in environment variables
- Rotate keys periodically
- Use different keys for staging/production

### 2. Room Code Validation

Before allowing users to join:
```javascript
async function validateRoom(roomCode) {
  try {
    const response = await fetch(
      `https://your-app.onrender.com/api/rooms/${roomCode}`,
      {
        headers: { 'X-API-Key': 'your-api-key' }
      }
    );
    
    if (!response.ok) return false;
    
    const room = await response.json();
    return room.state === 'open';
  } catch {
    return false;
  }
}
```

### 3. User Authentication

The signaling server handles WebRTC signaling only. You should:
- Authenticate users in **your** platform first
- Only provide room codes to authenticated users
- Use `user_id` in join requests for tracking
- Implement your own permission system

---

## 📱 Frontend Integration

### HTML/JavaScript Client Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>Video Conference</title>
</head>
<body>
  <div id="local-video"></div>
  <div id="remote-videos"></div>
  
  <script>
    const ws = new WebSocket('wss://your-app.onrender.com/ws');
    const roomCode = 'a7x9k2'; // From your backend
    let localStream;
    
    ws.onopen = async () => {
      // Get user media
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Join room
      ws.send(JSON.stringify({
        type: 'join',
        payload: {
          room_code: roomCode,
          display_name: 'John Doe',
          user_id: 'student_123'
        }
      }));
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        case 'room_joined':
          console.log('Joined room successfully');
          break;
        case 'participant_joined':
          // New peer joined, initiate connection
          createPeerConnection(message.payload);
          break;
        case 'offer':
          handleOffer(message.payload);
          break;
        case 'answer':
          handleAnswer(message.payload);
          break;
        case 'ice_candidate':
          handleIceCandidate(message.payload);
          break;
      }
    };
  </script>
</body>
</html>
```

### React Integration Example

```jsx
import { useEffect, useRef, useState } from 'react';

function VideoRoom({ roomCode, userId, displayName }) {
  const ws = useRef(null);
  const [participants, setParticipants] = useState([]);
  
  useEffect(() => {
    ws.current = new WebSocket('wss://your-app.onrender.com/ws');
    
    ws.current.onopen = () => {
      ws.current.send(JSON.stringify({
        type: 'join',
        payload: { room_code: roomCode, display_name: displayName, user_id: userId }
      }));
    };
    
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      // Handle messages...
    };
    
    return () => ws.current.close();
  }, [roomCode]);
  
  return (
    <div>
      <h1>Room: {roomCode}</h1>
      {/* Video elements */}
    </div>
  );
}
```

---

## 🌐 CORS Configuration

The server accepts requests from all origins (`*`) by default. To restrict to your domain:

Set environment variable:
```
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

---

## 📊 Monitoring & Analytics

### Track Usage

```javascript
// Get daily statistics
async function getDailyStats() {
  const response = await fetch(
    'https://your-app.onrender.com/api/statistics',
    {
      headers: { 'X-API-Key': 'your-api-key' }
    }
  );
  return await response.json();
}

// Monitor active sessions
setInterval(async () => {
  const health = await fetch('https://your-app.onrender.com/health')
    .then(r => r.json());
  
  console.log(`Active rooms: ${health.metrics.active_rooms}`);
  console.log(`Active connections: ${health.metrics.active_websocket_connections}`);
}, 30000); // Every 30 seconds
```

---

## 🔧 Error Handling

### Common Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| 401 | Invalid/missing API key | Check X-API-Key header |
| 404 | Room not found | Verify room code is valid |
| 400 | Invalid parameters | Check request format |
| 500 | Server error | Check logs, contact support |

### Error Response Format

```json
{
  "detail": "Invalid or missing API key"
}
```

---

## 🚀 Deployment Checklist

- [ ] Generate secure API key
- [ ] Set `API_KEY` in Render environment variables
- [ ] Configure `ALLOWED_ORIGINS` (optional)
- [ ] Set `ROOM_TTL_HOURS` (default: 24)
- [ ] Set `MAX_PARTICIPANTS_PER_ROOM` (default: 50)
- [ ] Test health endpoint
- [ ] Test room creation
- [ ] Test WebSocket connection
- [ ] Update frontend with production URL
- [ ] Monitor logs for first few sessions

---

## 📝 Environment Variables (Render)

```env
# Required
API_KEY=your-secure-api-key-here

# Optional
ALLOWED_ORIGINS=https://yourdomain.com
ROOM_TTL_HOURS=24
MAX_PARTICIPANTS_PER_ROOM=50
PORT=8000
```

---

## 🎓 Example: Complete Ed-Tech Flow

### 1. Teacher Creates Class
```javascript
// Backend: Create room when class is scheduled
const roomCode = await createVideoRoom(teacherId, 2, 30);
await db.classes.update(classId, { room_code: roomCode });
```

### 2. Student Opens Class
```javascript
// Frontend: Fetch class details
const classData = await fetch(`/api/classes/${classId}`);
const { room_code } = await classData.json();

// Validate room is active
const isActive = await validateRoom(room_code);

if (isActive) {
  // Join video conference
  openVideoConference(room_code, student.name, student.id);
}
```

### 3. Real-time Updates
```javascript
// Monitor room status
const roomInfo = await fetch(
  `https://your-app.onrender.com/api/rooms/${room_code}`,
  { headers: { 'X-API-Key': 'your-api-key' } }
).then(r => r.json());

// Show "5 students online" in UI
updateClassUI(roomInfo.participant_count);
```

---

## 📞 Support & Documentation

- **API Documentation:** https://your-app.onrender.com/api/docs
- **ReDoc:** https://your-app.onrender.com/api/redoc
- **Health Check:** https://your-app.onrender.com/health

---

## 🎉 You're Ready!

Your WebRTC signaling server is now deployed and ready to handle video conferencing for your Ed-Tech platform. Start by creating your first room and testing the connection.

**Next Steps:**
1. Integrate room creation into your class scheduling
2. Build the frontend video interface
3. Add user permissions and access control
4. Monitor usage with the statistics endpoint

Happy coding! 🚀
