
import { NOTE_TO_MIDI } from '../data/constants.js';

let audioCtx = null;
let reverbNode = null;
let reverbGain = null;
let activeNodes = []; // Track active oscillators/gain nodes

// Callbacks for visualizer
let onNotePlayCallback = null;
let onBodyHitCallback = null;

export function setVisualizerCallbacks(onNotePlay, onBodyHit) {
    onNotePlayCallback = onNotePlay;
    onBodyHitCallback = onBodyHit;
}

export function getAudioContext() {
    return audioCtx;
}

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Reverb Setup
        reverbNode = audioCtx.createConvolver();
        reverbGain = audioCtx.createGain();
        reverbGain.gain.value = 0.5;

        // Generate Impulse Response
        const sampleRate = audioCtx.sampleRate;
        const length = sampleRate * 2.0;
        const impulse = audioCtx.createBuffer(2, length, sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const decay = Math.pow(1 - i / length, 2);
            left[i] = (Math.random() * 2 - 1) * decay;
            right[i] = (Math.random() * 2 - 1) * decay;
        }

        reverbNode.buffer = impulse;
        reverbNode.connect(reverbGain);
        reverbGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function stopAllSounds() {
    if (audioCtx) {
        const now = audioCtx.currentTime;
        activeNodes.forEach(node => {
            try {
                if (node.gainNode) {
                    node.gainNode.gain.cancelScheduledValues(now);
                    node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, now);
                    node.gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
                }
                if (node.oscs) {
                    node.oscs.forEach(osc => osc.stop(now + 0.1));
                } else if (node.osc) {
                    node.osc.stop(now + 0.1);
                } else if (node.source) {
                    node.source.stop(now + 0.1);
                }
            } catch (e) {
                // Ignore errors on stopped nodes
            }
        });
        activeNodes = [];
    }
}

export function playTone(freq, noteName, duration = 2.4, startTime = 0, suppressVisuals = false) {
    if (!audioCtx) initAudio();
    const t = Math.max(audioCtx.currentTime, startTime || 0);

    if (!freq || isNaN(freq)) {
        console.error('[AudioEngine] Invalid frequency:', freq);
        return;
    }

    const masterGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;

    filter.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    if (reverbNode) {
        masterGain.connect(reverbNode);
    }

    const partials = [
        { mult: 1.0, gain: 0.5, type: 'sine' },
        { mult: 2.0, gain: 0.2, type: 'sine' },
        { mult: 3.0, gain: 0.08, type: 'sine' }
    ];

    const nodes = [];

    partials.forEach(p => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = p.type;
        osc.frequency.value = freq * p.mult;

        osc.connect(g);
        g.connect(filter);

        g.gain.setValueAtTime(p.gain, t);

        osc.start(t);
        osc.stop(t + duration);
        nodes.push(osc);
    });

    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(0.8, t + 0.003);
    masterGain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    masterGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    const nodeRef = { oscs: nodes, gainNode: masterGain };
    activeNodes.push(nodeRef);

    nodes[0].onended = () => {
        const idx = activeNodes.indexOf(nodeRef);
        if (idx > -1) activeNodes.splice(idx, 1);
    };

    if (!suppressVisuals && onNotePlayCallback && noteName) {
        // Calculate delay relative to now
        const delay = t - audioCtx.currentTime;
        onNotePlayCallback(noteName, delay);
    }
}

// Global buffer for noise to avoid recreation
let _noiseBuffer = null;

export function playTak(startTime, isAlt = false, isGhost = false, suppressVisuals = false) {
    if (!audioCtx) initAudio();
    const t = Math.max(audioCtx.currentTime, startTime || 0);

    if (!_noiseBuffer) {
        const bufferSize = audioCtx.sampleRate * 0.5;
        _noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = _noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = _noiseBuffer;

    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    filter.type = 'highpass';
    filter.frequency.value = isAlt ? 2100 : 1800;
    filter.Q.value = isAlt ? 1.5 : 1;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    if (reverbNode) {
        gain.connect(reverbNode);
    }

    const baseVolume = 0.68; // Lowered by 15% from 0.8
    const volume = isGhost ? baseVolume * 0.4 : baseVolume;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    source.start(t);
    source.stop(t + 0.06);

    const nodeRef = { source: source, gainNode: gain };
    activeNodes.push(nodeRef);

    source.onended = () => {
        const idx = activeNodes.indexOf(nodeRef);
        if (idx > -1) activeNodes.splice(idx, 1);
    };

    if (!suppressVisuals && onBodyHitCallback) {
        const delay = t - audioCtx.currentTime;
        onBodyHitCallback(delay, isGhost);
    }
}

// Helper for internal use or export if needed
export function setGlobalTempo(bpm) {
    // This might be better in scheduler/state, but engine sometimes needs it?
    // Actually engine processes time in seconds. Tempo is high-level.
}
