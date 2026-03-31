import { NOTE_TO_MIDI } from '../data/constants.js';
import { playTone, playTak, getAudioContext, stopAllSounds } from '../audio/engine.js';
import { getFrequencyForNoteName } from '../logic/chords.js';
import { renderHandpanSVG } from './visualizer.js';

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
let marqueeBox = null; // { startX, startY, currentX, currentY }
let isGuitarHeroMode = false;
let isShowHandpan = false;
let isDirty = false;

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
    const modeSelectAllBtn = document.getElementById('grid-mode-select-all');
    const modeMoveBtn = document.getElementById('grid-mode-move');
    const modePanBtn = document.getElementById('grid-mode-pan');
    const modeDeleteBtn = document.getElementById('grid-mode-delete');

    // Sizing & Res
    const minusBtn = document.getElementById('grid-length-minus');
    const plusBtn = document.getElementById('grid-length-plus');
    const x2Btn = document.getElementById('grid-length-x2');
    const resSelect = document.getElementById('grid-resolution-select');

    // Play & GH
    const playBtn = document.getElementById('grid-play-btn');
    const ghBtn = document.getElementById('grid-gh-btn');
    const ghStopBtn = document.getElementById('grid-gh-stop-btn');

    // Zoom
    const zoomHIn = document.getElementById('grid-zoom-h-in');
    const zoomHOut = document.getElementById('grid-zoom-h-out');
    const zoomVIn = document.getElementById('grid-zoom-v-in');
    const zoomVOut = document.getElementById('grid-zoom-v-out');

    const showHandpanCheck = document.getElementById('grid-show-handpan-check');

    if (openBtn) openBtn.addEventListener('click', () => openGridEditor());
    if (closeBtn) closeBtn.addEventListener('click', () => closeGridEditor());
    if (cancelBtn) cancelBtn.addEventListener('click', () => closeGridEditor());

    if (gridModal) {
        gridModal.addEventListener('click', (e) => {
            if (window.getSelection().toString().length > 0) return;
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
        [modeDrawBtn, modeSelectBtn, modeMoveBtn, modePanBtn].forEach(btn => {
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
        if (currentMode === 'pan') { activeBtn = modePanBtn; color = '#f1c40f'; }

        if (activeBtn) {
            activeBtn.classList.add('active-tool');
            if (currentMode === 'draw') {
                activeBtn.style.background = 'rgba(46,213,115,0.2)';
            } else if (currentMode === 'select') {
                activeBtn.style.background = 'rgba(243,156,18,0.2)';
            } else if (currentMode === 'move') {
                activeBtn.style.background = 'rgba(52,152,219,0.2)';
            } else if (currentMode === 'pan') {
                activeBtn.style.background = 'rgba(241,196,15,0.2)';
            }
            activeBtn.style.border = `1px solid ${color}`;
            activeBtn.style.color = color;
        }

        // Contextual Delete Button
        if (modeDeleteBtn) {
            if (currentMode === 'select' && selectedNotes.length > 0) {
                modeDeleteBtn.style.display = 'inline-block';
            } else {
                modeDeleteBtn.style.display = 'none';
            }
        }

        // Toggle native touch scrolling on the canvas for mobile Pan mode
        const canvas = document.getElementById('grid-canvas');
        if (canvas) {
            if (currentMode === 'pan') {
                canvas.style.touchAction = 'auto';
            } else {
                canvas.style.touchAction = 'none';
            }
        }
    };

    if (modeDrawBtn) modeDrawBtn.addEventListener('click', () => { currentMode = 'draw'; selectedNotes = []; renderCanvas(); updateModeUI(); });
    if (modeSelectBtn) modeSelectBtn.addEventListener('click', () => { currentMode = 'select'; updateModeUI(); renderCanvas(); });
    if (modeSelectAllBtn) modeSelectAllBtn.addEventListener('click', () => {
        currentMode = 'select';
        selectedNotes = [];
        for (let i = 0; i < notes.length; i++) {
            if (notes[i]) selectedNotes.push(i);
        }
        updateModeUI();
        renderCanvas();
    });
    if (modeMoveBtn) modeMoveBtn.addEventListener('click', () => { currentMode = 'move'; updateModeUI(); renderCanvas(); });
    if (modePanBtn) modePanBtn.addEventListener('click', () => { currentMode = 'pan'; updateModeUI(); renderCanvas(); });

    if (modeDeleteBtn) {
        modeDeleteBtn.addEventListener('click', () => {
            if (selectedNotes.length === 0) return;
            saveHistoryState();
            // Sort indices descending to avoid shifting issues when splicing
            selectedNotes.sort((a, b) => b - a).forEach(idx => {
                notes.splice(idx, 1);
            });
            selectedNotes = [];

            // Switch to draw mode if no notes remain
            if (notes.length === 0) {
                currentMode = 'draw';
                updateModeUI();
            }

            renderCanvas();
        });
    }

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

        if (gridBpmValue) {
            gridBpmValue.addEventListener('click', () => {
                const newBpm = prompt("Enter BPM (30-280):", gridBpmSlider.value);
                if (newBpm !== null) {
                    let parsed = parseInt(newBpm);
                    if (!isNaN(parsed)) {
                        if (parsed < 30) parsed = 30;
                        if (parsed > 280) parsed = 280;
                        gridBpmSlider.value = parsed;
                        gridBpmValue.textContent = parsed;

                        if (mainBpmSlider) {
                            mainBpmSlider.value = parsed;
                            if (mainBpmValue) mainBpmValue.textContent = parsed;
                            mainBpmSlider.dispatchEvent(new Event('input'));
                        }
                    }
                }
            });
        }
    }

    if (ghBtn) {
        ghBtn.addEventListener('click', () => {
            isGuitarHeroMode = !isGuitarHeroMode;
            updateGuitarHeroUI(isGuitarHeroMode);
        });
    }

    if (playBtn) playBtn.addEventListener('click', togglePlay);
    if (ghStopBtn) ghStopBtn.addEventListener('click', togglePlay);

    if (showHandpanCheck) {
        showHandpanCheck.addEventListener('change', (e) => {
            isShowHandpan = e.target.checked;
            updateMiniHandpanUI();
        });
    }

    // Canvas interaction
    const scrollArea = document.getElementById('grid-scroll-area');
    const labelsWrapper = document.getElementById('grid-labels-wrapper');
    const numbersScrollArea = document.getElementById('grid-numbers-scroll-area');
    const canvas = document.getElementById('grid-canvas');
    if (scrollArea && labelsWrapper) {
        let isSyncingLeft = false;
        let isSyncingRight = false;

        scrollArea.addEventListener('scroll', () => {
            if (!isSyncingLeft) {
                isSyncingRight = true;
                labelsWrapper.scrollTop = scrollArea.scrollTop;
                if (numbersScrollArea) numbersScrollArea.scrollLeft = scrollArea.scrollLeft;
                setTimeout(() => isSyncingRight = false, 10);
            }
        });

        labelsWrapper.addEventListener('scroll', () => {
            if (!isSyncingRight) {
                isSyncingLeft = true;
                scrollArea.scrollTop = labelsWrapper.scrollTop;
                setTimeout(() => isSyncingLeft = false, 10);
            }
        });

        if (numbersScrollArea) {
            numbersScrollArea.addEventListener('scroll', () => {
                if (!isSyncingRight) {
                    isSyncingLeft = true;
                    scrollArea.scrollLeft = numbersScrollArea.scrollLeft;
                    setTimeout(() => isSyncingLeft = false, 10);
                }
            });
        }
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
    isDirty = true;
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

    // Add Percussion tracks at the bottom
    scaleNotesSorted.push('T', 't');

    editingItem = null;
    if (itemId) {
        editingItem = document.getElementById(itemId);
    } else if (phraseString instanceof HTMLElement) {
        // Backwards compatibility if called with an element
        editingItem = phraseString;
        phraseString = editingItem.dataset.sourceText || editingItem.dataset.rawText || editingItem.dataset.pattern;
    }

    const nameInput = document.getElementById('grid-phrase-name');
    const repeatsInput = document.getElementById('grid-phrase-repeats');

    if (phraseString && typeof phraseString === 'string') {
        // Load from existing phrase text
        importPhraseToGrid(phraseString);
        if (nameInput) nameInput.value = editingItem ? (editingItem.querySelector('.prog-label') ? editingItem.querySelector('.prog-label').textContent : 'Phrase') : 'Phrase';
        if (repeatsInput) repeatsInput.value = editingItem ? (editingItem.dataset.repeats || 1) : 1;
    } else {
        // Initial empty state if none exists
        notes = [];
        const sizeSlider = document.getElementById('phrase-size-slider');
        numBeats = sizeSlider ? parseInt(sizeSlider.value) : 8;
        currentResolution = 1;
        const resSelect = document.getElementById('grid-resolution-select');
        if (resSelect) resSelect.value = '1';

        if (nameInput) nameInput.value = 'Phrase'; // default name
        if (repeatsInput) repeatsInput.value = '1';
    }

    undoStack = [];
    redoStack = [];
    selectedNotes = [];

    // Reset Zoom to defaults
    CELL_HEIGHT = DEFAULT_CELL_HEIGHT;
    BASE_COL_WIDTH = DEFAULT_BASE_COL_WIDTH;

    // Reset mode
    currentMode = 'draw';
    isGuitarHeroMode = false;
    updateGuitarHeroUI(false);

    // Reset Scroll Position
    const scrollArea = document.getElementById('grid-scroll-area');
    if (scrollArea) scrollArea.scrollLeft = 0;
    const numbersArea = document.getElementById('grid-numbers-scroll-area');
    if (numbersArea) numbersArea.scrollLeft = 0;
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
    document.body.classList.add('modal-open');

    // Calculate optimal zoom to fit all notes vertically now that modal is visible
    const scrollContainer = document.getElementById('grid-scroll-area');
    const containerHeight = scrollContainer ? (scrollContainer.clientHeight || 300) : 300;
    // Leave some padding for bottom shadow lines
    const optimalHeight = Math.floor((containerHeight - 15) / scaleNotesSorted.length);
    // Min 22px so it's readable on phone, Max 45px so it doesn't look too bulky on iPad
    CELL_HEIGHT = Math.max(22, Math.min(45, optimalHeight));

    // Reset horizontal zoom
    BASE_COL_WIDTH = DEFAULT_BASE_COL_WIDTH;

    isDirty = false;

    renderCanvas();
}

/**
 * @param {boolean} force - if true, bypasses the "unsaved changes" confirmation
 */
export function closeGridEditor(force = false) {
    if (!force && isDirty) {
        if (!confirm("You have unsaved changes in the grid. Are you sure you want to close and lose them?")) {
            return;
        }
    }

    document.getElementById('grid-editor-modal').style.display = 'none';
    document.body.classList.remove('modal-open');
    if (isPlaying) togglePlay();
    updateGuitarHeroUI(false); // Ensure return to normal mode next time
    
    // Reset Handpan toggle
    isShowHandpan = false;
    const check = document.getElementById('grid-show-handpan-check');
    if (check) check.checked = false;
    updateMiniHandpanUI();
}

function updateMiniHandpanUI() {
    const container = document.getElementById('grid-mini-handpan-container');
    if (!container) return;

    if (isShowHandpan && !(isGuitarHeroMode && isPlaying)) {
        container.style.display = 'block';
        
        const wrapper = container.querySelector('div');
        if (wrapper) {
            let miniSvg = document.getElementById('grid-handpan-svg');
            if (!miniSvg) {
                wrapper.innerHTML = '<svg id="grid-handpan-svg" viewBox="0 0 500 500" style="width: 100%; height: auto; display: block;"></svg>';
                miniSvg = document.getElementById('grid-handpan-svg');
            }
            if (miniSvg) {
                const currentScale = dependencies.getScale();
                if (currentScale) {
                    renderHandpanSVG(currentScale, 'notes', miniSvg, (noteName) => {
                        // Play sound
                        if (noteName === 'T' || noteName === 't') {
                            playTak(0, noteName === 'T', noteName === 't');
                        } else {
                            const freq = getFrequencyForNoteName(noteName);
                            if (freq) playTone(freq, noteName);
                        }
                    });
                }
            }
        }
    } else {
        container.style.display = 'none';
    }
}

// Consolidate UI changes for Guitar Hero mode
function updateGuitarHeroUI(active) {
    const ghBtn = document.getElementById('grid-gh-btn');
    if (ghBtn) {
        ghBtn.style.background = active ? 'rgba(243, 156, 18, 0.2)' : 'rgba(255,255,255,0.1)';
        ghBtn.style.border = active ? '1px solid #f39c12' : 'none';
    }

    const isGH = active && isPlaying;
    
    // Elements to hide/show
    const elementsToToggle = [
        'grid-editor-header',
        'grid-toolbar-1',
        'grid-toolbar-2',
        'grid-editor-footer',
        'grid-numbers-header'
    ];

    elementsToToggle.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = isGH ? 'none' : (id === 'grid-editor-footer' ? 'flex' : (id.includes('toolbar') ? 'flex' : 'flex'));
    });

    const labelsContainer = document.getElementById('grid-labels-container');
    const labelsWrapper = document.getElementById('grid-labels-wrapper');
    if (labelsContainer) labelsContainer.style.display = isGH ? 'none' : 'block';
    if (labelsWrapper) labelsWrapper.style.display = isGH ? 'none' : 'block';

    const stopOverlay = document.getElementById('grid-gh-stop-overlay');
    if (stopOverlay) {
        stopOverlay.style.display = isGH ? 'flex' : 'none';
        if (isGH) {
            stopOverlay.style.setProperty('position', 'absolute', 'important');
            stopOverlay.style.setProperty('top', '20px', 'important');
            stopOverlay.style.setProperty('right', '20px', 'important');
            stopOverlay.style.setProperty('margin', '0', 'important');
            stopOverlay.style.setProperty('z-index', '100', 'important');
        } else {
            stopOverlay.style.position = '';
            stopOverlay.style.top = '';
            stopOverlay.style.right = '';
            stopOverlay.style.margin = '';
            stopOverlay.style.zIndex = '';
        }
    }

    // Handle Modal Sizing
    const modal = document.querySelector('#grid-editor-modal .modal-content');
    const modalBody = document.querySelector('#grid-editor-modal .modal-body');
    const overlay = document.getElementById('grid-editor-modal');

    if (isGH) {
        if (overlay) overlay.style.setProperty('padding', '0px', 'important');
        if (modal) {
            modal.style.setProperty('max-width', '100vw', 'important');
            modal.style.setProperty('max-height', '100vh', 'important');
            modal.style.setProperty('height', '100vh', 'important');
            modal.style.setProperty('width', '100vw', 'important');
            modal.style.setProperty('margin', '0px', 'important');
            modal.style.setProperty('padding', '0px', 'important');
            modal.style.setProperty('border-radius', '0px', 'important');
            modal.style.setProperty('border', 'none', 'important');
        }
        if (modalBody) {
            modalBody.style.setProperty('max-height', 'none', 'important');
            modalBody.style.setProperty('border-radius', '0px', 'important');
            modalBody.style.setProperty('border', 'none', 'important');
            modalBody.style.setProperty('height', '100%', 'important');
            modalBody.style.setProperty('flex', '1', 'important');
        }
    } else {
        if (overlay) {
            overlay.style.removeProperty('padding');
        }
        if (modal) {
            // Remove style attribute overrides to fall back to index.html base styles
            modal.style.removeProperty('width');
            modal.style.setProperty('width', '1000px', 'important');
            modal.style.removeProperty('max-width');
            modal.style.setProperty('max-width', '98vw', 'important');
            modal.style.removeProperty('max-height');
            modal.style.removeProperty('height');
            modal.style.removeProperty('margin');
            modal.style.removeProperty('padding');
            modal.style.removeProperty('border-radius');
            modal.style.removeProperty('border-radius');
            modal.style.removeProperty('border');
        }

        if (modalBody) {
            modalBody.style.removeProperty('max-height');
            modalBody.style.removeProperty('border-radius');
            modalBody.style.removeProperty('border');
            modalBody.style.removeProperty('height');
            modalBody.style.removeProperty('overflow-y');
            modalBody.style.removeProperty('flex');
        }
    }

    // Ensure handpan visibility matches mode
    updateMiniHandpanUI();

    renderCanvas();
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
function renderCanvas(currentTick) {
    if (isGuitarHeroMode && isPlaying) return;
    const canvas = document.getElementById('grid-canvas');
    const container = document.getElementById('grid-labels-container');
    const modeDeleteBtn = document.getElementById('grid-mode-delete');

    if (modeDeleteBtn) {
        if (currentMode === 'select' && selectedNotes.length > 0) {
            modeDeleteBtn.style.display = 'flex';
        } else {
            modeDeleteBtn.style.display = 'none';
        }
    }

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

        let isPlayingNow = false;
        if (typeof currentTick !== 'undefined' && currentTick >= note.startTick && currentTick < note.startTick + note.lengthTicks) {
            isPlayingNow = true;
        }

        // 3D Voluminous styling
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        if (isPlayingNow) {
            grad.addColorStop(0, '#f1c40f'); // bright yellow
            grad.addColorStop(1, '#f39c12'); // orange-ish yellow
        } else {
            grad.addColorStop(0, '#2ecc71'); // Lighter vivid green top
            grad.addColorStop(1, '#229954'); // Darker solid green bottom
        }

        ctx.fillStyle = grad;

        // Shadow for depth
        ctx.shadowColor = isPlayingNow ? '#f1c40f' : 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = isPlayingNow ? 15 : 4;
        ctx.shadowOffsetY = isPlayingNow ? 0 : 2;
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
            ctx.strokeStyle = isPlayingNow ? '#fff' : 'rgba(255,255,255,0.4)';
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

    // Draw Marquee Box
    if (marqueeBox) {
        ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
        ctx.strokeStyle = '#3498db';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        const mx = Math.min(marqueeBox.startX, marqueeBox.currentX);
        const my = Math.min(marqueeBox.startY, marqueeBox.currentY);
        const mw = Math.abs(marqueeBox.startX - marqueeBox.currentX);
        const mh = Math.abs(marqueeBox.startY - marqueeBox.currentY);

        ctx.beginPath();
        ctx.rect(mx, my, mw, mh);
        ctx.fill();
        ctx.stroke();

        ctx.setLineDash([]); // Reset line dash for other drawings
    }
}

function setupCanvasInteractions(canvas) {
    let isDragging = false;
    let dragAction = null; // 'add' or 'remove'
    let lastHandledCell = null;
    let dragStartCell = null;
    let initialSelectedStates = [];

    let activePointers = new Map();
    let initialPanScrollLeft = 0;
    let initialPanScrollTop = 0;
    let initialPanCenter = null;
    let didSaveHistoryOnDown = false;

    const getCellFromEvent = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        const row = Math.floor(y / CELL_HEIGHT);
        const col = Math.floor(x / BASE_COL_WIDTH);
        return { row, col, x, y };
    };

    const handlePointerDown = (e) => {
        activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

        if (isPlaying) togglePlay();

        canvas.setPointerCapture(e.pointerId);

        // Handle 2-finger panning
        if (activePointers.size >= 2) {
            if (didSaveHistoryOnDown) {
                undoHistory();
                didSaveHistoryOnDown = false;
            }
            isDragging = false;
            marqueeBox = null;
            const scrollArea = document.getElementById('grid-scroll-area');
            if (scrollArea) {
                initialPanScrollLeft = scrollArea.scrollLeft;
                initialPanScrollTop = scrollArea.scrollTop;

                let sumX = 0, sumY = 0;
                activePointers.forEach(p => { sumX += p.clientX; sumY += p.clientY; });
                initialPanCenter = { x: sumX / activePointers.size, y: sumY / activePointers.size };
            }
            renderCanvas();
            return;
        }

        didSaveHistoryOnDown = false;

        if (currentMode === 'pan') {
            // Let the browser handle standard touch action scrolling natively
            return;
        }

        const { row, col, x, y } = getCellFromEvent(e);
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
                selectedNotes = [];
                marqueeBox = { startX: x, startY: y, currentX: x, currentY: y };
                isDragging = true;
            }
            renderCanvas();
            return;
        }

        if (currentMode === 'move') {
            if (selectedNotes.length === 0) return;
            saveHistoryState();
            didSaveHistoryOnDown = true;
            isDragging = true;
            dragStartCell = { row, col };
            initialSelectedStates = selectedNotes.map(idx => ({ ...notes[idx] }));
            return;
        }

        // Draw mode
        saveHistoryState();
        didSaveHistoryOnDown = true;

        if (existingIdx > -1) {
            dragAction = 'remove';
            notes.splice(existingIdx, 1);
        } else {
            dragAction = 'add';
            notes.push({ row, startTick: targetTick, lengthTicks: ticksPerStep });
            const noteName = scaleNotesSorted[row];
            if (noteName === 'T' || noteName === 't') {
                playTak(0, noteName === 'T', noteName === 't');
            } else {
                const freq = getFrequencyForNoteName(noteName);
                if (freq) playTone(freq, noteName);
            }
        }

        isDragging = true;
        lastHandledCell = `${row},${col}`;
        renderCanvas();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);

    const handlePointerMove = (e) => {
        if (activePointers.has(e.pointerId)) {
            activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        }

        // Handle 2-finger panning
        if (activePointers.size >= 2) {
            let sumX = 0, sumY = 0;
            activePointers.forEach(p => { sumX += p.clientX; sumY += p.clientY; });
            const currentCenter = { x: sumX / activePointers.size, y: sumY / activePointers.size };

            const dx = currentCenter.x - initialPanCenter.x;
            const dy = currentCenter.y - initialPanCenter.y;

            const scrollArea = document.getElementById('grid-scroll-area');
            if (scrollArea) {
                scrollArea.scrollLeft = initialPanScrollLeft - dx;
                scrollArea.scrollTop = initialPanScrollTop - dy;
            }
            return;
        }

        if (!isDragging || currentMode === 'pan') return;
        const { row, col, x, y } = getCellFromEvent(e);
        const maxCols = numBeats * currentResolution;

        if (currentMode === 'select' && marqueeBox) {
            marqueeBox.currentX = x;
            marqueeBox.currentY = y;

            const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
            const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
            const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
            const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

            selectedNotes = [];
            notes.forEach((note, idx) => {
                const noteX = (note.startTick / TICKS_PER_BEAT) * BASE_COL_WIDTH * currentResolution;
                const noteW = (note.lengthTicks / TICKS_PER_BEAT) * BASE_COL_WIDTH * currentResolution;
                const noteY = note.row * CELL_HEIGHT;
                const noteH = CELL_HEIGHT;

                if (noteX < maxX && noteX + noteW > minX && noteY < maxY && noteY + noteH > minY) {
                    selectedNotes.push(idx);
                }
            });
            renderCanvas();
            return;
        }

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
                    const noteName = scaleNotesSorted[row];
                    if (noteName === 'T' || noteName === 't') {
                        playTak(0, noteName === 'T', noteName === 't');
                    } else {
                        const freq = getFrequencyForNoteName(noteName);
                        if (freq) playTone(freq, noteName);
                    }
                }
            } else if (dragAction === 'remove') {
                if (existingIdx > -1) notes.splice(existingIdx, 1);
            }
        }

        renderCanvas();
    };

    canvas.addEventListener('pointermove', handlePointerMove);

    const handlePointerUpOrCancel = (e) => {
        activePointers.delete(e.pointerId);

        if (activePointers.size === 0) {
            isDragging = false;
            dragAction = null;
            lastHandledCell = null;
            dragStartCell = null;
            initialSelectedStates = [];
            initialPanCenter = null;
            marqueeBox = null;
            renderCanvas();
        } else if (activePointers.size >= 1) {
            // Update pan center when finger is lifted to prevent jumping
            let sumX = 0, sumY = 0;
            activePointers.forEach(p => { sumX += p.clientX; sumY += p.clientY; });
            initialPanCenter = { x: sumX / activePointers.size, y: sumY / activePointers.size };
            const scrollArea = document.getElementById('grid-scroll-area');
            if (scrollArea) {
                initialPanScrollLeft = scrollArea.scrollLeft;
                initialPanScrollTop = scrollArea.scrollTop;
            }
        }
    };

    canvas.addEventListener('pointerup', handlePointerUpOrCancel);
    canvas.addEventListener('pointercancel', handlePointerUpOrCancel);
    canvas.addEventListener('pointerout', (e) => {
        // Only if it's the primary pointer or native out
        if (e.pointerId && activePointers.has(e.pointerId)) {
            handlePointerUpOrCancel(e);
        }
    });

    // Custom Context Menu (prevent native menu on long press)
    canvas.addEventListener('contextmenu', e => e.preventDefault());
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

    // Explicitly resume audio context inside user gesture for iOS/iPadOS compatibility
    const audioCtx = getAudioContext();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    isPlaying = !isPlaying;
    if (isPlaying) {
        if (btn) {
            btn.textContent = 'Stop ⏹';
            btn.classList.add('stop-btn');
        }
        updateGuitarHeroUI(isGuitarHeroMode);
        
        // Lead-in duration
        startPlayback(true);
    } else {
        if (btn) {
            btn.textContent = 'Play ▶';
            btn.classList.remove('stop-btn');
        }
        cancelAnimationFrame(animationFrameId);
        clearTimeout(playbackTimeoutId);
        playbackTimeoutId = null;
        animationFrameId = null;
        stopAllSounds();

        // Use updateGuitarHeroUI for consistent restoration
        updateGuitarHeroUI(isGuitarHeroMode);

        const container = document.getElementById('grid-labels-container');
        if (container) container.style.display = 'block';

        const labelsWrapper = document.getElementById('grid-labels-wrapper');
        if (labelsWrapper) labelsWrapper.style.display = 'block';

        const scrollArea = document.getElementById('grid-scroll-area');
        if (scrollArea) scrollArea.style.overflow = 'auto';

        renderCanvas(); // Redraw static grid without playhead
    }
}

