# 🔍 WebRTC Cross-Network Debugging Guide

## The Problem You're Experiencing

**Working:** Same WiFi (same local network) ✅
**Not Working:** Different WiFi (different networks/ISPs) ❌

## Why This Happens

### What's Working vs Not Working:

| Component | Same WiFi | Different Networks |
|-----------|-----------|-------------------|
| WebSocket Signaling | ✅ Working | ✅ Working |
| Peer Discovery | ✅ Working | ✅ Working |
| ICE Connection | ✅ Direct P2P | ❌ **Needs TURN** |
| Video/Audio Tracks | ✅ Flowing | ❌ **Not Flowing** |

### Root Cause

When users are on different networks:
1. Their routers use **NAT (Network Address Translation)**
2. Direct peer-to-peer connection is **blocked by firewalls**
3. You need a **TURN relay server** to forward media between them
4. Free TURN servers are often **unreliable or overloaded**

## Current Configuration

Your app is now set to **force TURN relay mode** with these servers:

### TURN Servers in Use:
1. **Twilio TURN** (most reliable, production-grade)
2. **numb.viagenie.ca** (popular free server)
3. **openrelay.metered.ca** (free tier)

## How to Test & Diagnose

### Step 1: Deploy Your Changes
```bash
git add .
git commit -m "Enhanced WebRTC diagnostics and track verification"
git push origin main
```

### Step 2: Open Browser Console (BOTH USERS)

**On Chrome/Edge:** Press `F12` or `Ctrl+Shift+I`
**On Firefox:** Press `F12`

### Step 3: Look for These Critical Logs

#### ✅ **Success Indicators:**

1. **Media Stream Acquired:**
   ```
   ✅ Media stream acquired successfully
   Stream active: true
   Video tracks: 1
   Audio tracks: 1
   All tracks verified and ready
   ```

2. **Tracks Added to Peer Connection:**
   ```
   📤 Adding local tracks to peer connection...
   Local stream has 2 tracks
   ✅ Peer connection has 2 senders
   ```

3. **TURN Relay Active:**
   ```
   ✅ Using TURN Relay - Cross-network connectivity working!
   🔌 Local candidate: relay
   ```

4. **Remote Track Received:**
   ```
   🎬 RECEIVED TRACK EVENT
   Track kind: video
   Track readyState: live
   ✅ Stream received
   ```

5. **Video Playing:**
   ```
   ✅ Video metadata loaded
   ▶️ Attempting to play video
   ✅ Video playing successfully
   ```

#### ❌ **Failure Indicators:**

1. **No Local Stream:**
   ```
   ❌ No local stream available or no tracks in stream!
   ```
   **Fix:** Grant camera/microphone permissions and refresh

2. **No TURN Relay:**
   ```
   ⚠️ Not using TURN - Connection type: host
   ```
   **Problem:** TURN servers are not being used (blocked or failed)

3. **No Remote Tracks:**
   ```
   ❌ No video tracks in stream!
   ```
   **Problem:** Remote peer's camera is not sending video

4. **ICE Connection Failed:**
   ```
   ❌ ICE connection failed
   This usually means:
     1. All TURN servers are down or blocked
     2. Firewall is blocking WebRTC completely
     3. TURN credentials expired
   ```

### Step 4: Run Diagnostic Tool

In the browser console, type:
```javascript
diagnoseConnection()
```

This will show:
- Local stream status
- All peer connections
- Sender/receiver status
- Whether TURN relay is active
- Bytes sent/received

## Common Issues & Solutions

### Issue 1: "Black screen for remote peer"

**Symptoms:** You see your video, peer joins, but their video is black

**Causes:**
1. Remote peer's camera not working
2. Tracks not being sent from remote peer
3. Video element not rendering received stream

**Debug Steps:**
1. Check remote peer's console for "✅ All tracks verified"
2. Check your console for "🎬 RECEIVED TRACK EVENT"
3. Check for "▶️ Video playing successfully"

**Ask remote peer to:**
- Grant camera permissions
- Check if their local video shows
- Share their console logs

### Issue 2: "Connection stuck on 'checking'"

**Symptoms:** ICE state stays on "checking", never reaches "connected"

**Cause:** TURN servers are not working or blocked

**Solutions:**
1. Check firewall settings
2. Try different network (mobile hotspot)
3. Verify TURN credentials haven't expired

