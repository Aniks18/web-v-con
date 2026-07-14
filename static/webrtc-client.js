// WebRTC Client Logic
let ws = null;
let localStream = null;
let mySocketId = null;
let myDisplayName = 'You';
let currentRoomCode = null;
let peerConnections = {}; // socket_id -> RTCPeerConnection
let participantNames = {}; // socket_id -> display name
let isVideoEnabled = true;
let isAudioEnabled = true;
let isAppVisible = true;
let mediaTrackErrorRecovery = false;

// STUN/TURN configuration. TURN servers come from the backend
// (/api/ice-servers), driven by env vars, so credentials stay out of the
// client and can't silently expire in this file. STUN-only default until the
// fetch completes — enough for same-network peers.
let iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10
};

// Fetch ICE servers (including TURN) from the backend and merge into config.
async function loadIceServers() {
    try {
        const res = await fetch('/api/ice-servers', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && Array.isArray(data.iceServers) && data.iceServers.length) {
            iceServers.iceServers = data.iceServers;
            const hasTurn = data.iceServers.some(s => {
                const u = Array.isArray(s.urls) ? s.urls : [s.urls];
                return u.some(x => typeof x === 'string' && x.startsWith('turn'));
            });
            console.log(`✅ ICE servers loaded from backend (TURN ${hasTurn ? 'present' : 'MISSING — cross-network calls may fail'})`);
        }
    } catch (err) {
        console.warn('⚠️ Could not load ICE servers from backend, using STUN-only:', err);
    }
}

// Initialize WebSocket connection with reconnection logic
let wsReconnectAttempts = 0;
const maxReconnectAttempts = 5;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ WebSocket connected');
            wsReconnectAttempts = 0;
            updateStatus('connected', 'Connected to server');
        };
        
        ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                await handleMessage(message);
            } catch (error) {
                console.error('❌ Error handling message:', error);
            }
        };
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateStatus('error', 'Connection error');
        };
        
        ws.onclose = (event) => {
            console.log('⚠️ WebSocket disconnected, code:', event.code);
            
            // Only show error if not intentional disconnect
            if (event.code !== 1000) {
                updateStatus('error', 'Disconnected from server');
            }
            
            // Attempt reconnection if below max attempts (even if in room to maintain connection)
            if (wsReconnectAttempts < maxReconnectAttempts && event.code !== 1000) {
                wsReconnectAttempts++;
                console.log(`🔄 Attempting to reconnect... (${wsReconnectAttempts}/${maxReconnectAttempts})`);
                setTimeout(() => {
                    initWebSocket();
                    // If we were in a room, try to rejoin
                    if (currentRoomCode && localStream) {
                        console.log('🔄 Reconnecting to room:', currentRoomCode);
                        sendMessage({
                            type: 'join_room',
                            payload: {
                                room_code: currentRoomCode,
                                display_name: myDisplayName
                            }
                        });
                    }
                }, 2000 * wsReconnectAttempts);
            }
        };
    } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        updateStatus('error', 'Failed to connect');
    }
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
        
        case 'chat_message':
            addChatMessage(message.payload, false);
            break;
        
        case 'error':
            handleError(message.payload);
            break;
    }
}

