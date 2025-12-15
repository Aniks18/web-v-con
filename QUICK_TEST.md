# 🧪 Quick Test Guide for Cross-Network Video

## Changes Made

1. **✅ Removed fake Twilio credentials** - were causing failures
2. **✅ Switched from 'relay' to 'all' mode** - tries direct first, TURN as fallback
3. **✅ Added explicit transceivers** - ensures audio/video negotiation
4. **✅ Using reliable free TURN servers** (Metered.ca + backups)

## Deploy Now

```powershell
git add .
git commit -m "Fix TURN configuration and add transceivers"
git push origin main
```

Wait ~2 minutes for Render to deploy.

## Test Steps (BOTH USERS)

### 1. Open Browser Console
- **Chrome/Edge:** Press `F12`
- **Firefox:** Press `F12`

### 2. One Person Creates Room
Go to https://web-v-con.onrender.com/

### 3. Other Person Joins

###  4. What To Look For in Console

#### ✅ GOOD SIGNS:
```
✅ Media stream acquired successfully
   Video tracks: 1
   Audio tracks: 1
📤 Adding local tracks to peer connection...
✅ Peer connection has 2 senders
➕ Added audio transceiver
➕ Added video transceiver
🔍 Checking ICE candidates...
✅ ICE connection established
✅ Connected via TURN Relay (cross-network)
   OR
✅ Connected directly (host/srflx)
🎬 RECEIVED TRACK EVENT
   Track kind: video
   Track readyState: live
✅ Video playing successfully
```

#### ❌ BAD SIGNS:
```
❌ No local stream available
❌ No video tracks in stream
❌ ICE connection failed
❌ Connection failed
```

### 5. Visual Confirmation

You should see:
- **Green banner** at top: "✅ Connected via TURN Relay" (different networks)
  OR
- **Blue banner**: "✅ Connected directly" (same network)
- **Both video feeds** showing properly

## If Still Not Working

### Check #1: Is ICE connecting?
Look for: `✅ ICE connection established`

- **If NO** → TURN servers might be blocked by firewall
- **If YES but no video** → Track sending/receiving issue

### Check #2: Are tracks being received?
Look for: `🎬 RECEIVED TRACK EVENT`

- **If NO** → Remote peer's tracks aren't being sent
- **If YES but black screen** → Video rendering issue

### Check #3: Connection type
Look for the banner message:

- **"Connected via TURN Relay"** = Cross-network working ✅
- **"Connected directly"** = Same network or good NAT  ✅  
- **No banner** = Connection failed ❌

## Run Diagnostic

Type in console:
```javascript
diagnoseConnection()
```

Share the output if still having issues.

## Most Common Issue

**Problem:** Free TURN servers are overloaded/blocked

**Quick Fix:** Try at different time or from different network (mobile hotspot)

**Permanent Fix:** Use paid TURN service:
- Twilio TURN ($0.40/GB)
- Xirsys (pay-as-you-go)
- Self-hosted Coturn

## Expected Behavior

| Scenario | Connection Type | Should Work? |
|----------|----------------|--------------|
| Same WiFi | Direct (host) | ✅ Always |
| Same building, different WiFi | Direct (srflx) | ✅ Usually |
| Different cities/ISPs | TURN Relay | ✅ If TURN working |
| Corporate/School network | TURN Relay | ⚠️ May be blocked |

---

**Last Updated:** December 15, 2025
