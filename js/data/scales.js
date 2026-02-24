
export const SCALE_TEMPLATES = [
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

export const PREDEFINED_SCALES = [
    {
        id: 'e-amara',
        name: 'E Amara',
        top: ['E3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5'],
        bottom: { 'F#3': 'F#4', 'G3': 'G4', 'E5': 'B4' }
    }
];

// Custom scale logic
const STORAGE_KEY = 'customScales';
const LAST_SCALE_KEY = 'lastSelectedScale';

export function getCustomScales() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        console.warn('Failed to parse custom scales', e);
        return [];
    }
}

function setCustomScales(scales) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scales));
}

// Ensure "Alex's E Amara" exists (Starter Custom Scale)
export function initCustomScales() {
    let customScales = getCustomScales();

    const defaultAlexAmara = {
        id: 'custom-alex-amara',
        name: 'Alex E Amara',
        top: ['E3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5'],
        bottom: { 'D:F#3': 'F#4', 'D:G3': 'G4', 'E5': 'B4' }
    };

    let existingAlexIndex = customScales.findIndex(s => s.id === 'custom-alex-amara');

    if (existingAlexIndex === -1) {
        existingAlexIndex = customScales.findIndex(s => s.name === 'Alex E Amara');
    }

    if (existingAlexIndex > -1) {
        const existingId = customScales[existingAlexIndex].id;
        customScales[existingAlexIndex] = { ...defaultAlexAmara, id: existingId };
    } else {
        customScales.unshift(defaultAlexAmara);
    }
    setCustomScales(customScales);
    return customScales;
}

export function getAllScales() {
    const custom = getCustomScales();
    return [...PREDEFINED_SCALES, ...custom];
}

export function saveCustomScale(scaleId, scaleData) {
    const customScales = getCustomScales();
    const existingIndex = customScales.findIndex(s => s.id === scaleId);

    if (existingIndex > -1) {
        customScales[existingIndex] = { ...customScales[existingIndex], ...scaleData };
    } else {
        customScales.push(scaleData);
    }
    setCustomScales(customScales);
}

export function deleteCustomScale(scaleId) {
    let customScales = getCustomScales();
    customScales = customScales.filter(s => s.id !== scaleId);
    setCustomScales(customScales);
}

export function loadLastScale() {
    const savedScale = localStorage.getItem(LAST_SCALE_KEY);
    if (savedScale) {
        try {
            return JSON.parse(savedScale);
        } catch (e) {
            console.error('Failed to parse saved scale', e);
        }
    }
    return null;
}

export function saveLastScale(scale) {
    localStorage.setItem(LAST_SCALE_KEY, JSON.stringify(scale));
}
