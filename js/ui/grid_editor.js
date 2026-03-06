import { NOTE_TO_MIDI } from '../data/constants.js';
import { playTone, getAudioContext, stopAllSounds } from '../audio/engine.js';
import { getFrequencyForNoteName } from '../logic/chords.js';

let dependencies = {};
let scaleNotesSorted = []; // Array of note names, highest to lowest pitch
let notes = []; // Array of { row: int, startTick: int, lengthTicks: int }
let numBeats = 8;
let currentResolution = 1; // 1: 1/4, 2: 1/8, 3: triplets, 4: 1/16
const TICKS_PER_BEAT = 12;

let isPlaying = false;
let playStartTime = 0; // AudioContext time
let startTickOffset = 0; // In case we start from somewhere else (future)
let animationFrameId = null;
let playbackTimeoutId = null;

let undoStack = [];
let redoStack = [];

let currentMode = 'draw'; // 'draw', 'select', 'move'
let selectedNotes = []; // Array of note index numbers

let editingItem = null; // Store reference to Progression Item being edited

const DEFAULT_CELL_HEIGHT = 35;
const DEFAULT_BASE_COL_WIDTH = 40;

let CELL_HEIGHT = DEFAULT_CELL_HEIGHT;
let BASE_COL_WIDTH = DEFAULT_BASE_COL_WIDTH; // width of one subdivision step

