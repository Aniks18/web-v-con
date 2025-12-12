// WebRTC Client Logic
let ws = null;
let localStream = null;
let mySocketId = null;
let currentRoomCode = null;
let peerConnections = {}; // socket_id -> RTCPeerConnection
let isVideoEnabled = true;
let isAudioEnabled = true;

// STUN/TURN configuration with multiple fallback servers
const iceServers = {
    iceServers: [
        // Google STUN servers (for NAT discovery)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Metered STUN
        { urls: 'stun:stun.relay.metered.ca:80' },
        
        // TURN servers for media relay (critical for cross-network connectivity)
        // Metered.ca - Free public TURN service
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        
        // Additional TURN servers for redundancy
        {
            urls: 'turn:a.relay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:a.relay.metered.ca:80?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:a.relay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:a.relay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    // 'all' tries direct connection first, then falls back to TURN relay
    iceTransportPolicy: 'all',
    // Bundle policy for better connectivity
    bundlePolicy: 'max-bundle',
    // RTC configuration for better reliability
    rtcpMuxPolicy: 'require',
    // Increase ICE gathering timeout
    iceCandidatePoolSize: 10
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
            console.log('Sending ICE candidate:', event.candidate.type, 
                       event.candidate.protocol, event.candidate.address);
            sendMessage({
                type: 'signal',
                payload: {
                    to: peerId,
                    signal_type: 'candidate',
                    payload: event.candidate.toJSON()
                }
            });
        } else {
            console.log('All ICE candidates have been sent');
        }
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log(`[${peerId.substring(0,8)}] Connection state:`, pc.connectionState);
        
        const statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'position:fixed;top:70px;right:20px;background:rgba(0,0,0,0.8);color:white;padding:10px;border-radius:8px;font-size:12px;z-index:9999;';
        
        if (pc.connectionState === 'connected') {
            console.log('✅ Successfully connected to peer!');
            statusMsg.textContent = `✅ Connected to ${peerId.substring(0,8)}`;
            statusMsg.style.background = 'rgba(16, 185, 129, 0.9)';
        } else if (pc.connectionState === 'connecting') {
            console.log('🔄 Connecting to peer...');
            statusMsg.textContent = `🔄 Connecting to ${peerId.substring(0,8)}...`;
            statusMsg.style.background = 'rgba(251, 191, 36, 0.9)';
        } else if (pc.connectionState === 'failed') {
            console.error('❌ Connection failed - This may indicate TURN server issues or network problems');
            statusMsg.textContent = `❌ Connection failed to ${peerId.substring(0,8)}`;
            statusMsg.style.background = 'rgba(239, 68, 68, 0.9)';
        } else if (pc.connectionState === 'disconnected') {
            console.warn('⚠️ Connection disconnected - May reconnect automatically');
            statusMsg.textContent = `⚠️ Disconnected from ${peerId.substring(0,8)}`;
            statusMsg.style.background = 'rgba(234, 179, 8, 0.9)';
        }
        
        document.body.appendChild(statusMsg);
        setTimeout(() => statusMsg.remove(), 3000);
    };
    
    // Monitor ICE connection state for detailed diagnostics
    pc.oniceconnectionstatechange = () => {
        console.log(`[${peerId.substring(0,8)}] ICE connection state:`, pc.iceConnectionState);
        
        if (pc.iceConnectionState === 'checking') {
            console.log('🔍 Checking ICE candidates...');
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            console.log('✅ ICE connection established');
            
            // Log which type of connection is being used
            pc.getStats().then(stats => {
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        console.log('📡 Active connection type:', report.currentRoundTripTime);
                    }
                    if (report.type === 'local-candidate' && report.candidateType) {
                        console.log('🔌 Local candidate type:', report.candidateType, 
                                  report.protocol, report.relayProtocol || 'direct');
                    }
                    if (report.type === 'remote-candidate' && report.candidateType) {
                        console.log('🌐 Remote candidate type:', report.candidateType,
                                  report.protocol);
                    }
                });
            });
        } else if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE connection failed');
            console.error('Possible causes:');
            console.error('  1. TURN server unavailable or credentials expired');
            console.error('  2. Firewall blocking all connection attempts');
            console.error('  3. Network policies preventing WebRTC');
        }
    };
    
    // Log ICE gathering state for debugging
    pc.onicegatheringstatechange = () => {
        console.log(`[${peerId.substring(0,8)}] ICE gathering state:`, pc.iceGatheringState);
        if (pc.iceGatheringState === 'complete') {
            console.log('✅ Finished gathering ICE candidates');
        }
    };
    
    // Create offer if we're the initiator
    if (createOffer) {
        try {
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            
            console.log('📤 Sending offer to', peerId.substring(0,8));
            sendMessage({
                type: 'signal',
                payload: {
                    to: peerId,
                    signal_type: 'offer',
                    payload: pc.localDescription.toJSON()
                }
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
    
    return pc;
}

// Handle signaling messages
async function handleSignal(payload) {
    const { from, signal_type, payload: signalData } = payload;
    
    console.log(`📨 Received ${signal_type} from ${from.substring(0,8)}`);
    
    let pc = peerConnections[from];
    
    // If we don't have a peer connection yet, create one
    if (!pc) {
        console.log('Creating new peer connection for incoming signal');
        pc = await createPeerConnection(from, false);
    }
    
    try {
        if (signal_type === 'offer') {
            console.log('📥 Processing offer...');
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
            
            const answer = await pc.createAnswer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(answer);
            
            console.log('📤 Sending answer to', from.substring(0,8));
            sendMessage({
                type: 'signal',
                payload: {
                    to: from,
                    signal_type: 'answer',
                    payload: pc.localDescription.toJSON()
                }
            });
        } else if (signal_type === 'answer') {
            console.log('📥 Processing answer...');
            await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        } else if (signal_type === 'candidate') {
            if (pc.remoteDescription) {
                console.log('➕ Adding ICE candidate');
                await pc.addIceCandidate(new RTCIceCandidate(signalData));
            } else {
                console.log('⏳ Queuing ICE candidate (remote description not set yet)');
                // Queue the candidate to be added later
                if (!pc.pendingCandidates) {
                    pc.pendingCandidates = [];
                }
                pc.pendingCandidates.push(signalData);
            }
        }
        
        // Process any queued candidates after setting remote description
        if (pc.remoteDescription && pc.pendingCandidates && pc.pendingCandidates.length > 0) {
            console.log(`Processing ${pc.pendingCandidates.length} queued candidates`);
            for (const candidate of pc.pendingCandidates) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
            pc.pendingCandidates = [];
        }
    } catch (error) {
        console.error('Error handling signal:', error);
        console.error('Signal type:', signal_type);
        console.error('Error details:', error.message);
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
