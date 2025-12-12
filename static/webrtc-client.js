// WebRTC Client Logic
let ws = null;
let localStream = null;
let mySocketId = null;
let currentRoomCode = null;
let peerConnections = {}; // socket_id -> RTCPeerConnection
let isVideoEnabled = true;
let isAudioEnabled = true;

// STUN/TURN configuration
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateStatus('connected', 'Connected to server');
    };
    
    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        await handleMessage(message);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus('error', 'Connection error');
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateStatus('error', 'Disconnected from server');
    };
}

// Handle incoming messages
async function handleMessage(message) {
    console.log('Received message:', message.type);
    
    switch (message.type) {
        case 'connected':
            mySocketId = message.payload.socket_id;
            console.log('My socket ID:', mySocketId);
            break;
        
        case 'room_created':
            handleRoomCreated(message.payload);
            break;
        
        case 'joined':
            await handleJoined(message.payload);
            break;
        
        case 'peer_joined':
            await handlePeerJoined(message.payload);
            break;
        
        case 'peer_left':
            handlePeerLeft(message.payload);
            break;
        
        case 'signal':
            await handleSignal(message.payload);
            break;
        
        case 'error':
            handleError(message.payload);
            break;
    }
}

// Create a new room
async function createRoom() {
    const displayName = document.getElementById('displayName').value.trim() || 'Anonymous';
    
    try {
        // Start local stream first
        await startLocalStream();
        
        // Create room via WebSocket (no API key needed for users)
        sendMessage({
            type: 'create_room',
            payload: {
                display_name: displayName,
                ttl_hours: 24,
                max_participants: 50
            }
        });
        
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room: ' + error.message);
    }
}

// Join an existing room
async function joinRoom() {
    const roomCode = document.getElementById('roomCode').value.trim();
    const displayName = document.getElementById('displayName').value.trim() || 'Anonymous';
    
    if (!roomCode || roomCode.length !== 6) {
        alert('Please enter a valid 6-character room code');
        return;
    }
    
    currentRoomCode = roomCode;
    
    await startLocalStream();
    sendMessage({
        type: 'join_room',
        payload: {
            room_code: roomCode,
            display_name: displayName
        }
    });
}

// Start local media stream
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Show room view
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('room').classList.remove('hidden');
        
        // Add local video
        addVideoElement(mySocketId, localStream, 'You (Local)', true);
        
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access camera/microphone. Please grant permissions.');
        throw error;
    }
}

// Handle room created
function handleRoomCreated(payload) {
    console.log('Room created:', payload.room_code);
    currentRoomCode = payload.room_code;
    document.getElementById('currentRoomCode').textContent = payload.room_code;
    
    // Room view is already shown from startLocalStream
    // No peers yet since we're the creator
}

// Handle joined confirmation
async function handleJoined(payload) {
    console.log('Joined room:', payload.room_code);
    currentRoomCode = payload.room_code;
    document.getElementById('currentRoomCode').textContent = payload.room_code;
    
    // Create peer connections for existing peers
    for (const peer of payload.peers) {
        await createPeerConnection(peer.socket_id, true);
    }
}

// Handle new peer joining
async function handlePeerJoined(payload) {
    console.log('Peer joined:', payload.socket_id);
    // The new peer will create offers to us, so we wait for their signal
}

// Handle peer leaving
function handlePeerLeft(payload) {
    console.log('Peer left:', payload.socket_id);
    
    if (peerConnections[payload.socket_id]) {
        peerConnections[payload.socket_id].close();
        delete peerConnections[payload.socket_id];
    }
    
    removeVideoElement(payload.socket_id);
}

// Create peer connection
async function createPeerConnection(peerId, createOffer) {
    const pc = new RTCPeerConnection(iceServers);
    peerConnections[peerId] = pc;
    
    // Add local stream tracks
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('Received track from', peerId);
        addVideoElement(peerId, event.streams[0], `Peer ${peerId.substring(0, 6)}`);
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendMessage({
                type: 'signal',
                payload: {
                    to: peerId,
                    signal_type: 'candidate',
                    payload: event.candidate.toJSON()
                }
            });
        }
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log('Connection state with', peerId, ':', pc.connectionState);
    };
    
    // Create offer if we're the initiator
    if (createOffer) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        sendMessage({
            type: 'signal',
            payload: {
                to: peerId,
                signal_type: 'offer',
                payload: pc.localDescription.toJSON()
            }
        });
    }
    
    return pc;
}

// Handle signaling messages
async function handleSignal(payload) {
    const { from, signal_type, payload: signalData } = payload;
    
    let pc = peerConnections[from];
    
    // If we don't have a peer connection yet, create one
    if (!pc) {
        pc = await createPeerConnection(from, false);
    }
    
    try {
        if (signal_type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            sendMessage({
                type: 'signal',
                payload: {
                    to: from,
                    signal_type: 'answer',
                    payload: pc.localDescription.toJSON()
                }
            });
        } else if (signal_type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        } else if (signal_type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(signalData));
        }
    } catch (error) {
        console.error('Error handling signal:', error);
    }
}

// Add video element to grid
function addVideoElement(socketId, stream, label, isLocal = false) {
    // Remove existing if any
    removeVideoElement(socketId);
    
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-${socketId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    if (isLocal) {
        video.muted = true;
    }
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'video-label';
    labelDiv.textContent = label;
    
    container.appendChild(video);
    container.appendChild(labelDiv);
    
    document.getElementById('videosGrid').appendChild(container);
}

// Remove video element
function removeVideoElement(socketId) {
    const element = document.getElementById(`video-${socketId}`);
    if (element) {
        element.remove();
    }
}

// Toggle video
function toggleVideo() {
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    const btn = document.getElementById('toggleVideo');
    if (isVideoEnabled) {
        btn.textContent = '🎥 Video On';
        btn.classList.add('active');
    } else {
        btn.textContent = '🎥 Video Off';
        btn.classList.remove('active');
    }
}

// Toggle audio
function toggleAudio() {
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    const btn = document.getElementById('toggleAudio');
    if (isAudioEnabled) {
        btn.textContent = '🎤 Audio On';
        btn.classList.add('active');
    } else {
        btn.textContent = '🔇 Audio Off';
        btn.classList.remove('active');
    }
}

// Leave room
function leaveRoom() {
    sendMessage({
        type: 'leave_room',
        payload: {}
    });
    
    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Clear videos
    document.getElementById('videosGrid').innerHTML = '';
    
    // Show lobby
    document.getElementById('room').classList.add('hidden');
    document.getElementById('lobby').classList.remove('hidden');
    
    currentRoomCode = null;
}

// Copy room code
function copyRoomCode() {
    const code = document.getElementById('currentRoomCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('Room code copied to clipboard!');
    });
}

// Send WebSocket message
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

// Update status
function updateStatus(type, message) {
    const statusEl = document.getElementById('status');
    statusEl.className = `status ${type}`;
    statusEl.textContent = message;
}

// Handle errors
function handleError(payload) {
    console.error('Server error:', payload);
    alert(`Error: ${payload.message}`);
    
    if (payload.code === 'ROOM_NOT_FOUND' || payload.code === 'ROOM_EXPIRED' || payload.code === 'ROOM_CLOSED') {
        leaveRoom();
    }
}

// Initialize on page load
window.addEventListener('load', () => {
    initWebSocket();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (currentRoomCode) {
        leaveRoom();
    }
    if (ws) {
        ws.close();
    }
});
