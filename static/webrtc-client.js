// WebRTC Client Logic
let ws = null;
let localStream = null;
let mySocketId = null;
let currentRoomCode = null;
let peerConnections = {}; // socket_id -> RTCPeerConnection
let isVideoEnabled = true;
let isAudioEnabled = true;

// STUN/TURN configuration - optimized for cross-network connectivity
const iceServers = {
    iceServers: [
        // Multiple STUN servers for NAT discovery
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        
        // Metered.ca free TURN servers (most reliable free option)
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
        {
            urls: 'turns:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        
        // numb.viagenie.ca backup
        {
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        },
        
        // Backup relay servers
        {
            urls: 'turn:relay1.expressturn.com:3478',
            username: 'efB64MYB1VR6H04CKB',
            credential: 'pqPT8QYNjbeM1n3E'
        },
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
    // Switch to 'all' to try direct connection first, then fallback to TURN
    // This gives better performance when possible
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
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
        console.log('🎥 Requesting camera and microphone access...');
        
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        console.log('✅ Media stream acquired successfully');
        console.log(`   Stream id: ${localStream.id}`);
        console.log(`   Stream active: ${localStream.active}`);
        console.log(`   Total tracks: ${localStream.getTracks().length}`);
        
        // Verify tracks
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        
        console.log(`   Video tracks: ${videoTracks.length}`);
        videoTracks.forEach((track, i) => {
            console.log(`     Video ${i}: ${track.label}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        });
        
        console.log(`   Audio tracks: ${audioTracks.length}`);
        audioTracks.forEach((track, i) => {
            console.log(`     Audio ${i}: ${track.label}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        });
        
        // Verify we have active tracks
        if (videoTracks.length === 0 || audioTracks.length === 0) {
            throw new Error(`Missing tracks - video: ${videoTracks.length}, audio: ${audioTracks.length}`);
        }
        
        // Verify tracks are live
        const allTracksLive = localStream.getTracks().every(track => track.readyState === 'live');
        if (!allTracksLive) {
            throw new Error('Some tracks are not in live state');
        }
        
        console.log('✅ All tracks verified and ready');
        
        // Show room view
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('room').classList.remove('hidden');
        
        // Add local video
        addVideoElement(mySocketId, localStream, 'You (Local)', true);
        
    } catch (error) {
        console.error('❌ Error accessing media devices:', error);
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        alert(`Could not access camera/microphone: ${error.message}\n\nPlease grant permissions and try again.`);
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
    console.log(`\n🔧 Creating peer connection with ${peerId.substring(0,8)}, initiating offer: ${createOffer}`);
    
    const pc = new RTCPeerConnection(iceServers);
    peerConnections[peerId] = pc;
    
    // CRITICAL: Add local stream tracks FIRST before creating offer
    if (localStream && localStream.getTracks().length > 0) {
        console.log('📤 Adding local tracks to peer connection...');
        console.log(`   Local stream has ${localStream.getTracks().length} tracks`);
        
        localStream.getTracks().forEach(track => {
            console.log(`   Track ${track.kind}: id=${track.id}, enabled=${track.enabled}, readyState=${track.readyState}, muted=${track.muted}`);
            
            if (track.readyState === 'ended') {
                console.error(`❌ Track ${track.kind} is ended! Cannot add to peer connection.`);
                return;
            }
            
            const sender = pc.addTrack(track, localStream);
            console.log(`   ✅ Added ${track.kind} track to peer connection`);
        });
        
        // Verify senders
        const senders = pc.getSenders();
        console.log(`✅ Peer connection has ${senders.length} senders`);
        senders.forEach((sender, i) => {
            if (sender.track) {
                console.log(`   Sender ${i}: ${sender.track.kind}`);
            }
        });
    } else {
        console.error('❌ No local stream available or no tracks in stream!');
        if (localStream) {
            console.error(`   Stream exists but has ${localStream.getTracks().length} tracks`);
        }
        alert('ERROR: Your camera/microphone is not working. Please check permissions and refresh.');
        throw new Error('No local stream available');
    }
    
    // CRITICAL: Add transceivers to ensure media is negotiated even if tracks haven't been added yet
    // This ensures that the peer connection is ready to receive audio and video
    const transceivers = pc.getTransceivers();
    if (transceivers.length === 0 || !transceivers.some(t => t.receiver.track.kind === 'audio')) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        console.log('➕ Added audio transceiver');
    }
    if (transceivers.length === 0 || !transceivers.some(t => t.receiver.track.kind === 'video')) {
        pc.addTransceiver('video', { direction: 'sendrecv' });
        console.log('➕ Added video transceiver');
    }
    
    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('\n🎬 RECEIVED TRACK EVENT from', peerId.substring(0,8));
        console.log('   Track kind:', event.track.kind);
        console.log('   Track id:', event.track.id);
        console.log('   Track label:', event.track.label);
        console.log('   Track enabled:', event.track.enabled);
        console.log('   Track muted:', event.track.muted);
        console.log('   Track readyState:', event.track.readyState);
        console.log('   Streams in event:', event.streams.length);
        
        if (event.track.readyState === 'ended') {
            console.error('❌ Received track is already ended!');
            return;
        }
        
        if (event.streams && event.streams[0]) {
            const stream = event.streams[0];
            console.log('✅ Stream received:', stream.id);
            console.log('   Stream active:', stream.active);
            console.log('   Stream tracks:', stream.getTracks().length);
            console.log('   Video tracks:', stream.getVideoTracks().length);
            console.log('   Audio tracks:', stream.getAudioTracks().length);
            
            // Log each track in stream
            stream.getTracks().forEach((track, idx) => {
                console.log(`   Track ${idx}: ${track.kind}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            });
            
            // Remove and re-add video element to ensure clean state
            removeVideoElement(peerId);
            
            // Add video immediately (no delay)
            console.log('📺 Creating video element now...');
            addVideoElement(peerId, stream, `Peer ${peerId.substring(0, 6)}`);
            console.log('✅ Video element creation completed\n');
        } else {
            console.error('❌ No stream in track event!');
            console.error('   This should never happen - track must be associated with a stream');
        }
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
            console.log('🌐 Trying direct connection first, will use TURN if needed');
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            console.log('✅ ICE connection established');
            
            // CRITICAL: Verify we're using TURN relay
            pc.getStats().then(stats => {
                let connectionType = 'unknown';
                let usingRelay = false;
                
                stats.forEach(report => {
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        console.log('📡 Active connection:', {
                            rtt: report.currentRoundTripTime,
                            bytesSent: report.bytesSent,
                            bytesReceived: report.bytesReceived
                        });
                    }
                    if (report.type === 'local-candidate' && report.candidateType) {
                        connectionType = report.candidateType;
                        if (report.candidateType === 'relay') {
                            usingRelay = true;
                        }
                        console.log('🔌 Local candidate:', report.candidateType, 
                                  report.protocol, report.relayProtocol || 'direct',
                                  report.address || '');
                    }
                    if (report.type === 'remote-candidate' && report.candidateType) {
                        console.log('🌐 Remote candidate:', report.candidateType,
                                  report.protocol, report.address || '');
                    }
                });
                
                // Show visual confirmation
                const banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);background:rgba(16,185,129,0.95);color:white;padding:12px 24px;border-radius:12px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
                if (usingRelay) {
                    banner.textContent = `✅ Connected via TURN Relay (cross-network)`;
                    console.log('%c✅ TURN RELAY ACTIVE - Cross-network connection successful!', 'color: green; font-weight: bold; font-size: 16px');
                } else {
                    banner.textContent = `✅ Connected directly (${connectionType})`;
                    banner.style.background = 'rgba(59,130,246,0.95)';
                    console.log(`%c✅ DIRECT CONNECTION - Using ${connectionType}`, 'color: blue; font-weight: bold; font-size: 16px');
                }
                document.body.appendChild(banner);
                setTimeout(() => banner.remove(), 5000);
            });
        } else if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE connection failed - Attempting restart...');
            console.error('This usually means:');
            console.error('  1. All TURN servers are down or blocked');
            console.error('  2. Firewall is blocking WebRTC completely');
            console.error('  3. TURN credentials expired');
            
            // Try ICE restart
            if (pc.restartIce) {
                console.log('🔄 Triggering ICE restart...');
                pc.restartIce();
            }
        } else if (pc.iceConnectionState === 'disconnected') {
            console.warn('⚠️ ICE disconnected - waiting for reconnection...');
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
    console.log(`📺 Adding video element for ${socketId.substring(0,8)}, local=${isLocal}`);
    console.log(`   Stream id: ${stream.id}`);
    console.log(`   Stream active: ${stream.active}`);
    console.log(`   Stream tracks: ${stream.getTracks().length}`);
    
    stream.getTracks().forEach(track => {
        console.log(`   - ${track.kind}: id=${track.id}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
    });
    
    // Verify stream has active tracks
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    if (videoTracks.length === 0 && !isLocal) {
        console.error(`❌ No video tracks in stream for ${socketId.substring(0,8)}!`);
        alert(`ERROR: Remote peer's video is not being sent. Ask them to check their camera permissions.`);
    }
    
    // Remove existing if any
    removeVideoElement(socketId);
    
    const container = document.createElement('div');
    container.className = 'video-container';
    container.id = `video-${socketId}`;
    
    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal;
    
    // CRITICAL: Add aggressive play attempts
    let playAttempts = 0;
    const maxAttempts = 5;
    
    const attemptPlay = () => {
        playAttempts++;
        console.log(`▶️ Attempting to play video for ${socketId.substring(0,8)} (attempt ${playAttempts}/${maxAttempts})`);
        
        video.play()
            .then(() => {
                console.log(`✅ Video playing successfully for ${socketId.substring(0,8)}`);
            })
            .catch(e => {
                console.error(`❌ Play attempt ${playAttempts} failed:`, e.message);
                if (playAttempts < maxAttempts) {
                    setTimeout(attemptPlay, 500);
                } else {
                    console.error(`❌ Failed to play video after ${maxAttempts} attempts`);
                }
            });
    };
    
    // Add event listeners to debug video playback
    video.onloadedmetadata = () => {
        console.log(`✅ Video metadata loaded for ${socketId.substring(0,8)}`);
        console.log(`   Dimensions: ${video.videoWidth}x${video.videoHeight}`);
        console.log(`   Duration: ${video.duration}`);
        console.log(`   Ready state: ${video.readyState}`);
        attemptPlay();
    };
    
    video.onplay = () => {
        console.log(`▶️ Video playing for ${socketId.substring(0,8)}`);
    };
    
    video.onerror = (e) => {
        console.error(`❌ Video error for ${socketId.substring(0,8)}:`, e);
    };
    
    // Monitor stream active state
    stream.getTracks().forEach(track => {
        console.log(`   Track ${track.kind}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        
        track.onended = () => {
            console.log(`⚠️ Track ${track.kind} ended for ${socketId.substring(0,8)}`);
        };
        
        track.onmute = () => {
            console.log(`🔇 Track ${track.kind} muted for ${socketId.substring(0,8)}`);
        };
        
        track.onunmute = () => {
            console.log(`🔊 Track ${track.kind} unmuted for ${socketId.substring(0,8)}`);
        };
    });
    
    const labelDiv = document.createElement('div');
    labelDiv.className = 'video-label';
    labelDiv.textContent = label;
    
    container.appendChild(video);
    container.appendChild(labelDiv);
    
    document.getElementById('videosGrid').appendChild(container);
    
    console.log(`✅ Video element added to DOM for ${socketId.substring(0,8)}`);
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
    
    // Add diagnostic button (only visible in console)
    window.diagnoseConnection = () => {
        console.log('\n=== WEBRTC DIAGNOSTICS ===\n');
        console.log('Local Stream:', localStream);
        if (localStream) {
            console.log('  Video tracks:', localStream.getVideoTracks().length);
            console.log('  Audio tracks:', localStream.getAudioTracks().length);
            localStream.getTracks().forEach(track => {
                console.log(`  ${track.kind}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            });
        }
        
        console.log('\nPeer Connections:', Object.keys(peerConnections).length);
        Object.keys(peerConnections).forEach(peerId => {
            const pc = peerConnections[peerId];
            console.log(`\nPeer ${peerId.substring(0,8)}:`);
            console.log('  Connection state:', pc.connectionState);
            console.log('  ICE state:', pc.iceConnectionState);
            console.log('  Signaling state:', pc.signalingState);
            console.log('  Senders:', pc.getSenders().length);
            console.log('  Receivers:', pc.getReceivers().length);
            
            pc.getSenders().forEach((sender, i) => {
                if (sender.track) {
                    console.log(`  Sender ${i}: ${sender.track.kind}, enabled=${sender.track.enabled}`);
                }
            });
            
            pc.getReceivers().forEach((receiver, i) => {
                if (receiver.track) {
                    console.log(`  Receiver ${i}: ${receiver.track.kind}, enabled=${receiver.track.enabled}, muted=${receiver.track.muted}, readyState=${receiver.track.readyState}`);
                }
            });
            
            // Check stats
            pc.getStats().then(stats => {
                let hasRelay = false;
                stats.forEach(report => {
                    if (report.type === 'local-candidate' && report.candidateType === 'relay') {
                        hasRelay = true;
                    }
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        console.log('  Active pair:', {
                            local: report.localCandidateId,
                            remote: report.remoteCandidateId,
                            bytesSent: report.bytesSent,
                            bytesReceived: report.bytesReceived
                        });
                    }
                });
                console.log('  Using TURN relay:', hasRelay);
            });
        });
        
        console.log('\n=== END DIAGNOSTICS ===\n');
        console.log('Run diagnoseConnection() again to refresh\n');
    };
    
    console.log('%cDiagnostics available!', 'color: green; font-weight: bold; font-size: 16px');
    console.log('%cType: diagnoseConnection()', 'color: blue; font-size: 14px');
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