export function initGridEditor(deps) {
    dependencies = deps;

    // Modals
    const openBtn = document.getElementById('open-grid-editor-btn');
    const closeBtn = document.getElementById('close-grid-editor-modal');
    const cancelBtn = document.getElementById('grid-cancel-btn');
    const exportBtn = document.getElementById('grid-export-btn');
    const clearBtn = document.getElementById('grid-clear-btn');
    const gridModal = document.getElementById('grid-editor-modal');

    // Undo / Redo
    const undoBtn = document.getElementById('grid-undo-btn');
    const redoBtn = document.getElementById('grid-redo-btn');

    // Modes
    const modeDrawBtn = document.getElementById('grid-mode-draw');
    const modeSelectBtn = document.getElementById('grid-mode-select');
    const modeMoveBtn = document.getElementById('grid-mode-move');

    // Sizing & Res
    const minusBtn = document.getElementById('grid-length-minus');
    const plusBtn = document.getElementById('grid-length-plus');
    const x2Btn = document.getElementById('grid-length-x2');
    const resSelect = document.getElementById('grid-resolution-select');

    // Play
    const playBtn = document.getElementById('grid-play-btn');

    // Zoom
    const zoomHIn = document.getElementById('grid-zoom-h-in');
    const zoomHOut = document.getElementById('grid-zoom-h-out');
    const zoomVIn = document.getElementById('grid-zoom-v-in');
    const zoomVOut = document.getElementById('grid-zoom-v-out');

    if (openBtn) openBtn.addEventListener('click', () => openGridEditor());
    if (closeBtn) closeBtn.addEventListener('click', () => closeGridEditor());
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeGridEditor());

    if (gridModal) {
        gridModal.addEventListener('click', (e) => {
            if (e.target === gridModal) closeGridEditor();
        });
    }

    if (undoBtn) undoBtn.addEventListener('click', undoHistory);
    if (redoBtn) redoBtn.addEventListener('click', redoHistory);

    if (clearBtn) clearBtn.addEventListener('click', () => {
        if (isPlaying) togglePlay();
        saveHistoryState(); notes = []; selectedNotes = []; renderCanvas();
    });
    if (exportBtn) exportBtn.addEventListener('click', exportGridToPhrase);

    const updateModeUI = () => {
        [modeDrawBtn, modeSelectBtn, modeMoveBtn].forEach(btn => {
            if (btn) {
                btn.classList.remove('active-tool');
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.border = 'none';
                btn.style.color = '';
            }
        });

        let activeBtn = modeDrawBtn;
        let color = '#2ed573';
        if (currentMode === 'select') { activeBtn = modeSelectBtn; color = '#f39c12'; }
        if (currentMode === 'move') { activeBtn = modeMoveBtn; color = '#3498db'; }

        if (activeBtn) {
            activeBtn.classList.add('active-tool');
            activeBtn.style.background = `rgba(${color === '#2ed573' ? '46,213,115' : color === '#f39c12' ? '243,156,18' : '52,152,219'}, 0.2)`;
            activeBtn.style.border = `1px solid ${color}`;
            activeBtn.style.color = color;
        }
    };

    if (modeDrawBtn) modeDrawBtn.addEventListener('click', () => { currentMode = 'draw'; selectedNotes = []; renderCanvas(); updateModeUI(); });
    if (modeSelectBtn) modeSelectBtn.addEventListener('click', () => { currentMode = 'select'; updateModeUI(); });
    if (modeMoveBtn) modeMoveBtn.addEventListener('click', () => { currentMode = 'move'; updateModeUI(); });

    if (minusBtn) {
        minusBtn.addEventListener('click', () => {
            if (numBeats > 1) {
                if (isPlaying) togglePlay();
                saveHistoryState();
                numBeats--;
                // Trim notes that fall completely outside the new boundary
                const maxTicks = numBeats * TICKS_PER_BEAT;
                notes = notes.filter(n => n.startTick < maxTicks);
                updateLengthDisplay();
                renderCanvas();
            }
        });
    }
    if (plusBtn) {
        plusBtn.addEventListener('click', () => {
            if (numBeats < 1000) {
                if (isPlaying) togglePlay();
                saveHistoryState();
                numBeats++;
                updateLengthDisplay();
                renderCanvas();
            }
        });
    }
    if (x2Btn) x2Btn.addEventListener('click', () => { if (isPlaying) togglePlay(); duplicateGrid(); });

    // Zoom Listeners
    if (zoomHIn) zoomHIn.addEventListener('click', () => {
        if (BASE_COL_WIDTH < 100) { BASE_COL_WIDTH += 5; renderCanvas(); }
    });
    if (zoomHOut) zoomHOut.addEventListener('click', () => {
        if (BASE_COL_WIDTH > 15) { BASE_COL_WIDTH -= 5; renderCanvas(); }
    });
    if (zoomVIn) zoomVIn.addEventListener('click', () => {
        if (CELL_HEIGHT < 60) { CELL_HEIGHT += 5; renderCanvas(); }
    });
    if (zoomVOut) zoomVOut.addEventListener('click', () => {
        if (CELL_HEIGHT > 15) { CELL_HEIGHT -= 5; renderCanvas(); }
    });

    if (resSelect) {
        resSelect.addEventListener('change', (e) => {
            currentResolution = parseInt(e.target.value);
            renderCanvas();
        });
    }

    // BPM Control
    const gridBpmSlider = document.getElementById('grid-bpm-slider');
    const gridBpmValue = document.getElementById('grid-bpm-value');
    const mainBpmSlider = document.getElementById('bpm-slider');
    const mainBpmValue = document.getElementById('bpm-value');

    if (gridBpmSlider) {
        // Sync initial value when opened
        if (mainBpmSlider) {
            gridBpmSlider.value = mainBpmSlider.value;
            if (gridBpmValue) gridBpmValue.textContent = mainBpmSlider.value;
        }

        gridBpmSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            if (gridBpmValue) gridBpmValue.textContent = val;
            // Sync back to main UI
            if (mainBpmSlider) {
                mainBpmSlider.value = val;
                if (mainBpmValue) mainBpmValue.textContent = val;
                // Dispatch event so engine/scheduler picks it up if they listen to it
                mainBpmSlider.dispatchEvent(new Event('input'));
            }
        });
    }

    if (playBtn) playBtn.addEventListener('click', togglePlay);

    // Canvas interaction
    const scrollArea = document.getElementById('grid-scroll-area');
    const labelsWrapper = document.getElementById('grid-labels-wrapper');
    const numbersScrollArea = document.getElementById('grid-numbers-scroll-area');
    const canvas = document.getElementById('grid-canvas');
    if (scrollArea && labelsWrapper) {
        scrollArea.addEventListener('scroll', () => {
            // Sync vertical scroll to labels
            labelsWrapper.scrollTop = scrollArea.scrollTop;
            // Sync horizontal scroll to numbers track
            if (numbersScrollArea) numbersScrollArea.scrollLeft = scrollArea.scrollLeft;
        });
    }

    if (canvas) {
        setupCanvasInteractions(canvas);
    }
}