function startPlayback(isFirstLoop = true) {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;

    const bpmInput = document.getElementById('grid-bpm-slider') || document.getElementById('bpm-slider');
    const bpm = bpmInput ? parseInt(bpmInput.value) : 80;
    // Match progression stage default (1 step = 8th note)
    const ticksPerSecond = (bpm / 60) * TICKS_PER_BEAT * 2;

    // GH lead-in delay 
    const isGH = typeof isGuitarHeroMode !== 'undefined' && isGuitarHeroMode;
    let leadInSec = 0;

    if (isGH && isFirstLoop) {
        // Calculate exact time for a note to fall from top of screen to hitline
        const modalBody = document.querySelector('#grid-editor-modal .modal-body');
        const fullHeight = modalBody ? modalBody.clientHeight : window.innerHeight;
        const hitLineY = fullHeight - 60;

        const pixelsPerTick = 120 / TICKS_PER_BEAT;
        const pixelsPerSecond = pixelsPerTick * ticksPerSecond;

        // Time = Distance / Speed
        const fallTime = hitLineY / pixelsPerSecond;

        // At fast tempos, fallTime is small (e.g. 0.5s). We add a little buffer (0.5s) 
        // so it doesn't instantly appear. At slow tempos, fallTime could be 3s+, 
        // stringing the user along. We cap the total wait time to 1.5 seconds.
        leadInSec = Math.min(1.5, fallTime + 0.5);
    }

    // playStartTime is updated every loop iteration
    // If GH mode and first loop, we set the logical start time 2 seconds in the future
    playStartTime = audioCtx.currentTime + leadInSec;

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
            const noteName = scaleNotesSorted[note.row];
            if (noteName === 'T' || noteName === 't') {
                playTak(noteTime, noteName === 'T', noteName === 't', true); // suppressVisuals
            } else {
                const freq = getFrequencyForNoteName(noteName);
                if (freq) {
                    playTone(freq, noteName, 3.0, noteTime, true);
                }
            }
        }
    });

    // Schedule the next loop iteration exactly at the end of this bounds
    const totalBeatsDurationSec = (numBeats * TICKS_PER_BEAT) / ticksPerSecond;
    // We add leadInSec here so the visual loop and audio loop wait for the 2s preamble if it's the first loop
    playbackTimeoutId = setTimeout(() => {
        if (isPlaying) {
            startPlayback(false); // Trigger the next loop without lead-in
        }
    }, (leadInSec + totalBeatsDurationSec) * 1000);

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
    // elapsedTicks can be negative during lead-in
    const elapsedTicks = elapsedSec * ticksPerSecond;

    const maxTicks = numBeats * TICKS_PER_BEAT;

    // If GH mode, we don't wrap the playhead if it's still in the negative lead-in phase
    let currentTickWrap = elapsedTicks;
    if (elapsedTicks >= 0) {
        currentTickWrap = elapsedTicks % maxTicks;
    }

    if (isGuitarHeroMode) {
        drawGuitarHeroMode(currentTickWrap, maxTicks, elapsedTicks < 0);
        animationFrameId = requestAnimationFrame(drawPlayhead);
        return;
    }

    renderCanvas(currentTickWrap); // Redraw grid with active tick

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

