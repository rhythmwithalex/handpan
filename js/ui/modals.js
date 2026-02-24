
import {
    SCALE_TEMPLATES,
    getAllScales,
    saveCustomScale,
    deleteCustomScale,
    initCustomScales
} from '../data/scales.js';

let onScaleSelectCallback = null;

// Modal Elements
const scaleModal = document.getElementById('scale-modal');
const customModal = document.getElementById('custom-scale-modal');

// State for 2-step selection
let selectedTemplate = null;

export function initModals(onScaleSelect) {
    onScaleSelectCallback = onScaleSelect;

    // Scale Main Modal
    document.getElementById('scale-picker-trigger')?.addEventListener('click', openScaleModal);
    document.getElementById('close-scale-modal')?.addEventListener('click', () => {
        closeModal(scaleModal);
    });

    // Custom Scale Modal
    document.getElementById('btn-custom-scale')?.addEventListener('click', openCustomModal);
    document.getElementById('close-custom-modal')?.addEventListener('click', () => {
        closeModal(customModal);
    });

    // Overlay Close
    document.getElementById('modal-overlay')?.addEventListener('click', () => {
        closeModal(scaleModal);
        closeModal(customModal);
        closeModal(document.getElementById('voicing-modal'));
        closeModal(document.getElementById('editor-modal'));
        closeModal(document.getElementById('save-comp-modal'));
        closeModal(document.getElementById('load-comp-modal'));
        closeModal(document.getElementById('modal-overlay'));
    });

    // Save Custom Scale
    document.getElementById('save-custom-scale')?.addEventListener('click', handleCustomSave);

    // Save Composition Close
    document.getElementById('close-save-comp')?.addEventListener('click', () => {
        closeModal(document.getElementById('save-comp-modal'));
    });
    document.getElementById('cancel-save-comp')?.addEventListener('click', () => {
        closeModal(document.getElementById('save-comp-modal'));
    });

    // Load Composition Close
    document.getElementById('close-load-comp')?.addEventListener('click', () => {
        closeModal(document.getElementById('load-comp-modal'));
    });
}

export function openScaleModal() {
    renderScaleSelection();
    showModal(scaleModal);
}

export function closeModal(modal) {
    if (modal) modal.style.display = 'none';
    const modals = [scaleModal, customModal,
        document.getElementById('voicing-modal'),
        document.getElementById('editor-modal'),
        document.getElementById('save-comp-modal'),
        document.getElementById('load-comp-modal')];

    const anyOpen = modals.some(m => m && m.style.display && m.style.display !== 'none');

    if (!anyOpen) {
        document.getElementById('modal-overlay').style.display = 'none';
    }
}

export function showModal(modal) {
    if (modal) modal.style.display = 'flex';
    document.getElementById('modal-overlay').style.display = 'block';
}

