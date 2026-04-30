# Audio Testing Instructions

## 🚀 Quick Start

Your audio system has been fixed and enhanced with comprehensive logging. Follow these steps to test it:

### **Step 1: Start the Server**
```bash
npm run dev
```

### **Step 2: Run Diagnostics** 
Open the audio test page:
```
http://localhost:3000/audio-test.html
```

**Run these tests in order:**
1. ✅ **Check Browser** - Verify WebRTC support
2. ✅ **Check Audio Devices** - See your microphone/speakers
3. ✅ **Test Microphone** - Confirm mic is working
4. ✅ **Test Speaker** - Hear a test tone (440Hz)
5. ✅ **Test Audio Context** - Verify audio APIs work

### **Step 3: Open SharePass in Two Windows**
- Window 1: http://localhost:3000
- Window 2: http://localhost:3000

### **Step 4: Test Audio Room**
In both windows:
1. Join the same circle
2. Window 1 (as moderator): Click "Start Audio Room"
3. Both: Click "Join Audio Room"
4. Window 1: Speak into your microphone
5. **Look in browser console (F12):**
   - Should see: `[voice] remote audio canplay from [user-id]`
   - Should hear audio from Window 1 in Window 2

### **Step 5: Monitor Console**
Open DevTools (F12) → Console tab
```
✅ Look for these SUCCESS logs:
  [voice] establishing peer connections {totalRemotePeers: 1}
  [voice] remote audio canplay from user-123
  [voice] RTP stats {bytesSent: 1024, bytesReceived: 2048}
  [voice] remote audio playing successfully

❌ Watch for these ERROR logs (will tell you what's wrong):
  [voice] remote audio play error
  [voice] getUserMedia failed
  [voice] remote audio error
```

---

## 🔧 What Was Fixed

### **1. Audio Elements Now Unmuted** ✅
- Remote audio elements had default `muted={true}`
- **Fixed:** Changed to `muted={false}`
- **Impact:** Audio can now actually play

### **2. Audio Elements Now Hidden** ✅
- Audio elements were visible in UI taking up space
- **Fixed:** Changed to `display: "none"`
- **Impact:** UI is clean, audio works silently in background

### **3. Better Error Logging** ✅
- Added detailed error information for debugging
- Shows exact error types (NotAllowedError, NotFound, etc.)
- Tracks audio track states and stream information
- **Impact:** Easy to diagnose audio issues

### **4. Improved Promise Handling** ✅
- Was checking for `.catch()` instead of `.then()`
- **Fixed:** Now properly awaits `.then()` and `.catch()` chains
- **Impact:** Reliable audio playback

### **5. Better Microphone Error Messages** ✅
- Generic error messages before
- **Fixed:** Specific messages for each error type
  - Permission denied
  - No microphone found
  - Browser incompatibility
- **Impact:** Users know exactly what to fix

---

## 📋 Testing Checklist

```
AUDIO INPUT
□ Microphone found (audio-test.html)
□ Microphone permission granted
□ Audio track enabled
□ getUserMedia not throwing errors

AUDIO OUTPUT
□ Speaker plays test tone
□ AudioContext initialized
□ No autoplay errors

PEER CONNECTION
□ WebRTC supported
□ Peer connections established
□ ICE candidates exchanged
□ Audio data flowing (RTP stats)

AUDIO PLAYBACK
□ Remote audio element exists
□ Audio element not muted
□ Stream attached to audio element
□ Browser can play audio
□ No NotAllowedError on play()
```

---

## 🐛 If Audio Still Isn't Working

### **Debug Step 1: Check Console**
```javascript
// Open F12 → Console and run this:
Object.keys(remoteStreams).length // Should be > 0
```

### **Debug Step 2: Check Audio Elements**
```javascript
// Check if audio elements exist
document.querySelectorAll('audio').length // Should be > 0

// Check if they're unmuted
document.querySelectorAll('audio').forEach(el => {
  console.log('Audio element:', {
    muted: el.muted,
    paused: el.paused,
    hasSrcObject: !!el.srcObject,
    readyState: el.readyState
  });
});
```

### **Debug Step 3: Manual Audio Play Test**
```javascript
// Find and try to play audio element
const audio = document.querySelector('audio[data-stream-id]');
if (audio && audio.srcObject) {
  audio.muted = false;
  audio.play()
    .then(() => console.log('✓ Audio playing!'))
    .catch(err => console.error('✗ Error:', err.name, err.message));
}
```

### **Debug Step 4: Check RTP Stats**
Look for these in console:
```
[voice] RTP stats {remoteMemberId: "user-123", bytesSent: X, bytesReceived: Y}
```
- If `bytesSent: 0, bytesReceived: 0` = No data flowing = Connection issue
- If `bytesReceived > 0` = Audio data is arriving = Check playback

---

## 💡 Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Autoplay blocked | "Browser audio autoplay is blocked" message | Click page or press key |
| Mic not found | "No microphone found" error | Check mic is connected |
| Permission denied | "Allow mic permission" message | Grant permission to browser |
| One-way audio | One person hears other, but not vice versa | Other person needs to join audio room |
| No audio at all | Complete silence, no console errors | Check system volume, not browser volume |

---

## 🎯 Next Steps

1. **Run audio-test.html** and verify all tests pass
2. **Test with 2 people** in same circle
3. **Check browser console** for `[voice]` logs
4. **Report any errors** with full console output

---

## 📞 Getting Help

If audio isn't working, share:
1. Browser type and version
2. OS (Mac/Windows/Linux)
3. Full console output (copy all [voice] logs)
4. Screenshot of error message
5. Steps to reproduce

**Status:** ✅ Audio fixes deployed. Ready for testing!