// Create a new room
async function createRoom() {
    const displayName = document.getElementById('displayName').value.trim() || 'Anonymous';
    myDisplayName = displayName;
    
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
    myDisplayName = displayName;
    
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
        
        console.log(`📹 Video tracks: ${videoTracks.length}`);
        videoTracks.forEach((track, i) => {
            console.log(`     Video ${i}: ${track.label}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            
            // Add error handler for track issues (camera taken by another app)
            track.onended = () => {
                console.warn('⚠️ Video track ended unexpectedly');
                handleMediaTrackError('video', track);
            };
            
            track.onmute = () => {
                console.warn('⚠️ Video track muted');
            };
            
            track.onunmute = () => {
                console.log('✅ Video track unmuted');
            };
        });
        
        console.log(`🎤 Audio tracks: ${audioTracks.length}`);
        audioTracks.forEach((track, i) => {
            console.log(`     Audio ${i}: ${track.label}, enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
            
            // Add error handler for track issues
            track.onended = () => {
                console.warn('⚠️ Audio track ended unexpectedly');
                handleMediaTrackError('audio', track);
            };
            
            track.onmute = () => {
                console.warn('⚠️ Audio track muted');
            };
            
            track.onunmute = () => {
                console.log('✅ Audio track unmuted');
            };
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
        
        // Add local video with user's display name
        addVideoElement(mySocketId, localStream, `${myDisplayName} (You)`, true);
        
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
    const roomCodeBadge = document.getElementById('roomCodeBadge');
    if (roomCodeBadge) {
        roomCodeBadge.textContent = payload.room_code;
    }
    
    // Update participants list
    updateParticipantsList();
    
    // Room view is already shown from startLocalStream
    // No peers yet since we're the creator
}

// Handle joined confirmation
async function handleJoined(payload) {
    console.log('Joined room:', payload.room_code);
    currentRoomCode = payload.room_code;
    document.getElementById('currentRoomCode').textContent = payload.room_code;
    const roomCodeBadge = document.getElementById('roomCodeBadge');
    if (roomCodeBadge) {
        roomCodeBadge.textContent = payload.room_code;
    }
    
    // Store participant names and create peer connections for existing peers
    for (const peer of payload.peers) {
        participantNames[peer.socket_id] = peer.display_name || 'Anonymous';
        console.log(`📝 Stored name: ${peer.display_name} for ${peer.socket_id.substring(0,8)}`);
        await createPeerConnection(peer.socket_id, true);
    }
    
    // Update participants list
    updateParticipantsList();
}

// Handle new peer joining
async function handlePeerJoined(payload) {
    console.log('Peer joined:', payload.socket_id, 'Name:', payload.display_name);
    // Store the new peer's display name
    participantNames[payload.socket_id] = payload.display_name || 'Anonymous';
    console.log(`📝 Stored name: ${payload.display_name} for ${payload.socket_id.substring(0,8)}`);
    
    // Update participants list
    updateParticipantsList();
    
    // The new peer will create offers to us, so we wait for their signal
}

// Handle peer leaving
function handlePeerLeft(payload) {
    console.log('Peer left:', payload.socket_id);
    
    if (peerConnections[payload.socket_id]) {
        peerConnections[payload.socket_id].close();
        delete peerConnections[payload.socket_id];
    }
    
    // Clean up participant name
    delete participantNames[payload.socket_id];
    
    removeVideoElement(payload.socket_id);
    
    // Update participants list
    updateParticipantsList();
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
            const peerName = participantNames[peerId] || `Peer ${peerId.substring(0, 6)}`;
            addVideoElement(peerId, stream, peerName);
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
    if (!localStream) return;
    
    isVideoEnabled = !isVideoEnabled;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = isVideoEnabled;
    });
    
    updateVideoButton();
    
    // Update participants list
    if (typeof updateParticipantsList === 'function') {
        updateParticipantsList();
    }
}

// Toggle audio
function toggleAudio() {
    if (!localStream) return;
    
    isAudioEnabled = !isAudioEnabled;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = isAudioEnabled;
    });
    
    updateAudioButton();
    
    // Update participants list
    if (typeof updateParticipantsList === 'function') {
        updateParticipantsList();
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
        try {
            ws.send(JSON.stringify(message));
        } catch (error) {
            console.error('❌ Failed to send message:', error);
        }
    } else {
        console.warn('⚠️ WebSocket not ready, state:', ws ? ws.readyState : 'null');
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
window.addEventListener('load', async () => {
    // Load TURN/STUN config from backend before any peer connection is made.
    await loadIceServers();
    initWebSocket();
    
    // Initialize UI components safely
    setTimeout(() => {
        if (typeof updateParticipantsList === 'function') {
            updateParticipantsList();
        }
        if (typeof populateDeviceSelects === 'function') {
            populateDeviceSelects();
        }
    }, 100);
    
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

// ===== NEW UI FUNCTIONS =====

// Screen Sharing
let isScreenSharing = false;
let screenStream = null;
let originalVideoTrack = null;

async function shareScreen() {
    if (isScreenSharing) {
        stopScreenShare();
        return;
    }
    
    try {
        console.log('🖥️ Starting screen share...');
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: false
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        originalVideoTrack = localStream.getVideoTracks()[0];
        
        // Replace video track in local stream
        localStream.removeTrack(originalVideoTrack);
        localStream.addTrack(screenTrack);
        
        // Replace track in all peer connections
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(screenTrack);
                console.log(`✅ Replaced video track for ${peerId.substring(0,8)}`);
            }
        }
        
        // Update local video element
        const localVideo = document.querySelector(`#video-${mySocketId} video`);
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
        
        isScreenSharing = true;
        const btn = document.getElementById('shareScreen');
        btn.classList.add('active');
        btn.title = 'Stop sharing';
        
        // Handle when user stops sharing via browser button
        screenTrack.onended = () => {
            stopScreenShare();
        };
        
        console.log('✅ Screen sharing started');
    } catch (error) {
        console.error('❌ Screen share failed:', error);
        if (error.name === 'NotAllowedError') {
            alert('Screen sharing permission denied');
        } else {
            alert('Failed to share screen: ' + error.message);
        }
    }
}

function stopScreenShare() {
    if (!isScreenSharing) return;
    
    console.log('🛑 Stopping screen share...');
    
    // Stop screen track
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    
    // Restore original video track
    if (originalVideoTrack && originalVideoTrack.readyState === 'live') {
        const screenTrack = localStream.getVideoTracks()[0];
        localStream.removeTrack(screenTrack);
        localStream.addTrack(originalVideoTrack);
        
        // Replace track in all peer connections
        for (const peerId in peerConnections) {
            const pc = peerConnections[peerId];
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(originalVideoTrack);
            }
        }
        
        // Update local video element
        const localVideo = document.querySelector(`#video-${mySocketId} video`);
        if (localVideo) {
            localVideo.srcObject = localStream;
        }
    }
    
    isScreenSharing = false;
    const btn = document.getElementById('shareScreen');
    btn.classList.remove('active');
    btn.title = 'Share your screen';
    
    console.log('✅ Screen sharing stopped');
}

