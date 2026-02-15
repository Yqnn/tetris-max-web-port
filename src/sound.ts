// ===========================================
// AUDIO SYSTEM
// ===========================================

// Music configurations for different styles
const MUSIC_CONFIGS = {
  peter_wagner: {
    prefix: 'peter_wagner',
    segments: [
      'repeat',
      'repeat',
      'CD',
      'repeat',
      'repeat',
      'E',
      'E',
      'Fa',
      'Fb',
      'Fc',
      'repeat',
      'repeat',
      'E',
      'Fb',
      'G',
    ],
    repeatSegment: 0,
    folder: 'music',
  },
  animal_instinct: {
    prefix: 'animal_instinct',
    segments: ['A'], // Single looping segment
    repeatSegment: 0,
    folder: 'music',
  },
};

export type MusicStyle = keyof typeof MUSIC_CONFIGS;

const SOUND_FILES = {
  drop: 'sounds/drop.wav',
  stick: 'sounds/stick.wav',
  clear1: 'sounds/clear1.wav',
  clear2: 'sounds/clear2.wav',
  clear3: 'sounds/clear3.wav',
  clear4: 'sounds/clear4.wav',
  highscore: 'sounds/highscore.wav',
  smallBonus: 'sounds/smallBonus.wav',
  bigBonus: 'sounds/bigBonus.wav',
  newLevel: 'sounds/newlevel.wav',
  gameOver: 'sounds/gameover.wav',
  pause: 'sounds/pause.wav',
};
export type Sound = keyof typeof SOUND_FILES;

export const initSound = async (style?: MusicStyle) => {
  // Audio
  const audioContext: AudioContext = new window.AudioContext({
    latencyHint: 'interactive',
  });
  const sounds: Partial<Record<Sound, AudioBuffer>> = {};

  // State
  let musicBuffers: (AudioBuffer | null)[] = [];
  let musicSegmentNames: string[] = [];
  let currentMusicSegment = 0;
  let repeatMusicSegment = 0;
  let lastMusicSegment = 0;
  let musicSource: AudioBufferSourceNode | null = null;
  let musicGainNode: GainNode | null = null;
  let gMusicOn = true;
  let gSoundOn = true;
  let isPlaying = false;

  // Load music segments for a given style
  async function loadMusicSegments(style: keyof typeof MUSIC_CONFIGS) {
    const config = MUSIC_CONFIGS[style];

    musicSegmentNames = config.segments;
    repeatMusicSegment = config.repeatSegment;
    lastMusicSegment = config.segments.length - 1;

    // Load unique segments first, then reference them for the full sequence
    const uniqueSegments = [...new Set(musicSegmentNames)];
    const segmentCache: Record<string, AudioBuffer | null> = {};

    for (const segName of uniqueSegments) {
      try {
        const response = await fetch(
          `${config.folder}/${config.prefix}_${segName}.wav`
        );
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        segmentCache[segName] = audioBuffer;
      } catch (e) {
        console.log(`Failed to load music segment: ${segName}`, e);
        segmentCache[segName] = null;
      }
    }

    musicBuffers = musicSegmentNames.map((name) => segmentCache[name] || null);
  }

  async function startMusic(style?: MusicStyle) {
    if (style) {
      await loadMusicSegments(style);
    }
    if (!gMusicOn || musicBuffers.length === 0) return;

    // Resume audio context if suspended
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    currentMusicSegment = 0;
    isPlaying = true;
    playMusicSegment();
  }

  function playMusicSegment() {
    if (!isPlaying || !gMusicOn) return;

    // Safety check (shouldn't normally happen with correct logic)
    if (currentMusicSegment >= musicBuffers.length || currentMusicSegment < 0) {
      currentMusicSegment = repeatMusicSegment;
    }

    const buffer = musicBuffers[currentMusicSegment];
    if (!buffer) {
      // Skip missing segment using original logic
      if (currentMusicSegment === lastMusicSegment) {
        currentMusicSegment = repeatMusicSegment;
      } else {
        currentMusicSegment++;
      }
      playMusicSegment();
      return;
    }

    // Stop any currently playing music source
    if (musicSource) {
      try {
        musicSource.onended = null;
        musicSource.stop();
      } catch {
        /**/
      }
    }

    // Create new source
    musicSource = audioContext.createBufferSource();
    musicSource.buffer = buffer;

    // Create gain node for music volume
    musicGainNode = audioContext.createGain();
    musicGainNode.gain.value = 0.3; // 30% volume for background music

    musicSource.connect(musicGainNode);
    musicGainNode.connect(audioContext.destination);

    // When this segment ends, play the next one (original MusicSeq logic)
    musicSource.onended = () => {
      if (isPlaying && gMusicOn) {
        // Original: if current == last, go to repeat; else increment
        if (currentMusicSegment === lastMusicSegment) {
          currentMusicSegment = repeatMusicSegment;
        } else {
          currentMusicSegment++;
        }
        playMusicSegment();
      }
    };

    musicSource.start(0);
  }

  function stopMusic() {
    isPlaying = false;
    if (musicSource) {
      try {
        musicSource.onended = null;
        musicSource.stop();
      } catch {
        /**/
      }
      musicSource = null;
    }
  }

  function toggleMusic(shouldResume: boolean) {
    gMusicOn = !gMusicOn;
    if (!gMusicOn) {
      stopMusic();
    } else if (shouldResume) {
      startMusic();
    }
    return gMusicOn;
  }

  function toggleSound() {
    gSoundOn = !gSoundOn;
    return gSoundOn;
  }

  function playSound(name: Sound) {
    if (!audioContext || !sounds[name] || !gSoundOn) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Create buffer source and play the sound
    const source = audioContext.createBufferSource();
    source.buffer = sounds[name];

    // Add gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.5; // 50% volume

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(audioContext.currentTime + 0.01);
  }

  async function initAudio(style?: MusicStyle) {
    try {
      const names = Object.keys(SOUND_FILES) as Sound[];

      // Load all sound files
      for (const name of names) {
        try {
          const path = SOUND_FILES[name];
          const response = await fetch(path);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          sounds[name] = audioBuffer;
        } catch (e) {
          console.log(`Failed to load sound: ${name}`, e);
        }
      }

      // Load default music
      await loadMusicSegments(style || 'peter_wagner');
    } catch (e) {
      console.log('Audio not available:', e);
    }
  }

  await initAudio(style);

  return {
    playSound,
    startMusic,
    stopMusic,
    getIsPlaying: () => isPlaying,
    toggleMusic,
    toggleSound,
  };
};
