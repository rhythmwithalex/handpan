
import { initAudio, playTone, playTak, stopAllSounds, setVisualizerCallbacks, getAudioContext, setBaseKickFrequency, setMasterVolume } from './audio/engine.js';
import { startProgression, stopProgression, toggleProgression, setProgressionCallbacks, setTempo, isPlaying as isProgressionPlaying, setCustomPrecountPattern } from './logic/progression.js';
import { loadLastScale, saveLastScale, getAllScales, initCustomScales, saveCustomScale } from './data/scales.js';
import { generateChords, parseNoteName, getFrequencyForNoteName } from './logic/chords.js';
import { parseRhythmString, transposeMelodyText } from './logic/parser.js';
import { initInteraction, renderHandpanSVG, highlightNote, highlightBody, resetVisuals } from './ui/visualizer.js';
import { initModals, openScaleModal } from './ui/modals.js';
import { initChordGrid, renderChordGrid, toggleChordSort } from './ui/chord_grid.js';
import { initProgressionUI, addChordToProgression, updateProgressionItem, getProgressionChords, clearProgression, exportProgressionData, loadProgressionData } from './ui/progression.js';
import { initEditor, openEditor } from './ui/editor.js';
import { initInspirations } from './ui/inspirations.js';
import { initGridEditor, openGridEditor, closeGridEditor } from './ui/grid_editor.js';
import { initLayoutEditor } from './ui/layout_editor.js';
import * as storage from './data/storage.js';

// Application State
let currentScale = null;
let handpanNotes = []; // Array of {note, octave, value}
let visualizerMode = 'notes'; // 'notes', 'numbers', 'degrees'
let activeColor = 'none';
let isCompactView = false;
let isTransposingMelody = false;
let transposeOldScale = null;

let currentLoadedCompName = '';
let currentLoadedCompCategory = '';

// Function to trigger state save
const saveCurrentState = () => {
    const precountSelect = document.getElementById('precount-select');
    let precountConfig = { value: '0' };
    if (precountSelect) {
        precountConfig.value = precountSelect.value;
        if (precountSelect.value === 'custom') {
            try {
                const saved = localStorage.getItem('customPrecountPattern');
                if (saved) precountConfig.data = JSON.parse(saved);
            } catch (e) { }
        }
    }
    const eachTimeToggle = document.getElementById('precount-each-time');
    if (eachTimeToggle) {
        precountConfig.eachTime = eachTimeToggle.checked;
    }
    const loopToggle = document.getElementById('playback-loop');
    if (loopToggle) {
        precountConfig.loop = loopToggle.checked;
    }
    const bpmInput = document.getElementById('bpm-slider');
    const tempo = bpmInput ? parseInt(bpmInput.value) : 80;
    storage.saveStateToLocal(currentScale, exportProgressionData(), tempo, precountConfig, isCompactView ? 'compact' : 'grid', currentLoadedCompName, currentLoadedCompCategory);
};

const resetPrecountUI = () => {
    const precountSelect = document.getElementById('precount-select');
    const eachLoopCheckbox = document.getElementById('precount-each-time');
    const loopToggle = document.getElementById('playback-loop');
    if (precountSelect) precountSelect.value = "0";
    if (eachLoopCheckbox) eachLoopCheckbox.checked = false;
    if (loopToggle) loopToggle.checked = true;
    saveCurrentState();
};

// --- Initialization ---

