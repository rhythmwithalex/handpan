
import { sortNotesByPitch } from '../logic/chords.js';

let stageContainer = null;
let dependencies = {};
// dependencies: { openEditor, onUpdate, getScale, parseText, stopPlayback }

export function initProgressionUI(containerId, deps) {
    stageContainer = document.getElementById(containerId);
    dependencies = deps;

    if (stageContainer) {
        stageContainer.addEventListener('dragover', handleDragOver);

        const clearBtn = document.getElementById('clear-progression');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearProgression);
        }

        const addCustomBtn = document.getElementById('add-custom-chord');
        if (addCustomBtn) {
            addCustomBtn.addEventListener('click', () => {
                const nextName = getNextDefaultName();
                dependencies.openEditor(null, nextName); // Open new with auto-name
            });
        }
    }
}

export function getNextDefaultName() {
    if (!stageContainer) return 'A';
    const count = stageContainer.querySelectorAll('.progression-item').length;
    const charCode = 65 + (count % 26); // A-Z
    let label = String.fromCharCode(charCode);
    if (count >= 26) {
        label += (Math.floor(count / 26) + 1);
    }
    return label;
}

export function getProgressionChords() {
    if (!stageContainer) return [];
    const items = stageContainer.querySelectorAll('.progression-item');
    const chords = [];
    const currentScale = dependencies.getScale ? dependencies.getScale() : null;

    items.forEach(item => {
        if (item.dataset.notes) {
            try {
                let notes = JSON.parse(item.dataset.notes);
                // Validation: ensure freq exists
                if (notes.length > 0 && typeof notes[0].freq === 'undefined' && dependencies.parseText && currentScale) {
                    // Fallback: re-parse from source text
                    if (item.dataset.sourceText) {
                        notes = dependencies.parseText(item.dataset.sourceText, currentScale);
                    }
                }
                const localRepeats = item.dataset.repeats ? parseInt(item.dataset.repeats) : 1;
                chords.push({ notes, localRepeats, element: item });
            } catch (e) {
                console.error("Error parsing progression item:", e);
            }
        }
    });
    return chords;
}

export function exportProgressionData() {
    if (!stageContainer) return [];
    const items = stageContainer.querySelectorAll('.progression-item');
    const data = [];

    items.forEach(item => {
        const labelEl = item.querySelector('.prog-label');
        const name = labelEl ? labelEl.textContent : 'Untitled';
        const text = item.dataset.sourceText || '';
        const repeats = item.dataset.repeats ? parseInt(item.dataset.repeats) : 1;
        data.push({ name, text, repeats });
    });

    return data;
}

