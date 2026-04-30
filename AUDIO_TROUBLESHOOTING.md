# Audio Troubleshooting Guide - SharePass

## 🔊 Critical Fixes Applied

### 1. **Audio Elements Now Unmuted** ✅
- **Issue:** Remote audio elements were rendering with `muted={true}` (default)
- **Fix:** Explicitly set `muted={false}` on all audio elements
- **Location:** [components/SharePass.js](components/SharePass.js#L2372)

### 2. **Audio Elements Now Hidden** ✅
- **Issue:** Audio elements were visible as HTML players cluttering the UI
- **Fix:** Set `style={{ display: "none" }}` - they work without being visible
- **Result:** Audio flows silently in background, UI stays clean

### 3. **Enhanced Error Logging** ✅
- **Added:** Console logs for audio playback events
- **Helps with:** Identifying exactly where audio fails
- **Examples:**
  - `[voice] remote audio canplay from user-123` - Audio is playing
  - `[voice] remote audio error from user-456:` - Audio failed
  - `[voice] remote audio element state` - Full stream state

---

## 🧪 Diagnostic Steps

### Step 1: Check Browser Console
```
1. Open DevTools (F12)
2. Go to Console tab
3. Join audio room
4. Look for these patterns:
```

**Expected logs (Audio working):**
```
✅ [voice] remote audio canplay from user-123
✅ [voice] RTP stats {bytesSent: 1024, bytesReceived: 2048}
✅ [voice] ICE state change {state: "connected"}
```

**Problem logs (Audio not working):**
```
❌ [voice] remote audio error from user-456: NotAllowedError
❌ [voice] remote audio play blocked {errorName: "NotAllowedError"}
❌ No audio logs at all (connection issue)
```

---

### Step 2: Check Microphone Input

**Test if your mic is working:**
```javascript
// Open console and run this:
navigator.mediaDevices.getUserMedia({audio: true})
  .then(stream => {
    console.log("✓ Microphone works!", stream.getAudioTracks());
  })
  .catch(err => {
    console.error("✗ Microphone blocked:", err.message);
  });
```

**Expected output:**
```
✓ Microphone works! [AudioTrack {...}]
```

**Problem output:**
```
✗ Microphone blocked: Permission denied
```

---

### Step 3: Monitor RTP Audio Data

**Check if audio data is flowing:**
```javascript
// In console, filter logs
console.clear();
// Then look for these patterns in real-time:
//  - [voice] RTP stats
//  - bytesSent > 0
//  - bytesReceived > 0

// If you see:
// bytesSent: 0, bytesReceived: 0
// = No audio data flowing!
```

---

## 🐛 Common Issues & Solutions

### Issue 1: "No audio heard, but console has no errors"

**Diagnosis:**
1. Open DevTools Console
2. Look for: `[voice] remote audio canplay`
3. If you see it → Audio is being delivered to browser
4. Then it's likely: **Browser speaker muted or volume is 0**

**Solutions:**
```
✓ Check system volume (not just browser volume)
✓ Unmute tab in browser (mute icon in tab title)
✓ Check sound output device is correct
  - System Preferences → Sound → Output
✓ Restart browser
```

---

### Issue 2: "Audio tried to play but failed (NotAllowedError)"

**What it means:**
- Browser autoplay policy is blocking audio
- Requires user interaction to play audio

**Solution:**
```
✓ Message appears: "Browser audio autoplay is blocked"
✓ Click anywhere on page or press any key
✓ Audio should start playing
✓ Page will remember this preference
```

**Note:** This is normal browser security behavior.

---

### Issue 3: "I can hear myself but not others"

**This means:**
- ✓ Your microphone is working
- ❌ Remote audio streams are not connecting

**Diagnosis:**
```
1. Console → Look for other people's member IDs
2. Search for: [voice] remote audio canplay from OTHER-PERSON-ID
3. If NOT found → Peer connection failed
4. If found → Audio reached browser, check speaker
```

**Solutions:**
```
✓ Close other audio/video apps (Chrome WebRTC conflict)
✓ Try different browser (Chrome, then Safari)
✓ Check network connection (should be stable)
✓ Close other tabs using audio
✓ Restart entire browser
```

---

### Issue 4: "One-way audio (only one direction works)"

**Problem:** Person A hears B, but B doesn't hear A

**Causes:**
```
1. Person A's microphone isn't enabled
   → Check: Is A's mic showing as "Live" in participant list?
   
2. Person A hasn't joined audio room yet
   → Check: Does A see "You are connected..." message?
   
3. WebRTC negotiation incomplete
   → Check console for: [voice] ICE state change {state: "failed"}
   
4. Firewall blocking peer connections
   → Check: Do they have TURN server configured?
```

**Solutions:**
```
✓ Ask A to click "Join Audio Room" again
✓ Ask A to unmute microphone
✓ Both refresh page and rejoin
✓ Try on same WiFi network first (rules out firewall)
```

---

### Issue 5: "Connection states keep changing or disconnecting"

**Symptoms:**
```
- Connects then disconnects repeatedly
- Participants appear/disappear
- Audio cuts in and out
```

**Causes:**
```
1. Network unstable (WiFi, mobile data)
2. Too many people connected (mesh topology overloaded)
3. Browser running out of memory
4. CPU usage too high
```

**Solutions:**
```
✓ Move closer to WiFi router
✓ Switch from WiFi to wired if possible
✓ Close other applications (Chrome is CPU-heavy)
✓ Reduce number of participants (best with 2-4 people)
✓ Try on faster internet connection
```

---

## 🔍 Full Debug Output Example

**Copy this from your browser console when audio isn't working:**

```
F12 → Console → Right-click → "Save all messages as..."

Share the output with debug info including:
- [voice] establishing peer connections {totalRemotePeers: X}
- [voice] remote audio element state {audioTracksCount: X}
- [voice] RTP stats {bytesSent: X, bytesReceived: Y}
- [voice] remote audio play blocked {errorName: "..."}
- Any error messages in red
```

---

## 📋 Checklist: Debug Before Reporting Bug

Use this checklist to verify all components:

```
MICROPHONE
□ System volume is ON (not muted)
□ Browser tab is not muted (check tab title)
□ Microphone device is selected (not default)
□ Permissions given to browser
□ DevTools shows: "Microphone works!"

PEER CONNECTION
□ Multiple people joined audio room
□ Console shows: "establishing peer connections {totalRemotePeers: N}"
□ Console shows: "ICE state change {state: connected}"
□ Console shows: "RTP stats {bytesSent: >0, bytesReceived: >0}"

AUDIO PLAYBACK
□ Remote audio element exists (check: Object.keys(remoteStreams).length > 0)
□ Console shows: "remote audio canplay from USER-ID"
□ No errors: "NotAllowedError", "NotSupportedError"
□ If autoplay blocked, clicked on page to unblock

BROWSER
□ Chrome, Safari, or Firefox (best in Chrome)
□ No other tabs using microphone
□ Enough memory available (close other apps)
□ Not behind restrictive firewall (VPN might help)
```

---

## 🚀 Quick Test

**Test remote audio in 2 minutes:**

```bash
# Terminal 1: Start your app
npm run dev

# Browser 1: http://localhost:3000
# Browser 2: http://localhost:3000 (same circle)

# Both:
1. Join circle
2. One person: Click "Start Audio Room"
3. Both: Click "Join Audio Room"
4. Both: Open DevTools (F12) → Console
5. Person A: Speak into microphone
6. Person B: Look for console logs:
   - [voice] remote audio canplay from PERSON-A-ID ✅
   - Your speaker should play audio ✅
7. Swap: Person B speaks
8. Person A should hear it
```

**If both can hear each other:** Audio is working! 🎉

---

## 📞 When to Report a Bug

**Report a bug with this info:**

```
Browser: Chrome / Safari / Firefox
OS: Mac / Windows / Linux
People in call: 2 / 3 / 4 / ...
Audio direction: One-way / No audio / Choppy

Console output (paste full [voice] logs):
[Copy from DevTools Console]

Checklist items that FAILED:
□ Item X
□ Item Y

Steps to reproduce:
1. ...
2. ...
3. ...

Expected: Audio should work
Actual: [What happens instead]
```

---

## 🎯 Audio Flow Verification

If you want to verify the exact audio path:

```javascript
// In browser console, verify each step:

// Step 1: Check local stream
console.log("Local stream:", {
  hasMicrophone: navigator.mediaDevices?.getUserMedia ? "✓" : "✗",
  audioTracks: localStreamRef.current?.getAudioTracks().length || 0
});

// Step 2: Check remote streams
console.log("Remote streams:", Object.keys(remoteStreams).length);
remoteStreams.forEach((stream, id) => {
  console.log(`  ${id}:`, {
    audioTracks: stream.getAudioTracks().length,
    trackStates: stream.getAudioTracks().map(t => t.readyState)
  });
});

// Step 3: Check peer connections
console.log("Peer connections:", Object.keys(peerConnectionsRef.current).length);

// Step 4: Check audio elements
document.querySelectorAll('audio').forEach((el, i) => {
  console.log(`Audio element ${i}:`, {
    muted: el.muted,
    paused: el.paused,
    hasSrcObject: !!el.srcObject,
    volume: el.volume
  });
});
```

---

## 🔧 Advanced: Manual Audio Test

**For developers who want full control:**

```javascript
// Get the remote audio element
const remoteAudio = document.querySelector('audio[data-stream-id]');

// Force it unmuted and loud
remoteAudio.muted = false;
remoteAudio.volume = 1.0;

// Try to play
remoteAudio.play()
  .then(() => console.log("✓ Playing!"))
  .catch(err => console.error("✗ Error:", err));

// Check stream state
console.log("Stream state:", {
  hasSrcObject: !!remoteAudio.srcObject,
  tracks: remoteAudio.srcObject?.getAudioTracks().length,
  readyState: remoteAudio.readyState,
  networkState: remoteAudio.networkState
});
```

---

**Status:** ✅ Audio fixes applied. Use the troubleshooting steps above to diagnose any remaining issues.