function initApp() {
    // 0. Audio Init (Instant-On)
    // Global "Unlock" for Safari/Mobile - ensures AudioContext is resumed on the first interaction
    const unlockAudioGlobally = () => {
        try {
            initAudio();
        } catch (e) {}
        document.removeEventListener('click', unlockAudioGlobally);
        document.removeEventListener('touchstart', unlockAudioGlobally);
    };
    document.addEventListener('click', unlockAudioGlobally);
    document.addEventListener('touchstart', unlockAudioGlobally);

    // 1. Init Data
    initCustomScales();
    initCustomPrecountUI();

    // 2. Init UI Components
    initModals((newScale) => loadScale(newScale));

    initVisualizer();

    initChordGrid({
        addToProgression: (chord, specificNotes, label, rawText, defaultRepeats, isSimultaneous = false) => {
            addChordToProgression(chord, specificNotes, label, rawText, defaultRepeats, isSimultaneous);
            const panel = document.getElementById('progression-panel');
            if (panel && !panel.classList.contains('open')) {
                toggleProgressionPanel();
            }
            saveCurrentState();
        }
    });

    // Global Audio Controls
    const masterVolSlider = document.getElementById('master-volume');
    const volValueDisplay = document.getElementById('vol-value');
    if (masterVolSlider) {
        masterVolSlider.addEventListener('input', (e) => {
            if (volValueDisplay) volValueDisplay.textContent = e.target.value + '%';
            setMasterVolume(parseInt(e.target.value));
        });
    }

    const palette = document.querySelector('.color-palette');
    const swatches = document.querySelectorAll('.color-swatch');
    if (swatches.length > 0) {
        swatches.forEach(swatch => {
            swatch.onclick = () => {
                swatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                activeColor = swatch.dataset.color;
            };
        });
    }

    const toggleViewBtn = document.getElementById('toggle-view-btn');
    const stage = document.getElementById('progression-stage');
    if (toggleViewBtn && stage) {
        toggleViewBtn.onclick = () => {
            isCompactView = !isCompactView;
            if (isCompactView) {
                stage.classList.add('compact-view');
                toggleViewBtn.textContent = '⊞';
            } else {
                stage.classList.remove('compact-view');
                toggleViewBtn.textContent = '≡';
            }
            saveCurrentState();
        };
    }

    initProgressionUI('progression-stage', {
        openEditor: (item, defaultName) => openEditor(item, defaultName, currentScale),
        openGridEditor: (phraseString, itemId) => openGridEditor(phraseString, itemId),
        getActiveColor: () => activeColor,
        onUpdate: () => {
            saveCurrentState();
        },
        getScale: () => currentScale,
        parseText: (text) => parseRhythmString(text, currentScale),
        stopPlayback: () => stopPlayback(),
        onClear: () => {
            currentLoadedCompName = '';
            currentLoadedCompCategory = '';
            resetPrecountUI();
        }
    });

    initEditor((data) => {
        // data: { name, text, repeats, originalItem }
        if (data.originalItem) {
            updateProgressionItem(data.originalItem, data);
        } else {
            const parsedNotes = parseRhythmString(data.text, currentScale);
            addChordToProgression(null, parsedNotes, data.name, data.text);

            const stage = document.getElementById('progression-stage');
            const newItem = stage.lastElementChild;
            if (newItem && data.repeats > 1) {
                newItem.dataset.repeats = data.repeats;
                updateProgressionItem(newItem, data);
            }
        }
        storage.saveStateToLocal(currentScale, exportProgressionData()); // save temp session
    });

    initInspirations({
        addToProgression: (chord) => addChordToProgression(chord), // Not used really
        addFromText: (name, text, repeats) => {
            const parsed = parseRhythmString(text, currentScale);
            addChordToProgression(null, parsed, name, text);
            // Apply repeats
            const stage = document.getElementById('progression-stage');
            const newItem = stage.lastElementChild;
            if (newItem && repeats > 1) {
                newItem.dataset.repeats = repeats;
                updateProgressionItem(newItem, { name, text, repeats });
            }
            saveCurrentState();
        }
    });

    initGridEditor({
        getScale: () => currentScale,
        openEditor: (item, defaultName) => openEditor(item, defaultName, currentScale),
        updateProgressionItem: (item, data) => updateProgressionItem(item, data),
        parseText: (text) => parseRhythmString(text, currentScale),
        addToProgression: (chord, specificNotes, name, text, repeats) => {
            const parsed = parseRhythmString(text, currentScale);
            addChordToProgression(null, parsed, name, text);
            const stage = document.getElementById('progression-stage');
            const newItem = stage.lastElementChild;
            if (newItem && repeats > 1) {
                newItem.dataset.repeats = repeats;
                updateProgressionItem(newItem, { name, text, repeats });
            }
            saveCurrentState();
        }
    });

    // 3. Audio & Scheduler Setup
    setupAudioEngine();
    setupScheduler();

    // 4. Global Event Listeners
    setupGlobalEvents();

    const transposeBtn = document.getElementById('transpose-melody-btn');
    if (transposeBtn) {
        transposeBtn.addEventListener('click', () => {
            const currentData = exportProgressionData();
            if (currentData.length === 0) {
                alert("Progression Stage is empty. Add phrases first to translate them.");
                return;
            }
            isTransposingMelody = true;
            transposeOldScale = currentScale;
            // Native open UI
            openScaleModal();
        });
        // Safety reset to false when modals are closed manually by overlapping click or close buttons
        const overlay = document.getElementById('modal-overlay');
        const scaleClose = document.getElementById('close-scale-modal');
        if (overlay) overlay.addEventListener('click', () => isTransposingMelody = false);
        if (scaleClose) scaleClose.addEventListener('click', () => isTransposingMelody = false);
    }

    // 5. Share Button Setup
    const shareBtn = document.getElementById('share-progression');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const bpmInput = document.getElementById('bpm-slider');
            const precountSelect = document.getElementById('precount-select');
            let precountConfig = { value: '0' };
            if (precountSelect) {
                precountConfig.value = precountSelect.value;
                if (precountSelect.value === 'custom') {
                    try {
                        const saved = localStorage.getItem('customPrecountPattern');
                        if (saved) precountConfig.data = JSON.parse(saved);
                    } catch (e) { }
                }
            }
            const eachTimeToggle = document.getElementById('precount-each-time');
            if (eachTimeToggle) {
                precountConfig.eachTime = eachTimeToggle.checked;
            }
            const loopToggle = document.getElementById('playback-loop');
            if (loopToggle) {
                precountConfig.loop = loopToggle.checked;
            }

            const currentBpm = bpmInput ? parseInt(bpmInput.value) : 80;
            const url = storage.generateShareUrl(currentScale, exportProgressionData(), currentBpm, precountConfig, isCompactView ? 'compact' : 'grid');
            navigator.clipboard.writeText(url).then(() => {
                const originalText = shareBtn.textContent;
                shareBtn.textContent = '✓';
                setTimeout(() => shareBtn.textContent = originalText, 1500);
            }).catch(err => {
                console.error("Failed to copy link:", err);
                alert("Could not copy link to clipboard.");
            });
        });
    }

    // 6. Visualizer Labels Toggle
    const toggleBtn = document.getElementById('vis-label-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (visualizerMode === 'notes') visualizerMode = 'numbers';
            else if (visualizerMode === 'numbers') visualizerMode = 'degrees';
            else visualizerMode = 'notes';

            // Update button text/icon
            const icons = { 'notes': 'ABC', 'numbers': '123', 'degrees': 'I-V' };
            toggleBtn.textContent = icons[visualizerMode];
            toggleBtn.title = `Labels: ${visualizerMode.charAt(0).toUpperCase() + visualizerMode.slice(1)}`;

            renderHandpanSVG(currentScale, visualizerMode);
        });
    }

    // BPM Slider save hook
    const bpmSlider = document.getElementById('bpm-slider');
    if (bpmSlider) {
        bpmSlider.addEventListener('change', () => {
            storage.saveStateToLocal(currentScale, exportProgressionData()); // save temp session
        });
    }

    // Help Modal (Save/Share)
    const saveShareHelpModal = document.getElementById('save-share-help-modal');
    const helpBtn = document.getElementById('help-save-share-btn');
    const closeHelpBtn = document.getElementById('close-save-share-help');

    if (helpBtn && saveShareHelpModal) {
        helpBtn.addEventListener('click', () => {
            saveShareHelpModal.style.display = 'flex';
        });

        const closeHelp = () => {
            saveShareHelpModal.style.display = 'none';
        };

        if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelp);

        const secondaryHelpBtns = saveShareHelpModal.querySelectorAll('.close-save-share-btn-secondary');
        secondaryHelpBtns.forEach(btn => btn.addEventListener('click', closeHelp));

        saveShareHelpModal.addEventListener('click', (e) => {
            if (e.target === saveShareHelpModal) {
                closeHelp();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && saveShareHelpModal.style.display === 'flex') {
                closeHelp();
            }
        });
    }

    // 7. Save/Load Composition Modals

    const saveCompBtn = document.getElementById('save-comp-btn');
    if (saveCompBtn) {
        saveCompBtn.addEventListener('click', () => {
            const modal = document.getElementById('save-comp-modal');
            if (modal) {
                const nameInput = document.getElementById('save-comp-name');
                const catInput = document.getElementById('save-comp-category');
                nameInput.value = currentLoadedCompName;
                catInput.value = currentLoadedCompCategory;

                document.getElementById('modal-overlay').style.display = 'block';
                modal.style.display = 'flex';
                nameInput.focus();
            }
        });
    }

    // Bind Close Events for generic modals here
    document.getElementById('close-save-comp')?.addEventListener('click', () => {
        const m = document.getElementById('save-comp-modal');
        if (m) m.style.display = 'none';
        document.getElementById('modal-overlay').style.display = 'none';
    });
    document.getElementById('cancel-save-comp')?.addEventListener('click', () => {
        const m = document.getElementById('save-comp-modal');
        if (m) m.style.display = 'none';
        document.getElementById('modal-overlay').style.display = 'none';
    });
    document.getElementById('close-load-comp')?.addEventListener('click', () => {
        const m = document.getElementById('load-comp-modal');
        if (m) m.style.display = 'none';
        document.getElementById('modal-overlay').style.display = 'none';
    });

    // Bind overlay click explicitly for generic modals
    document.getElementById('save-comp-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'save-comp-modal') {
            e.target.style.display = 'none';
            document.getElementById('modal-overlay').style.display = 'none';
        }
    });
    document.getElementById('load-comp-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'load-comp-modal') {
            e.target.style.display = 'none';
            document.getElementById('modal-overlay').style.display = 'none';
        }
    });

    // Keeping original overlay click for backward compatibility with others
    document.getElementById('modal-overlay')?.addEventListener('click', () => {
        const s = document.getElementById('save-comp-modal');
        const l = document.getElementById('load-comp-modal');
        if (s) s.style.display = 'none';
        if (l) l.style.display = 'none';
    });

    const confirmSaveCompBtn = document.getElementById('confirm-save-comp');
    if (confirmSaveCompBtn) {
        confirmSaveCompBtn.addEventListener('click', () => {
            const name = document.getElementById('save-comp-name').value.trim();
            const category = document.getElementById('save-comp-category').value.trim();
            if (!name) {
                alert("Please enter a name for the composition.");
                return;
            }

            const progressionData = exportProgressionData();
            if (progressionData.length === 0) {
                alert("Progression is empty. Add some chords first!");
                return;
            }

            const bpmInput = document.getElementById('bpm-slider');
            const tempo = bpmInput ? parseInt(bpmInput.value) : 80;

            const success = storage.saveComposition(name, category, currentScale, progressionData, tempo);
            if (success) {
                currentLoadedCompName = name;
                currentLoadedCompCategory = category;

                const modal = document.getElementById('save-comp-modal');
                if (modal) modal.style.display = 'none';
                document.getElementById('modal-overlay').style.display = 'none';

                const originalText = saveCompBtn.textContent;
                saveCompBtn.textContent = '✓';
                setTimeout(() => saveCompBtn.textContent = originalText, 1500);
            } else {
                alert("Failed to save composition.");
            }
        });
    }

    const loadCompBtn = document.getElementById('load-comp-btn');
    if (loadCompBtn) {
        loadCompBtn.addEventListener('click', () => {
            const compositions = storage.getCompositions();
                const listContainer = document.getElementById('compositions-list');
                listContainer.innerHTML = '';

                if (compositions.length === 0) {
                    listContainer.innerHTML = '<div class="placeholder-text">No saved compositions yet.</div>';
                } else {
                    // Group by category
                    const grouped = {};
                    compositions.forEach(c => {
                        const cat = c.category || 'Uncategorized';
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(c);
                    });

                    Object.keys(grouped).sort().forEach(cat => {
                        const catHeader = document.createElement('h3');
                        catHeader.textContent = cat;
                        catHeader.style.marginTop = '10px';
                        catHeader.style.marginBottom = '5px';
                        catHeader.style.fontSize = '1.1rem';
                        listContainer.appendChild(catHeader);

                        grouped[cat].forEach(comp => {
                            const itemDiv = document.createElement('div');
                            itemDiv.className = 'scale-item glass-card-small';
                            itemDiv.style.cursor = 'pointer';

                            const dateStr = new Date(comp.date).toLocaleDateString();

                            itemDiv.innerHTML = `
                                <div class="scale-info" style="flex: 1;">
                                    <div class="scale-name" style="font-size: 1.05rem;">${comp.name}</div>
                                    <div class="scale-notes" style="font-size: 0.85rem; margin-top: 4px;">Structure: ${comp.scale.name} • ${comp.progression.length} parts • ${comp.tempo} BPM</div>
                                </div>
                                <div class="scale-actions" style="display: flex; gap: 5px;">
                                    <button class="icon-btn append-comp" title="Add to End (+)" style="background: rgba(46, 204, 113, 0.2); color: #27ae60; border: 1px solid rgba(46, 204, 113, 0.3);">＋</button>
                                    <button class="icon-btn export-single-comp" title="Export as JSON" style="opacity: 0.7;">📥</button>
                                    <button class="icon-btn delete-comp" title="Delete">🗑</button>
                                </div>
                            `;

                            itemDiv.onclick = (e) => {
                                if (e.target.closest('.delete-comp')) {
                                    e.stopPropagation();
                                    if (confirm(`Delete composition "${comp.name}"?`)) {
                                        storage.deleteComposition(comp.id);
                                        loadCompBtn.click(); // reload list
                                    }
                                    return;
                                }

                                if (e.target.closest('.export-single-comp')) {
                                    e.stopPropagation();
                                    storage.exportCompositionToJson(comp.id);
                                    return;
                                }

                                const isAppend = !!e.target.closest('.append-comp');
                                if (isAppend) {
                                    e.stopPropagation();
                                }

                                // Load/Append it
                                if (!isAppend) {
                                    loadScale(comp.scale, true);
                                    updateBpmUI(comp.tempo);
                                    currentLoadedCompName = comp.name;
                                    currentLoadedCompCategory = comp.category;
                                }
                                loadProgressionData(comp.progression, isAppend);

                                // Track the loaded composition details
                                currentLoadedCompName = comp.name;
                                currentLoadedCompCategory = comp.category;

                                saveCurrentState();

                                const modal = document.getElementById('load-comp-modal');
                                if (modal) modal.style.display = 'none';
                                document.getElementById('modal-overlay').style.display = 'none';
                            };

                            listContainer.appendChild(itemDiv);
                        });
                    });
                }

                const modal = document.getElementById('load-comp-modal');
                if (modal) {
                    document.getElementById('modal-overlay').style.display = 'block';
                    modal.style.display = 'flex';
                }
            });
        }

    // Global Export/Import Listeners (Relocated)
    const exportLibraryBtn = document.getElementById('export-library-json-btn');
    const exportCurrentBtn = document.getElementById('export-current-json-btn');
    const importLibraryBtn = document.getElementById('import-library-json-btn');
    const importFileInput = document.getElementById('import-library-file-input');

    if (exportLibraryBtn) {
        exportLibraryBtn.onclick = () => storage.exportLibraryToJson();
    }

    if (exportCurrentBtn) {
        exportCurrentBtn.onclick = () => {
            const nameInput = document.getElementById('save-comp-name');
            const catInput = document.getElementById('save-comp-category');
            let name = nameInput?.value.trim();
            let category = catInput?.value.trim();

            if (!name) {
                name = prompt("Please enter a name for your export:", "My Handpan Composition");
                if (!name) return; // User Cancelled
                if (nameInput) nameInput.value = name;
            }

            if (!category) {
                category = prompt("Please enter a category for your export:", "My Phrases");
                if (!category) return; // User Cancelled
                if (catInput) catInput.value = category;
            }

            const currentBpm = document.getElementById('bpm-slider') ? parseInt(document.getElementById('bpm-slider').value) : 80;
            
            // Collect full precount/playback config (same as share/save)
            const precountSelect = document.getElementById('precount-select');
            let precountConfig = { value: '0' };
            if (precountSelect) {
                precountConfig.value = precountSelect.value;
                if (precountSelect.value === 'custom') {
                    try {
                        const saved = localStorage.getItem('customPrecountPattern');
                        if (saved) precountConfig.data = JSON.parse(saved);
                    } catch (e) { }
                }
            }
            const eachTimeToggle = document.getElementById('precount-each-time');
            if (eachTimeToggle) precountConfig.eachTime = eachTimeToggle.checked;
            const loopToggle = document.getElementById('playback-loop');
            if (loopToggle) precountConfig.loop = loopToggle.checked;

            const currentData = {
                id: 'current_session_' + Date.now(),
                name: name,
                category: category,
                scale: currentScale,
                tempo: currentBpm,
                precount: precountConfig, // Added precount metadata
                progression: exportProgressionData(),
                date: new Date().toISOString()
            };
            const dataStr = JSON.stringify(currentData, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const safeName = currentData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `handpan_comp_${safeName}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };
    }

    if (importLibraryBtn && importFileInput) {
        importLibraryBtn.onclick = () => importFileInput.click();
        importFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = storage.importLibraryFromJson(event.target.result);
                if (result.success) {
                    if (result.count === 1 && result.imported) {
                        const comp = result.imported;
                        
                        // Show Premium Choice Modal
                        const choiceModal = document.getElementById('import-choice-modal');
                        const appendBtn = document.getElementById('import-append-btn');
                        const replaceBtn = document.getElementById('import-replace-btn');
                        const closeBtn = document.getElementById('close-import-choice');
                        const overlay = document.getElementById('modal-overlay');

                        if (choiceModal && overlay) {
                            overlay.style.display = 'block';
                            choiceModal.style.display = 'flex';

                            const cleanup = () => {
                                choiceModal.style.display = 'none';
                                overlay.style.display = 'none';
                                appendBtn.onclick = null;
                                replaceBtn.onclick = null;
                                closeBtn.onclick = null;

                                // Also close the parent Load modal
                                const loadModal = document.getElementById('load-comp-modal');
                                if (loadModal) loadModal.style.display = 'none';
                            };

                            appendBtn.onclick = () => {
                                cleanup();
                                loadProgressionData(comp.progression, true);
                            };

                            replaceBtn.onclick = () => {
                                cleanup();
                                loadScale(comp.scale, true);
                                if (comp.tempo) updateBpmUI(comp.tempo);
                                loadProgressionData(comp.progression, false);
                            };

                            closeBtn.onclick = () => {
                                cleanup();
                            };
                        }
                    } else {
                        alert(`Successfully imported ${result.count} compositions to library!`);
                        // Reload list if load modal is open
                        const loadModal = document.getElementById('load-comp-modal');
                        if (loadModal && loadModal.style.display !== 'none') {
                            loadCompBtn.click();
                        }
                    }
                } else {
                    alert("Import failed: " + result.error);
                }
            };
            reader.readAsText(file);
            importFileInput.value = ''; // reset
        };
    }

    // 8. Initial Load (URL -> LocalStorage -> Default)
    const bpmValue = document.getElementById('bpm-value');
    function updateBpmUI(tempo) {
        if (bpmSlider) bpmSlider.value = tempo;
        if (bpmValue) bpmValue.textContent = tempo;
        setTempo(tempo);
    }

    const urlData = storage.decodeUrlData();
    if (urlData) {
        if (urlData.viewMode === 'compact') {
            isCompactView = true;
            const stage = document.getElementById('progression-stage');
            const toggleViewBtn = document.getElementById('toggle-view-btn');
            if (stage) stage.classList.add('compact-view');
            if (toggleViewBtn) toggleViewBtn.textContent = '⊞';
        }
        loadScale(urlData.scale, true);
        loadProgressionData(urlData.progression);
        if (urlData.tempo) updateBpmUI(urlData.tempo);
        if (urlData.precount) applyPrecountConfig(urlData.precount);
        // Save URL data to local storage immediately so it persists on reload
        saveCurrentState();
        // Clean up URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        const localData = storage.loadStateFromLocal();
        if (localData) {
            if (localData.viewMode === 'compact') {
                isCompactView = true;
                const stage = document.getElementById('progression-stage');
                const toggleViewBtn = document.getElementById('toggle-view-btn');
                if (stage) stage.classList.add('compact-view');
                if (toggleViewBtn) toggleViewBtn.textContent = '⊞';
            }
            loadScale(localData.scale, true);
            if (localData.progression) {
                loadProgressionData(localData.progression);
            }
            if (localData.tempo) updateBpmUI(localData.tempo);
            if (localData.precount) applyPrecountConfig(localData.precount);
            if (localData.loadedCompName) currentLoadedCompName = localData.loadedCompName;
            if (localData.loadedCompCategory) currentLoadedCompCategory = localData.loadedCompCategory;
        } else {
            const saved = loadLastScale() || getAllScales()[0];
            loadScale(saved, true);
        }
    }
}

// --- Core Logic ---

function loadScale(scale, isInitialLoad = false) {
    if (!scale) return;
    
    // Check Transpose Mode
    let transposedData = null;
    if (isTransposingMelody && transposeOldScale) {
        const progressionData = exportProgressionData();
        if (progressionData.length > 0) {
            // Ask user for tie-breaker preference
            const roundUp = window.confirm(
                "When transposing, some notes might fall exactly between two keys on the new handpan.\n\n" +
                "Click OK to round these notes UP.\n" +
                "Click Cancel to round these notes DOWN."
            );

            transposedData = progressionData.map(item => ({
                ...item,
                text: transposeMelodyText(item.text, transposeOldScale, scale, roundUp)
            }));
        }
        isTransposingMelody = false;
        transposeOldScale = null;
    }

    currentScale = scale;
    saveLastScale(scale);

    // Update Header
    const titleDisplay = document.getElementById('current-scale-display');
    if (titleDisplay) {
        const bottomNotes = Object.keys(scale.bottom).join(' ');
        titleDisplay.textContent = bottomNotes ? `${scale.name} • ${bottomNotes}` : scale.name;
    }

    // Populate Handpan Notes for Logic
    const allNotes = [...scale.top, ...Object.keys(scale.bottom)];
    handpanNotes = allNotes.map(n => parseNoteName(n)).filter(n => n !== null);

    // Set kick drum frequency based on current root note (top[0] is typically the Ding)
    const dingFreq = getFrequencyForNoteName(scale.top[0]);
    if (dingFreq) {
        setBaseKickFrequency(dingFreq);
    }

    // Render SVG
    renderHandpanSVG(currentScale, visualizerMode);

    // Generate & Render Chords
    const chords = generateChords(handpanNotes);

    // Collect all Dings
    const dingNotes = [scale.top[0]];
    if (scale.bottom) {
        Object.keys(scale.bottom).forEach(k => {
            if (k.startsWith('D:')) {
                dingNotes.push(k.substring(2));
            }
        });
    }

    renderChordGrid(chords, dingNotes);

    if (transposedData) {
        loadProgressionData(transposedData, false);
    } else if (!isInitialLoad) {
        clearProgression(true);
        resetPrecountUI();
    } else {
        clearProgression(false); // Don't trigger a save
    }
}

function setupAudioEngine() {
    // Wire engine -> visualizer
    setVisualizerCallbacks(
        (noteName, delay) => {
            highlightNote(noteName, delay);
            // Also highlight editor/progression pills?
            // The scheduler handles progression pill highlighting via its own callback.
            // But if I play manually on SVG?
            // SVG click -> engine -> setVisualizerCallbacks -> highlightNote.
            // This works for SVG feedback.
        },
        (delay, isGhost) => {
            highlightBody(delay, isGhost);
        }
    );
}

function initVisualizer() {
    initInteraction(
        (noteName) => {
            // User clicked SVG note
            const freq = getFrequencyForNoteName(noteName);
            if (freq) {
                initAudio();
                playTone(freq, noteName, 2.4, 0); // Visuals handled by callback
            }
        },
        () => {
            // User clicked body? (Not commonly clickable in SVG, but supported)
            initAudio();
            playTak(0);
        }
    );
}

function setupScheduler() {
    setProgressionCallbacks(
        (idx, chordData) => {
            // Step Connect
            const items = document.querySelectorAll('.progression-item');
            items.forEach(el => el.classList.remove('playing-item'));
            if (chordData && chordData.element) {
                chordData.element.classList.add('playing-item');
                // chordData.element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        },
        () => {
            // Stop
            const items = document.querySelectorAll('.progression-item');
            items.forEach(el => el.classList.remove('playing-item'));

            const btn = document.getElementById('play-progression-btn');
            if (btn) {
                btn.innerHTML = 'Play ▶';
                btn.classList.remove('playing');
                btn.classList.remove('stop-btn');
            }
            const canvasBtn = document.getElementById('canvas-play-btn');
            if (canvasBtn) {
                canvasBtn.classList.remove('playing');
                canvasBtn.classList.remove('stop-btn');
                canvasBtn.setAttribute('title', 'Play');
                canvasBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            }
            resetVisuals();
        },
        (noteName, time) => {
            // Note Schedule (high precision visual)
            // We no longer highlight specific pills in the progression card
            // as requested. The handpan SVG itself is animated via audio engine callbacks.
        }
    );
}

function togglePlayback() {
    const btn = document.getElementById('play-progression-btn');
    const canvasBtn = document.getElementById('canvas-play-btn');

    if (isProgressionPlaying()) {
        stopProgression();
    } else {
        // Ensure AudioContext is ready (browser policy)
        initAudio();
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }

        const chords = getProgressionChords();
        if (chords.length === 0) return;

        // Parse Notes map to Audio Events if needed?
        // chords has `notes` which are Parsed Objects (from parseRhythmString).
        // The scheduler's `scheduleSequence` expects these objects.
        // However, we need to ensure they have `freq` calculated.
        // `parseRhythmString` in `parser.js` returns objects like {note:'E', octave:4}.
        // It does NOT calculate freq.
        // `scheduler.js` (logic/progression.js) `scheduleProgressionStep` line 74 (approx)
        // calls `getFrequencyForNoteName`.
        // So it expects Objects with `note` and `octave`.
        // It handles the frequency lookup.
        // EXCEPT `parser.js` `getSortedScaleNotes` calculated `freq`?
        // `parser.js` used it for sorting.
        // The objects returned by Parser have `freq`?
        // Let's check `parser.js`.
        // `parseNoteToken` -> `getSortedScaleNotes` -> `allNotes.push({..., freq})`.
        // `parseNoteToken` pushes these objects into `noteGroup`.
        // So YES, the parsed notes ALREADY HAVE FREQ!
        // `scheduler.js` line 718: `const freq = getFrequencyForNoteName(noteName);`
        // It re-calculates it. That is fine/redundant but safe.
        // As long as `noteName` is constructible.

        startProgression(chords);

        // Auto-scroll to visualizer
        const vizSection = document.getElementById('visualizer-section');
        if (vizSection) {
            vizSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (btn) {
            btn.textContent = 'Stop ■';
            btn.classList.add('playing');
            btn.classList.add('stop-btn');
        }
        if (canvasBtn) {
            canvasBtn.classList.add('playing');
            canvasBtn.classList.add('stop-btn');
            canvasBtn.setAttribute('title', 'Stop');
            canvasBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>';
        }
    }
}

function stopPlayback() {
    stopProgression();
}

function setupGlobalEvents() {
    // Buttons
    document.getElementById('play-progression-btn')?.addEventListener('click', togglePlayback);
    document.getElementById('canvas-play-btn')?.addEventListener('click', togglePlayback);

    const muteAllBtn = document.getElementById('mute-all-btn');
    if (muteAllBtn) {
        let isAllMuted = false;
        muteAllBtn.addEventListener('click', () => {
            isAllMuted = !isAllMuted;

            // Adjust muteAllBtn icon
            if (isAllMuted) {
                muteAllBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
                muteAllBtn.title = "Unmute All Phrases";
            } else {
                muteAllBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
                muteAllBtn.title = "Mute All Phrases";
            }

            const items = document.querySelectorAll('#progression-stage .progression-item');
            items.forEach(item => {
                item.dataset.muted = isAllMuted ? 'true' : 'false';
                if (isAllMuted) {
                    item.classList.add('muted');
                } else {
                    item.classList.remove('muted');
                }

                const muteToggle = item.querySelector('.mute-toggle-btn');
                if (muteToggle) {
                    if (isAllMuted) {
                        muteToggle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
                        muteToggle.title = "Unmute";
                    } else {
                        muteToggle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
                        muteToggle.title = "Mute";
                    }
                }
            });

            // Save state once after all updates
            saveCurrentState();
        });
    }

    initLayoutEditor({
        getCurrentScale: () => currentScale,
        saveCurrentState: () => saveCurrentState(),
        saveCustomScale: (id, data) => saveCustomScale(id, data)
    });

    // Sliders
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValue = document.getElementById('bpm-value');
    if (bpmSlider) {
        bpmSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            setTempo(val);
            if (bpmValue) bpmValue.textContent = val;
        });
    }
    if (bpmValue && bpmSlider) {
        bpmValue.style.cursor = 'pointer';
        bpmValue.title = "Click to enter BPM manually";
        bpmValue.addEventListener('click', () => {
            const newBpm = prompt("Enter BPM (30-280):", bpmSlider.value);
            if (newBpm !== null) {
                let parsed = parseInt(newBpm);
                if (!isNaN(parsed)) {
                    if (parsed < 30) parsed = 30;
                    if (parsed > 280) parsed = 280;
                    bpmSlider.value = parsed;
                    setTempo(parsed);
                    bpmValue.textContent = parsed;
                }
            }
        });
    }

    // Theme
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        // Init state
        const savedTheme = localStorage.getItem('theme') || 'light';
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeBtn.textContent = '🌙';
        }

        themeBtn.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            themeBtn.textContent = isDark ? '🌙' : '🌞';
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    // Escape Key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Priority 1: If Notation Info is open, close only it
            const notationInfo = document.getElementById('notation-info-modal');
            if (notationInfo && notationInfo.style.display !== 'none' && !notationInfo.classList.contains('hidden')) {
                notationInfo.style.display = 'none';
                return; // Stop here, don't close the Editor underneath
            }

            // Priority 2: Grid Editor
            const gridModal = document.getElementById('grid-editor-modal');
            if (gridModal && gridModal.style.display !== 'none') {
                closeGridEditor();
                return;
            }

            // Otherwise, close other modals
            const modals = document.querySelectorAll('.modal, .modal-overlay');
            modals.forEach(m => {
                if (m.style.display !== 'none' && !m.classList.contains('hidden')) {
                    m.style.display = 'none';
                }
            });
            const overlay = document.getElementById('modal-overlay');
            if (overlay) overlay.style.display = 'none';
        }
    });

    // 4. Visualizer View Toggle
    const vizToggle = document.getElementById('viz-toggle');
    const vizSection = document.getElementById('visualizer-section');
    if (vizToggle && vizSection) {
        vizToggle.addEventListener('click', () => {
            vizSection.classList.toggle('collapsed');
            vizToggle.classList.toggle('collapsed');
            const isCollapsed = vizSection.classList.contains('collapsed');
            vizToggle.innerHTML = isCollapsed ? '<span style="font-size: 1.2em;">▼</span>' : '<span style="font-size: 1.2em;">▲</span>';
        });
    }

    const vizFullscreenBtn = document.getElementById('viz-fullscreen-btn');
    if (vizFullscreenBtn) {
        vizFullscreenBtn.addEventListener('click', () => {
            const container = document.querySelector('.handpan-container');
            if (container) {
                container.classList.toggle('visualizer-fullscreen');

                // Toggle icon
                const isFullscreen = container.classList.contains('visualizer-fullscreen');

                // Prevent background scrolling
                if (isFullscreen) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }

                if (isFullscreen) {
                    vizFullscreenBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3v3h-3m16 0h-3v-3m0 18v-3h3M3 16h3v3" />
                        </svg>
                    `;
                    vizFullscreenBtn.title = "Exit Fullscreen";
                } else {
                    vizFullscreenBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                    `;
                    vizFullscreenBtn.title = "Toggle Fullscreen";
                }
            }
        });

    }


    // Chord Panel Toggle
    const chordToggleBtn = document.getElementById('chord-toggle-btn');
    const chordHeader = document.querySelector('.chord-panel-header');

    const toggleChordPanel = () => {
        const grid = document.getElementById('chord-grid');
        const btn = document.getElementById('chord-toggle-btn');
        if (grid) {
            grid.classList.toggle('collapsed');
            const isCollapsed = grid.classList.contains('collapsed');
            if (btn) btn.innerHTML = isCollapsed ? '▼' : '▲';

            const sortBtn = document.getElementById('sort-chords-btn');
            if (sortBtn) {
                sortBtn.style.display = isCollapsed ? 'none' : 'block';
            }
        }
    };

    if (chordToggleBtn) {
        chordToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChordPanel();
        });
    }

    if (chordHeader) {
        chordHeader.addEventListener('click', toggleChordPanel);
    }

    // Sort Button
    const sortBtn = document.getElementById('sort-chords-btn');
    if (sortBtn) {
        sortBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChordSort();
        });
    }
}

// Ensure initApp runs even if DOMContentLoaded already fired (common with modules)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(registration => {
            console.log('SW registered: ', registration);

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    // Has network content changed?
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New update available
                        const banner = document.getElementById('pwa-update-banner');
                        const btn = document.getElementById('pwa-reload-btn');
                        if (banner && btn) {
                            banner.style.display = 'flex';
                            banner.classList.add('show');
                            btn.addEventListener('click', () => {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                window.location.reload();
                            });
                        }
                    }
                });
            });
        }).catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
        });
    });
}

function applyPrecountConfig(config) {
    if (!config) return;
    const select = document.getElementById('precount-select');
    if (!select) return;

    if (config.eachTime !== undefined) {
        const eachTimeToggle = document.getElementById('precount-each-time');
        if (eachTimeToggle) eachTimeToggle.checked = config.eachTime;
    }

    if (config.loop !== undefined) {
        const loopToggle = document.getElementById('playback-loop');
        if (loopToggle) loopToggle.checked = config.loop;
    }

    if (config.value === 'custom' && config.data) {
        localStorage.setItem('customPrecountPattern', JSON.stringify(config.data));
        setCustomPrecountPattern(config.data);

        let customOpt = select.querySelector('option[value="custom"]');
        if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.value = 'custom';
            select.appendChild(customOpt);
        }

        let pLen = 8, sDiv = 2;
        if (Array.isArray(config.data)) {
            pLen = config.data.length;
        } else if (config.data.pattern) {
            pLen = config.data.pattern.length;
            sDiv = config.data.subdiv || 2;
        }

        const formatLabel = (p, s) => {
            if (s === 1) return `Custom (${p} beats)`;
            const typeMap = { 2: '1/8', 3: '1/12', 4: '1/16' };
            return `Custom (${p} ${typeMap[s] || '?'})`;
        };
        customOpt.textContent = formatLabel(pLen, sDiv);
        select.value = 'custom';
    } else {
        select.value = config.value || '0';
        const customOpt = select.querySelector('option[value="custom"]');
        if (customOpt) customOpt.remove();
    }
}

function initCustomPrecountUI() {
    const select = document.getElementById('precount-select');
    const openBtn = document.getElementById('open-custom-precount-btn');
    const modal = document.getElementById('custom-precount-modal');
    const overlay = document.getElementById('modal-overlay');
    const lengthInput = document.getElementById('custom-precount-length');
    const subdivSelect = document.getElementById('custom-precount-subdiv');
    const gridContainer = document.getElementById('custom-precount-grid');
    const saveBtn = document.getElementById('confirm-custom-precount');
    const cancelBtn = document.getElementById('cancel-custom-precount');
    const closeBtn = document.getElementById('close-custom-precount');

    if (!select || !modal) return;

    let previousValue = select.value || '0';
    let currentPattern = [true, false, false, false, true, false, false, false]; // default 8
    let currentSubdiv = 2; // 1/8 notes by default, aligned with Grid Editor 1/4 feel

    // Load saved custom pattern if any
    try {
        const saved = localStorage.getItem('customPrecountPattern');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                currentPattern = parsed; // Legacy support
                currentSubdiv = 2;
            } else if (parsed && parsed.pattern) {
                currentPattern = parsed.pattern;
                currentSubdiv = parsed.subdiv || 2;
            }
        }
        setCustomPrecountPattern({ pattern: currentPattern, subdiv: currentSubdiv });
    } catch (e) { }

    const renderGrid = (len) => {
        gridContainer.innerHTML = '';
        // Adjust array size
        while (currentPattern.length < len) currentPattern.push(false);
        if (currentPattern.length > len) currentPattern.length = len;

        for (let i = 0; i < len; i++) {
            const cell = document.createElement('div');
            cell.className = 'custom-precount-cell' + (currentPattern[i] ? ' active' : '');
            cell.textContent = i + 1;
            cell.onclick = () => {
                currentPattern[i] = !currentPattern[i];
                cell.classList.toggle('active', currentPattern[i]);
            };
            gridContainer.appendChild(cell);
        }
    };

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            previousValue = select.value;
            let customOpt = select.querySelector('option[value="custom"]');
            if (!customOpt) {
                customOpt = document.createElement('option');
                customOpt.value = 'custom';

                const formatLabel = (p, s) => {
                    if (s === 1) return `Custom (${p} beats)`;
                    const typeMap = { 2: '1/8', 3: '1/12', 4: '1/16' };
                    return `Custom (${p} ${typeMap[s] || '?'})`;
                };
                customOpt.textContent = formatLabel(currentPattern.length, currentSubdiv);
                select.appendChild(customOpt);
            }
            select.value = 'custom';

            lengthInput.value = currentPattern.length;
            if (subdivSelect) subdivSelect.value = currentSubdiv;
            renderGrid(currentPattern.length);
            overlay.style.display = 'block';
            modal.style.display = 'block';
        });
    }

    select.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            previousValue = e.target.value;
            // If they pick a normal number, remove 'custom' option if it exists
            const customOpt = select.querySelector('option[value="custom"]');
            if (customOpt) customOpt.remove();
        }
    });

    if (lengthInput) {
        lengthInput.addEventListener('change', (e) => {
            let val = parseInt(e.target.value);
            if (val < 1) val = 1;
            if (val > 32) val = 32;
            e.target.value = val;
            renderGrid(val);
        });
    }

    if (subdivSelect) {
        subdivSelect.addEventListener('change', (e) => {
            currentSubdiv = parseInt(e.target.value);
        });
    }

    const closeModal = () => {
        modal.style.display = 'none';
        overlay.style.display = 'none';
    };

    const cancel = () => {
        // Revert select back to what it was
        select.value = previousValue;
        const customOpt = select.querySelector('option[value="custom"]');
        if (customOpt && previousValue !== 'custom') customOpt.remove();
        closeModal();
    };

    const save = () => {
        previousValue = 'custom';
        const saveData = { pattern: currentPattern, subdiv: currentSubdiv };
        localStorage.setItem('customPrecountPattern', JSON.stringify(saveData));
        setCustomPrecountPattern(saveData);

        let customOpt = select.querySelector('option[value="custom"]');
        if (!customOpt) {
            customOpt = document.createElement('option');
            customOpt.value = 'custom';
            select.appendChild(customOpt);
        }

        const formatLabel = (p, s) => {
            if (s === 1) return `Custom (${p} beats)`;
            const typeMap = { 2: '1/8', 3: '1/12', 4: '1/16' };
            return `Custom (${p} ${typeMap[s] || '?'})`;
        };
        customOpt.textContent = formatLabel(currentPattern.length, currentSubdiv);

        select.value = 'custom';

        closeModal();
    };

    if (cancelBtn) cancelBtn.addEventListener('click', cancel);
    if (closeBtn) closeBtn.addEventListener('click', cancel);
    if (saveBtn) saveBtn.addEventListener('click', save);

    // Prevent modal close on overlay click? Optionally.
    // The modals.js logic already handles clicking #modal-overlay to close all.
    // However, if we click outside, we might want to trigger `cancel` instead of just hiding it
    // so the select reverts.
    // We already intercepted clicks in modals.js, but let's assume it's fine for now, 
    // user just explicitly clicks 'Save' or 'Cancel' in this modal.
}