export function addChordToProgression(chord, specificNotes = null, label = null, rawText = null, defaultRepeats = 1) {
    const item = document.createElement('div');
    item.className = 'progression-item glass-card-small';
    item.draggable = true;
    if (defaultRepeats > 1) {
        item.dataset.repeats = defaultRepeats;
    }

    let displayNotes = [];
    let actualNotes = [];
    let chordName = chord ? chord.name : "Custom Chord";

    if (chord) {
        if (specificNotes) {
            if (rawText || label === 'Copy' || chord.name === 'Copy') {
                actualNotes = specificNotes;
                displayNotes = specificNotes.map(n => {
                    if (n.isGroup) return 'GRP';
                    return n.type === 'percussion' ? n.hand : (n.note ? `${n.note}${n.octave}` : '-');
                });
            } else {
                const sorted = sortNotesByPitch(specificNotes);
                actualNotes = sorted;
                displayNotes = sorted.map(n => `${n.note}${n.octave}`);
            }
        } else {
            const rootNote = chord.root;
            let bestVoicing = chord.voicings.find(v => v.length === 3 && v[0].note === rootNote);
            if (!bestVoicing) bestVoicing = chord.voicings[0];

            const base = bestVoicing || chord.arpeggio;
            actualNotes = sortNotesByPitch(base);
            displayNotes = actualNotes.map(n => `${n.note}${n.octave}`);
        }
    } else {
        chordName = "Musical Phrase";
        if (specificNotes) {
            actualNotes = specificNotes;
            displayNotes = specificNotes.map(evt => {
                const renderN = (n) => n.type === 'percussion' ? (n.isGhost ? n.hand.toLowerCase() : n.hand) : `${n.note}${n.octave}`;
                if (evt.isGroup) {
                    return evt.notes.map(renderN).join('|');
                }
                return renderN(evt);
            });
        }
    }

    // Clone for dataset
    const clonedNotes = actualNotes.map(evt => {
        const clone = { ...evt, duration: evt.duration || 1 };
        if (evt.isGroup) {
            clone.notes = evt.notes.map(n => ({ ...n }));
        }
        return clone;
    });

    item.dataset.notes = JSON.stringify(clonedNotes);
    item.dataset.sourceText = rawText || displayNotes.join(' ');

    let headerContentNotes = '';

    // Prefer raw text display for Custom Phrases (when chord is null or explicit rawText is provided)
    if (rawText && (!chord || chord.name === "Custom Chord" || chord.name === "Custom Arp" || chord.name === "Musical Phrase")) {
        headerContentNotes = generateHTMLFromText(rawText);
    } else {
        headerContentNotes = generateTruncatedNotesHTML(actualNotes);
    }

    // Auto-generate name
    let finalLabel = label;

    // If no label, or generic "Untitled"/"Musical Phrase", generate A, B, C...
    const isGeneric = !finalLabel || finalLabel === 'Untitled' || finalLabel === 'Custom Arp' || finalLabel === 'Custom Chord' || finalLabel === 'Musical Phrase';

    if (isGeneric) {
        if (chord && chord.name && chord.name !== 'Custom Chord') {
            finalLabel = chordName;
        } else {
            const count = stageContainer ? stageContainer.querySelectorAll('.progression-item').length : 0;
            const nextChar = String.fromCharCode(65 + (count % 26)); // A, B, C...
            finalLabel = nextChar;

            // If we have more than 26, maybe A1? For now A..Z is enough.
            if (count >= 26) {
                finalLabel += Math.floor(count / 26) + 1;
            }
        }
    }

    renderItemDOM(item, finalLabel, headerContentNotes);
    setupItemEvents(item);

    if (defaultRepeats > 1) {
        renderRepeatsBadge(item, defaultRepeats);
    }

    if (stageContainer) {
        const placeholder = stageContainer.querySelector('.placeholder-text');
        if (placeholder) placeholder.remove();

        stageContainer.appendChild(item);
        stageContainer.scrollLeft = stageContainer.scrollWidth;

        // Legacy behavior: open editor for new custom chords if empty
        if (!chord && specificNotes === null) {
            dependencies.openEditor(item, finalLabel);
        }
    }
}

export function updateProgressionItem(item, data) {
    // data = { name, text, repeats }
    const label = item.querySelector('.prog-label');
    if (label) label.textContent = data.name;

    const currentScale = dependencies.getScale();
    const validNotes = dependencies.parseText(data.text, currentScale);

    item.dataset.notes = JSON.stringify(validNotes);
    item.dataset.sourceText = data.text;

    if (data.repeats > 0) {
        item.dataset.repeats = data.repeats;
    } else {
        delete item.dataset.repeats;
    }

    const notesContainer = item.querySelector('.prog-notes');
    if (notesContainer) {
        // Use text for display if available
        if (data.text) {
            notesContainer.innerHTML = generateHTMLFromText(data.text);
        } else {
            notesContainer.innerHTML = generateTruncatedNotesHTML(validNotes);
        }
    }

    renderRepeatsBadge(item, data.repeats);

    if (dependencies.onUpdate) dependencies.onUpdate();
}