function drawGuitarHeroMode(currentTickWrap, maxTicks, isLeadIn = false) {
    const canvas = document.getElementById('grid-canvas');
    const ctx = canvas.getContext('2d');

    // Instead of using grid-scroll-area, use the full modal body width for centering
    const modalBody = document.querySelector('#grid-editor-modal .modal-body');
    const fullWidth = modalBody ? modalBody.clientWidth : window.innerWidth;
    const fullHeight = modalBody ? modalBody.clientHeight : window.innerHeight;

    if (canvas.width !== fullWidth || canvas.height !== fullHeight) {
        canvas.width = fullWidth;
        canvas.height = fullHeight;

        // Ensure scroll area doesn't clip the centered canvas
        const scrollArea = document.getElementById('grid-scroll-area');
        if (scrollArea) {
            scrollArea.scrollLeft = 0;
            scrollArea.scrollTop = 0;
            scrollArea.style.overflow = 'hidden';
        }

        // Hide the labels wrapper entirely to free up the space on the left
        const labelsWrapper = document.getElementById('grid-labels-wrapper');
        if (labelsWrapper) labelsWrapper.style.display = 'none';

        const container = document.getElementById('grid-labels-container');
        if (container) container.style.display = 'none';
    }

    ctx.fillStyle = '#1e272e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const hitLineY = canvas.height - 60;

    const numLanes = scaleNotesSorted.length;
    const maxLaneWidth = 60;
    const laneWidth = Math.min(maxLaneWidth, canvas.width / numLanes);
    const lanesStartX = (canvas.width - (numLanes * laneWidth)) / 2;

    const pixelsPerTick = 120 / TICKS_PER_BEAT;

    // Pre-calculate which lanes are currently hitting to apply bounce
    const laneHits = new Array(numLanes).fill(false);
    notes.forEach(note => {
        if (note.startTick >= maxTicks) return;
        let visualDelta = note.startTick - currentTickWrap;
        if (visualDelta < -(note.lengthTicks)) visualDelta += maxTicks;

        const isHitting = visualDelta <= 0 && visualDelta > -note.lengthTicks;
        if (isHitting) {
            const displayIndex = (numLanes - 1) - note.row;
            laneHits[displayIndex] = true;
        }
    });

    // Hit line
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, hitLineY);

    // Straight line till the first lane
    if (lanesStartX > 0) {
        ctx.lineTo(lanesStartX, hitLineY);
    }

    // Draw bouncy segmented line
    for (let i = 0; i < numLanes; i++) {
        const lx = lanesStartX + (i * laneWidth);
        const rx = lx + laneWidth;
        const bounceOffset = laneHits[i] ? 9 : 0; // 9px bounce down

        // If this lane has a bounce, we step down. 
        // If not, it stays at hitLineY.
        const segmentY = hitLineY + bounceOffset;

        ctx.lineTo(lx, segmentY);
        ctx.lineTo(rx, segmentY);
    }

    // Straight line from the last lane to the edge
    const lanesEndX = lanesStartX + (numLanes * laneWidth);
    if (lanesEndX < canvas.width) {
        ctx.lineTo(lanesEndX, hitLineY);
    }

    ctx.lineTo(canvas.width, hitLineY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';

    // Dynamic font size
    let fontSize = 12;
    if (laneWidth > 25) fontSize = 14;
    if (laneWidth > 35) fontSize = 18;
    if (laneWidth > 50) fontSize = 22;
    ctx.font = `bold ${fontSize}px Inter, sans-serif`;

    ctx.textAlign = 'center';

    for (let i = 0; i < numLanes; i++) {
        // Reverse lane index so lowest note (highest row index) is on the left
        const displayIndex = (numLanes - 1) - i;
        const lx = lanesStartX + (displayIndex * laneWidth);
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, canvas.height);
        ctx.stroke();

        ctx.fillText(scaleNotesSorted[i].replace(/^D:/, ''), lx + laneWidth / 2, canvas.height - 20);
    }

    ctx.beginPath();
    ctx.moveTo(lanesStartX + numLanes * laneWidth, 0);
    ctx.lineTo(lanesStartX + numLanes * laneWidth, canvas.height);
    ctx.stroke();

    const visibleLoops = Math.ceil(canvas.height / (maxTicks * pixelsPerTick)) + 1;

    notes.forEach(note => {
        if (note.startTick >= maxTicks) return;

        for (let k = -1; k <= visibleLoops; k++) {
            // If we are in the initial lead-in phase, do not draw the "previous" loop (k=-1) 
            // because there was no previous loop. It would just appear as phantom notes.
            if (isLeadIn && k < 0) continue;

            let visualDelta = note.startTick - currentTickWrap + (k * maxTicks);

            const noteY = hitLineY - (visualDelta * pixelsPerTick);
            const noteH = Math.max(10, note.lengthTicks * pixelsPerTick);
            const topY = noteY - noteH;

            if (noteY > 0 && topY < canvas.height) {
                const isHitting = visualDelta <= 0 && visualDelta > -note.lengthTicks;
                const hitDepth = -visualDelta; // how far into the note we are

                // Reverse row mapping for notes as well
                const displayIndex = (numLanes - 1) - note.row;
                const nx = lanesStartX + (displayIndex * laneWidth);
                const w = laneWidth - 2; // subtle separation

                // Default colors (green)
                let fillColor = '#2ecc71';
                let strokeColor = '#27ae60';
                let textColor = '#fff';
                let alpha = 1.0;

                // Stop going down once it hits the line, and fade out quickly
                if (isHitting) {
                    fillColor = '#f1c40f'; // Yellow when hitting
                    strokeColor = '#ffffff';
                    textColor = '#000';

                    ctx.shadowColor = '#f1c40f';
                    ctx.shadowBlur = 15;

                    // Fade out quickly over 70 ticks (about 1/8th of a beat at 480 PPQ)
                    // You can adjust 'fadeTicks' to make it vanish faster or slower
                    const fadeTicks = 80;
                    alpha = Math.max(0, 1.0 - (hitDepth / fadeTicks));
                } else if (visualDelta < -note.lengthTicks) {
                    // Already passed completely
                    alpha = 0;
                    ctx.shadowBlur = 0;
                } else {
                    ctx.shadowBlur = 0;
                }

                if (alpha <= 0) continue; // Skip drawing

                ctx.globalAlpha = alpha;

                // Clamp drawing to the hitline
                let drawTopY = topY;
                let drawNoteH = noteH;

                // If note has hit the line, we clip the bottom
                if (isHitting) {
                    drawNoteH = Math.max(0, noteH - (hitDepth * pixelsPerTick));
                    drawTopY = hitLineY - drawNoteH;
                }

                if (drawNoteH <= 0) {
                    ctx.globalAlpha = 1.0; // Reset
                    continue;
                }

                ctx.fillStyle = fillColor;

                ctx.beginPath();
                if (ctx.roundRect) {
                    // Reduce border radius dynamically if note gets too short
                    const r = Math.min(6, drawNoteH / 2);
                    ctx.roundRect(nx + 1, drawTopY, w, drawNoteH, r);
                } else {
                    ctx.rect(nx + 1, drawTopY, w, drawNoteH);
                }
                ctx.fill();

                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = 1;
                ctx.stroke();

                // Only show text if lane is wide enough and note is tall enough
                if (drawNoteH > 20 && laneWidth > 20) {
                    ctx.fillStyle = textColor;
                    ctx.shadowBlur = 0;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(scaleNotesSorted[note.row].replace(/^D:/, ''), nx + 1 + w / 2, drawTopY + drawNoteH / 2);
                    ctx.textBaseline = 'alphabetic'; // reset
                }

                ctx.globalAlpha = 1.0;
                ctx.shadowBlur = 0;
            }
        }
    });
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
    // Do NOT remove trailing rests! 
    // The user explicitly requested to keep trailing rests to respect the Grid `numBeats` setting length.

    if (phraseOutput === '') phraseOutput = '-';

    if (currentResolution > 1) {
        phraseOutput = `(${phraseOutput})/${currentResolution}`;
    }

    closeGridEditor(true);

    const nameInput = document.getElementById('grid-phrase-name');
    const repeatsInput = document.getElementById('grid-phrase-repeats');
    const finalName = nameInput ? (nameInput.value || 'Grid Pattern') : 'Grid Pattern';
    const finalRepeats = repeatsInput ? (parseInt(repeatsInput.value) || 1) : 1;

    if (editingItem && dependencies.updateProgressionItem) {
        // Update the card directly
        dependencies.updateProgressionItem(editingItem, {
            name: finalName,
            text: phraseOutput,
            repeats: finalRepeats
        });
    } else if (dependencies.addToProgression) {
        // Create new item directly
        dependencies.addToProgression(null, null, finalName, phraseOutput, finalRepeats, false);
    } else if (dependencies.openEditor) {
        // Fallback
        dependencies.openEditor(null, finalName);
        setTimeout(() => {
            const input = document.getElementById('editor-input');
            const repInput = document.getElementById('editor-repeats');
            if (input) {
                input.value = phraseOutput;
                input.dispatchEvent(new Event('input'));
            }
            if (repInput) repInput.value = finalRepeats;
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
        // parseText returns 'duration' relative to a 1-beat step.
        // E.g. (A B)/2 returns duration 0.5. 
        // 0.5 * 12 = 6 ticks. The currentResolution is not needed since duration is absolute.
        const duration = evt.duration || 1;
        const stepTicks = Math.round(duration * TICKS_PER_BEAT);

        if (evt.type === 'rest') {
            currentTick += stepTicks;
            return;
        }

        const handleNote = (noteObj) => {
            if (noteObj.type === 'rest') return;
            if (noteObj.type === 'percussion') {
                const targetName = noteObj.hand === 'K' || noteObj.hand === 'k' || noteObj.isGhost || noteObj.hand === 't' ? 't' : 'T';
                const rowIdx = scaleNotesSorted.findIndex(s => s === targetName);
                if (rowIdx > -1) {
                    notes.push({ row: rowIdx, startTick: currentTick, lengthTicks: stepTicks });
                }
                return;
            }

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
