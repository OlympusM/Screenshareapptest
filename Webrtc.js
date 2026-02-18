// main.js
const peer = new Peer({
  host: '0.peerjs.com',
  port: 443,
  path: '/'
});

let localStream;
let currentCall = null;

const startBtn = document.getElementById('start');
const endBtn = document.getElementById('end');
const idArea = document.getElementById('idArea');
const remoteAudio = document.getElementById('remoteAudio');
const remoteVideo = document.getElementById('remoteVideo');
const connectSound = new Audio('assets/Join_sound.wav');
const disconnectSound = new Audio('assets/Leave_sound.wav');

remoteVideo.addEventListener('loadeddata', () => {
  connectSound.play();
  remoteVideo.style.display = 'block';
  console.log("Stream loaded, video visible");
});

// Get microphone
navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  .then(stream => {
    localStream = stream;
    console.log("Microphone access granted");
  })
  .catch(err => console.error("Microphone access denied", err));


// ────────────────────────────────────────────────
// Ending Call
// ────────────────────────────────────────────────

endBtn.addEventListener('click', () => {
    if (currentCall) {
        currentCall.close(); //closes call
        console.log("Call ended");
    } else {
        console.log("No ongoing call");
    }
});

peer.on('open', id => {
  idArea.value = id;
  console.log('My Peer ID:', id);
});

// ============================================================
// REUSABLE SDP MODIFICATION FUNCTION
// ============================================================
function modifySDP(pc) {
  if (!pc || !pc.localDescription) return;
  
  let sdp = pc.localDescription.sdp;
  console.log("Modifying SDP for AV1 and FPS...");

  // 1. Force AV1 Preference
  const av1Match = sdp.match(/a=rtpmap:(\d+) AV1\/90000/);
  if (av1Match) {
      const av1PayloadType = av1Match[1];
      const videoLineRegex = /(m=video \d+ RTP\/SAVPF) (.*)/;
      
      sdp = sdp.replace(videoLineRegex, (match, mLineStart, payloadTypes) => {
          // Remove AV1 from its current position
          const types = payloadTypes.split(' ').filter(t => t !== av1PayloadType);
          // Put AV1 payload type first
          return `${mLineStart} ${av1PayloadType} ${types.join(' ')}`;
      });
      console.log("SDP rearranged to prefer AV1");
  } else {
      console.warn("AV1 codec not supported by this browser.");
  }

  // 2. Add Framerate Hint
  sdp = sdp.replace(/m=video (.*)\r\n/g, 'm=video $1\r\n' + 'a=framerate:30\r\n');
  console.log("Framerate hint added");

  // 3. Apply Modified SDP
  pc.setLocalDescription({
      type: pc.localDescription.type,
      sdp: sdp
  }).then(() => {
      console.log("SUCCESS: SDP modified for AV1 and FPS.");
  }).catch(e => console.error("Error setting local description:", e));
}
// ============================================================

// ────────────────────────────────────────────────
// Incoming call (receiver) - UPDATED
// ────────────────────────────────────────────────
peer.on('call', call => {
  console.log("Incoming call from", call.peer);
  currentCall = call;

  call.answer(localStream);

 // --- !!! UPDATED SDP MODIFICATION FOR ANSWER !!! ---
  const checkConnection = setInterval(() => {
    const pc = call.peerConnection;
    
    // Check if pc exists, localDescription exists, and we are not in 'stable' state
    if (pc && pc.localDescription && pc.signalingState !== "stable") {
      clearInterval(checkConnection);
      
      // Small timeout to let PeerJS finish its internal processing
      setTimeout(() => {
        console.log("Applying modified SDP to answer...");
        modifySDP(pc); 
      }, 100);
    }
  }, 50);

  call.on('stream', remoteStream => {
    if (remoteStream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = remoteStream;
    } else {
      remoteAudio.srcObject = remoteStream;
    }
  });

  call.on('close', () => {
    currentCall = null;
    disconnectSound.play();
    remoteVideo.srcObject = null;
    remoteAudio.srcObject = null;
    remoteVideo.style.display = 'none';
    console.log("Call ended");
  });
});

// ────────────────────────────────────────────────
// Outgoing call (caller/sharer) - UPDATED
// ────────────────────────────────────────────────
startBtn.addEventListener('click', async () => {
  if (currentCall) {
    alert("Call already in progress. Hang up first.");
    return;
  }

  const friendId = prompt("Enter Friend's Peer ID:");
  if (!friendId) return;

  const useScreen = confirm("Do you want to share your screen?");

  let streamToSend = localStream;

  if (useScreen) {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width:  { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30, max: 30 }
        }
      });

      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = 'motion';
        console.log("Content hint set to 'motion' for smoother static frames");
      }

      streamToSend = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...localStream?.getAudioTracks() || []
      ]);

      remoteVideo.srcObject = screenStream;

      screenStream.getVideoTracks()[0].onended = () => {
        console.log("Screen sharing stopped by user");
        remoteVideo.srcObject = null;
      };
    } catch (err) {
      console.error("Screen share failed", err);
      alert("Screen sharing failed. Call aborted.");
      return;
    }
  }

  console.log("Calling", friendId);
  const call = peer.call(friendId, streamToSend);
  currentCall = call;

  // --- !!! APPLY SDP MODIFICATION TO OFFER !!! ---
  const checkConnection = setInterval(() => {
    const pc = call.peerConnection;
    if (pc && pc.localDescription) {
      clearInterval(checkConnection);
      modifySDP(pc); // Modify the offer SDP
    }
  }, 50);

  call.on('stream', remoteStream => {
    if (remoteStream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = remoteStream;
    } else {
      remoteAudio.srcObject = remoteStream;
    }
  });

  call.on('close', () => {
    currentCall = null;
    disconnectSound.play()
    remoteVideo.srcObject = null;
    remoteAudio.srcObject = null;
    remoteVideo.style.display = 'none';
    console.log("Call ended");
  });
  
});