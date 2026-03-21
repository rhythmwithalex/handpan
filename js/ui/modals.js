
import {
    SCALE_TEMPLATES,
    getAllScales,
    saveCustomScale,
    deleteCustomScale,
    initCustomScales
} from '../data/scales.js';
import { openLayoutEditor } from './layout_editor.js';

let onScaleSelectCallback = null;

// Modal Elements
const scaleModal = document.getElementById('scale-modal');
const customModal = document.getElementById('custom-scale-modal');

// State for 2-step selection
let selectedTemplate = null;
let creationMode = 'select'; // 'select' or 'clone'

export function initModals(onScaleSelect) {
    onScaleSelectCallback = onScaleSelect;

    // Scale Main Modal
    document.getElementById('scale-picker-trigger')?.addEventListener('click', openScaleModal);
    document.getElementById('close-scale-modal')?.addEventListener('click', () => {
        closeModal(scaleModal);
    });

    // Custom Scale Modal
    document.getElementById('btn-custom-scale')?.addEventListener('click', () => {
        renderScaleSelection('choice');
    });
    document.getElementById('close-custom-modal')?.addEventListener('click', () => {
        closeModal(customModal);
    });

    // Overlay Close
    document.getElementById('modal-overlay')?.addEventListener('click', () => {
        if (window.getSelection().toString().length > 0) return;
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
    creationMode = 'select'; // Reset when opened normally
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
        document.body.classList.remove('modal-open');
    }
}

export function showModal(modal) {
    if (modal) modal.style.display = 'flex';
    document.getElementById('modal-overlay').style.display = 'block';
    document.body.classList.add('modal-open');
}

function renderScaleSelection(step = 'categories') {
    const list = document.getElementById('scale-list');
    list.innerHTML = '';

    if (step === 'categories') {
        selectedTemplate = null;
        
        // Restore default title and footer
        const modalTitle = scaleModal.querySelector('h2');
        if (modalTitle) modalTitle.textContent = 'Select Scale Type';
        const footerBtn = document.getElementById('btn-custom-scale');
        if (footerBtn) footerBtn.style.display = 'block';

        if (creationMode === 'clone') {
            if (modalTitle) modalTitle.textContent = 'Create Custom Handpan';
            if (footerBtn) footerBtn.style.display = 'none';

            const cloneHeader = document.createElement('div');
            cloneHeader.className = 'scale-category-header clone-mode-info';
            cloneHeader.innerHTML = `<strong>1. Pick a base structure for your custom scale</strong>`;
            list.appendChild(cloneHeader);
        }

        // Render Scale Categories (Templates) sorted alphabetically
        const sortedTemplates = [...SCALE_TEMPLATES].sort((a, b) => a.name.localeCompare(b.name));
        sortedTemplates.forEach(tmpl => {
            const div = document.createElement('div');
            // Use 'scale-item-category' class
            div.className = 'scale-item-category';

            div.innerHTML = `
                <div class="scale-item-text">
                    <span class="scale-item-title">${tmpl.name}</span>
                    <span class="scale-item-subtitle">${tmpl.type}</span>
                </div>
                <div class="scale-item-arrow">›</div>
            `;

            div.onclick = () => {
                selectedTemplate = tmpl;
                renderScaleSelection('keys');
            };

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
    } else if (step === 'choice') {
        // Change Modal Title and Hide Footer Button
        const modalTitle = scaleModal.querySelector('h2');
        if (modalTitle) modalTitle.textContent = 'Create Custom Handpan';
        const footerBtn = document.getElementById('btn-custom-scale');
        if (footerBtn) footerBtn.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'scale-category-header';
        header.innerHTML = `<strong>How would you like to start?</strong>`;
        list.appendChild(header);

        const choiceContainer = document.createElement('div');
        choiceContainer.className = 'choice-container';
        choiceContainer.style.display = 'flex';
        choiceContainer.style.flexDirection = 'column';
        choiceContainer.style.gap = '15px';
        choiceContainer.style.marginTop = '20px';

        const emptyBtn = document.createElement('button');
        emptyBtn.className = 'premium-btn';
        emptyBtn.style.background = 'rgba(255,255,255,0.05)';
        emptyBtn.style.color = 'var(--text-main)';
        emptyBtn.innerHTML = '✨ Create Empty Handpan<br><small style="opacity: 0.6">Start from scratch</small>';
        emptyBtn.onclick = () => openCustomModal();

        const fromExistingBtn = document.createElement('button');
        fromExistingBtn.className = 'premium-btn';
        fromExistingBtn.innerHTML = '📋 Based on Existing Scale<br><small style="opacity: 0.8">Pick a base structure to edit</small>';
        fromExistingBtn.onclick = () => {
            creationMode = 'clone';
            renderScaleSelection('categories');
        };

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'premium-btn secondary-btn';
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.border = '1px solid rgba(0,0,0,0.1)';
        cancelBtn.style.marginTop = '20px';
        cancelBtn.style.width = 'auto';
        cancelBtn.style.alignSelf = 'center';
        cancelBtn.style.padding = '10px 30px';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => renderScaleSelection('categories');

        choiceContainer.appendChild(emptyBtn);
        choiceContainer.appendChild(fromExistingBtn);
        list.appendChild(choiceContainer);
        list.appendChild(cancelBtn);

    } else if (step === 'keys') {
        // Back Button
        const backBtn = document.createElement('div');
        backBtn.className = 'scale-back-btn';
        backBtn.innerHTML = '← Back to Styles';
        backBtn.onclick = () => renderScaleSelection('categories');
        list.appendChild(backBtn);

        const footerBtn = document.getElementById('btn-custom-scale');
        if (footerBtn) footerBtn.style.display = creationMode === 'clone' ? 'none' : 'block';

        const header = document.createElement('div');
        header.className = 'scale-category-header';
        if (creationMode === 'clone') {
            header.innerHTML = `<strong>2. Select Key for ${selectedTemplate.name}</strong>`;
        } else {
            header.innerHTML = `Select Key for <strong>${selectedTemplate.name}</strong>`;
        }
        list.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'scale-key-grid';

        selectedTemplate.keys.forEach(key => {
            const keyBtn = document.createElement('button');
            keyBtn.className = 'scale-key-btn';
            keyBtn.textContent = key;
            keyBtn.onclick = () => {
                handleScaleSelected(generateScaleObject(selectedTemplate, key));
            };
            grid.appendChild(keyBtn);
        });

        // Add "Add Custom Root" button container
        const customRootContainer = document.createElement('div');
        customRootContainer.style.gridColumn = '1 / -1';
        customRootContainer.style.display = 'flex';
        customRootContainer.style.justifyContent = 'center';
        customRootContainer.style.marginTop = '10px';

        const customRootBtn = document.createElement('button');
        customRootBtn.className = 'premium-btn'; // Use standard button style for better visibility
        customRootBtn.style.padding = '8px 20px';
        customRootBtn.style.width = 'auto'; // Prevent it from stretching
        customRootBtn.textContent = '+ Add Custom Root';
        customRootBtn.onclick = () => {
            let input = prompt(`Enter a new root note for ${selectedTemplate.name} (e.g., C#, Eb, F):`);
            if (input) {
                let customKey = input.trim();
                if (customKey.length > 0) {
                    customKey = customKey.charAt(0).toUpperCase() + customKey.slice(1).toLowerCase();
                    generateAndSelectScale(selectedTemplate, customKey);
                }
            }
        };
        customRootContainer.appendChild(customRootBtn);
        grid.appendChild(customRootContainer);

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
        handleScaleSelected(scale);
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
    const scale = generateScaleObject(template, key);
    handleScaleSelected(scale);
}

function handleScaleSelected(scale) {
    if (creationMode === 'clone') {
        openCustomModal(scale, true); // true = clone
        creationMode = 'select'; // Reset
    } else {
        selectScale(scale);
    }
}

// Helpers for scale generation
function generateScaleObject(template, key) {
    const dingOctave = 3; 
    const keyMap = { 
        'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 
        'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 
        'A#': 10, 'Bb': 10, 'B': 11 
    };
    const rootIndex = keyMap[key] !== undefined ? keyMap[key] : 0;
    
    // 1. Calculate all semitone indices and octaves first
    const indices = [rootIndex]; // Ding is rootIndex
    const octaves = [dingOctave];
    
    template.formula.forEach(semitones => {
        let totalSemitonesFromC = rootIndex + semitones;
        let oct = dingOctave + Math.floor(totalSemitonesFromC / 12);
        let targetIdx = ((totalSemitonesFromC % 12) + 12) % 12;
        indices.push(targetIdx);
        octaves.push(oct);
    });

    // 2. Determine best naming (Sharps vs Flats)
    const sharpNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const flatNames  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    const countDups = (names) => {
        const letters = names.map(n => n[0].toUpperCase());
        const seen = new Set();
        let dups = 0;
        letters.forEach(l => {
            if (seen.has(l)) dups++;
            seen.add(l);
        });
        return dups;
    };

    const resSharp = indices.map(i => sharpNames[i]);
    const resFlat = indices.map(i => flatNames[i]);
    
    const dupsSharp = countDups(resSharp);
    const dupsFlat = countDups(resFlat);

    let chosenNames;
    if (dupsFlat < dupsSharp) {
        chosenNames = resFlat;
    } else if (dupsSharp < dupsFlat) {
        chosenNames = resSharp;
    } else {
        // Tie-breaker: use key name preference
        const useFlats = key.includes('b') || ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'].includes(key);
        chosenNames = useFlats ? resFlat : resSharp;
    }

    // 3. Construct the scale object
    const allNotes = chosenNames.map((name, i) => `${name}${octaves[i]}`);
    const ding = allNotes[0];
    const sideNotes = allNotes.slice(1);

    return {
        id: `gen-${template.name}-${key}`.toLowerCase().replace(/\s+/g, '-'),
        name: `${key} ${template.name}`,
        top: [ding, ...sideNotes],
        bottom: {}
    };
}

// Custom Modal Logic
function openCustomModal(editScale = null, isClone = false) {
    closeModal(scaleModal); // Ensure main is closed
    showModal(customModal);

    const nameInput = document.getElementById('custom-scale-name');
    const topInput = document.getElementById('custom-scale-top');
    const bottomInput = document.getElementById('custom-scale-bottom');

    if (editScale) {
        if (!isClone) {
            customModal.dataset.editId = editScale.id;
        } else {
            delete customModal.dataset.editId;
        }
        nameInput.value = isClone ? `${editScale.name} (Custom)` : editScale.name;
        topInput.value = editScale.top.join(' ');

        // Convert bottom object to string "Note (Parent) Note (Parent)"
        const bottomStr = Object.entries(editScale.bottom)
            .map(([n, p]) => `${n}(${p})`)
            .join(' ');
        bottomInput.value = bottomStr;
    } else {
        delete customModal.dataset.editId;
        nameInput.value = '';
        topInput.value = '';
        bottomInput.value = '';
    }
}

function handleCustomSave() {
    const nameInput = document.getElementById('custom-scale-name');
    const topInput = document.getElementById('custom-scale-top');
    const bottomInput = document.getElementById('custom-scale-bottom');

    const name = nameInput.value.trim();
    if (!name) return alert('Name is required');

    const topFull = topInput.value.trim().split(/\s+/).filter(n => n);
    if (topFull.length === 0) return alert('At least 1 top note (Ding) is required.');

    // We accept both F#3(F#4) and F#3:F#4 syntax
    const bottomRaw = bottomInput.value.trim().split(/\s+/).filter(n => n);
    const bottom = {};
    bottomRaw.forEach(pair => {
        let n, p;
        if (pair.includes('(')) {
            const m = pair.match(/^([^\(]+)\(([^\)]+)\)$/);
            if (m) { n = m[1]; p = m[2]; }
        } else if (pair.includes(':')) {
            const [nSplit, pSplit] = pair.split(':');
            n = nSplit; p = pSplit;
        }
        if (n && p) bottom[n] = p;
    });

    const editId = customModal.dataset.editId;
    const isEdit = !!editId;
    const id = isEdit ? editId : `custom-${Date.now()}`;

    const scale = {
        id,
        name,
        top: topFull,
        bottom
    };

    const savedScale = saveCustomScale(id, scale);
    closeModal(customModal);

    // If editing currently active scale, select it?
    // Or nicely ask.
    // For now, just re-select it to update UI
    if (onScaleSelectCallback) onScaleSelectCallback(savedScale);

    // Hybrid Workflow: Automatically open Layout Editor after creation
    if (!isEdit) {
        setTimeout(() => {
            openLayoutEditor(scale);
        }, 500); 
    }
}