function parseNoteForSort(name) {
    const cleanName = name.replace(/^D:/, '');
    const match = cleanName.match(/^([A-G][#b]?)([0-8])$/);
    if (!match) return { original: name, value: 0 };
    const note = match[1];
    const octave = parseInt(match[2]);
    const val = NOTE_TO_MIDI[note] !== undefined ? NOTE_TO_MIDI[note] : 0;
    const midi = (octave + 1) * 12 + val;
    return { original: name, value: midi };
}

// History
function saveHistoryState() {
    undoStack.push({
        numBeats,
        currentResolution,
        notes: JSON.parse(JSON.stringify(notes)) // Deep copy
    });
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
}

function undoHistory() {
    if (undoStack.length === 0) return;
    if (isPlaying) togglePlay();
    redoStack.push({
        numBeats,
        currentResolution,
        notes: JSON.parse(JSON.stringify(notes))
    });
    const state = undoStack.pop();
    numBeats = state.numBeats;
    currentResolution = state.currentResolution;
    notes = state.notes;
    const resSelect = document.getElementById('grid-resolution-select');
    if (resSelect) resSelect.value = currentResolution.toString();
    updateLengthDisplay();
    renderCanvas();
}

function redoHistory() {
    if (redoStack.length === 0) return;
    if (isPlaying) togglePlay();
    undoStack.push({
        numBeats,
        currentResolution,
        notes: JSON.parse(JSON.stringify(notes))
    });
    const state = redoStack.pop();
    numBeats = state.numBeats;
    currentResolution = state.currentResolution;
    notes = state.notes;
    const resSelect = document.getElementById('grid-resolution-select');
    if (resSelect) resSelect.value = currentResolution.toString();
    updateLengthDisplay();
    renderCanvas();
}

export function openGridEditor(phraseString = null, itemId = null) {
    const currentScale = dependencies.getScale();
    if (!currentScale) return;

    let allNotes = [];
    if (currentScale.top) allNotes = [...currentScale.top];
    if (currentScale.bottom) {
        allNotes = [...allNotes, ...Object.keys(currentScale.bottom)];
    }

    const parsed = allNotes.map(parseNoteForSort);
    parsed.sort((a, b) => b.value - a.value);
    scaleNotesSorted = parsed.map(p => p.original);

    editingItem = null;
    if (itemId) {
        editingItem = document.getElementById(itemId);
    } else if (phraseString instanceof HTMLElement) {
        // Backwards compatibility if called with an element
        editingItem = phraseString;
        phraseString = editingItem.dataset.sourceText || editingItem.dataset.rawText || editingItem.dataset.pattern;
    }

    if (phraseString && typeof phraseString === 'string') {
        // Load from existing phrase text
        importPhraseToGrid(phraseString);
    } else {
        // Initial empty state if none exists
        notes = [];
        const sizeSlider = document.getElementById('phrase-size-slider');
        numBeats = sizeSlider ? parseInt(sizeSlider.value) : 8;
        currentResolution = 1;
        const resSelect = document.getElementById('grid-resolution-select');
        if (resSelect) resSelect.value = '1';
    }

    undoStack = [];
    redoStack = [];
    selectedNotes = [];

    // Reset Zoom to defaults
    CELL_HEIGHT = DEFAULT_CELL_HEIGHT;
    BASE_COL_WIDTH = DEFAULT_BASE_COL_WIDTH;

    // Reset mode
    currentMode = 'draw';
    const modeDrawBtn = document.getElementById('grid-mode-draw');
    if (modeDrawBtn) modeDrawBtn.click();

    updateLengthDisplay();
    // Sync BPM when opening just in case it changed outside
    const gridBpmSlider = document.getElementById('grid-bpm-slider');
    const gridBpmValue = document.getElementById('grid-bpm-value');
    const mainBpmSlider = document.getElementById('bpm-slider');
    if (gridBpmSlider && mainBpmSlider) {
        gridBpmSlider.value = mainBpmSlider.value;
        if (gridBpmValue) gridBpmValue.textContent = mainBpmSlider.value;
    }

    updateLengthDisplay();
    document.getElementById('grid-editor-modal').style.display = 'flex';
    renderCanvas();
}

function closeGridEditor() {
    document.getElementById('grid-editor-modal').style.display = 'none';
    if (isPlaying) togglePlay();
}

function updateLengthDisplay() {
    const display = document.getElementById('grid-length-display');
    if (display) display.textContent = numBeats;
}

function duplicateGrid() {
    if (numBeats < 500) {
        saveHistoryState();
        const totalTicks = numBeats * TICKS_PER_BEAT;
        const clonedNotes = notes.map(n => ({
            row: n.row,
            startTick: n.startTick + totalTicks,
            lengthTicks: n.lengthTicks
        }));
        notes = [...notes, ...clonedNotes];
        numBeats *= 2;
        updateLengthDisplay();
        renderCanvas();
    }
}

// Canvas Rendering
function renderCanvas() {
    const canvas = document.getElementById('grid-canvas');
    const container = document.getElementById('grid-labels-container');
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');

    // Sizing
    const totalCols = numBeats * currentResolution;
    const canvasWidth = Math.max(800, totalCols * BASE_COL_WIDTH);
    // Add half a cell height of padding at the bottom so lowest note isn't cut off
    const canvasHeight = (scaleNotesSorted.length * CELL_HEIGHT) + (CELL_HEIGHT / 2);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Labels
    container.innerHTML = '';
    container.style.height = `${canvasHeight}px`;
    const currentScale = dependencies.getScale();
    const mainDingRaw = (currentScale && currentScale.top && currentScale.top[0]) ? currentScale.top[0] : '';
    const mainDingClean = mainDingRaw.replace(/^D:/, '');

    scaleNotesSorted.forEach((noteName, r) => {
        const isDing = noteName.startsWith('D:') || noteName.replace(/^D:/, '') === mainDingClean;
        const displayLabel = noteName.replace(/^D:/, '');
        const div = document.createElement('div');
        div.textContent = displayLabel;
        div.style.height = `${CELL_HEIGHT}px`;
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'flex-end';
        div.style.paddingRight = '8px';
        div.style.fontSize = isDing ? '0.8rem' : '0.75rem';
        div.style.fontWeight = isDing ? '900' : 'bold'; // Extra bold for Dings
        if (isDing) {
            div.style.textShadow = '0px 0px 1px rgba(141, 110, 99, 0.5)'; // subtle shadow to enforce thickness
        }
        div.style.boxSizing = 'border-box'; // Fix 1px creep alignment issue
        div.style.borderBottom = '1px solid rgba(0,0,0,0.1)';
        div.style.color = isDing ? '#8D6E63' : 'rgba(0,0,0,0.85)'; // Ding is now brown
        container.appendChild(div);
    });

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const ticksPerStep = TICKS_PER_BEAT / currentResolution;
    const pixelsPerTick = BASE_COL_WIDTH / ticksPerStep;

    // Horiz Lines
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    const drawnWidth = Math.floor(totalCols * BASE_COL_WIDTH);
    // Draw from r=0 to include the top boundary line
    for (let r = 0; r <= scaleNotesSorted.length; r++) {
        const y = Math.floor(r * CELL_HEIGHT) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(drawnWidth, y); ctx.stroke();
    }

    // Render Beat Numbers Track
    const numbersTrack = document.getElementById('grid-numbers-track');
    if (numbersTrack) {
        numbersTrack.innerHTML = '';
        numbersTrack.style.width = `${drawnWidth}px`;
        // One beat = BASE_COL_WIDTH * currentResolution pixels width
        const pixelsPerBeat = BASE_COL_WIDTH * currentResolution;

        for (let b = 1; b <= numBeats; b++) {
            const numDiv = document.createElement('div');
            numDiv.textContent = b;
            numDiv.style.width = `${pixelsPerBeat}px`;
            numDiv.style.flexShrink = '0';
            numDiv.style.textAlign = 'center'; // Center horizontally
            numDiv.style.fontSize = '0.7rem';
            numDiv.style.fontWeight = 'bold';
            numDiv.style.color = 'rgba(0,0,0,0.5)';
            numDiv.style.boxSizing = 'border-box';
            numDiv.style.borderLeft = '1px solid rgba(0,0,0,0.15)'; // Vertical separator
            numbersTrack.appendChild(numDiv);
        }
    }

    // Vert Lines
    for (let c = 0; c <= totalCols; c++) {
        const x = Math.floor(c * BASE_COL_WIDTH) + 0.5;
        if (c % currentResolution === 0) {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'; // Beat line
        } else {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)'; // Sub division
        }
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, (scaleNotesSorted.length * CELL_HEIGHT)); ctx.stroke();
    }

    // Filter notes beyond bounds just in case (optional, we'll keep them around if user shrinks grid)

    // Draw Notes
    notes.forEach((note, index) => {
        const x = (note.startTick / TICKS_PER_BEAT) * BASE_COL_WIDTH * currentResolution;
        const y = note.row * CELL_HEIGHT;
        const w = (note.lengthTicks / TICKS_PER_BEAT) * BASE_COL_WIDTH * currentResolution;
        const h = CELL_HEIGHT;

        const isSelected = selectedNotes.includes(index);

        // 3D Voluminous styling
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, '#2ecc71'); // Lighter vivid green top
        grad.addColorStop(1, '#229954'); // Darker solid green bottom

        ctx.fillStyle = grad;

        // Shadow for depth
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.shadowOffsetX = 0;

        // Draw rounded rectangle
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 6);
        } else {
            ctx.rect(x + 2, y + 2, w - 4, h - 4);
        }
        ctx.fill();

        // Optional: 1px subtle stroke for shine inside (top edge)
        if (ctx.roundRect) {
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.shadowColor = 'transparent'; // Remove shadow before stroke
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 6);
            ctx.stroke();

            // Highlight if selected
            if (isSelected) {
                ctx.strokeStyle = '#f39c12';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 6);
                ctx.stroke();
            }
        }

        // Reset shadow for text and other drawings
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Print Note Name inside active blocks
        const displayLabel = scaleNotesSorted[note.row].replace(/^D:/, '');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Only draw text if cell width can comfortably hold it (approx > 18px)
        if (w > 18) {
            ctx.fillText(displayLabel, x + (w / 2), y + (h / 2));
        }
    });
}

