// WebAudio synthesizer for Midnight Bento Rush — zero external audio files.

export function createSoundEngine() {
  let ctx = null;
  let muted = false;

  function ensureContext() {
    if (muted) return null;
    if (!ctx && typeof window !== 'undefined') {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        try {
          ctx = new AudioCtor();
        } catch {
          ctx = null;
        }
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function playTone(freqStart, freqEnd, duration, type, gainPeak, delay = 0) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playNoiseBurst(duration, filterFreq, gainPeak) {
    const audio = ensureContext();
    if (!audio) return;
    const sampleCount = Math.max(1, Math.floor(audio.sampleRate * duration));
    const buffer = audio.createBuffer(1, sampleCount, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.4;
    const gain = audio.createGain();
    const now = audio.currentTime;
    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    source.start(now);
  }

  return {
    isMuted() {
      return muted;
    },
    setMuted(nextMuted) {
      muted = Boolean(nextMuted);
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    playPickup() {
      playTone(420, 580, 0.07, 'triangle', 0.11);
    },
    playChopThock() {
      playTone(195, 72, 0.065, 'triangle', 0.18);
      playNoiseBurst(0.045, 1150, 0.08);
    },
    playSizzleTick() {
      playNoiseBurst(0.08, 3600, 0.045);
    },
    playCookReadyDing() {
      playTone(880, 1175, 0.14, 'sine', 0.12);
      playTone(1318, 1318, 0.18, 'sine', 0.09, 0.08);
    },
    playPlateSnap() {
      playTone(510, 740, 0.08, 'sine', 0.11);
    },
    playServeBell(streak = 1) {
      const pitchBoost = Math.min(streak - 1, 5) * 45;
      playTone(988 + pitchBoost, 988 + pitchBoost, 0.24, 'sine', 0.15);
      playTone(1480 + pitchBoost, 1480 + pitchBoost, 0.32, 'triangle', 0.11, 0.06);
      playTone(1976 + pitchBoost, 1976 + pitchBoost, 0.22, 'sine', 0.06, 0.11);
    },
    playDashWhoosh() {
      playNoiseBurst(0.09, 1400, 0.07);
      playTone(290, 440, 0.08, 'sine', 0.06);
    },
    playErrorBuzz() {
      playTone(185, 115, 0.17, 'sawtooth', 0.11);
    },
    playBinDiscard() {
      playTone(260, 130, 0.11, 'square', 0.07);
    },
    playRushChime() {
      playTone(587, 587, 0.13, 'triangle', 0.13, 0);
      playTone(784, 784, 0.14, 'triangle', 0.13, 0.12);
      playTone(1174, 1174, 0.28, 'sine', 0.14, 0.24);
    },
  };
}