// Chat Functions
function toggleChat() {
    const chatPanel = document.getElementById('chatPanel');
    chatPanel.classList.toggle('open');
    
    // Clear unread badge when opening
    if (chatPanel.classList.contains('open')) {
        const badge = document.getElementById('chatBadge');
        badge.style.display = 'none';
        badge.textContent = '0';
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    const chatData = {
        sender: myDisplayName,
        message: message,
        timestamp: new Date().toISOString(),
        senderId: mySocketId
    };
    
    // Send via WebSocket
    sendMessage({
        type: 'chat_message',
        payload: chatData
    });
    
    // Add to own chat UI
    addChatMessage(chatData, true);
    
    input.value = '';
}

function addChatMessage(data, isOwn = false) {
    const messagesContainer = document.getElementById('chatMessages');
    
    // Remove empty state if exists
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOwn ? 'own' : 'other'}`;
    
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
        ${!isOwn ? `<div class="chat-sender">${data.sender}</div>` : ''}
        <div class="chat-bubble">${escapeHtml(data.message)}</div>
        <div class="chat-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Show badge if chat is closed and message is from others
    if (!isOwn && !document.getElementById('chatPanel').classList.contains('open')) {
        const badge = document.getElementById('chatBadge');
        const count = parseInt(badge.textContent) || 0;
        badge.textContent = count + 1;
        badge.style.display = 'block';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Participants Functions
function toggleParticipants() {
    const panel = document.getElementById('participantsPanel');
    panel.classList.toggle('open');
}

function updateParticipantsList() {
    const list = document.getElementById('participantsList');
    list.innerHTML = '';
    
    // Add yourself first
    list.appendChild(createParticipantItem(mySocketId, myDisplayName, true));
    
    // Add other participants
    for (const [socketId, name] of Object.entries(participantNames)) {
        list.appendChild(createParticipantItem(socketId, name, false));
    }
    
    // Update participant count
    const count = 1 + Object.keys(participantNames).length;
    document.getElementById('participantCount').textContent = count;
}

function createParticipantItem(socketId, name, isYou) {
    const item = document.createElement('div');
    item.className = 'participant-item';
    item.id = `participant-${socketId}`;
    
    const initial = (name || 'A').charAt(0).toUpperCase();
    
    // Check mic and camera status
    const pc = peerConnections[socketId];
    let hasMic = true;
    let hasCamera = true;
    
    if (socketId === mySocketId) {
        hasMic = isAudioEnabled;
        hasCamera = isVideoEnabled;
    } else if (pc) {
        const receivers = pc.getReceivers();
        hasCamera = receivers.some(r => r.track && r.track.kind === 'video' && r.track.enabled);
        hasMic = receivers.some(r => r.track && r.track.kind === 'audio' && r.track.enabled);
    }
    
    item.innerHTML = `
        <div class="participant-avatar">${initial}</div>
        <div class="participant-info">
            <div class="participant-name">
                ${name || 'Anonymous'}
                ${isYou ? '<span class="you-badge">You</span>' : ''}
            </div>
            <div class="participant-status">
                <span class="status-icon ${hasMic ? 'active' : ''}" title="${hasMic ? 'Mic on' : 'Mic off'}">
                    ${hasMic ? '🎤' : '🔇'}
                </span>
                <span class="status-icon ${hasCamera ? 'active' : ''}" title="${hasCamera ? 'Camera on' : 'Camera off'}">
                    ${hasCamera ? '📹' : '📹̶'}
                </span>
            </div>
        </div>
    `;
    
    return item;
}

// Settings Functions
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    modal.classList.toggle('open');
}

async function populateDeviceSelects() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const cameraSelect = document.getElementById('cameraSelect');
        const micSelect = document.getElementById('microphoneSelect');
        const speakerSelect = document.getElementById('speakerSelect');
        
        cameraSelect.innerHTML = '';
        micSelect.innerHTML = '';
        speakerSelect.innerHTML = '';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `${device.kind} ${devices.filter(d => d.kind === device.kind).indexOf(device) + 1}`;
            
            if (device.kind === 'videoinput') {
                cameraSelect.appendChild(option);
            } else if (device.kind === 'audioinput') {
                micSelect.appendChild(option);
            } else if (device.kind === 'audiooutput') {
                speakerSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Error enumerating devices:', error);
    }
}

async function changeCamera() {
    const deviceId = document.getElementById('cameraSelect').value;
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId } },
            audio: false
        });
        
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStream.getVideoTracks()[0];
        
        localStream.removeTrack(oldTrack);
        localStream.addTrack(newTrack);
        oldTrack.stop();
        
        // Update all peer connections
        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                await sender.replaceTrack(newTrack);
            }
        }
        
        console.log('✅ Camera changed');
    } catch (error) {
        console.error('Failed to change camera:', error);
        alert('Failed to change camera');
    }
}

async function changeMicrophone() {
    const deviceId = document.getElementById('microphoneSelect').value;
    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { deviceId: { exact: deviceId } }
        });
        
        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = localStream.getAudioTracks()[0];
        
        localStream.removeTrack(oldTrack);
        localStream.addTrack(newTrack);
        oldTrack.stop();
        
        // Update all peer connections
        for (const peerId in peerConnections) {
            const sender = peerConnections[peerId].getSenders().find(s => s.track && s.track.kind === 'audio');
            if (sender) {
                await sender.replaceTrack(newTrack);
            }
        }
        
        console.log('✅ Microphone changed');
    } catch (error) {
        console.error('Failed to change microphone:', error);
        alert('Failed to change microphone');
    }
}

function changeSpeaker() {
    // Note: setSinkId is not supported in all browsers
    const deviceId = document.getElementById('speakerSelect').value;
    const videos = document.querySelectorAll('video');
    
    videos.forEach(video => {
        if (typeof video.setSinkId !== 'undefined') {
            video.setSinkId(deviceId).catch(error => {
                console.error('Failed to change speaker:', error);
            });
        }
    });
}

function toggleBackgroundBlur() {
    const checkbox = document.getElementById('blurBackground');
    const videos = document.querySelectorAll('.video-container video');
    
    videos.forEach(video => {
        if (checkbox.checked) {
            video.style.filter = 'blur(0px)'; // Apply to background (requires CSS backdrop-filter)
            video.parentElement.style.backdropFilter = 'blur(10px)';
        } else {
            video.style.filter = 'none';
            video.parentElement.style.backdropFilter = 'none';
        }
    });
}

function saveSettings() {
    const displayName = document.getElementById('displayNameSetting').value.trim();
    if (displayName) {
        myDisplayName = displayName;
        localStorage.setItem('displayName', displayName);
        
        // Update local video label
        const localLabel = document.querySelector(`#video-${mySocketId} .video-label`);
        if (localLabel) {
            localLabel.textContent = `${myDisplayName} (You)`;
        }
        
        // Update participants list
        updateParticipantsList();
    }
    
    toggleSettings();
    alert('Settings saved!');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (currentRoomCode) {
        leaveRoom();
    }
    if (ws) {
        ws.close();
    }
});