function setupCanvasInteractions(canvas) {
    let isDragging = false;
    let dragAction = null; // 'add' or 'remove'
    let lastHandledCell = null;
    let dragStartCell = null;
    let initialSelectedStates = [];

    const getCellFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        // Handle scroll and zoom
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const row = Math.floor(y / CELL_HEIGHT);
        const col = Math.floor(x / BASE_COL_WIDTH);
        return { row, col };
    };

    canvas.addEventListener('pointerdown', (e) => {
        if (isPlaying) togglePlay(); // Custom UX: stop playback on edit

        // Ensure the canvas captures the pointer so dragging outside doesn't lose the event
        canvas.setPointerCapture(e.pointerId);

        const { row, col } = getCellFromEvent(e);
        const maxCols = numBeats * currentResolution;
        if (row < 0 || row >= scaleNotesSorted.length || col < 0 || col >= maxCols) return;

        const ticksPerStep = TICKS_PER_BEAT / currentResolution;
        const targetTick = col * ticksPerStep;
        const existingIdx = notes.findIndex(n => n.row === row && targetTick >= n.startTick && targetTick < n.startTick + n.lengthTicks);

        if (currentMode === 'select') {
            if (existingIdx > -1) {
                const selIdx = selectedNotes.indexOf(existingIdx);
                if (selIdx > -1) {
                    selectedNotes.splice(selIdx, 1);
                } else {
                    selectedNotes.push(existingIdx);
                }
            } else {
                selectedNotes = []; // Clicked empty space clears selection
            }
            renderCanvas();
            return;
        }

        if (currentMode === 'move') {
            if (selectedNotes.length === 0) return;
            saveHistoryState();
            isDragging = true;
            dragStartCell = { row, col };
            // Store original positions of selected notes
            initialSelectedStates = selectedNotes.map(idx => ({ ...notes[idx] }));
            return;
        }

        // Draw mode
        saveHistoryState();

        if (existingIdx > -1) {
            dragAction = 'remove';
            notes.splice(existingIdx, 1);
        } else {
            dragAction = 'add';
            notes.push({ row, startTick: targetTick, lengthTicks: ticksPerStep });

            const freq = getFrequencyForNoteName(scaleNotesSorted[row]);
            if (freq) playTone(freq, scaleNotesSorted[row]);
        }

        isDragging = true;
        lastHandledCell = `${row},${col}`;
        renderCanvas();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const { row, col } = getCellFromEvent(e);
        const maxCols = numBeats * currentResolution;

        if (currentMode === 'move') {
            const cellId = `${row},${col}`;
            if (cellId === lastHandledCell) return;
            lastHandledCell = cellId;

            const ticksPerStep = TICKS_PER_BEAT / currentResolution;
            const deltaRow = row - dragStartCell.row;
            const deltaCol = col - dragStartCell.col;
            const deltaTicks = deltaCol * ticksPerStep;

            // Calculate bounds
            let minAllowedDeltaRow = -Infinity;
            let maxAllowedDeltaRow = Infinity;
            let minAllowedDeltaTicks = -Infinity;
            let maxAllowedDeltaTicks = Infinity;

            const maxTicks = numBeats * TICKS_PER_BEAT;

            initialSelectedStates.forEach(n => {
                minAllowedDeltaRow = Math.max(minAllowedDeltaRow, -n.row);
                maxAllowedDeltaRow = Math.min(maxAllowedDeltaRow, scaleNotesSorted.length - 1 - n.row);

                minAllowedDeltaTicks = Math.max(minAllowedDeltaTicks, -n.startTick);
                maxAllowedDeltaTicks = Math.min(maxAllowedDeltaTicks, maxTicks - (n.startTick + n.lengthTicks));
            });

            const finalDeltaRow = Math.max(minAllowedDeltaRow, Math.min(maxAllowedDeltaRow, deltaRow));
            const finalDeltaTicks = Math.max(minAllowedDeltaTicks, Math.min(maxAllowedDeltaTicks, deltaTicks));

            selectedNotes.forEach((idx, i) => {
                notes[idx].row = initialSelectedStates[i].row + finalDeltaRow;
                notes[idx].startTick = initialSelectedStates[i].startTick + finalDeltaTicks;
            });

            renderCanvas();
            return;
        }

        if (row < 0 || row >= scaleNotesSorted.length || col < 0 || col >= maxCols) return;

        const cellId = `${row},${col}`;
        if (cellId === lastHandledCell) return; // Prevent spamming identical cell
        lastHandledCell = cellId;

        const ticksPerStep = TICKS_PER_BEAT / currentResolution;
        const targetTick = col * ticksPerStep;

        const existingIdx = notes.findIndex(n => n.row === row && targetTick >= n.startTick && targetTick < n.startTick + n.lengthTicks);

        if (currentMode === 'draw') {
            if (dragAction === 'add') {
                if (existingIdx === -1) {
                    notes.push({ row, startTick: targetTick, lengthTicks: ticksPerStep });
                    const freq = getFrequencyForNoteName(scaleNotesSorted[row]);
                    if (freq) playTone(freq, scaleNotesSorted[row]);
                }
            } else if (dragAction === 'remove') {
                if (existingIdx > -1) notes.splice(existingIdx, 1);
            }
        }

        renderCanvas();
    });

    const endDrag = (e) => {
        isDragging = false;
        canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
}