function renderScaleSelection(step = 'categories') {
    const list = document.getElementById('scale-list');
    list.innerHTML = '';

    if (step === 'categories') {
        selectedTemplate = null;

        // Render Scale Categories (Templates)
        // Render Scale Categories (Templates)
        SCALE_TEMPLATES.forEach(tmpl => {
            const div = document.createElement('div');
            // Use 'scale-item' class instead of 'scale-item-category' to match expected style or create new
            div.className = 'scale-item-category';
            // Simplified style
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.padding = '15px';
            div.style.background = 'transparent';
            div.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:700; font-size:1rem; color:#333;">${tmpl.name}</span>
                    <span style="font-size:0.85rem; color:#666;">${tmpl.type}</span>
                </div>
                <div style="color:#ccc;">›</div>
            `;

            div.onclick = () => {
                selectedTemplate = tmpl;
                renderScaleSelection('keys');
            };

            // Hover effect handled by CSS or inline
            div.onmouseover = () => { div.style.background = 'rgba(0,0,0,0.03)'; };
            div.onmouseout = () => { div.style.background = 'transparent'; };

            list.appendChild(div);
        });

        // "My Custom Scales" Section
        const customScales = getAllScales().filter(s => s.id.startsWith('custom-'));
        if (customScales.length > 0) {
            const separator = document.createElement('div');
            separator.className = 'scale-separator';
            separator.textContent = 'My Custom Scales';
            list.appendChild(separator);

            customScales.forEach(scale => {
                renderScaleItem(scale, list, true);
            });
        }
    } else if (step === 'keys') {
        // Back Button
        const backBtn = document.createElement('div');
        backBtn.className = 'scale-back-btn';
        backBtn.innerHTML = '← Back to Styles';
        backBtn.onclick = () => renderScaleSelection('categories');
        list.appendChild(backBtn);

        const header = document.createElement('div');
        header.className = 'scale-category-header';
        header.innerHTML = `Select Key for <strong>${selectedTemplate.name}</strong>`;
        list.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'scale-key-grid';

        selectedTemplate.keys.forEach(key => {
            const keyBtn = document.createElement('button');
            keyBtn.className = 'scale-key-btn';
            keyBtn.textContent = key;
            keyBtn.onclick = () => {
                generateAndSelectScale(selectedTemplate, key);
            };
            grid.appendChild(keyBtn);
        });
        list.appendChild(grid);
    }
}

function renderScaleItem(scale, container, isCustom = false) {
    const div = document.createElement('div');
    div.className = 'scale-item glass-card-small';

    // Notes/Keys display
    const bottomNotes = Object.keys(scale.bottom).join(' ');

    let html = `
        <div class="scale-info">
            <div class="scale-name">${scale.name}</div>
            <div class="scale-notes">${scale.top.join(' ')} ${bottomNotes ? '| ' + bottomNotes : ''}</div>
        </div>
    `;

    // Edit/Delete for Custom
    if (isCustom) {
        html += `<div class="scale-actions">`;
        html += `<button class="icon-btn edit-scale" title="Edit">✎</button>`;
        html += `<button class="icon-btn delete-scale" title="Delete">🗑</button>`;
        html += `</div>`;
    }

    div.innerHTML = html;

    // Main Click -> Select
    div.onclick = (e) => {
        // Ignore if action button clicked
        if (e.target.closest('.scale-actions')) return;
        selectScale(scale);
    };

    if (isCustom) {
        const editBtn = div.querySelector('.edit-scale');
        const deleteBtn = div.querySelector('.delete-scale');

        editBtn.onclick = (e) => {
            e.stopPropagation();
            openCustomModal(scale);
        };

        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm(`Delete scale "${scale.name}"?`)) {
                deleteCustomScale(scale.id);
                renderScaleSelection('categories'); // Refresh
            }
        };
    }

    container.appendChild(div);
}

function selectScale(scale) {
    if (onScaleSelectCallback) onScaleSelectCallback(scale);
    closeModal(scaleModal);
}

function generateAndSelectScale(template, key) {
    // Generate scale object from Template + Key
    // Formula: semitones from Root.
    // Root is 'key' (e.g. 'C#3'?). Templates have keys like 'C#'.
    // Handpan usually has center Ding (Root) in 3rd octave (e.g. D3).
    // Some low ones D2. Standard is 3.

    // Note names map
    // Note names map for Sharps vs Flats
    const sharpNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatNotes = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Find index of Root Note (using Sharps as reference)
    let rootIndex = sharpNotes.indexOf(key);
    if (rootIndex === -1) {
        // Try to handle flat-named key input by mapping to sharp index
        const flatIndex = flatNotes.indexOf(key);
        if (flatIndex !== -1) {
            rootIndex = flatIndex;
        }
    }

    // Heuristics for Choosing Sharps or Flats
    // Minor-ish scales (Kurd, Amara, Pygmy, Integral, Equinox, Mystic) typically use Flats for keys: F, Bb, Eb, Ab, Db, Gb... AND D, G, C.
    // Major-ish scales (Sabye, Mixolydian, Hijaz?) typically use Sharps, except F, Bb, Eb...

    // Simplification:
    // If Scale Type contains 'Major' or 'Mixolydian', use simpler Major rule.
    // Else use Minor rule.

    const isMajor = template.type.includes('Major') || template.type.includes('Mixolydian') || template.type.includes('Dominant');

    // Keys that prefer Flats in Major context
    const majorFlatKeys = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

    // Keys that prefer Flats in Minor context (D Minor has Bb, G Minor has Bb, Eb etc.)
    // Natural Minor Flat Keys: D, G, C, F, Bb, Eb, Ab...
    // Sharps: E, B, F#, C#, G#, D#, A#
    const minorFlatKeys = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'D', 'G', 'A']; // A Minor has no sharps/flats but G dorian might? A minor is natural.
    // Actually lets just list Sharp keys for Minor to be safe:
    // E (F#), B (C#, F#), F# (C#, F#, G#), C#...

    let useFlats = false;

    if (isMajor) {
        if (majorFlatKeys.includes(key)) useFlats = true;
    } else {
        // Minor / Other
        if (minorFlatKeys.includes(key)) useFlats = true;
    }

    // Heuristics for sequential lettering
    const getSpellings = (idx) => {
        const s = sharpNotes[idx % 12];
        const f = flatNotes[idx % 12];
        return s === f ? [s] : [s, f];
    };

    const rootOctave = 3;

    // Calculate Ding (Root) based on user Key selection (force their spelling)
    const ding = `${key}${rootOctave}`;

    // Calculate Side Notes with "Different Letter" Heuristic
    let previousNote = ding;

    const sideNotes = template.formula.map(semitones => {
        let absIndex = rootIndex + semitones;
        let octave = rootOctave + Math.floor(absIndex / 12);
        let chromaticIndex = absIndex % 12;

        const candidates = getSpellings(chromaticIndex);
        const prevLetter = previousNote.charAt(0);

        // Choose best candidate: Prefer different letter
        let chosen = candidates[0];

        if (candidates.length > 1) {
            // Check if first choice conflicts with previous letter
            if (candidates[0].charAt(0) === prevLetter) {
                // Conflict! Prefer second choice
                chosen = candidates[1];
            } else {
                // First choice doesn't conflict. Check if second choice also doesn't conflict?
                const c1 = candidates[0];
                const c2 = candidates[1];

                const c1Conflict = c1.charAt(0) === prevLetter;
                const c2Conflict = c2.charAt(0) === prevLetter;

                if (c1Conflict && !c2Conflict) chosen = c2;
                else if (!c1Conflict && c2Conflict) chosen = c1;
                else {
                    // Tie: use default key preference
                    // sharpNotes has sharps at [0], flatNotes has flats at [1]
                    // If candidates are different, [0] is sharp, [1] is flat usually?
                    // Let's check:
                    // sharpNotes[1] = C#, flatNotes[1] = Db.
                    // candidates = [C#, Db].
                    // So index 0 is Sharp.
                    chosen = useFlats ? candidates[1] : candidates[0];
                }
            }
        }

        const noteName = `${chosen}${octave}`;
        previousNote = noteName;
        return noteName;
    });

    const scale = {
        id: `gen-${template.name}-${key}`.toLowerCase().replace(/\s+/g, '-'),
        name: `${key} ${template.name}`,
        top: [ding, ...sideNotes],
        bottom: {}
    };

    selectScale(scale);
}

// Custom Modal Logic
function openCustomModal(editScale = null) {
    closeModal(scaleModal); // Ensure main is closed
    showModal(customModal);

    const nameInput = document.getElementById('custom-scale-name');
    const dingInput = document.getElementById('custom-scale-ding');
    const topInput = document.getElementById('custom-scale-top');
    const bottomInput = document.getElementById('custom-scale-bottom');
    const idInput = document.getElementById('custom-scale-id');

    if (editScale) {
        idInput.value = editScale.id;
        nameInput.value = editScale.name;
        dingInput.value = editScale.top[0];
        topInput.value = editScale.top.slice(1).join(' ');

        // Convert bottom object to string "Note:Parent Note:Parent"
        const bottomStr = Object.entries(editScale.bottom)
            .map(([n, p]) => `${n}:${p}`)
            .join(' ');
        bottomInput.value = bottomStr;
    } else {
        idInput.value = '';
        nameInput.value = '';
        dingInput.value = 'D3';
        topInput.value = 'A3 Bb3 C4 D4 E4 F4 G4 A4';
        bottomInput.value = '';
    }
}

function handleCustomSave() {
    const idInput = document.getElementById('custom-scale-id');
    const nameInput = document.getElementById('custom-scale-name');
    const dingInput = document.getElementById('custom-scale-ding');
    const topInput = document.getElementById('custom-scale-top');
    const bottomInput = document.getElementById('custom-scale-bottom');

    const name = nameInput.value.trim();
    if (!name) return alert('Name is required');

    const ding = dingInput.value.trim();
    const top = topInput.value.trim().split(/\s+/).filter(n => n);

    const bottomRaw = bottomInput.value.trim().split(/\s+/).filter(n => n);
    const bottom = {};
    bottomRaw.forEach(pair => {
        const [n, p] = pair.split(':');
        if (n && p) bottom[n] = p;
    });

    const isEdit = !!idInput.value;
    const id = isEdit ? idInput.value : `custom-${Date.now()}`;

    const scale = {
        id,
        name,
        top: [ding, ...top],
        bottom
    };

    saveCustomScale(id, scale);
    closeModal(customModal);

    // If editing currently active scale, select it?
    // Or nicely ask.
    // For now, just re-select it to update UI
    if (onScaleSelectCallback) onScaleSelectCallback(scale);
}
