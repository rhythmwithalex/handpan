
// Musical Constants

// specific map for note name -> semitone index (0-11)
export const NOTE_TO_MIDI = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

// Intervals for chord types relative to root (semitones)
export const CHORD_TYPES = {
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
    'Min7b5': [3, 6, 10],
    'M3': [4], // Dyad: Root + Major 3rd
    'm3': [3]  // Dyad: Root + Minor 3rd
};

export const CHORD_TYPE_PRIORITY = {
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
    'Min7b5': 7,
    'M3': 8,
    'm3': 8
};