// Shifting
function shiftLeft() {
    saveHistoryState();
    const ticksPerStep = TICKS_PER_BEAT / currentResolution;
    notes.forEach(n => { n.startTick -= ticksPerStep; });
    notes = notes.filter(n => n.startTick >= 0);
    renderCanvas();
}
function shiftRight() {
    saveHistoryState();
    const ticksPerStep = TICKS_PER_BEAT / currentResolution;
    notes.forEach(n => { n.startTick += ticksPerStep; });
    // Filter against bounds
    const maxTick = numBeats * TICKS_PER_BEAT;
    notes = notes.filter(n => n.startTick < maxTick);
    renderCanvas();
}
function shiftUp() {
    saveHistoryState();
    notes.forEach(n => { n.row -= 1; });
    notes = notes.filter(n => n.row >= 0);
    renderCanvas();
}
function shiftDown() {
    saveHistoryState();
    notes.forEach(n => { n.row += 1; });
    notes = notes.filter(n => n.row < scaleNotesSorted.length);
    renderCanvas();
}

// Playback Scheduler
function togglePlay() {
    const btn = document.getElementById('grid-play-btn');
    isPlaying = !isPlaying;
    if (isPlaying) {
        if (btn) btn.textContent = 'Stop ⏹';
        startPlayback();
    } else {
        if (btn) btn.textContent = 'Play ▶';
        cancelAnimationFrame(animationFrameId);
        clearTimeout(playbackTimeoutId);
        playbackTimeoutId = null;
        animationFrameId = null;
        stopAllSounds();
        renderCanvas(); // Redraw without playhead
    }
}

