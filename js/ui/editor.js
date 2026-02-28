
import { NOTE_TO_MIDI } from '../data/constants.js';

// Editor Modal UI handling

let editorModal = null;
let editorName = null;
let editorInput = null;
let editorRepeats = null;
let currentEditItem = null;
let onSaveCallback = null;
let onCopyCallback = null;

export function initEditor(onSave) {
    onSaveCallback = onSave;

    editorModal = document.getElementById('editor-modal');
    editorName = document.getElementById('editor-name');
    editorInput = document.getElementById('editor-input');
    editorRepeats = document.getElementById('editor-repeats');

    document.getElementById('editor-save-btn')?.addEventListener('click', handleSave);
    document.getElementById('editor-cancel-btn')?.addEventListener('click', closeEditor);
    document.getElementById('close-editor-modal')?.addEventListener('click', closeEditor);

    const infoBtn = document.getElementById('editor-notation-info-btn');
    const infoModal = document.getElementById('notation-info-modal');
    const closeInfoBtn = document.getElementById('close-notation-info');

    if (infoBtn && infoModal) {
        infoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            infoModal.style.display = 'flex';
        });
        closeInfoBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            infoModal.style.display = 'none';
        });
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) {
                infoModal.style.display = 'none';
            }
        });
    }

    // Previous bare '|' button listener was removed since we generate it dynamically now.
}

