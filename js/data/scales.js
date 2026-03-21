
export const SCALE_TEMPLATES = [
    {
        name: 'Kurd 9',
        type: 'Natural Minor (Ding+8)',
        keys: ['A', 'B', 'C#', 'D', 'E', 'G'],
        formula: [7, 8, 10, 12, 14, 15, 17, 19] // 5, b6, b7, 1, 2, b3, 4, 5
    },
    {
        name: 'Kurd 10',
        type: 'Natural Minor (Ding+9)',
        keys: ['A', 'B', 'C#', 'D', 'E', 'G'],
        formula: [7, 8, 10, 12, 14, 15, 17, 19, 22] // 5, b6, b7, 1, 2, b3, 4, 5, b7
    },
    {
        name: 'Amara 9',
        type: 'Celtic Minor',
        keys: ['B', 'C#', 'D', 'E', 'F', 'G'],
        formula: [7, 10, 12, 14, 15, 17, 19, 22] // 5, b7, 1, 2, b3, 4, 5, b7
    },
    {
        name: 'Pygmy 9',
        type: 'Pentatonic',
        keys: ['D', 'E', 'F', 'F#', 'G'],
        formula: [5, 7, 8, 12, 14, 15, 17, 19] // 4, 5, b6, 1, 2, b3, 4, 5
    },
    {
        name: 'Hijaz 9',
        type: 'Phrygian Dominant',
        keys: ['B', 'C#', 'D', 'E', 'F', 'G'],
        formula: [7, 8, 11, 12, 14, 15, 17, 19] // 5, b6, 7, 1, 2, b3, 4, 5
    },
    {
        name: 'Integral 8',
        type: 'Minor Variant',
        keys: ['B', 'C', 'C#', 'D'],
        formula: [7, 8, 10, 12, 14, 15, 17] // 5, b6, b7, 1, 2, b3, 4
    },
    {
        name: 'Equinox 9',
        type: 'Minor',
        keys: ['B', 'C', 'E', 'F', 'G'],
        formula: [3, 7, 8, 10, 12, 14, 15, 19] // b3, 5, b6, b7, 1, 2, b3, 5
    },
    {
        name: 'Sabye 9',
        type: 'Major',
        keys: ['Bb', 'C', 'D', 'F', 'G'],
        formula: [7, 9, 11, 12, 14, 16, 17, 19] // 5, 6, 7, 1, 2, 3, 4, 5
    },
    {
        name: 'Mixolydian 9',
        type: 'Mixolydian',
        keys: ['A', 'C', 'D', 'F', 'G'],
        formula: [7, 9, 10, 12, 14, 15, 17, 19] // 5, 6, b7, 1, 2, b3, 4, 5
    },
    {
        name: 'Mystic 9',
        type: 'Minor',
        keys: ['A', 'C', 'D', 'F', 'G'],
        formula: [5, 7, 10, 12, 14, 15, 17, 19] // 4, 5, b7, 1, 2, b3, 4, 5
    },
    {
        name: 'Aegean 9',
        type: 'Lydian',
        keys: ['C', 'C#', 'D', 'E'],
        formula: [4, 7, 11, 12, 16, 18, 19, 23] // 3, 5, 7, 1, 3, #4, 5, 7
    }
];

export const PREDEFINED_SCALES = [
    {
        id: 'd-kurd-10',
        name: 'D Kurd 10',
        top: ['D3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5'],
        bottom: {}
    },
    {
        id: 'e-amara-9',
        name: 'E Amara 9',
        top: ['E3', 'B3', 'D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'D5'],
        bottom: { 'D:F#3': 'F#4', 'D:G3': 'G4', 'E5': 'B4' }
    },
    {
        id: 'b-hijaz',
        name: 'B Hijaz',
        top: ['B2', 'F#3', 'G3', 'A#3', 'B3', 'C#4', 'D4', 'E4', 'F#4'],
        bottom: {}
    },
    {
        id: 'c-aegean-9',
        name: 'C Aegean',
        top: ['C3', 'E3', 'G3', 'B3', 'C4', 'E4', 'F#4', 'G4', 'B4'],
        bottom: {}
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
    let updatedScale = scaleData;

    if (existingIndex > -1) {
        updatedScale = { ...customScales[existingIndex], ...scaleData };
        customScales[existingIndex] = updatedScale;
    } else {
        customScales.push(scaleData);
    }
    setCustomScales(customScales);
    return updatedScale;
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