function startPlayback() {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const bpmInput = document.getElementById('grid-bpm-slider') || document.getElementById('bpm-slider');
    const bpm = bpmInput ? parseInt(bpmInput.value) : 80;
    // Match progression stage default (1 step = 8th note)
    const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT * 2;

    // playStartTime is updated every loop iteration
    playStartTime = audioCtx.currentTime;

    // Clear old animation frame and timeouts so we don't spawn multiple
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    if (playbackTimeoutId) {
        clearTimeout(playbackTimeoutId);
        playbackTimeoutId = null;
    }

    // Sort notes and schedule
    notes.forEach(note => {
        if (note.startTick < numBeats * TICKS_PER_BEAT) { // Only play notes within bounds
            const delaySec = note.startTick / ticksPerSecond;
            const noteTime = playStartTime + delaySec;
            const freq = getFrequencyForNoteName(scaleNotesSorted[note.row]);
            if (freq) {
                // Determine duration in sec
                // For a Handpan, we usually want the note to ring out (e.g., 3.0s) rather than gating it
                // Note length visually determines rhythm, but audio should sustain naturally.
                playTone(freq, scaleNotesSorted[note.row], 3.0, noteTime, true);
            }
        }
    });

    // Schedule the next loop iteration exactly at the end of this bounds
    const totalBeatsDurationSec = (numBeats * TICKS_PER_BEAT) / ticksPerSecond;
    playbackTimeoutId = setTimeout(() => {
        if (isPlaying) {
            startPlayback(); // Trigger the next loop
        }
    }, totalBeatsDurationSec * 1000);

    // Initial draw playhead is decoupled from audio scheduling directly now
    if (!animationFrameId) {
        drawPlayhead();
    }
}