function renderItemDOM(item, label, notesHTML) {
    item.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'prog-header';

    const titleContainer = document.createElement('div');
    titleContainer.style.display = 'flex';
    titleContainer.style.alignItems = 'center';
    titleContainer.style.gap = '8px';
    titleContainer.style.cursor = 'pointer';
    titleContainer.onclick = (e) => {
        e.stopPropagation();
        dependencies.openEditor(item);
    };

    const titleSpan = document.createElement('span');
    titleSpan.className = 'prog-label';
    titleSpan.textContent = label;
    titleSpan.style.fontWeight = 'bold';

    const editIcon = document.createElement('span');
    editIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.7;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
    editIcon.title = "Edit";

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'icon-btn';
    duplicateBtn.title = "Duplicate";
    duplicateBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    duplicateBtn.onclick = (e) => {
        e.stopPropagation();
        const currentNotes = item.dataset.notes ? JSON.parse(item.dataset.notes) : [];
        const currentRaw = item.dataset.sourceText;
        addChordToProgression({ name: "Copy", notes: [] }, currentNotes, undefined, currentRaw);
        if (dependencies.onUpdate) dependencies.onUpdate();
    };

    titleContainer.appendChild(titleSpan);
    titleContainer.appendChild(editIcon);
    titleContainer.appendChild(duplicateBtn);

    const actionsDiv = document.createElement('div');
    actionsDiv.style.display = 'flex';
    actionsDiv.style.gap = '5px';

    const removeSpan = document.createElement('span');
    removeSpan.className = 'remove-btn';
    removeSpan.innerHTML = '&times;';
    removeSpan.onclick = (e) => {
        e.stopPropagation();
        item.remove();
        if (dependencies.stopPlayback) dependencies.stopPlayback();
        if (dependencies.onUpdate) dependencies.onUpdate();
    };

    actionsDiv.appendChild(removeSpan);

    header.appendChild(titleContainer);
    header.appendChild(actionsDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'prog-info';
    contentDiv.innerHTML = `<div class="prog-notes">${notesHTML}</div>`;

    item.appendChild(header);
    item.appendChild(contentDiv);
}

function setupItemEvents(item) {
    item.addEventListener('dragstart', () => {
        item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
    });
}

function renderRepeatsBadge(item, repeats) {
    let b = item.querySelector('.repeat-badge');
    if (repeats > 1) {
        if (!b) {
            b = document.createElement('div');
            b.className = 'repeat-badge';
            item.appendChild(b);
        }
        b.textContent = `x${repeats}`;
    } else {
        if (b) b.remove();
    }
}

export function clearProgression(triggerSave = true) {
    if (stageContainer) {
        stageContainer.innerHTML = '<div class="placeholder-text">Click + on a card to add to progression</div>';
    }
    if (dependencies.stopPlayback) dependencies.stopPlayback();
    if (triggerSave && dependencies.onUpdate) dependencies.onUpdate();
}

export function loadProgressionData(dataArray) {
    clearProgression(false); // don't trigger save during load
    if (!dataArray || !Array.isArray(dataArray)) return;

    dataArray.forEach(item => {
        if (!item.text) return;
        const currentScale = dependencies.getScale ? dependencies.getScale() : null;
        let parsedNotes = [];
        if (dependencies.parseText && currentScale) {
            parsedNotes = dependencies.parseText(item.text, currentScale);
        }
        addChordToProgression(null, parsedNotes, item.name, item.text);

        // Apply repeats if needed
        if (item.repeats > 1 && stageContainer) {
            const addedItem = stageContainer.lastElementChild;
            if (addedItem && addedItem.classList.contains('progression-item')) {
                addedItem.dataset.repeats = item.repeats;
                updateProgressionItem(addedItem, item);
            }
        }
    });
}

function handleDragOver(e) {
    e.preventDefault();
    const afterElement = getDragAfterElement(stageContainer, e.clientX);
    const draggable = document.querySelector('.dragging');
    if (draggable) {
        if (afterElement == null) {
            stageContainer.appendChild(draggable);
        } else {
            stageContainer.insertBefore(draggable, afterElement);
        }
    }
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.progression-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function generateTruncatedNotesHTML(notes) {
    if (!notes || notes.length === 0) return `<span class="tiny-note" style="opacity:0.3">Empty...</span>`;

    const MAX_NOTES = 6;
    let html = '';

    // Process first N notes
    const slice = notes.slice(0, MAX_NOTES);
    slice.forEach(evt => {
        if (evt.isGroup) {
            html += `<span class="tiny-note-group">(`;
            evt.notes.forEach(n => {
                html += renderSingleNoteHTML(n);
            });
            html += `)</span>`;
        } else {
            html += renderSingleNoteHTML(evt);
        }
    });

    if (notes.length > MAX_NOTES) {
        html += `<span class="tiny-note" style="opacity:0.6">...</span>`;
    }
    return html;
}

function renderSingleNoteHTML(n) {
    if (n.type === 'percussion') {
        const color = n.hand === 'K' ? '#ff8c00' : '#ffd700';
        const opacity = n.isGhost ? 0.5 : 1;
        return `<span class="tiny-note" style="color:${color}; opacity:${opacity}">${n.hand}</span>`;
    } else if (n.type === 'rest') {
        return `<span class="tiny-note" style="opacity:0.3">-</span>`;
    } else {
        return `<span class="tiny-note note-pill">${n.note}${n.octave}</span>`;
    }
}

function generateHTMLFromText(text) {
    if (!text) return '';
    let displayText = text.trim();
    if (displayText.length > 20) {
        displayText = displayText.substring(0, 20) + '...';
    }
    // Split by spaces to create tokens, preserve groups visually if possible
    const tokens = displayText.split(/\s+/);
    return tokens.map(token => {
        // Simple styling for tokens
        return `<span class="tiny-note note-pill">${token}</span>`;
    }).join('');
}
