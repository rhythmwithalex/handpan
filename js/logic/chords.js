
import { NOTE_TO_MIDI, CHORD_TYPES, CHORD_TYPE_PRIORITY } from '../data/constants.js';

export function getNoteName(value) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes[value % 12];
}

export function parseNoteName(name) {
    const cleanName = name.replace(/^D:/, '');
    const match = cleanName.match(/^([A-G][#b]?)([0-8])$/);
    if (!match) return null;
    const note = match[1];
    const octave = parseInt(match[2]);
    const val = NOTE_TO_MIDI[note] !== undefined ? NOTE_TO_MIDI[note] : 0;
    const midi = (octave + 1) * 12 + val;
    return { note, octave, value: midi - 48 }; // Value relative to C3 (midi 48)
}

export function getFrequencyForNoteName(name) {
    const cleanName = name.replace(/^D:/, '');
    const match = cleanName.match(/^([A-G][#b]?)([0-8])$/);
    if (!match) return 0;
    const note = match[1];
    const octave = parseInt(match[2]);
    const midi = (octave + 1) * 12 + NOTE_TO_MIDI[note];
    return 440 * Math.pow(2, (midi - 69) / 12);
}

export function sortNotesByPitch(notes) {
    return [...notes].sort((a, b) => {
        const getMidi = (n) => (n.octave * 12) + (NOTE_TO_MIDI[n.note] || 0);
        return getMidi(a) - getMidi(b);
    });
}

// Identify chords from a set of notes
export function identifyChord(noteSet) {
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
                if (requiredIntervals.length === noteSet.length - 1) {
                    return {
                        root: root.note,
                        type: type,
                        name: `${root.note} ${type}`,
                        notes: noteSet,
                        intervalSignature: intervals.join(',')
                    };
                }
            }
        }
    }
    return null;
}

// Generate combinations of notes
export function generateChords(handpanNotes) {
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
    combine(handpanNotes, 2);
    combine(handpanNotes, 3);
    combine(handpanNotes, 4);

    // Validates voicings and adds them
    const results = Array.from(chordMap.values());

    results.forEach(chord => {
        const allowedNotes = new Set(chord.notes.map(n => n.note));
        const arpeggio = handpanNotes.filter(n => allowedNotes.has(n.note));
        const arpeggioId = arpeggio.map(n => n.value).join('-');

        // Find if arpeggio exists as a voicing
        const exists = chord.voicings.some(v => v.map(n => n.value).join('-') === arpeggioId);

        if (!exists) {
            chord.arpeggio = arpeggio;
        } else {
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

    results.sort((a, b) => {
        const pA = CHORD_TYPE_PRIORITY[a.type] || 99;
        const pB = CHORD_TYPE_PRIORITY[b.type] || 99;

        if (pA !== pB) return pA - pB;
        return a.root.localeCompare(b.root);
    });

    return results;
}