function drawPlayhead() {
    if (!isPlaying) return;
    const audioCtx = getAudioContext();
    // Default to grid slider first
    const bpmInput = document.getElementById('grid-bpm-slider') || document.getElementById('bpm-slider');
    const bpm = bpmInput ? parseInt(bpmInput.value) : 80;
    // Progression stage plays default 1-duration tokens as eighth notes (beatDuration / 2).
    // So we double ticksPerSecond here to match that exact "fast" tempo feel.
    const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT * 2;

    const elapsedSec = audioCtx.currentTime - playStartTime;
    const elapsedTicks = elapsedSec * ticksPerSecond;

    const maxTicks = numBeats * TICKS_PER_BEAT;

    // We loop the playhead visually by modulating the elapsed ticks by maxTicks
    // So it snaps back to 0 when it hits the end.
    const currentTickWrap = elapsedTicks % maxTicks;

    renderCanvas(); // Redraw grid

    // Draw playhead over it
    const canvas = document.getElementById('grid-canvas');
    const ctx = canvas.getContext('2d');

    const ticksPerStep = TICKS_PER_BEAT / currentResolution;
    const pxPerTick = BASE_COL_WIDTH / ticksPerStep;
    const playheadX = currentTickWrap * pxPerTick;

    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.height);
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sync scroll slightly to keep playhead in view
    const scrollArea = document.getElementById('grid-scroll-area');
    if (scrollArea) {
        const viewRight = scrollArea.scrollLeft + scrollArea.clientWidth;
        if (playheadX > viewRight - 50) {
            scrollArea.scrollLeft += 100;
        } else if (playheadX < scrollArea.scrollLeft) {
            scrollArea.scrollLeft = 0;
        }
    }

    animationFrameId = requestAnimationFrame(drawPlayhead);
}

// Exporter
function exportGridToPhrase() {
    const totalTicks = numBeats * TICKS_PER_BEAT;
    const activeTicks = {};

    // Using current resolution to group notes
    const ticksPerStep = TICKS_PER_BEAT / currentResolution;
    const totalSteps = numBeats * currentResolution;

    notes.forEach(note => {
        // Ignore out of bounds notes
        if (note.startTick >= totalTicks) return;

        // Quantize note start to the current step grid
        // This is important because they might switch res to 1/4 after drawing 1/8 notes
        // We will stick exactly to the startTick they chose, but export groups by step
        if (!activeTicks[note.startTick]) activeTicks[note.startTick] = [];
        const cleanName = scaleNotesSorted[note.row].replace(/^D:/, '');
        activeTicks[note.startTick].push(cleanName);
    });

    const tokens = [];
    for (let step = 0; step < totalSteps; step++) {
        const tick = step * ticksPerStep;
        // Group all notes that fall between this step and the next step?
        // Let's just grab exact matches for now.
        const notesAtTick = activeTicks[tick] || [];

        if (notesAtTick.length === 0) {
            tokens.push('-');
        } else if (notesAtTick.length === 1) {
            tokens.push(notesAtTick[0]);
        } else {
            // deduplicate
            const unique = [...new Set(notesAtTick)];
            tokens.push(unique.join('|'));
        }
    }

    let phraseOutput = tokens.join(' ');
    // Remove trailing rests to clean up output
    phraseOutput = phraseOutput.replace(/( -\s*)+$/, '');

    if (phraseOutput === '') phraseOutput = '-';

    if (currentResolution > 1) {
        phraseOutput = `(${phraseOutput})/${currentResolution}`;
    }

    closeGridEditor();

    if (editingItem && dependencies.updateProgressionItem) {
        // Update the card directly
        dependencies.updateProgressionItem(editingItem, {
            name: (editingItem.querySelector('.prog-label') ? editingItem.querySelector('.prog-label').textContent : 'Grid Pattern'),
            text: phraseOutput,
            repeats: (editingItem.dataset.repeats ? parseInt(editingItem.dataset.repeats) : 1)
        });
    } else if (dependencies.openEditor) {
        // Create new item via standard phrase editor
        dependencies.openEditor(null, 'Grid Pattern');
        setTimeout(() => {
            const input = document.getElementById('editor-input');
            if (input) {
                input.value = phraseOutput;
                input.dispatchEvent(new Event('input'));
            }
        }, 50);
    }
}

