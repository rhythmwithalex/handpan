// LocalStorage and URL Parameters handling

const STORAGE_KEY = 'handpan_app_progression';

export function saveStateToLocal(scale, progressionItemsData, tempo) {
    if (!scale || !progressionItemsData) return;
    const data = {
        scale: scale,
        progression: progressionItemsData,
        tempo: tempo || 80
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn("Could not save to localStorage:", e);
    }
}

export function loadStateFromLocal() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn("Could not load from localStorage:", e);
    }
    return null;
}

export function generateShareUrl(scale, progressionItemsData, tempo) {
    if (!scale || !progressionItemsData) return window.location.href.split('?')[0];

    const data = {
        s: scale, // Use short keys to save space in URL
        t: tempo || 80, // Tempo
        p: progressionItemsData.map(item => ({
            n: item.name,      // name
            t: item.text,      // original text
            r: item.repeats    // repeats
        }))
    };

    try {
        const jsonStr = JSON.stringify(data);
        // Base64 encode. Note: btoa doesn't handle Unicode natively, but our notes/names are usually ASCII.
        // We'll use a safer utf8-to-b64 wrapper if user typed Russian names.
        const encoded = encodeURIComponent(jsonStr);
        const b64 = btoa(encoded);

        const baseUrl = window.location.href.split('?')[0];
        return `${baseUrl}?data=${b64}`;
    } catch (e) {
        console.error("Error generating URL:", e);
        return window.location.href;
    }
}

export function decodeUrlData() {
    const urlParams = new URLSearchParams(window.location.search);
    const b64Data = urlParams.get('data');
    if (!b64Data) return null;

    try {
        const decodedUri = atob(b64Data);
        const jsonStr = decodeURIComponent(decodedUri);
        const parsed = JSON.parse(jsonStr);

        // Map back from short keys
        const scale = parsed.s;
        const tempo = parsed.t || 80;
        const progression = parsed.p ? parsed.p.map(item => ({
            name: item.n || item.name,
            text: item.t || item.text,
            repeats: item.r || item.repeats || 1
        })) : [];

        return { scale, progression, tempo };

    } catch (e) {
        console.error("Error decoding URL data:", e);
        return null;
    }
}

// --- Compositions Library ---

const LIBRARY_KEY = 'handpan_app_compositions';

export function getCompositions() {
    try {
        const stored = localStorage.getItem(LIBRARY_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn("Could not load library from localStorage:", e);
    }
    return [];
}

export function saveComposition(name, category, scale, progressionItemsData, tempo) {
    if (!name || !scale || !progressionItemsData) return false;

    const comp = {
        id: Date.now().toString(),
        name: name,
        category: category || '',
        date: new Date().toISOString(),
        scale: scale,
        progression: progressionItemsData,
        tempo: tempo || 80
    };

    const library = getCompositions();
    const existingIndex = library.findIndex(c =>
        c.name.toLowerCase() === name.toLowerCase() &&
        (c.category || '').toLowerCase() === (category || '').toLowerCase()
    );

    if (existingIndex !== -1) {
        // Overwrite existing, keep its ID
        comp.id = library[existingIndex].id;
        library[existingIndex] = comp;
    } else {
        // Add new
        library.push(comp);
    }

    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
        return true;
    } catch (e) {
        console.error("Could not save composition to library:", e);
        return false;
    }
}

export function deleteComposition(id) {
    let library = getCompositions();
    library = library.filter(c => c.id !== id);
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
        return true;
    } catch (e) {
        console.error("Could not delete composition:", e);
        return false;
    }
}
