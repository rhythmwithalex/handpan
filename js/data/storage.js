// LocalStorage and URL Parameters handling

const STORAGE_KEY = 'handpan_app_progression';

export function saveStateToLocal(scale, progressionItemsData, tempo, precount, viewMode) {
    if (!scale || !progressionItemsData) return;
    const data = {
        scale: scale,
        progression: progressionItemsData,
        tempo: tempo || 80,
        precount: precount,
        viewMode: viewMode || 'grid'
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

export function generateShareUrl(scale, progressionItemsData, tempo, precount, viewMode) {
    if (!scale || !progressionItemsData) return window.location.href.split('?')[0];

    const data = {
        s: scale, // Use short keys to save space in URL
        t: tempo || 80, // Tempo
        pr: precount, // Precount config
        vm: viewMode === 'compact' ? 1 : 0,
        p: progressionItemsData.map(item => ({
            n: item.name,      // name
            t: item.text,      // original text
            r: item.repeats,   // repeats
            c: item.color !== 'none' ? item.color : undefined
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
        const precount = parsed.pr;
        const viewMode = parsed.vm === 1 ? 'compact' : 'grid';
        const progression = parsed.p ? parsed.p.map(item => ({
            name: item.n || item.name,
            text: item.t || item.text,
            repeats: item.r || item.repeats || 1,
            color: item.c || item.color || 'none'
        })) : [];

        return { scale, progression, tempo, precount, viewMode };

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

export function exportLibraryToJson() {
    const library = getCompositions();
    const dataStr = JSON.stringify(library, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `handpan_library_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function exportCompositionToJson(id) {
    const library = getCompositions();
    const comp = library.find(c => c.id === id);
    if (!comp) return;

    const dataStr = JSON.stringify(comp, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const safeName = comp.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.download = `handpan_comp_${safeName}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function importLibraryFromJson(jsonString) {
    try {
        let imported = JSON.parse(jsonString);
        
        // Flexibly handle single object or array
        if (!Array.isArray(imported)) {
            if (imported.id && imported.name && imported.progression) {
                imported = [imported];
            } else {
                throw new Error("Invalid format: Expected a composition or library array.");
            }
        }
        
        // Basic validation of items
        const validItems = imported.filter(item => item.id && item.name && item.progression);
        if (validItems.length === 0 && imported.length > 0) {
            throw new Error("No valid compositions found in file.");
        }

        const currentLibrary = getCompositions();
        const merged = [...currentLibrary];
        validItems.forEach(newItem => {
            const index = merged.findIndex(c => c.id === newItem.id);
            if (index !== -1) {
                merged[index] = newItem; // Overwrite
            } else {
                merged.push(newItem); // Append
            }
        });

        localStorage.setItem(LIBRARY_KEY, JSON.stringify(merged));
        return { 
            success: true, 
            count: validItems.length, 
            imported: validItems.length === 1 ? validItems[0] : null 
        };
    } catch (e) {
        console.error("Error importing library:", e);
        return { success: false, error: e.message };
    }
}