### Issue 3: "No video tracks in stream"

**Symptoms:** Console shows "❌ No video tracks in stream"

**Cause:** Remote peer's camera is not capturing video

**Solution:**
1. Remote peer should refresh and allow camera access
2. Check if camera is being used by another app
3. Try different browser (Chrome recommended)

## Network Requirements

For cross-network WebRTC to work:

### Ports That Must Be Open:
- **TCP 443** (HTTPS and TURN over TCP)
- **UDP 3478** (TURN)
- **UDP 49152-65535** (RTP media)

### If Corporate/School Network:
- Might have strict firewall rules
- WebRTC might be completely blocked
- Try using mobile hotspot to test

## What Happens During Connection

```
User A (You)                           User B (Remote)
    |                                       |
    | 1. Get camera/mic                     | 1. Get camera/mic
    | ✅ Local tracks ready                 | ✅ Local tracks ready
    |                                       |
    | 2. WebSocket signaling ←─────────────→| 2. WebSocket signaling
    | ✅ Peers discovered                   | ✅ Peers discovered
    |                                       |
    | 3. Add tracks to peer connection      | 3. Add tracks to peer connection
    | ✅ Senders created                    | ✅ Senders created
    |                                       |
    | 4. SDP offer/answer ←────────────────→| 4. SDP offer/answer
    | ✅ Media capabilities negotiated      | ✅ Media capabilities negotiated
    |                                       |
    | 5. ICE candidates (via TURN)          | 5. ICE candidates (via TURN)
    | ✅ Using relay connection             | ✅ Using relay connection
    |                                       |
    | 6. Media flows through TURN ←────────→| 6. Media flows through TURN
    | ✅ Video/audio received               | ✅ Video/audio received
    |                                       |
    | 7. Video element renders              | 7. Video element renders
    | ✅ See remote video                   | ✅ See remote video
```

## Expected Console Output (Success Case)

### When Creating/Joining Room:
```
🎥 Requesting camera and microphone access...
✅ Media stream acquired successfully
   Stream active: true
   Video tracks: 1
   Audio tracks: 1
✅ All tracks verified and ready
📺 Adding video element for local
```

### When Peer Joins:
```
🔧 Creating peer connection with peer_id, initiating offer: true
📤 Adding local tracks to peer connection...
   Local stream has 2 tracks
   ✅ Added video track to peer connection
   ✅ Added audio track to peer connection
✅ Peer connection has 2 senders
```

### When Connection Establishes:
```
🔍 Checking ICE candidates...
⚠️ TURN RELAY IS FORCED - This ensures cross-network connectivity
✅ ICE connection established
🔌 Local candidate: relay tcp 443
✅ Using TURN Relay - Cross-network connectivity working!
```

### When Receiving Remote Video:
```
🎬 RECEIVED TRACK EVENT from peer_id
   Track kind: video
   Track readyState: live
✅ Stream received
📺 Creating video element now...
✅ Video metadata loaded
   Dimensions: 1280x720
▶️ Attempting to play video (attempt 1/5)
✅ Video playing successfully
```

## If Still Not Working

### Option 1: Switch to Paid TURN Service

Free TURN servers are unreliable. Consider:
- **Twilio TURN** ($0.40 per GB after free tier)
- **Xirsys** (pay-as-you-go)
- **Self-hosted Coturn** (requires VPS)

### Option 2: Temporarily Switch Back to 'all' Mode

In `webrtc-client.js`, change:
```javascript
iceTransportPolicy: 'relay',  // Current: forces TURN
```
to:
```javascript
iceTransportPolicy: 'all',    // Try direct first, fallback to TURN
```

This allows direct P2P when possible, falling back to TURN only when needed.

### Option 3: Test with Mobile Hotspot

If one user connects via mobile hotspot:
- Different network topology
- Might have better NAT traversal
- Can help identify if it's ISP-specific issue

## Contact for Help

When asking for help, provide:
1. **Full console logs from BOTH users**
2. **Screenshot of diagnostic output** (run `diagnoseConnection()`)
3. **Network type** (home WiFi, corporate, mobile, etc.)
4. **Browser and version** (Chrome 120, Firefox 121, etc.)
5. **Any error messages** shown to users

---

**Updated:** December 2025
**Current Status:** Using forced TURN relay mode with enhanced diagnostics
