
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
}

export function openEditor(item, defaultName = '') {
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
            // Fallback: reconstruct from JSON (Simple reconstruction)
            // We can do this here or assume sourceText is always passed.
            // Given the architecture, let's assume the caller passes the text if they have it, 
            // OR we read from dataset.
            // If we really need reconstruction, we can import a helper.
            // For now, let's try to trust dataset.sourceText.
            // If missing, we might show empty or try to parse 'notes'.
            // Let's implement the reconstruction helper here to be safe and helpful.
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
        // Remove IDs to prevent duplicate ID issues
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        miniContainer.innerHTML = '';
        miniContainer.appendChild(clone);
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