function importPhraseToGrid(phraseInput) {
    notes = [];
    currentResolution = 1;
    let rawStr = phraseInput.trim();

    // Still extract resolution if wrapper exists e.g. (A B C)/2
    const match = rawStr.match(/^\((.*)\)\/(\d+)$/);
    if (match) {
        currentResolution = parseInt(match[2]);
    }

    const resSelect = document.getElementById('grid-resolution-select');
    if (resSelect) resSelect.value = currentResolution.toString();

    // Use robust main parser which handles 'D', '1', '2' -> exact pitch objects
    if (!dependencies.parseText) {
        console.error('Dependencies.parseText not provided to Grid Editor!');
        return;
    }

    const parsedEvents = dependencies.parseText(phraseInput);

    // We walk through the sequence to count ticks
    let currentTick = 0;
    const ticksPerWholeBeat = TICKS_PER_BEAT;

    parsedEvents.forEach(evt => {
        // duration in the parser is given relative to a standard beat=1 (eighth note base)
        // A duration of 1 usually means 1 step in the phrase.
        // E.g. (A B C)/2 means each has duration 0.5.
        // Since we are building back into a grid with a fixed `currentResolution`,
        // each logical "step" of the sequence usually maps directly to `TICKS_PER_BEAT / currentResolution`

        // Let's compute exact ticks based on parsed duration
        // Wait, parser outputs duration like: if divided by 2 -> 0.5 duration.
        // A 1 quarter note beat = 12 ticks. Thus a duration of 1 = 12 ticks?
        // Actually the Progression loop treats duration 1 as a single step token.
        // In Grid, 1 step token = `TICKS_PER_BEAT / currentResolution` ticks.

        // Calculate step length in ticks
        // Since the parser output standardizes everything relative to the token count,
        // we can just multiply token duration by TICKS_PER_BEAT
        const duration = evt.duration || 1;
        const stepTicks = Math.round(duration * TICKS_PER_BEAT * currentResolution);

        if (evt.type === 'rest') {
            currentTick += stepTicks;
            return;
        }

        const handleNote = (noteObj) => {
            if (!noteObj.note) {
                console.warn("Grid Parser Warning: Could not find note property in:", noteObj);
                return;
            }
            const noteName = `${noteObj.note}${noteObj.octave}`;

            // Note could match a normal note or a Ding.
            // Dings on canvas might look like 'D:C3', while normal text is 'C3'. 
            // So we compare ignoring 'D:'.
            const rowIdx = scaleNotesSorted.findIndex(s => s.replace(/^D:/, '') === noteName.toUpperCase());

            if (rowIdx > -1) {
                notes.push({
                    row: rowIdx,
                    startTick: currentTick,
                    lengthTicks: stepTicks
                });
            } else {
                console.warn(`Grid Parser Warning: Note ${noteName.toUpperCase()} not found in grid scale!`);
            }
        };

        if (evt.isGroup) {
            evt.notes.forEach(handleNote);
        } else {
            handleNote(evt);
        }

        currentTick += stepTicks;
    });

    // Auto-size length display based on max tick reached
    // currentTick represents total ticks of the phrase.
    // Convert back to beats (1 beat = TICKS_PER_BEAT).
    const calculatedBeats = Math.ceil(currentTick / TICKS_PER_BEAT);

    // Set precise phrase size based on parsed content
    numBeats = Math.max(1, calculatedBeats);
}