// Handle visibility changes - prevent disconnection when app goes to background
document.addEventListener('visibilitychange', () => {
    isAppVisible = !document.hidden;
    
    if (document.hidden) {
        console.log('📱 App went to background');
        // Keep connection alive, just log the state change
        // DO NOT disconnect or leave room
    } else {
        console.log('📱 App came to foreground');
        
        // Check if we need to reconnect WebSocket
        if (ws.readyState !== WebSocket.OPEN && currentRoomCode) {
            console.log('🔄 Reconnecting WebSocket after app return');
            initWebSocket();
        }
        
        // Check media tracks are still working
        if (localStream && currentRoomCode) {
            const videoTrack = localStream.getVideoTracks()[0];
            const audioTrack = localStream.getAudioTracks()[0];
            
            if (videoTrack && videoTrack.readyState === 'ended') {
                console.warn('⚠️ Video track ended while in background, attempting recovery');
                handleMediaTrackError('video', videoTrack);
            }
            
            if (audioTrack && audioTrack.readyState === 'ended') {
                console.warn('⚠️ Audio track ended while in background, attempting recovery');
                handleMediaTrackError('audio', audioTrack);
            }
        }
    }
});

// Handle media track errors (camera taken by another app like Snapchat)
async function handleMediaTrackError(trackType, failedTrack) {
    if (mediaTrackErrorRecovery) {
        console.log('⏳ Already recovering media track');
        return;
    }
    
    mediaTrackErrorRecovery = true;
    console.log(`🔧 Attempting to recover ${trackType} track...`);
    
    try {
        // Get constraints for the specific track type
        const constraints = {};
        if (trackType === 'video') {
            constraints.video = true;
            constraints.audio = false;
        } else {
            constraints.video = false;
            constraints.audio = true;
        }
        
        // Try to get a new track
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        const newTrack = trackType === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
        
        if (newTrack) {
            console.log(`✅ Successfully acquired new ${trackType} track`);
            
            // Replace the old track in local stream
            if (localStream) {
                const oldTracks = trackType === 'video' ? localStream.getVideoTracks() : localStream.getAudioTracks();
                oldTracks.forEach(track => {
                    localStream.removeTrack(track);
                    track.stop();
                });
                localStream.addTrack(newTrack);
                
                // Update local video element
                const localVideo = document.getElementById(`video-${mySocketId}`)?.querySelector('video');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                }
                
                // Add event handlers to new track
                newTrack.onended = () => handleMediaTrackError(trackType, newTrack);
                newTrack.onmute = () => console.warn(`⚠️ ${trackType} track muted`);
                newTrack.onunmute = () => console.log(`✅ ${trackType} track unmuted`);
            }
            
            // Replace track in all peer connections
            for (const [socketId, pc] of Object.entries(peerConnections)) {
                const sender = pc.getSenders().find(s => 
                    s.track && s.track.kind === trackType
                );
                if (sender) {
                    await sender.replaceTrack(newTrack);
                    console.log(`✅ Replaced ${trackType} track for peer ${socketId}`);
                }
            }
            
            // Update UI state
            if (trackType === 'video') {
                isVideoEnabled = true;
                updateVideoButton();
            } else {
                isAudioEnabled = true;
                updateAudioButton();
            }
            
            console.log(`✅ ${trackType} track recovery complete`);
        }
    } catch (error) {
        console.error(`❌ Failed to recover ${trackType} track:`, error);
        
        // Show user-friendly notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(239, 68, 68, 0.95);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            max-width: 90%;
            text-align: center;
        `;
        notification.textContent = `${trackType === 'video' ? '📹' : '🎤'} ${trackType === 'video' ? 'Camera' : 'Microphone'} was taken by another app. Please close that app and toggle ${trackType === 'video' ? 'camera' : 'mic'} off/on.`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transition = 'opacity 0.3s';
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 5000);
    } finally {
        mediaTrackErrorRecovery = false;
    }
}

function updateVideoButton() {
    const videoBtn = document.getElementById('toggleVideo');
    if (!videoBtn) return;
    
    const icon = videoBtn.querySelector('.icon');
    
    if (isVideoEnabled) {
        videoBtn.classList.add('active');
        if (icon) icon.textContent = '📹';
        videoBtn.title = 'Turn off camera';
    } else {
        videoBtn.classList.remove('active');
        if (icon) icon.textContent = '🚫';
        videoBtn.title = 'Turn on camera';
    }
}

function updateAudioButton() {
    const audioBtn = document.getElementById('toggleAudio');
    if (!audioBtn) return;
    
    const icon = audioBtn.querySelector('.icon');
    
    if (isAudioEnabled) {
        audioBtn.classList.add('active');
        if (icon) icon.textContent = '🎤';
        audioBtn.title = 'Mute microphone';
    } else {
        audioBtn.classList.remove('active');
        if (icon) icon.textContent = '🔇';
        audioBtn.title = 'Unmute microphone';
    }
}

