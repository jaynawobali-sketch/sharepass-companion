# Audio Room Session Analysis - SharePass

## Current Implementation Overview

Your application has a **WhatsApp-style group audio session** system called "Circle Voice Room" with the following structure:

### Architecture

```
SharePass Circles (Groups)
    ↓
    ├── Voice Session (Active/Inactive)
    ├── Speakers Array (who's on the floor)
    ├── Request Queue (hands raised to speak)
    └── Voice Room (WebRTC peer-to-peer connections)
          ├── Participants (connected members)
          ├── Signals (WebRTC offer/answer/ice candidates)
          └── Audio Streams (real-time audio)
```

---

## Key Components

### 1. **Voice Session Management**
**File:** [pages/api/circles.js](pages/api/circles.js)

- **Start/End Audio Room**: Moderators only
- **Speakers Management**: Manually controlled list of who can speak
- **Request Queue**: Tracks people raising hands to speak
- **Auto-clears speakers** when ending the session

```javascript
// When moderator starts floor:
voiceSession.active = true
speakers = currentCircle.speakers (preserved)

// When moderator ends floor:
speakers = [] (cleared)
voiceSession.active = false
```

### 2. **Voice Room & Real-time Audio**
**File:** [pages/api/circle-voice.js](pages/api/circle-voice.js)

The voice room handles:
- **Join/Leave** - Participants join audio stream
- **Heartbeat** - Keep-alive signals every 5 seconds
- **Mute State** - Track who is muted
- **WebRTC Signals** - Offer/Answer/ICE candidates for peer connections
- **Signal Acknowledgment** - Track processed signals

**Supported Actions:**
- `join` - Add participant to audio room
- `leave` - Remove participant
- `heartbeat` - Keep participant active (timeout after 20s)
- `set-muted` - Control mute state
- `signal` - Exchange WebRTC negotiation data
- `ack-signals` - Acknowledge received signals

### 3. **Frontend Audio Component**
**File:** [components/SharePass.js](components/SharePass.js) - `CircleVoicePanel` function (lines 977+)

#### Audio Features:
- ✅ **WebRTC Peer-to-Peer** - Direct audio between participants
- ✅ **Audio Level Visualization** - Real-time frequency analysis
- ✅ **Mute Control** - Local and sync mute state across room
- ✅ **Participant Roster** - See who's connected and speaking
- ✅ **Featured Speaker** - Highlights who is currently speaking
- ✅ **Echo Cancellation** - Built-in audio processing
- ✅ **Autoplay Fallback** - Handles browser autoplay restrictions

#### Participant Types:
```javascript
- Moderators (role: "moderator") - Can manage floor
- Speakers (onFloor: true) - Currently have speaking rights
- Listeners (onFloor: false) - Listening only
```

---

## Data Flow

### Joining Audio Room

```
User Click "Join Audio"
    ↓
Check: User is circle member & audio active
    ↓
Request Microphone Permission
    ↓
Create Local Audio Stream
    ↓
POST /api/circle-voice with action:"join"
    ↓
Server adds to voice room participants
    ↓
Client polls other participants
    ↓
WebRTC P2P connections establish
    ↓
Audio streams flowing ✨
```

### Peer Connection Establishment

```
Participant A (lower userId) initiates:
  A: Creates RTCPeerConnection
  A: Creates Offer → sends to B
  B: Creates RTCPeerConnection
  B: Receives Offer → Creates Answer → sends to A
  A: Receives Answer
  Both exchange ICE candidates
  Audio flows bidirectionally
```

---

## Current Limitations

### 1. **Mesh Network (not Hub-and-Spoke)**
- Every participant connects to EVERY other participant
- Works well for 2-3 people
- **Problems at scale:**
  - N participants = N×(N-1)/2 peer connections
  - 10 people = 45 connections!
  - High CPU and bandwidth usage
  - Poor quality as numbers grow

### 2. **Manual Speaker Management**
- Speakers list is manually controlled
- Must be invited by moderator
- No automatic speaker queue optimization
- No automatic silence detection

### 3. **No Centralized Recording**
- Audio is peer-to-peer only
- No server-side recording capability
- No backup of important discussions

### 4. **Audio Quality Issues at Scale**
- Browser WebRTC single-peer debug mode active (line 1925)
- Comment: "WEBRTC_SINGLE_PEER_DEBUG = true"
- Currently limits to 1 peer in debug mode!

```javascript
const WEBRTC_SINGLE_PEER_DEBUG = true;  // ⚠️ Only connects to 1 person!
const remoteMemberIds = WEBRTC_SINGLE_PEER_DEBUG 
  ? allRemoteMemberIds.slice(0, 1)  // Only take first peer
  : allRemoteMemberIds;
```

---

## Visual Status Indicators

### Room Display Shows:
- 🎙️ **Floor Timer** - How long session has been active
- 📊 **Connected Count** - Number of participants
- 🔊 **Live Mics** - Count of unmuted participants
- 🌊 **Room Motion** - Visual activity indicator (frequency bars)
- 👤 **Featured Participant** - Who's speaking loudest
- 🎚️ **Per-Person Audio Levels** - Individual mute states

---

## Issues to Address

### ⚠️ Critical Issues:

1. **Single Peer Debug Mode is Active**
   - Only connects to 1 remote participant
   - Need to set `WEBRTC_SINGLE_PEER_DEBUG = false` for multi-person conversations
   - **Location:** [components/SharePass.js](components/SharePass.js#L1925)

2. **Scalability**
   - Mesh topology doesn't scale beyond 3-4 people comfortably
   - Consider SFU (Selective Forwarding Unit) for larger groups

3. **Manual Speaker Management**
   - Not ideal for organic group conversations
   - No queue fairness or timeout

---

## Next Steps to Improve

### Option 1: Fix for Small Groups (2-4 people)
- Disable debug mode: `WEBRTC_SINGLE_PEER_DEBUG = false`
- Test with 3-4 people in same room
- Monitor CPU and connection quality

### Option 2: Implement Queue Management
- Auto-invite next queued speaker after current finishes
- Add silence detection to auto-yield floor
- Show speaker queue in UI

### Option 3: Scale to Large Groups
- Consider SFU solution (Janus, Kurento, or SFU service)
- Implement server-side mixer
- Add recording capability

### Option 4: Hybrid Approach
- Use SFU for audio mixing
- Minimize bandwidth per participant
- Support 20+ people comfortably

---

## Configuration

### Environment Variables:
```
NEXT_PUBLIC_TURN_URL=        # TURN server for NAT traversal
NEXT_PUBLIC_TURN_USERNAME=   # TURN credentials
NEXT_PUBLIC_TURN_CREDENTIAL= # TURN credentials
```

### WebRTC Config:
- STUN Servers: Google's public STUN servers
- Echo Cancellation: ✅ Enabled
- Noise Suppression: ✅ Enabled  
- Auto Gain Control: ✅ Enabled
- Polling Interval: 2.5 seconds
- Heartbeat Interval: 5 seconds
- Participant TTL: 20 seconds

---

## Summary

Your audio room is well-architected for **2-4 person intimate conversations** (like WhatsApp group calls). The WebRTC mesh topology works great for this use case with:

✅ Real-time peer-to-peer audio  
✅ Proper mute management  
✅ Visual activity indicators  
✅ Moderator controls  
✅ Emotion support circle focus  

**Main Issue:** Debug mode limits to 1 peer connection, so multi-person audio isn't working yet.

**Recommendation:** Disable `WEBRTC_SINGLE_PEER_DEBUG` to test real multi-participant sessions.