export function openEditor(item, defaultName = '', currentScale = null) {
    if (!editorModal) return;

    currentEditItem = item;

    // Reset
    editorName.value = '';
    editorInput.value = '';
    editorRepeats.value = '1';

    if (item) {
        // Edit existing
        const label = item.querySelector('.prog-label');
        if (label) editorName.value = label.textContent;

        if (item.dataset.sourceText) {
            editorInput.value = item.dataset.sourceText;
        } else {
            editorInput.value = reconstructText(item);
        }
        editorRepeats.value = item.dataset.repeats || 1;
    } else {
        // New
        editorName.value = defaultName;
        editorRepeats.value = 1;
    }

    editorModal.style.display = 'flex';
    editorInput.focus();

    // Render mini handpan
    const mainSvg = document.getElementById('handpan-svg');
    const miniContainer = document.getElementById('editor-mini-handpan');
    if (mainSvg && miniContainer) {
        const clone = mainSvg.cloneNode(true);
        clone.id = 'mini-handpan-svg';
        clone.style.width = '100%';
        clone.style.height = '100%';
        clone.style.display = 'block';
        clone.style.overflow = 'visible';
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        miniContainer.innerHTML = '';
        miniContainer.appendChild(clone);
    }

    // Generate fast insert buttons based on currentScale
    const fastInsertContainer = document.getElementById('editor-fast-insert-buttons');
    if (fastInsertContainer && currentScale) {
        fastInsertContainer.innerHTML = '';

        const createBtn = (label, valueToInsert, isSpecial = false) => {
            const btn = document.createElement('button');
            btn.className = 'fast-insert-btn';
            btn.style.padding = '5px 10px';
            btn.style.fontSize = '0.85rem';
            btn.style.border = '1px solid rgba(0, 0, 0, 0.08)';
            btn.style.borderRadius = '8px';
            btn.style.backgroundColor = 'rgba(0,0,0,0.03)';
            btn.style.color = 'var(--text-main)';
            btn.style.whiteSpace = 'nowrap';
            btn.style.cursor = 'pointer';
            btn.style.transition = 'all 0.2s ease';
            if (isSpecial) {
                btn.style.fontWeight = 'bold';
                btn.style.backgroundColor = 'rgba(0,0,0,0.06)';
            }
            btn.textContent = label;
            btn.type = 'button';

            // Add hover effect via JS since it's an inline-styled element (or we can just rely on the class we add)
            btn.onmouseover = () => {
                btn.style.backgroundColor = 'var(--accent-color)';
                btn.style.color = '#000';
                btn.style.borderColor = 'var(--accent-color)';
                btn.style.transform = 'translateY(-1px)';
            };
            btn.onmouseout = () => {
                btn.style.backgroundColor = isSpecial ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.03)';
                btn.style.color = 'var(--text-main)';
                btn.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                btn.style.transform = 'none';
            };

            btn.onclick = (e) => {
                e.preventDefault();
                if (!editorInput) return;
                const start = editorInput.selectionStart;
                const end = editorInput.selectionEnd;
                const val = editorInput.value;

                let insertStr = valueToInsert;
                if (valueToInsert !== '|' && start > 0 && val[start - 1] !== ' ' && val[start - 1] !== '\n' && val[start - 1] !== '(' && val[start - 1] !== '|') {
                    insertStr = ' ' + insertStr;
                }

                editorInput.value = val.substring(0, start) + insertStr + val.substring(end);
                editorInput.selectionStart = editorInput.selectionEnd = start + insertStr.length;
                editorInput.focus();
            };
            return btn;
        };

        const parseForSort = (str) => {
            const clean = str.replace(/^D:/, '');
            const m = clean.match(/^([A-G][#b]?)([0-8])$/);
            if (!m) return { note: 'C', octave: 0, value: 0, original: str, clean };
            const note = m[1];
            const octave = parseInt(m[2]);
            const val = (octave * 12) + (NOTE_TO_MIDI[note] || 0);
            return { note, octave, value: val, original: str, clean };
        };

        const topNotes = currentScale.top; // array of strings
        const bottomNotes = Object.keys(currentScale.bottom); // array of strings

        const allNotes = [...topNotes, ...bottomNotes];
        const parsed = allNotes.map(s => parseForSort(s));
        parsed.sort((a, b) => a.value - b.value);

        // Render Note Buttons
        parsed.forEach(p => {
            fastInsertContainer.appendChild(createBtn(p.clean, p.clean));
        });

        // Add special buttons separator visually using a small gap
        const sep = document.createElement('div');
        sep.style.width = '1px';
        sep.style.height = '18px';
        sep.style.background = 'var(--glass-border)';
        sep.style.margin = '2px 4px 0 4px';
        fastInsertContainer.appendChild(sep);

        // Add special buttons
        fastInsertContainer.appendChild(createBtn('|', '|', true));
        fastInsertContainer.appendChild(createBtn('-', '-', true));
        fastInsertContainer.appendChild(createBtn('T', 'T'));
        fastInsertContainer.appendChild(createBtn('K', 'K'));
        fastInsertContainer.appendChild(createBtn('t', 't'));
        fastInsertContainer.appendChild(createBtn('k', 'k'));
    }
}

export function closeEditor() {
    if (editorModal) editorModal.style.display = 'none';
    currentEditItem = null;
}

function handleSave() {
    if (!onSaveCallback) return;

    const name = editorName.value.trim() || 'Untitled';
    const text = editorInput.value.trim();
    const repeats = parseInt(editorRepeats.value) || 1;

    // We pass back the data + the reference to the item being edited (if any)
    const data = {
        name,
        text,
        repeats,
        originalItem: currentEditItem
    };

    onSaveCallback(data);
    closeEditor();
}

function reconstructText(item) {
    let events = [];
    try {
        events = JSON.parse(item.dataset.notes);
    } catch (e) { return ''; }

    const renderNote = (n) => {
        if (n.type === 'percussion') return n.isGhost ? n.hand.toLowerCase() : n.hand;
        if (n.type === 'rest') return '-';
        return `${n.note}${n.octave}`;
    }
    return events.map(evt => {
        if (evt.isGroup) {
            return `(${evt.notes.map(renderNote).join(' ')})`; // Wait, format is (A B)/N or just (A B)?
            // Code in parser says `(\([^\)]+\)\/\d+`. So groups must have divisor?
            // If we lost the divisor info (duration), it's hard to reconstruct exactly.
            // But we stored `duration` in note object?
            // `runSequence` uses `duration` multiplier.
            // If all notes in group have same duration...
            // This reconstruction is lossy if we didn't store the exact divisor string.
            // `dataset.sourceText` is the key. We should ALWAYS save it.
            // So reconstruction is a fallback.
            // Let's just join with space for now or give up.
            return evt.notes.map(renderNote).join(' ');
        }
        if (evt.type === 'rest') return '-';
        return renderNote(evt);
    }).join(' ');
}
