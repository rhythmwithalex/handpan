document.addEventListener('DOMContentLoaded', () => {
    console.log('Handpan Chord Cards initialized');

    // --- Data & Constants ---

    const SCALE_TEMPLATES = [
        {
            name: 'Kurd',
            type: 'Natural Minor (Ding+8)',
            keys: ['D', 'C#', 'E', 'B', 'A', 'G'],
            formula: [7, 8, 10, 12, 14, 15, 17, 19] // 5, b6, b7, 1, 2, b3, 4, 5
        },
        {
            name: 'Kurd 9',
            type: 'Natural Minor (Ding+9)',
            keys: ['D', 'C#', 'E', 'B', 'A', 'G'],
            formula: [7, 8, 10, 12, 14, 15, 17, 19, 22] // 5, b6, b7, 1, 2, b3, 4, 5, b7
        },
        {
            name: 'Amara',
            type: 'Celtic Minor',
            keys: ['D', 'C#', 'E', 'B', 'F', 'G'],
            formula: [7, 10, 12, 14, 15, 17, 19, 22] // 5, b7, 1, 2, b3, 4, 5, b7
        },
        {
            name: 'Pygmy',
            type: 'Pentatonic',
            keys: ['F', 'G', 'E', 'F#', 'D'],
            formula: [5, 7, 8, 12, 14, 15, 17, 19] // 4, 5, b6, 1, 2, b3, 4, 5
        },
        {
            name: 'Hijaz',
            type: 'Phrygian Dominant',
            keys: ['D', 'C#', 'G', 'F', 'E'],
            formula: [7, 8, 11, 12, 14, 15, 17, 19] // 5, b6, 7, 1, 2, b3, 4, 5
        },
        {
            name: 'Integral',
            type: 'Minor Variant',
            keys: ['D', 'C#', 'C', 'B'],
            formula: [7, 8, 10, 12, 14, 15, 17] // 5, b6, b7, 1, 2, b3, 4
        },
        {
            name: 'Equinox',
            type: 'Minor',
            keys: ['E', 'F', 'G', 'B', 'C'],
            formula: [3, 7, 8, 10, 12, 14, 15, 19] // b3, 5, b6, b7, 1, 2, b3, 5
        },
        {
            name: 'Sabye',
            type: 'Major',
            keys: ['C', 'D', 'F', 'G', 'Bb'],
            formula: [7, 9, 11, 12, 14, 16, 17, 19] // 5, 6, 7, 1, 2, 3, 4, 5
        },
        {
            name: 'Mixolydian',
            type: 'Mixolydian',
            keys: ['D', 'C', 'G', 'F', 'A'],
            formula: [7, 9, 10, 12, 14, 15, 17, 19] // 5, 6, b7, 1, 2, b3, 4, 5
        },
        {
            name: 'Mystic',
            type: 'Minor',
            keys: ['D', 'G', 'A', 'F', 'C'],
            formula: [5, 7, 10, 12, 14, 15, 17, 19] // 4, 5, b7, 1, 2, b3, 4, 5
        }
    ];

    const PREDEFINED_SCALES = [
        {
            id: 'e-amara',
            name: 'E Amara',
            top: ['E3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5'],
            bottom: { 'F#3': 'F#4', 'G3': 'G4', 'E5': 'B4' }
        }
    ];

    let customScales = JSON.parse(localStorage.getItem('customScales') || '[]');

    // Ensure "Alex's E Amara" exists in custom scales as a starter example
    const defaultAlexAmara = {
        id: 'custom-alex-amara',
        name: 'Alex E Amara',
        top: ['E3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5'],
        bottom: { 'D:F#3': 'F#4', 'D:G3': 'G4', 'E5': 'B4' }
    };

    // Force update/ensure "Alex's E Amara" exists with latest definition
    // Check by ID first, then by Name to prevent duplicates if user recreated it
    let existingAlexIndex = customScales.findIndex(s => s.id === 'custom-alex-amara');

    if (existingAlexIndex === -1) {
        existingAlexIndex = customScales.findIndex(s => s.name === 'Alex E Amara');
    }

    if (existingAlexIndex > -1) {
        // Update existing instance (keeping its ID if it was manually created, or updating the default one)
        const existingId = customScales[existingAlexIndex].id;
        customScales[existingAlexIndex] = { ...defaultAlexAmara, id: existingId };
    } else {
        // Create new default
        customScales.unshift(defaultAlexAmara);
    }
    localStorage.setItem('customScales', JSON.stringify(customScales));

    function getMergedScales() {
        return [...PREDEFINED_SCALES, ...customScales];
    }

    // Resilience: Load from full object if possible, then ID, then default
    let currentScale;
    const savedScale = localStorage.getItem('lastSelectedScale');
    if (savedScale) {
        try {
            currentScale = JSON.parse(savedScale);
        } catch (e) {
            console.error('Failed to parse saved scale', e);
        }
    }

    if (!currentScale) {
        const lastScaleId = localStorage.getItem('lastScaleId');
        currentScale = getMergedScales().find(s => s.id === lastScaleId) || getMergedScales()[0];
    }

    let HANDPAN_NOTES = []; // Populated dynamically

    // Intervals for chord types relative to root (semitones)
    const CHORD_TYPES = {
        '5': [7], // Power Chord
        'Major': [4, 7],
        'Minor': [3, 7],
        'Diminished': [3, 6],
        'Sus2': [2, 7],
        'Sus4': [5, 7],
        'Maj7': [4, 7, 11],
        'Min7': [3, 7, 10],
        '7': [4, 7, 10], // Dominant 7
        'Dim7': [3, 6, 9],
        'Min7b5': [3, 6, 10]
    };

    // --- State ---
    const PROGRESSIONS = [
        {
            name: "Sunset Valley",
            desc: "A classic grounding progression for E Amara.",
            chords: ["E Minor", "G Major", "D Major", "B Minor"]
        },
        {
            name: "Deep Mist",
            desc: "Melancholic and deep harmonic transitions.",
            chords: ["E Minor", "B Minor", "D Major", "E Minor"]
        },
        {
            name: "Mountain Air",
            desc: "Bright and wide open sounds.",
            chords: ["G Major", "D Major", "G Major", "E Minor"]
        },
        {
            name: "Suspended Flow",
            desc: "Dreamy and unresolved atmospheric movement.",
            chords: ["E Minor", "A Sus2", "D Sus2", "E Minor"]
        }
    ];
    const detectedChords = [];
    const progression = [];

    // --- Logic ---

    function getNoteName(value) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return notes[value % 12];
    }

    // Identify chords from a set of notes
    function identifyChord(noteSet) {
        // Sort by value
        noteSet.sort((a, b) => a.value - b.value);

        // Try each note as root
        for (let i = 0; i < noteSet.length; i++) {
            const root = noteSet[i];
            const intervals = [];

            for (let j = 0; j < noteSet.length; j++) {
                if (i === j) continue;
                let interval = (noteSet[j].value - root.value) % 12;
                if (interval < 0) interval += 12;
                if (!intervals.includes(interval) && interval !== 0) {
                    intervals.push(interval);
                }
            }
            intervals.sort((a, b) => a - b);

            // Check against dictionary
            for (const [type, requiredIntervals] of Object.entries(CHORD_TYPES)) {
                const match = requiredIntervals.every(req => intervals.includes(req));

                if (match) {
                    // Check if we have gathered simply triads or tetrads
                    // Ideally size match:
                    if (requiredIntervals.length === noteSet.length - 1) {
                        return {
                            root: root.note,
                            type: type,
                            name: `${root.note} ${type}`,
                            notes: noteSet,
                            intervalSignature: intervals.join(',') // Helps with uniqueness check if needed
                        };
                    }
                }
            }
        }
        return null;
    }

    // Generate combinations of notes
    function generateChords() {
        const chordMap = new Map(); // Key: "Root Type" -> { ...chordData, voicings: [] }

        // Helper for combinations
        function combine(arr, k, start = 0, current = []) {
            if (current.length === k) {
                const chord = identifyChord([...current]);
                if (chord) {
                    // Grouping Logic
                    const key = chord.name;
                    if (!chordMap.has(key)) {
                        chordMap.set(key, {
                            ...chord,
                            voicings: [chord.notes]
                        });
                    } else {
                        // Avoid duplicate voicings
                        const existing = chordMap.get(key);
                        const newVoicingIds = chord.notes.map(n => n.value).sort().join('-');
                        const hasVoicing = existing.voicings.some(v => v.map(n => n.value).sort().join('-') === newVoicingIds);

                        if (!hasVoicing) {
                            existing.voicings.push(chord.notes);
                        }
                    }
                }
                return;
            }
            for (let i = start; i < arr.length; i++) {
                combine(arr, k, i + 1, [...current, arr[i]]);
            }
        }

        // We search for Dyads (2), Triads (3) and Tetrads (4)
        combine(HANDPAN_NOTES, 2);
        combine(HANDPAN_NOTES, 3);
        combine(HANDPAN_NOTES, 4);

        // Validates voicings and adds them
        const results = Array.from(chordMap.values());

        // Process each chord:
        // 1. Generate "Full Arpeggio" (all available notes for this chord)
        // 2. Sort existing voicings
        results.forEach(chord => {
            // Calculate Arpeggio
            // We need to know which notes belong to this chord. 
            // We can determine this by checking the base notes of the chord.
            // chord.notes contains one valid voicing. We can use it to get the set of allowed note names.
            const allowedNotes = new Set(chord.notes.map(n => n.note));

            const arpeggio = HANDPAN_NOTES.filter(n => allowedNotes.has(n.note));

            // Add Arpeggio as a special voicing (or just the first one?)
            // Let's add it if it's not already covered exactly by a voicing (unlikely for 3-4 note chords if arpeggio is longer)
            // But we want it distinct. Let's mark it or just prepend/append it.
            // User asked for it "as a variant". Let's put it at the END with a special label? 
            // Or beginning? "Chain from lowest to highest".
            // Let's attach it to the chord object separately or add to voicings with a flag.

            // Let's add it to voicings but we need to handle duplicates if the arpeggio IS one of the voicings (e.g. if only 3 notes exist total).
            const arpeggioId = arpeggio.map(n => n.value).join('-');
            const exists = chord.voicings.some(v => v.map(n => n.value).join('-') === arpeggioId);

            if (!exists) {
                // If we add it, we should label it "Full Sequence" or similar in UI.
                // We'll attach it as a property `arpeggio` to separate it from "standard voicings" in the UI loop, 
                // OR just add to voicings and let sort handle it? 
                // Better to have explicit control. Let's add it to a new property `arpeggio`.
                chord.arpeggio = arpeggio;
            } else {
                // Check if we want to explicitly highlight it?
                chord.arpeggio = arpeggio;
            }

            // Sort standard voicings
            chord.voicings.sort((vA, vB) => {
                const rootA = vA[0].note === chord.root;
                const rootB = vB[0].note === chord.root;

                if (rootA && !rootB) return -1;
                if (!rootA && rootB) return 1;

                const sumA = vA.reduce((sum, n) => sum + n.value, 0);
                const sumB = vB.reduce((sum, n) => sum + n.value, 0);

                return sumA - sumB;
            });
        });

        // Sorting Priority for Chords themselves
        const typePriority = {
            'Minor': 1,
            'Major': 2,
            'Sus2': 3,
            'Sus4': 3,
            '5': 4, // Priority for Power Chords
            'Min7': 5,
            'Maj7': 5,
            '7': 6,
            'Diminished': 7,
            'Dim7': 7,
            'Min7b5': 7
        };

        results.sort((a, b) => {
            const pA = typePriority[a.type] || 99;
            const pB = typePriority[b.type] || 99;

            if (pA !== pB) return pA - pB;

            // If same priority, sort by root alphabetically
            return a.root.localeCompare(b.root);
        });

        return results;
    }

    // --- Audio Engine ---

    // Note to MIDI value mapping for frequency calculation
    const NOTE_TO_MIDI = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 };

    function getFrequencyForNoteName(name) {
        const cleanName = name.replace(/^D:/, '');
        const match = cleanName.match(/^([A-G][#b]?)([0-8])$/);
        if (!match) return 0;
        const note = match[1];
        const octave = parseInt(match[2]);
        const midi = (octave + 1) * 12 + NOTE_TO_MIDI[note];
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function sortNotesByPitch(notes) {
        return [...notes].sort((a, b) => {
            const getMidi = (n) => (n.octave * 12) + (NOTE_TO_MIDI[n.note] || 0);
            return getMidi(a) - getMidi(b);
        });
    }

    function parseNoteName(name) {
        const cleanName = name.replace(/^D:/, '');
        const match = cleanName.match(/^([A-G][#b]?)([0-8])$/);
        if (!match) return null;
        const note = match[1];
        const octave = parseInt(match[2]);
        // NOTE: NOTE_TO_MIDI must be defined before this function is called, or be in scope
        const val = NOTE_TO_MIDI[note] !== undefined ? NOTE_TO_MIDI[note] : 0;
        const midi = (octave + 1) * 12 + val;
        return { note, octave, value: midi - 48 }; // Value relative to C3 (midi 48) for internal logic
    }

    let audioCtx = null;
    let globalTempo = 100;
    let currentLoopId = null;
    let currentPlayBtn = null;
    let nextNoteTime = 0.0; // Precise scheduling time
    let isProgressionPlaying = false;
    let progressionTimeoutId = null;
    let visualTimeouts = []; // Track active visual schedule timeouts
    let progressionState = {
        idx: 0,
        repeat: 0,
        chords: [] // Array of { notes: [] }
    };

    let reverbNode = null;
    let reverbGain = null;

    // init audio context on interaction
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            // Reverb Setup
            reverbNode = audioCtx.createConvolver();
            reverbGain = audioCtx.createGain();
            reverbGain.gain.value = 0.5; // Increased reverb

            // Generate Impulse Response
            const sampleRate = audioCtx.sampleRate;
            const length = sampleRate * 2.0; // 2 seconds tail
            const impulse = audioCtx.createBuffer(2, length, sampleRate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);

            for (let i = 0; i < length; i++) {
                // Decay exponential
                const n = i / length;
                const decay = Math.pow(1 - n, 3);
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

    let activeNodes = []; // Track active oscillators/gain nodes

    function playTone(freq, duration, startTime, suppressVisuals = false) {
        if (!audioCtx) return;

        // Local chain for this note
        const masterGain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200; // Soften the digital "edge"
        filter.Q.value = 0.7;

        filter.connect(masterGain);
        filter.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        if (reverbNode) {
            masterGain.connect(reverbNode); // Wet Send
        }

        const t = Math.max(audioCtx.currentTime, startTime);

        // Handpan Harmonics: Fundamental + Octave + Compound 5th
        const partials = [
            { mult: 1.0, gain: 0.5, type: 'sine' },     // Fundamental
            { mult: 2.0, gain: 0.2, type: 'sine' },     // Octave
            { mult: 3.0, gain: 0.08, type: 'sine' }      // Compound 5th
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

        // ADSR: Sharp "finger impact" attack + natural resonance decay
        masterGain.gain.setValueAtTime(0, t);
        masterGain.gain.linearRampToValueAtTime(0.8, t + 0.003); // 3ms sharp attack (was 0.6/4ms)
        masterGain.gain.exponentialRampToValueAtTime(0.5, t + 0.05); // Rapid decay to body resonance
        masterGain.gain.exponentialRampToValueAtTime(0.001, t + duration); // Long tail

        // Track for cleanup
        const nodeRef = { oscs: nodes, gainNode: masterGain };
        activeNodes.push(nodeRef);

        nodes[0].onended = () => {
            const idx = activeNodes.indexOf(nodeRef);
            if (idx > -1) activeNodes.splice(idx, 1);
        };

        // Trigger Visual
        if (!suppressVisuals) {
            const allNotes = currentScale.top.concat(Object.keys(currentScale.bottom));
            // Find note name from freq with tolerance
            const noteNameFromFreq = allNotes.find(n => Math.abs(getFrequencyForNoteName(n) - freq) < 1.0);
            if (noteNameFromFreq) {
                triggerNoteVisual(noteNameFromFreq, t - audioCtx.currentTime);
            }
        }
    }

    function playTak(t, isAlt = false, isGhost = false, suppressVisuals = false) {
        initAudio();

        if (!window._noiseBuffer) {
            const bufferSize = audioCtx.sampleRate * 0.5;
            window._noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const output = window._noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        }

        const source = audioCtx.createBufferSource();
        source.buffer = window._noiseBuffer;

        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        filter.type = 'highpass';
        // Alternation: T/t (isAlt) shifts frequency slightly
        filter.frequency.value = isAlt ? 2100 : 1800;
        filter.Q.value = isAlt ? 1.5 : 1;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        if (reverbNode) {
            gain.connect(reverbNode); // Wet Send
        }

        // Volume: Boosted significantly for K/T. k/t is 40% of that (was 50%).
        const baseVolume = 0.8;
        const volume = isGhost ? baseVolume * 0.4 : baseVolume;

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        source.start(t);
        source.stop(t + 0.06);

        const nodeRef = { source: source, gainNode: gain };
        activeNodes.push(nodeRef);

        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            filter.disconnect();
            const idx = activeNodes.indexOf(nodeRef);
            if (idx > -1) activeNodes.splice(idx, 1);
        };

        // Trigger Visual
        if (!suppressVisuals) {
            triggerBodyVisual(t - audioCtx.currentTime, isGhost);
        }
    }

    function triggerBodyVisual(delaySeconds = 0, isGhost = false) {
        const ring = document.querySelector('.perc-ring');
        if (!ring) return;

        const trigger = () => {
            if (isGhost) {
                ring.classList.add('ghost-ring');
            } else {
                ring.classList.remove('ghost-ring');
            }
            ring.classList.add('flash');
            setTimeout(() => {
                ring.classList.remove('flash');
                ring.classList.remove('ghost-ring');
            }, 100);
        };

        if (delaySeconds <= 0) {
            trigger();
        } else {
            const timeoutId = setTimeout(trigger, delaySeconds * 1000);
            visualTimeouts.push(timeoutId);
        }
    }

    function triggerNoteVisual(noteName, delaySeconds = 0) {
        const cleanName = noteName.replace(/^D:/, '');
        const el = document.getElementById(`note-${cleanName}`);
        if (!el) return;

        const trigger = () => {
            el.classList.add('note-active');
            const offTimeout = setTimeout(() => {
                el.classList.remove('note-active');
                visualTimeouts = visualTimeouts.filter(id => id !== offTimeout);
            }, 200); // Match animation duration
            visualTimeouts.push(offTimeout);
        };

        if (delaySeconds <= 0) {
            trigger();
        } else {
            const onTimeout = setTimeout(trigger, delaySeconds * 1000);
            visualTimeouts.push(onTimeout);
        }
    }

    function stopPlayback() {
        if (currentLoopId) {
            clearTimeout(currentLoopId);
            currentLoopId = null;
        }
        if (progressionTimeoutId) {
            clearTimeout(progressionTimeoutId);
            progressionTimeoutId = null;
        }

        // Clear all scheduled visuals (Handpan highlights)
        visualTimeouts.forEach(t => clearTimeout(t));
        visualTimeouts = [];

        // Reset Highlights
        document.querySelectorAll('.progression-item.playing-item').forEach(el => el.classList.remove('playing-item'));
        document.querySelectorAll('.hp-note.note-active').forEach(el => el.classList.remove('note-active'));

        if (currentPlayBtn) {
            currentPlayBtn.textContent = 'Play ▶';
            currentPlayBtn.classList.remove('playing');
        }

        const canvasBtn = document.getElementById('canvas-play-btn');
        if (canvasBtn) {
            canvasBtn.classList.remove('playing');
            canvasBtn.setAttribute('title', 'Play Sequence');
            canvasBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        }

        // Reset Progression State
        isProgressionPlaying = false;
        progressionState = { idx: 0, repeat: 0, chords: [] };

        const progBtn = document.getElementById('play-progression-btn');
        if (progBtn) {
            progBtn.textContent = 'Play Sequence ▶';
            progBtn.classList.remove('playing');
        }

        // Immediate Fade Out and Stop
        if (audioCtx) {
            const now = audioCtx.currentTime;
            activeNodes.forEach(node => {
                try {
                    node.gainNode.gain.cancelScheduledValues(now);
                    node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, now);
                    node.gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
                    if (node.oscs) {
                        node.oscs.forEach(osc => osc.stop(now + 0.1));
                    } else if (node.osc) {
                        node.osc.stop(now + 0.1);
                    }
                } catch (e) {
                    // Ignore
                }
            });
            activeNodes = [];
        }
    }

    // Progression Scheduling
    function scheduleProgressionStep() {
        if (!isProgressionPlaying) return;

        // Get controls
        const repeatsInput = document.getElementById('repeat-count');
        const repeatsTarget = repeatsInput ? parseInt(repeatsInput.value) || 2 : 2;

        const pState = progressionState;

        // Safety: chords array might be empty
        if (pState.chords.length === 0) {
            stopPlayback();
            return;
        }

        // Check if finished (wrap around)
        if (pState.idx >= pState.chords.length) {
            pState.idx = 0;
        }

        const chordData = pState.chords[pState.idx];

        // --- VISUAL HIGHLIGHT ---
        // Remove previous highlights
        document.querySelectorAll('.progression-item.playing-item').forEach(el => el.classList.remove('playing-item'));
        // Highlight current
        if (chordData.element) {
            chordData.element.classList.add('playing-item');
        }

        // --- REPEAT LOGIC REFINEMENT ---
        // Priority: Local repeat count > Global repeat count
        const localRepeats = chordData.localRepeats;
        const targetRepeats = localRepeats !== undefined ? localRepeats : repeatsTarget;

        const notes = chordData.notes;

        const beatDuration = 60 / globalTempo;
        const baseNoteDuration = beatDuration / 2; // Default eighth note

        let currentOffset = 0;
        notes.forEach((eventObj) => {
            const durationMult = eventObj.duration || 1;
            const actualDuration = baseNoteDuration * durationMult;
            const scheduledTime = nextNoteTime + currentOffset;

            if (eventObj.isGroup) {
                eventObj.notes.forEach(noteObj => {
                    if (noteObj.type === 'percussion') {
                        playTak(scheduledTime, noteObj.hand === 'T', noteObj.isGhost);
                        return;
                    }
                    if (noteObj.type === 'rest') return; // Should not happen in group usually but safe check

                    const noteName = `${noteObj.note}${noteObj.octave}`;
                    const freq = getFrequencyForNoteName(noteName);
                    if (freq) playTone(freq, 2.4, scheduledTime);
                });
            } else {
                if (eventObj.type === 'percussion') {
                    playTak(scheduledTime, eventObj.hand === 'T', eventObj.isGhost);
                } else if (eventObj.type === 'rest') {
                    // Do nothing, just wait (silence)
                } else {
                    const noteName = `${eventObj.note}${eventObj.octave}`;
                    const freq = getFrequencyForNoteName(noteName);
                    if (freq) playTone(freq, 2.4, scheduledTime);
                }
            }
            currentOffset += actualDuration;
        });

        // Ensure we advance at least a bit to avoid infinite tight loops
        const sequenceLength = Math.max(0.1, currentOffset);

        // Advance Grid
        nextNoteTime += sequenceLength;

        // Logic for next step
        pState.repeat++;
        if (pState.repeat >= targetRepeats) {
            // Move to next chord
            pState.idx++;
            pState.repeat = 0;

            // Loop entire progression if at end
            if (pState.idx >= pState.chords.length) {
                pState.idx = 0;
            }
        }

        // Schedule next call
        const delay = (nextNoteTime - audioCtx.currentTime - 0.1);
        progressionTimeoutId = setTimeout(scheduleProgressionStep, Math.max(10, delay * 1000));
    }

    function toggleProgressionPlayback() {
        const btn = document.getElementById('play-progression-btn');

        if (isProgressionPlaying) {
            stopPlayback();
            return;
        }

        // Start
        stopPlayback(); // clear any other
        initAudio();

        // Gather chords
        const stage = document.getElementById('progression-stage');
        const items = stage.querySelectorAll('.progression-item');
        if (items.length === 0) return;

        const chords = [];
        items.forEach(item => {
            if (item.dataset.notes) {
                try {
                    const notes = JSON.parse(item.dataset.notes);
                    const localRepeats = item.dataset.repeats ? parseInt(item.dataset.repeats) : undefined;
                    chords.push({ notes, localRepeats, element: item });
                } catch (e) { }
            }
        });

        if (chords.length === 0) return;

        isProgressionPlaying = true;
        progressionState = { idx: 0, repeat: 0, chords };

        if (btn) {
            btn.textContent = 'Stop Sequence ■';
            btn.classList.add('playing');
        }

        const canvasBtn = document.getElementById('canvas-play-btn');
        if (canvasBtn) {
            canvasBtn.classList.add('playing');
            canvasBtn.setAttribute('title', 'Stop Sequence');
            canvasBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>';
        }

        nextNoteTime = audioCtx.currentTime + 0.05;
        scheduleProgressionStep();
    }

    // Scheduling Logic to keep time strict (Single Chord Loop)
    // Scheduling Logic to keep time strict (Single Chord Loop)
    function runSequence(notes, btn, container = null) {
        // Safety check if stopped
        if (btn && (!currentPlayBtn || currentPlayBtn !== btn)) return;

        const beatDuration = 60 / globalTempo;
        const noteDuration = beatDuration / 2; // Eighth notes

        // Loop length = total duration of notes
        const sequenceLength = (notes.length * noteDuration);

        // Schedule notes
        notes.forEach((eventObj, index) => {
            const t = nextNoteTime + (index * noteDuration);
            if (eventObj.isGroup) {
                eventObj.notes.forEach(noteObj => {
                    if (noteObj.type === 'percussion') {
                        playTak(t, noteObj.hand === 'T', noteObj.isGhost, !!container);
                        return;
                    }
                    if (noteObj.type === 'rest') return;

                    const noteName = `${noteObj.note}${noteObj.octave}`;
                    const freq = getFrequencyForNoteName(noteName);
                    if (freq) playTone(freq, 3.0, t, !!container); // Longer duration (3.0s), suppress visual if container

                    // Visuals
                    if (container) {
                        const delayMs = (t - audioCtx.currentTime) * 1000;
                        const vId = setTimeout(() => {
                            // Find pills with this note text
                            const pills = container.querySelectorAll('.note-pill, .note-badge');
                            pills.forEach(p => {
                                if (p.textContent === noteName) {
                                    p.classList.add('note-active');
                                    setTimeout(() => p.classList.remove('note-active'), 300);
                                }
                            });
                        }, delayMs);
                        visualTimeouts.push(vId);
                    }
                });
            } else {
                if (eventObj.type === 'percussion') {
                    playTak(t, eventObj.hand === 'T', eventObj.isGhost, !!container);
                } else if (eventObj.type === 'rest') {
                    // Rest
                } else {
                    const noteName = `${eventObj.note}${eventObj.octave}`;
                    const freq = getFrequencyForNoteName(noteName);
                    if (freq) playTone(freq, 3.0, t, !!container); // Longer duration (3.0s)

                    // Visuals
                    if (container) {
                        const delayMs = (t - audioCtx.currentTime) * 1000;
                        const vId = setTimeout(() => {
                            const pills = container.querySelectorAll('.note-pill, .note-badge');
                            pills.forEach(p => {
                                if (p.textContent === noteName) {
                                    p.classList.add('note-active');
                                    setTimeout(() => p.classList.remove('note-active'), 300);
                                }
                            });
                        }, delayMs);
                        visualTimeouts.push(vId);
                    }
                }
            }
        });

        // Loop Logic
        if (btn) {
            // Advance the grid
            nextNoteTime += sequenceLength;

            // Calculate delay until we need to schedule next loop
            const delay = (nextNoteTime - audioCtx.currentTime - 0.1);

            // Wait
            currentLoopId = setTimeout(() => {
                runSequence(notes, btn, container);
            }, Math.max(10, delay * 1000));
        }
    }

    function playArpeggio(notes, btn = null) {
        initAudio();

        // Handle Toggle
        if (btn && currentPlayBtn === btn) {
            stopPlayback();
            return;
        }

        stopPlayback();

        let container = null;
        if (btn) {
            currentPlayBtn = btn;
            currentPlayBtn.textContent = 'Stop ■';
            currentPlayBtn.classList.add('playing');
            // Determine context for visualization
            container = btn.closest('.voicing-row-large') || btn.closest('.card-main') || null;
        }

        nextNoteTime = audioCtx.currentTime + 0.05;
        runSequence(notes, btn, container);
    }

    // --- Data & Initialization ---

    let ALL_CHORDS = [];

    // Controls Init
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValue = document.getElementById('bpm-value');

    if (bpmSlider) {
        bpmSlider.addEventListener('input', (e) => {
            globalTempo = parseInt(e.target.value);
            bpmValue.textContent = globalTempo;
        });
        globalTempo = parseInt(bpmSlider.value);
    }
    const progPlayBtn = document.getElementById('play-progression-btn');
    if (progPlayBtn) {
        progPlayBtn.addEventListener('click', toggleProgressionPlayback);
    }

    const addCustomBtn = document.getElementById('add-custom-chord');
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', () => {
            openEditorModal(null); // Open editor for NEW item
        });
    }
    // --- UI Rendering ---

    const grid = document.querySelector('.card-grid');
    const inspirationsList = document.getElementById('inspirations-list');

    // Create Modal Element if not exists
    let modalOverlay = document.getElementById('voicing-modal');

    // ... (modal creation code is below, unchanged) ...

    // Helper to get note value (0-11) from name
    function getNoteValueByName(name) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return notes.indexOf(name);
    }

    function sortNotesRelativeToRoot(noteNames, root) {
        const rootNote = parseNoteName(root);
        if (!rootNote) return noteNames;
        const rootVal = rootNote.value;
        return noteNames.sort((a, b) => {
            if (a === root) return -1;
            if (b === root) return 1;

            const nA = parseNoteName(a);
            const nB = parseNoteName(b);
            if (!nA || !nB) return 0;

            const valA = nA.value;
            const valB = nB.value;

            // Distance from root
            let distA = (valA - rootVal + 12) % 12;
            let distB = (valB - rootVal + 12) % 12;

            return distA - distB;
        });
    }

    function renderHandpanSVG() {
        const svg = document.getElementById('handpan-svg');
        if (!svg) return;

        svg.innerHTML = '';

        // Main Body
        const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        body.setAttribute("cx", "200");
        body.setAttribute("cy", "200");
        body.setAttribute("r", "165");
        body.classList.add("hp-body");
        svg.appendChild(body);

        // Percussion Visualizer Ring (Dotted/Dashed, hidden by default)
        const percRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        percRing.setAttribute("cx", "200");
        percRing.setAttribute("cy", "200");
        percRing.setAttribute("r", "64"); // Increased radius
        percRing.setAttribute("fill", "none");
        percRing.classList.add("perc-ring");
        svg.appendChild(percRing);

        // Bottom Side Notes Marker (Dashed line)
        const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        marker.setAttribute("cx", "200");
        marker.setAttribute("cy", "200");
        marker.setAttribute("r", "185");
        marker.setAttribute("fill", "none");
        marker.setAttribute("stroke", "var(--glass-border)");
        marker.setAttribute("stroke-dasharray", "4 4");
        marker.setAttribute("opacity", "0.4");
        svg.appendChild(marker);

        const topNotes = currentScale.top;
        const dingName = topNotes[0];
        const sideNotes = sortNotesByPitch(topNotes.slice(1));

        const nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.appendChild(nodesGroup);

        const notePositions = {};

        // Render Ding
        const dingG = createNoteG(dingName, 200, 200, 43, true);
        nodesGroup.appendChild(dingG);
        notePositions[dingName] = { x: 200, y: 200 };

        // Render Top Side Notes with Even Zigzag Layout
        const radius = 110;
        const N = sideNotes.length;
        const stepAngle = (2 * Math.PI) / N;

        sideNotes.forEach((name, i) => {
            // Check if it's a ding (explicit "D:" or matching known ding list if specific logic existed, but "D:" is safe)
            const isExtraDing = name.startsWith('D:');

            // Direction: 1 for Left (CCW), -1 for Right (CW)
            const direction = (i % 2 === 1) ? 1 : -1;
            const stepCount = Math.ceil(i / 2);

            // Start at bottom (PI/2), zigzag out from there
            const angle = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);

            const x = 200 + radius * Math.cos(angle);
            const y = 200 + radius * Math.sin(angle);

            // Larger radius for extra dings (36 vs 30)
            const r = isExtraDing ? 38 : 30;
            const g = createNoteG(name, x, y, r, isExtraDing);
            nodesGroup.appendChild(g);
            notePositions[name] = { x, y };
        });

        // Render Bottom Notes
        Object.entries(currentScale.bottom).forEach(([note, parent]) => {
            const parentPos = notePositions[parent];
            if (!parentPos) return;

            const dx = parentPos.x - 200;
            const dy = parentPos.y - 200;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const outerRadius = 185;
            const x = 200 + (dx / dist) * outerRadius;
            const y = 200 + (dy / dist) * outerRadius;

            const isExtraDing = note.startsWith('D:');
            const r = isExtraDing ? 30 : 22; // Larger for bottom ding (30 vs 22)

            const g = createNoteG(note, x, y, r, isExtraDing, true);
            nodesGroup.appendChild(g);
        });

        function createNoteG(name, x, y, r, isDing = false, isBottom = false) {
            const displayName = name.replace(/^D:/, '');
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.id = `note-${displayName}`; // Use clean name for ID so animations work
            g.classList.add("hp-note");
            if (isDing) g.classList.add("ding");
            if (isBottom) g.classList.add("side-note");
            g.setAttribute("data-note", name);

            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", x);
            circle.setAttribute("cy", y);
            circle.setAttribute("r", r);
            circle.classList.add("note-area");
            g.appendChild(circle);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", x);
            text.setAttribute("y", y + (r * 0.15));
            text.setAttribute("text-anchor", "middle");
            text.classList.add(r < 25 ? "note-label-small" : "note-label");
            text.textContent = displayName;
            g.appendChild(text);

            g.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                const freq = getFrequencyForNoteName(displayName);
                if (freq) {
                    initAudio();
                    playTone(freq, 2.4, audioCtx.currentTime);
                }
            });
            return g;
        }
    }

    function loadScale(scale) {
        currentScale = scale;
        localStorage.setItem('lastScaleId', scale.id);
        localStorage.setItem('lastSelectedScale', JSON.stringify(scale));
        const allNotes = [...scale.top, ...Object.keys(scale.bottom)];
        HANDPAN_NOTES = allNotes.map(n => parseNoteName(n)).filter(n => n !== null);

        const titleDisplay = document.getElementById('current-scale-display');
        if (titleDisplay) {
            const bottomNotes = Object.keys(scale.bottom).join(' ');
            titleDisplay.textContent = bottomNotes ? `${scale.name} • ${bottomNotes}` : scale.name;
        }

        ALL_CHORDS = generateChords();
        renderChords(ALL_CHORDS);
        renderHandpanSVG();
        clearProgression(); // Clear progression when scale changes
    }

    function init() {
        const vizToggleBtn = document.getElementById('viz-toggle');
        const vizSection = document.getElementById('visualizer-section');

        // Initial Load from merged list
        loadScale(currentScale);
        renderInspirations();

        // Theme Init
        const savedTheme = localStorage.getItem('theme') || 'light';
        const themeBtn = document.getElementById('theme-toggle');

        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            if (themeBtn) themeBtn.textContent = '🌙';
        } else {
            document.body.classList.remove('dark-mode');
            if (themeBtn) themeBtn.textContent = '🌞';
        }

        if (vizToggleBtn && vizSection) {
            vizToggleBtn.addEventListener('click', () => {
                const isCollapsed = vizSection.classList.toggle('collapsed');
                vizToggleBtn.classList.toggle('open', !isCollapsed);
            });
        }
    }

    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            themeToggleBtn.textContent = isDark ? '🌙' : '🌞';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    // --- Scale Management ---

    function openScaleModal() {
        const modal = document.getElementById('scale-modal');
        const overlay = document.getElementById('modal-overlay');
        const list = document.getElementById('scale-list');
        const headerTitle = modal.querySelector('h2');
        if (!modal || !list || !overlay) return;

        function renderTemplates() {
            headerTitle.textContent = 'Select Scale Type';
            list.innerHTML = '';

            // Section: Template Library
            const libraryHeader = document.createElement('div');
            libraryHeader.className = 'scale-list-section-header';
            libraryHeader.textContent = 'Scale Library';
            list.appendChild(libraryHeader);

            SCALE_TEMPLATES.forEach(template => {
                const item = document.createElement('div');
                item.className = 'scale-item template-item';
                item.innerHTML = `
                    <div class="scale-item-main">
                        <strong>${template.name}</strong>
                        <div class="scale-info-notes">${template.type}</div>
                    </div>
                    <div class="scale-item-actions">
                        <span class="chevron">›</span>
                    </div>
                `;
                item.onclick = () => renderKeys(template);
                list.appendChild(item);
            });

            // Section: Your Custom Instruments
            if (customScales.length > 0) {
                const customHeader = document.createElement('div');
                customHeader.className = 'scale-list-section-header';
                customHeader.textContent = 'Custom Instruments';
                list.appendChild(customHeader);

                customScales.forEach(scale => {
                    const item = document.createElement('div');
                    item.className = `scale-item ${scale.id === currentScale.id ? 'active' : ''}`;
                    item.innerHTML = `
                        <div class="scale-item-main">
                            <strong>${scale.name}</strong>
                            <div class="scale-info-notes">${scale.top.join(' ')}</div>
                        </div>
                        <div class="scale-item-actions">
                            <button class="scale-action-btn edit" title="Edit Scale">✎</button>
                            <button class="scale-action-btn delete" title="Delete Scale">×</button>
                            ${scale.id === currentScale.id ? '<span class="active-tag">✓</span>' : ''}
                        </div>
                    `;
                    item.querySelector('.scale-item-main').onclick = () => {
                        loadScale(scale);
                        closeModal(modal);
                        closeModal(overlay);
                    };
                    item.querySelector('.scale-action-btn.edit').onclick = (e) => {
                        e.stopPropagation();
                        openCustomModal(scale);
                    };
                    item.querySelector('.scale-action-btn.delete').onclick = (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${scale.name}"?`)) {
                            deleteScale(scale.id);
                        }
                    };
                    list.appendChild(item);
                });
            }
        }

        function renderKeys(template) {
            headerTitle.innerHTML = `<span class="back-link">‹</span> Select Key for ${template.name}`;
            headerTitle.querySelector('.back-link').onclick = renderTemplates;

            list.innerHTML = '';
            const keyGrid = document.createElement('div');
            keyGrid.className = 'key-selection-grid';

            template.keys.forEach(key => {
                const btn = document.createElement('button');
                btn.className = 'key-badge-btn';
                btn.textContent = key;
                btn.onclick = () => {
                    const scale = generateScaleFromTemplate(template, key);
                    loadScale(scale);
                    closeModal(modal);
                    closeModal(overlay);
                };
                keyGrid.appendChild(btn);
            });

            list.appendChild(keyGrid);
        }

        renderTemplates();
        modal.classList.add('active');
        overlay.classList.add('active');
    }

    function generateScaleFromTemplate(template, dingKey) {
        // Base MIDI for C3 = 48
        const noteMap = { 'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11 };

        // Find suitable octave for Ding (usually 3)
        let rootOffset = noteMap[dingKey];
        if (rootOffset === undefined) rootOffset = 2; // Default to D if weird

        const dingMIDI = 48 + rootOffset;
        const dingName = getNoteFromMIDI(dingMIDI);

        const top = [dingName];
        template.formula.forEach(offset => {
            top.push(getNoteFromMIDI(dingMIDI + offset));
        });

        return {
            id: `auto-${template.name.toLowerCase()}-${dingKey.toLowerCase()}`,
            name: `${dingKey} ${template.name}`,
            top: top,
            bottom: {}
        };
    }

    function getNoteFromMIDI(midi) {
        const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        const octave = Math.floor(midi / 12) - 1;
        const name = names[midi % 12];
        return `${name}${octave}`;
    }

    function openCustomModal(scaleToEdit = null) {
        const modal = document.getElementById('custom-scale-modal');
        const overlay = document.getElementById('modal-overlay');
        const nameInput = document.getElementById('custom-scale-name');
        const topInput = document.getElementById('custom-scale-top');
        const bottomInput = document.getElementById('custom-scale-bottom');
        const saveBtn = document.getElementById('save-custom-scale');

        if (scaleToEdit) {
            modal.dataset.editId = scaleToEdit.id;
            nameInput.value = scaleToEdit.name;
            topInput.value = scaleToEdit.top.join(' ');

            // Format bottom notes: Note(Parent)
            const bottomParts = Object.entries(scaleToEdit.bottom).map(([note, parent]) => `${note}(${parent})`);
            bottomInput.value = bottomParts.join(' ');
            saveBtn.textContent = 'Update Handpan';
        } else {
            delete modal.dataset.editId;
            nameInput.value = '';
            topInput.value = '';
            bottomInput.value = '';
            saveBtn.textContent = 'Build My Handpan!';
        }

        if (modal && overlay) {
            modal.classList.add('active');
            overlay.classList.add('active');
        }
    }

    function deleteScale(id) {
        customScales = customScales.filter(s => s.id !== id);
        localStorage.setItem('customScales', JSON.stringify(customScales));

        // If current scale was deleted, fallback to default
        if (currentScale.id === id) {
            loadScale(PREDEFINED_SCALES[0]);
        }

        openScaleModal(); // Re-render list
    }

    function saveCustomScale() {
        const modal = document.getElementById('custom-scale-modal');
        const nameInput = document.getElementById('custom-scale-name');
        const topInput = document.getElementById('custom-scale-top');
        const bottomInput = document.getElementById('custom-scale-bottom');
        const editId = modal.dataset.editId;

        if (!nameInput.value || !topInput.value) {
            alert('Please provide at least a name and top shell notes.');
            return;
        }

        const topNotes = topInput.value.trim().split(/\s+/);
        // Clean up notes (ensure they match the format A4, Bb4 etc)

        const bottom = {};
        if (bottomInput.value.trim()) {
            const bottomParts = bottomInput.value.trim().split(/\s+/);
            bottomParts.forEach(part => {
                // Support D:Note(Parent)
                const match = part.match(/^((?:D:)?[A-G][#b]?\d)\((.+)\)$/);
                if (match) {
                    bottom[match[1]] = match[2];
                }
            });
        }

        const newScale = {
            id: editId || ('custom-' + Date.now()),
            name: nameInput.value,
            top: topNotes,
            bottom: bottom
        };

        if (editId) {
            const idx = customScales.findIndex(s => s.id === editId);
            if (idx > -1) customScales[idx] = newScale;
        } else {
            customScales.push(newScale);
        }

        localStorage.setItem('customScales', JSON.stringify(customScales));
        loadScale(newScale);

        // Cleanup and close
        nameInput.value = '';
        topInput.value = '';
        bottomInput.value = '';
        closeModal(document.getElementById('custom-scale-modal'));
        closeModal(document.getElementById('scale-modal'));
        closeModal(document.getElementById('modal-overlay'));
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('active');
        if (modal.classList.contains('modal-overlay')) {
            modal.style.display = 'none';
        }
    }

    // Modal Events
    document.getElementById('scale-picker-trigger')?.addEventListener('click', openScaleModal);

    document.getElementById('close-scale-modal')?.addEventListener('click', () => {
        closeModal(document.getElementById('scale-modal'));
        closeModal(document.getElementById('modal-overlay'));
    });

    document.getElementById('btn-custom-scale')?.addEventListener('click', () => openCustomModal());

    document.getElementById('close-custom-modal')?.addEventListener('click', () => {
        closeModal(document.getElementById('custom-scale-modal'));
        closeModal(document.getElementById('modal-overlay'));
    });

    document.getElementById('canvas-play-btn')?.addEventListener('click', toggleProgressionPlayback);

    document.getElementById('modal-overlay')?.addEventListener('click', () => {
        closeModal(document.getElementById('scale-modal'));
        closeModal(document.getElementById('custom-scale-modal'));
        closeModal(document.getElementById('voicing-modal'));
        closeModal(document.getElementById('editor-modal'));
        closeModal(document.getElementById('modal-overlay'));
    });

    document.getElementById('save-custom-scale')?.addEventListener('click', saveCustomScale);

    document.getElementById('canvas-play-btn')?.addEventListener('click', toggleProgressionPlayback);

    // Escape Key Support
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(document.getElementById('scale-modal'));
            closeModal(document.getElementById('custom-scale-modal'));
            closeModal(document.getElementById('voicing-modal'));
            closeModal(document.getElementById('editor-modal'));

            // Special handling for the main overlay
            closeModal(document.getElementById('modal-overlay'));

            // Stop any active preview audio
            stopPlayback();
        }
    });

    function renderInspirations() {
        if (!inspirationsList) return;
        inspirationsList.innerHTML = '';

        PROGRESSIONS.forEach(prog => {
            const chip = document.createElement('button');
            chip.className = 'inspiration-chip';
            chip.innerHTML = `
                <span class="chip-name">${prog.name}</span>
                <span class="chip-chords">${prog.chords.map(c => c.split(' ')[0]).join(' - ')}</span>
            `;

            chip.title = prog.desc;

            chip.addEventListener('click', () => {
                loadProgression(prog.chords);
            });

            inspirationsList.appendChild(chip);
        });
    }

    function loadProgression(chordNames) {
        const stage = document.getElementById('progression-stage');

        // Remove existing items first
        while (stage.firstChild) {
            stage.removeChild(stage.firstChild);
        }

        chordNames.forEach(name => {
            // Find chord object
            // Name in chord object is ".root .type" e.g. "E Minor", "D Sus2"
            // Our map keys are "Root Type"

            // Adjust search to match exact name or close enough
            const target = ALL_CHORDS.find(c => {
                // Construct name from root + type to be sure, or use c.name
                return c.name === name;
            });

            if (target) {
                // Add base chord (not specific voicing for simple preset)
                addToProgression(target);
            }
        });
    }
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'voicing-modal';
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.display = 'none';
        modalOverlay.innerHTML = `
            <div class="modal-content glass-card">
                <div class="modal-header">
                    <h2 id="modal-title">Chord Name</h2>
                    <button id="modal-close" class="close-btn">&times;</button>
                </div>
                <div id="modal-body" class="modal-body">
                    <!-- Voicings go here -->
                </div>
            </div>
        `;
        document.body.appendChild(modalOverlay);

        // Close handlers
        const closeBtn = modalOverlay.querySelector('#modal-close');
        closeBtn.addEventListener('click', () => {
            modalOverlay.style.display = 'none';
            stopPlayback();
        });
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.style.display = 'none';
                stopPlayback();
            }
        });
    }

    // --- Editor Modal ---
    let editorModal = document.getElementById('editor-modal');
    if (!editorModal) {
        editorModal = document.createElement('div');
        editorModal.id = 'editor-modal';
        editorModal.className = 'modal-overlay';
        editorModal.style.zIndex = '2000'; // Above voicing modal
        editorModal.style.display = 'none';
        editorModal.innerHTML = `
            <div class="modal-content glass-card" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Edit Arpeggio</h2>
                    <button id="editor-close" class="close-btn">&times;</button>
                </div>
                <div class="modal-body" style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="editor-name" placeholder="Part Name (e.g. Intro)" style="flex: 1; background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-main); padding: 8px; border-radius: 6px; font-size: 1rem;">
                    </div>
                    <p style="font-size: 0.9rem; opacity: 0.8;">Enter notes separated by spaces (e.g. "E3 G3 B3"). These notes will be played in order.</p>
                    <textarea id="editor-input" rows="6" style="width: 100%; background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-main); padding: 10px; border-radius: 8px; font-family: monospace; font-size: 1.1rem; resize: vertical;"></textarea>
                    
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="font-size: 0.9rem; opacity: 0.8;">Repeats:</label>
                        <input type="number" id="editor-repeats" min="1" max="16" style="width: 60px; background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-main); padding: 5px; border-radius: 4px;">
                        <span style="font-size: 0.7rem; opacity: 0.5;">Overrides global sequence</span>
                    </div>

                    <button id="editor-save-btn" class="premium-btn" style="align-self: flex-end;">Save Changes</button>
                </div>
            </div>
        `;
        document.body.appendChild(editorModal);

        const closeEd = editorModal.querySelector('#editor-close');
        closeEd.addEventListener('click', () => {
            editorModal.style.display = 'none';
        });

        // Close on background click
        editorModal.addEventListener('click', (e) => {
            if (e.target === editorModal) editorModal.style.display = 'none';
        });
    }

    let currentEditItem = null;
    const editorName = document.getElementById('editor-name');
    const editorInput = document.getElementById('editor-input');
    const editorRepeats = document.getElementById('editor-repeats');
    const editorSaveBtn = document.getElementById('editor-save-btn');

    editorSaveBtn.addEventListener('click', () => {
        const rawText = editorInput.value.trim();
        const validNotes = parseRhythmString(rawText);
        const repeatsVal = parseInt(editorRepeats.value);

        if (validNotes.length === 0) {
            // Close without adding if empty
            editorModal.style.display = 'none';
            return;
        }

        if (currentEditItem) {
            // Update Existing Item
            // Update Name
            const label = currentEditItem.querySelector('.prog-label');
            if (label) label.textContent = editorName.value.trim() || 'Part';

            currentEditItem.dataset.notes = JSON.stringify(validNotes);
            currentEditItem.dataset.sourceText = rawText;

            if (!isNaN(repeatsVal) && repeatsVal > 0) {
                currentEditItem.dataset.repeats = repeatsVal;
            } else {
                delete currentEditItem.dataset.repeats;
            }

            const notesContainer = currentEditItem.querySelector('.prog-notes');
            if (notesContainer) {
                notesContainer.innerHTML = generateTruncatedNotesHTML(validNotes);
            }

            let b = currentEditItem.querySelector('.repeat-badge');
            if (repeatsVal > 1) { // Only show if > 1
                if (!b) {
                    b = document.createElement('div');
                    b.className = 'repeat-badge';
                    currentEditItem.appendChild(b);
                }
                b.textContent = `x${repeatsVal}`;
            } else if (b) {
                b.remove();
            }
        } else {
            // Create New Item from "plus" flow
            addToProgression(
                null,
                validNotes,
                editorName.value.trim() || undefined, // Use input name or auto-generate
                rawText
            );
            // After creation, we might want to apply the repeats to the NEW item
            const stage = document.getElementById('progression-stage');
            const newItem = stage.lastElementChild;
            if (newItem && repeatsVal > 1) { // Only show if > 1
                newItem.dataset.repeats = repeatsVal;
                const b = document.createElement('div');
                b.className = 'repeat-badge';
                b.textContent = `x${repeatsVal}`;
                newItem.appendChild(b);
            }
        }

        editorModal.style.display = 'none';
        currentEditItem = null;
    });

    function generateTruncatedNotesHTML(notes) {
        const renderEvent = (evt) => {
            const renderN = (n) => {
                if (n.type === 'percussion') return n.isGhost ? n.hand.toLowerCase() : n.hand;
                if (n.type === 'rest') return '-';
                return (n.note + n.octave);
            };

            if (evt.isGroup) {
                return `<span class="note-group">${evt.notes.map(renderN).join('|')}</span>`;
            }
            if (evt.type === 'percussion') return `<span class="tiny-note percussive">${renderN(evt)}</span>`;
            if (evt.type === 'rest') return `<span class="tiny-note rest" style="opacity:0.5">-</span>`;
            return `<span class="tiny-note">${evt.note}${evt.octave}</span>`;
        };

        const textRep = notes.map(n => {
            if (n.isGroup) return 'GRP';
            if (n.type === 'percussion') return n.hand;
            if (n.type === 'rest') return '-';
            return (n.note && n.octave) ? (n.note + n.octave) : 'N';
        }).join(' ');

        if (textRep.length > 25) {
            const limit = 6;
            if (notes.length > limit) {
                const visibleNotes = notes.slice(0, limit);
                return visibleNotes.map(renderEvent).join(' ') + ' <span style="opacity:0.6; margin-left:4px;">...</span>';
            }
        }
        return notes.map(renderEvent).join(' ');
    }

    function parseRhythmString(text) {
        const result = [];
        // Tokenize: Match groups like (A B)/N or individual words
        // Regex: 
        // 1. Group: \([^\)]+\)\/\d+  -> matches ( ... )/Digits
        // 2. Word: [^\s]+
        const regex = /(\([^\)]+\)\/\d+|[^\s]+)/g;
        const tokens = text.match(regex) || [];

        tokens.forEach(token => {
            // Check for group
            const groupMatch = token.match(/^\(([^\)]+)\)\/(\d+)$/);
            if (groupMatch) {
                const content = groupMatch[1];
                const divisor = parseInt(groupMatch[2], 10);
                const subTokens = content.split(/\s+/);

                const multiplier = 1 / divisor;

                subTokens.forEach(sub => {
                    const event = parseNoteToken(sub);
                    if (event) {
                        event.duration = multiplier;
                        result.push(event);
                    }
                });
            } else {
                // Single note or group Note1|Note2
                const event = parseNoteToken(token);
                if (event) {
                    event.duration = 1;
                    result.push(event);
                }
            }
        });
        return result;
    }

    function getSortedScaleNotes() {
        // Collect all notes from current scale
        const allNotes = [];
        const topNotes = currentScale.top || [];
        const bottomNotes = currentScale.bottom ? Object.keys(currentScale.bottom) : [];

        // Helper to parse note string "E3" or "D:F#3" -> {note, octave, freq, isDing}
        const parse = (nStr) => {
            let isExplicitDing = false;
            let cleanStr = nStr;

            if (cleanStr.startsWith('D:')) {
                isExplicitDing = true;
                cleanStr = cleanStr.substring(2);
            }

            const m = cleanStr.match(/^([A-G][#b]?)(\d)$/);
            if (!m) return null;
            return {
                note: m[1],
                octave: parseInt(m[2]),
                freq: getFrequencyForNoteName(cleanStr),
                name: cleanStr,
                isDing: isExplicitDing
            };
        };

        [...topNotes, ...bottomNotes].forEach(n => {
            const p = parse(n);
            if (p) allNotes.push(p);
        });

        // Sort by frequency (pitch)
        allNotes.sort((a, b) => a.freq - b.freq);

        if (allNotes.length === 0) return { dings: [], toneCircle: [] };

        // Identify Dings

        // 1. The Main Ding is ALWAYS the first note of Top Shell (per user requirement)
        const mainDingNameRaw = currentScale.top[0];
        // We need to match this raw name against our parsed notes (which might have D: stripped if we parsed it?)
        // Actually, our 'parse' helper in this function returns 'name' as the clean name if D: was stripped?
        // Wait, let's check parse() in getSortedScaleNotes again.
        // It returns .name = cleanStr. 
        // So if top[0] is "E3", distinct from "D:F#3".
        // But top[0] usually doesn't have D: prefix in standard scales.
        // In "Alex E Amara", top[0] is "E3".

        // Let's find the note object that matches the Main Ding's pitch/name
        // We can't just rely on name string match if there's normalization.
        // But getFrequencyForNoteName handles it.
        // Let's find the note in allNotes that corresponds to top[0].

        // Better strategy:
        // Filter out the Main Ding from allNotes first.

        const mainDingObj = allNotes.find(n => n.name === mainDingNameRaw || n.name === mainDingNameRaw.replace('D:', ''));

        let dings = [];
        if (mainDingObj) {
            dings.push(mainDingObj);
        }

        // 2. Find other notes marked as Ding (isDing = true), EXCLUDING the main ding we just added
        const otherDings = allNotes.filter(n => n.isDing && n !== mainDingObj);
        // Sort other dings by pitch for consistency? (User didn't specify, but good practice).
        otherDings.sort((a, b) => a.freq - b.freq);
        dings.push(...otherDings);

        // 3. Tone Circle is everything else
        let toneCircle = allNotes.filter(n => !dings.includes(n));

        // Sort tone circle by pitch (already sorted in allNotes, but safe to ensure)
        toneCircle.sort((a, b) => a.freq - b.freq);

        return { dings, toneCircle };
    }

    function parseNoteToken(token) {
        // Support Note1|Note2|Note3 or special tokens like K, T, k, t
        const parts = token.split('|');
        const noteGroup = [];

        parts.forEach(p => {
            const raw = p.trim();
            const clean = raw.toUpperCase();

            if (clean === 'K' || clean === 'T') {
                noteGroup.push({
                    type: 'percussion',
                    hand: clean, // K or T
                    isGhost: raw === 'k' || raw === 't'
                });
                return;
            }

            // Rest logic
            if (clean === '-') {
                noteGroup.push({
                    type: 'rest',
                    duration: 1
                });
                return;
            }

            // Check for Number Notation or Ding
            const numberMatch = raw.match(/^(\d+|D)$/i);
            if (numberMatch) {
                const symbol = numberMatch[1].toUpperCase();
                const sorted = getSortedScaleNotes();

                if (symbol === 'D' || symbol === '0') {
                    // Main Ding (lowest note)
                    if (sorted.dings.length > 0) {
                        // Return the main (lowest) ding
                        // Sort dings by frequency just in case
                        sorted.dings.sort((a, b) => a.freq - b.freq);
                        noteGroup.push(sorted.dings[0]);
                    }
                } else {
                    // Tone Circle Number (1-based index)
                    const idx = parseInt(symbol) - 1;
                    if (idx >= 0 && idx < sorted.toneCircle.length) {
                        noteGroup.push(sorted.toneCircle[idx]);
                    }
                }
                return;
            }

            const match = raw.match(/^([A-G][#b]?)(\d)$/i);
            if (match) {
                noteGroup.push({
                    note: match[1].toUpperCase(),
                    octave: parseInt(match[2])
                });
            }
        });

        if (noteGroup.length > 0) {
            return {
                isGroup: true,
                notes: noteGroup
            };
        }
        return null;
    }
    function openEditorModal(item) {
        currentEditItem = item;

        // Reset fields
        editorName.value = '';
        editorInput.value = '';

        // Default repeats 
        const globalRepeats = document.getElementById('repeat-count')?.value || 2;
        editorRepeats.value = '1';

        if (item) {
            // Populate Name
            const label = item.querySelector('.prog-label');
            if (label) editorName.value = label.textContent;

            // Prefer source text if available to preserve notation
            if (item.dataset.sourceText) {
                editorInput.value = item.dataset.sourceText;
            } else {
                // Fallback: reconstruct from JSON
                let events = [];
                try {
                    events = JSON.parse(item.dataset.notes);
                } catch (e) { }

                const renderNote = (n) => {
                    if (n.type === 'percussion') return n.isGhost ? n.hand.toLowerCase() : n.hand;
                    if (n.type === 'rest') return '-';
                    return `${n.note}${n.octave}`;
                }
                const text = events.map(evt => {
                    if (evt.isGroup) {
                        return evt.notes.map(renderNote).join('|');
                    }
                    // If top-level rest
                    if (evt.type === 'rest') return '-';
                    return renderNote(evt);
                }).join(' ');
                editorInput.value = text;
            }
            editorRepeats.value = item.dataset.repeats || 1;
            // Duplicate logic moved to item itself
        } else {
            // New item. Auto-suggest name
            const pContainer = document.getElementById('progression-stage');
            const count = pContainer ? pContainer.querySelectorAll('.progression-item').length : 0;
            const nextChar = String.fromCharCode(65 + (count % 26)); // A, B, C...
            editorName.value = nextChar;

            editorName.value = nextChar;

            editorName.value = nextChar;

            editorRepeats.value = 1;
        }

        editorModal.style.display = 'flex';
        editorInput.focus();
    }
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    function renderChords(chords) {
        grid.innerHTML = '';

        if (chords.length === 0) {
            grid.innerHTML = '<p style="color:white; text-align:center; grid-column: 1/-1;">No standard chords found with these notes.</p>';
            return;
        }

        chords.forEach(chord => {
            const card = document.createElement('div');
            card.className = 'glass-card chord-card compact';

            // Add type-specific class for color coding
            const cType = chord.type;
            if (cType === 'Major' || cType === 'Maj7') card.classList.add('type-major');
            else if (cType === 'Minor' || cType === 'Min7') card.classList.add('type-minor');
            else if (cType.includes('Sus')) card.classList.add('type-sus');
            else if (cType === '5') card.classList.add('type-power');
            else if (cType === '7' || cType.includes('Dim') || cType === 'Min7b5') card.classList.add('type-seventh');

            const baseNotes = [...new Set(chord.notes.map(n => n.note))];
            // Sort relative to root
            const sortedNotes = sortNotesRelativeToRoot(baseNotes, chord.root);

            const noteBadges = sortedNotes.map(n => `<span class="note-badge">${n}</span>`).join('');

            card.innerHTML = `
                <div class="card-main">
                    <div class="card-info">
                        <div class="card-title-row">
                            <h2>${chord.root} <span style="font-weight:300; font-size: 0.9em; opacity: 0.9;">${chord.type}</span></h2>
                        </div>
                        <div class="card-notes-row">
                            ${noteBadges}
                        </div>
                    </div>
                    <div class="card-actions">
                        <button class="add-btn premium-btn-small" title="Add to progression">+</button>
                        <button class="expand-btn" title="Show voicings">▼</button>
                    </div>
                </div>
            `;

            // Listeners
            card.querySelector('.add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                addToProgression(chord);
            });

            const expandBtn = card.querySelector('.expand-btn');

            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openVoicingModal(chord);
            });

            // Play on card click logic if desire, or just expand?
            // Let's keep card click for play? Or just expand?
            // User requested expand on arrow. 
            // Let's make whole card click play main voicing?
            card.addEventListener('click', () => {
                playChordStub(chord, 0);
            });

            grid.appendChild(card);
        });
    }

    function openVoicingModal(chord) {
        modalTitle.innerHTML = `${chord.root} ${chord.type}`;
        modalBody.innerHTML = '';

        const sortedScale = getSortedScaleNotes();
        const dings = sortedScale.dings.map(d => d.name); // Get names of dings

        // Helper to render a row
        const renderRow = (notes, label, index) => {
            // Sort notes by pitch before rendering
            const sortedByPitch = sortNotesByPitch(notes);

            const row = document.createElement('div');
            row.className = 'voicing-row-large';
            if (label === 'Full Arpeggio') {
                row.classList.add('arpeggio-highlight');
            }

            const notesHTML = sortedByPitch.map(n => {
                const noteStr = `${n.note}${n.octave}`;
                const isDing = dings.includes(noteStr);
                const dingClass = isDing ? 'ding-note' : '';
                return `<span class="note-pill ${dingClass}">${noteStr}</span>`;
            }).join('');

            row.innerHTML = `
                <div class="voicing-info">
                    <span class="voicing-label">${label}</span>
                    <div class="voicing-notes-container">${notesHTML}</div>
                </div>
                <div class="voicing-actions">
                    <button class="add-variant-btn premium-btn-small" title="Add this variant to progression" style="width: 32px; height: 32px; font-size: 1.2rem;">+</button>
                    <button class="play-btn-large">Play ▶</button>
                </div>
             `;

            // Play logic
            row.querySelector('.play-btn-large').addEventListener('click', (e) => {
                playArpeggio(sortedByPitch, e.target);
            });

            // Add to progression logic
            row.querySelector('.add-variant-btn').addEventListener('click', () => {
                // Use the chord name if available, otherwise construct it
                const variantName = chord.name || `${chord.root} ${chord.type}`;
                addToProgression(chord, sortedByPitch, variantName);
                modalOverlay.style.display = 'none';
                stopPlayback();
            });

            modalBody.appendChild(row);
        };

        // 1. Render Arpeggio first (if exists)
        if (chord.arpeggio) {
            renderRow(chord.arpeggio, 'Full Arpeggio', -1);
        }

        // 2. Render standard voicings
        chord.voicings.forEach((voicing, index) => {
            renderRow(voicing, `Option ${index + 1}`, index);
        });

        modalOverlay.style.display = 'flex';
    }

    function addToProgression(chord, specificNotes = null, label = null, rawText = null) {
        const item = document.createElement('div');
        item.className = 'progression-item glass-card-small';
        item.draggable = true;

        // Use specific notes if provided (from modal), otherwise use simplified base notes (from card + button)
        let displayNotes = [];
        let actualNotes = []; // Array of objects {note, octave}
        let chordName = chord ? chord.name : "Custom Chord";

        if (chord) {
            if (specificNotes) {
                // If rawText is provided or it looks like a sequence reproduction, don't sort!
                // Sorting destroys arpeggio/rhythm order.
                if (rawText || label === 'Copy' || chord.name === 'Copy') {
                    actualNotes = specificNotes;
                    displayNotes = specificNotes.map(n => {
                        if (n.isGroup) return 'GRP';
                        return n.type === 'percussion' ? n.hand : (n.note ? `${n.note}${n.octave}` : '-');
                    });
                } else {
                    const sorted = sortNotesByPitch(specificNotes);
                    actualNotes = sorted;
                    displayNotes = sorted.map(n => `${n.note}${n.octave}`);
                }
            } else {
                // Fallback for default add (+)
                const rootNote = chord.root;
                let bestVoicing = chord.voicings.find(v => v.length === 3 && v[0].note === rootNote);
                if (!bestVoicing) bestVoicing = chord.voicings[0];

                const base = bestVoicing || chord.arpeggio;
                actualNotes = sortNotesByPitch(base);
                displayNotes = actualNotes.map(n => `${n.note}${n.octave}`);
            }
        } else {
            // Empty / Custom case
            chordName = "Custom Arp";
            if (specificNotes) {
                actualNotes = specificNotes;
                displayNotes = specificNotes.map(evt => {
                    const renderN = (n) => n.type === 'percussion' ? (n.isGhost ? n.hand.toLowerCase() : n.hand) : `${n.note}${n.octave}`;
                    if (evt.isGroup) {
                        return evt.notes.map(renderN).join('|');
                    }
                    return renderN(evt);
                });
            }
        }

        // Store notes for playback - IMPORTANT: Clone to avoid sharing objects
        const clonedNotes = actualNotes.map(evt => {
            const clone = { ...evt, duration: evt.duration || 1 };
            if (evt.isGroup) {
                clone.notes = evt.notes.map(n => ({ ...n }));
            }
            return clone;
        });

        item.dataset.notes = JSON.stringify(clonedNotes);
        item.dataset.sourceText = rawText || displayNotes.join(' '); // Use rawText if provided to preserve notation

        // renderEvent removed (using shared helper)

        const headerContentNotes = generateTruncatedNotesHTML(actualNotes);

        // Truncate logic
        // We need to truncate the HTML string or the text representation?
        // The notesList contains spans. Truncating raw HTML is risky.
        // Let's truncate visually or just limit the number of rendered notes?
        // User asked: "if arpeggio text is too long, show only first 25 characters".
        // It's likely referring to the source text (e.g. "D3 A3 Bb3 C4...").
        // But we display executed notes. 
        // Let's try to limit the number of notes shown?
        // Or if using rawText / sourceText for display? 
        // Currently we show `notesList` which is a string of spans.

        // Let's wrap the notesList in a container with text-overflow ellipsis?
        // But user said "first 25 chars". 
        // Maybe he means the text inside? 
        // Let's interpret as: if rawText is used (or generated text), truncate it if displayed.
        // But we display spans. 
        // Let's just limit the container width or use logic to slice the array of notes.

        // New approach: Limit rendered notes to e.g. 5-6 notes, or check length of text.
        // Let's assume user sees the text representation in his mind. 
        // If we have many notes, it gets long. 
        // Let's slice actualNotes if it's too long? 
        // "show only first 25 characters" -> strongly implies text string.


        // Auto-generate name logic (A, B, C...)
        let finalLabel = label;
        if (!finalLabel) {
            if (chord) {
                finalLabel = chordName;
            } else {
                const pContainer = document.getElementById('progression-stage');
                const count = pContainer ? pContainer.querySelectorAll('.progression-item').length : 0;
                const nextChar = String.fromCharCode(65 + (count % 26));
                finalLabel = nextChar;
            }
        }

        // Clear innerHTML and build with DOM for event listeners
        item.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'prog-header';

        const titleContainer = document.createElement('div');
        titleContainer.style.display = 'flex';
        titleContainer.style.alignItems = 'center';
        titleContainer.style.gap = '8px';
        titleContainer.style.cursor = 'pointer';
        titleContainer.onclick = (e) => {
            e.stopPropagation();
            openEditorModal(item);
        };

        const titleSpan = document.createElement('span');
        titleSpan.className = 'prog-label';
        titleSpan.textContent = finalLabel;
        titleSpan.style.fontWeight = 'bold';

        const editIcon = document.createElement('span');
        editIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.7;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
        editIcon.title = "Edit";

        const duplicateBtn = document.createElement('button');
        duplicateBtn.className = 'icon-btn';
        duplicateBtn.title = "Duplicate";
        duplicateBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        duplicateBtn.onclick = (e) => {
            e.stopPropagation();
            // Duplicate logic
            const currentNotes = item.dataset.notes ? JSON.parse(item.dataset.notes) : [];
            const currentRaw = item.dataset.sourceText;
            addToProgression({ name: "Copy", notes: [] }, currentNotes, undefined, currentRaw);
        };

        titleContainer.appendChild(titleSpan);
        titleContainer.appendChild(editIcon);
        titleContainer.appendChild(duplicateBtn);

        // Actions wrapper (Only Remove now)
        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '5px';

        const removeSpan = document.createElement('span');
        removeSpan.className = 'remove-btn';
        removeSpan.innerHTML = '&times;';
        removeSpan.onclick = (e) => {
            e.stopPropagation();
            item.remove();
            stopPlayback();
        };

        actionsDiv.appendChild(removeSpan);

        header.appendChild(titleContainer);
        header.appendChild(actionsDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'prog-info';
        contentDiv.innerHTML = `<div class="prog-notes">${headerContentNotes}</div>`;
        // Make whole item clickable to edit? Or just title? User said "Click on name". 
        // But "edit-btn" was also there. Let's keep "edit-btn" behavior consistent or remove it if title is enough.
        // The user said: "Window opens also when clicking on arpeggio name".

        // Let's add the notes container.

        item.appendChild(header);
        item.appendChild(contentDiv);

        // Edit Handler (keep compatible with existing CSS/Layout if needed, but we are changing layout)
        // We can add a "Edit" button if needed, but title click covers it. 
        // Let's stick to the prompt.

        item.addEventListener('click', (e) => {
            // Maybe selecting the item does something? 
            // For now, let's just let title click handle edit.
        });

        // DnD events
        item.addEventListener('dragstart', () => {
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        const container = document.getElementById('progression-stage');
        if (container) {
            // Remove placeholder if it exists
            const placeholder = container.querySelector('.placeholder-text');
            if (placeholder) {
                placeholder.remove();
            }

            container.appendChild(item);
            container.scrollLeft = container.scrollWidth;

            // Auto-open editor ONLY if it's a "Custom" shell creation WITHOUT notes yet
            // (legacy flow or fallback). If it was created from Save button, specificNotes will be present.
            if (!chord && specificNotes === null) {
                openEditorModal(item);
            }
        }
    }

    // Drag Over Container
    const stageContainer = document.getElementById('progression-stage');
    if (stageContainer) {
        stageContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(stageContainer, e.clientX);
            const draggable = document.querySelector('.dragging');
            if (draggable) {
                if (afterElement == null) {
                    stageContainer.appendChild(draggable);
                } else {
                    stageContainer.insertBefore(draggable, afterElement);
                }
            }
        });

        // Clear Button Logic
        const clearBtn = document.getElementById('clear-progression');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearProgression);
        }
    }

    function clearProgression() {
        const stage = document.getElementById('progression-stage');
        if (stage) {
            stage.innerHTML = '<div class="placeholder-text">Click + on a card to add to progression</div>';
        }
        stopPlayback();
    }

    function getDragAfterElement(container, x) {
        const draggableElements = [...container.querySelectorAll('.progression-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function playChordStub(chord, voicingIndex = 0) {
        const rootNote = chord.root;
        let bestVoicing = chord.voicings.find(v => v.length === 3 && v[0].note === rootNote);

        if (!bestVoicing) {
            bestVoicing = chord.voicings.find(v => v[0].note === rootNote);
        }

        if (!bestVoicing) {
            bestVoicing = chord.voicings[0];
        }

        const notes = bestVoicing || chord.arpeggio;
        playArpeggio(notes);
    }

    // --- Init ---
    init();

});
