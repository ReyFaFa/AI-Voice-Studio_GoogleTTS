// Emergency script to stop all playing audio
// Open browser console and paste this to force-stop all audio

// Method 1: Stop all audio elements
document.querySelectorAll('audio').forEach(audio => {
  audio.pause();
  audio.currentTime = 0;
  audio.src = '';
});

// Method 2: Stop Web Audio API contexts
if (window.AudioContext || (window as any).webkitAudioContext) {
  // This will be in the log if there's an active context
  console.log('Attempting to stop all audio contexts...');
}

// Method 3: Reload the page
// location.reload();

console.log('✅ Emergency stop executed. If audio persists, refresh page (F5)');
