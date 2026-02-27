
import { initAudio, playTone, playTak, stopAllSounds, setVisualizerCallbacks, getAudioContext } from './audio/engine.js';
import { startProgression, stopProgression, toggleProgression, setProgressionCallbacks, setTempo, isPlaying as isProgressionPlaying } from './logic/progression.js';
import { loadLastScale, saveLastScale, getAllScales, initCustomScales } from './data/scales.js';
import { generateChords, parseNoteName, getFrequencyForNoteName } from './logic/chords.js';
import { parseRhythmString } from './logic/parser.js';
import { initInteraction, renderHandpanSVG, highlightNote, highlightBody, resetVisuals } from './ui/visualizer.js?v=7';
import { initModals } from './ui/modals.js';
import { initChordGrid, renderChordGrid, toggleChordSort } from './ui/chord_grid.js?v=7';
import { initProgressionUI, addChordToProgression, updateProgressionItem, getProgressionChords, clearProgression, exportProgressionData, loadProgressionData } from './ui/progression.js';
import { initEditor, openEditor } from './ui/editor.js';
import { initInspirations } from './ui/inspirations.js';
import { saveStateToLocal, loadStateFromLocal, generateShareUrl, decodeUrlData } from './data/storage.js';

// Application State
let currentScale = null;
let handpanNotes = []; // Array of {note, octave, value}
let visualizerMode = 'notes'; // 'notes', 'numbers', 'degrees'

// Function to trigger state save
function saveCurrentState() {
    if (!currentScale) return;
    const progressionData = exportProgressionData();
    const bpmInput = document.getElementById('bpm-slider');
    const tempo = bpmInput ? parseInt(bpmInput.value) : 80;
    saveStateToLocal(currentScale, progressionData, tempo);
}

// --- Initialization ---

function initApp() {
    // 0. Welcome Overlay & Audio Init
    const welcomeOverlay = document.getElementById('welcome-overlay');
    const startBtn = document.getElementById('btn-start-app');
    if (welcomeOverlay && startBtn) {
        startBtn.addEventListener('click', () => {
            try {
                initAudio();
            } catch (e) {
                console.error("Audio init error:", e);
            }
            welcomeOverlay.style.opacity = '0';
            setTimeout(() => welcomeOverlay.style.display = 'none', 300); // fade out duration
        });
    }

    // 1. Init Data
    initCustomScales();

    // 2. Init UI Components
    initModals((newScale) => loadScale(newScale));

    initVisualizer();

    initChordGrid({
        addToProgression: (chord, specificNotes, label) => {
            addChordToProgression(chord, specificNotes, label);
            saveCurrentState();
        }
    });

    initProgressionUI('progression-stage', {
        openEditor: (item, defaultName) => openEditor(item, defaultName),
        onUpdate: () => {
            saveCurrentState();
        },
        getScale: () => currentScale,
        parseText: (text) => parseRhythmString(text, currentScale),
        stopPlayback: () => stopPlayback()
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
        saveCurrentState();
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

    // 3. Audio & Scheduler Setup
    setupAudioEngine();
    setupScheduler();

    // 4. Global Event Listeners
    setupGlobalEvents();

    // 5. Share Button Setup
    const shareBtn = document.getElementById('share-progression');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const bpmInput = document.getElementById('bpm-slider');
            const tempo = bpmInput ? parseInt(bpmInput.value) : 80;
            const url = generateShareUrl(currentScale, exportProgressionData(), tempo);
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
            saveCurrentState();
        });
    }

    // 7. Save/Load Composition Modals
    let currentLoadedCompName = '';
    let currentLoadedCompCategory = '';

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

            // Optional: Import saveComposition from storage.js at top of file
            import('./data/storage.js').then(storage => {
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
        });
    }

    const loadCompBtn = document.getElementById('load-comp-btn');
    if (loadCompBtn) {
        loadCompBtn.addEventListener('click', () => {
            import('./data/storage.js').then(storage => {
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
                                <div class="scale-actions">
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

                                // Load it
                                loadScale(comp.scale, true);
                                loadProgressionData(comp.progression);
                                updateBpmUI(comp.tempo);

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
        });
    }

    // 8. Initial Load (URL -> LocalStorage -> Default)
    const bpmValue = document.getElementById('bpm-value');
    const updateBpmUI = (tempo) => {
        if (bpmSlider) bpmSlider.value = tempo;
        if (bpmValue) bpmValue.textContent = tempo;
        setTempo(tempo);
    };

    const urlData = decodeUrlData();
    if (urlData) {
        // Load from URL
        loadScale(urlData.scale, true);
        loadProgressionData(urlData.progression);
        if (urlData.tempo) updateBpmUI(urlData.tempo);
        // Save URL data to local storage immediately so it persists on reload
        saveCurrentState();
        // Clean up URL without reloading
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        const localData = loadStateFromLocal();
        if (localData && localData.scale) {
            loadScale(localData.scale, true);
            if (localData.progression) {
                loadProgressionData(localData.progression);
            }
            if (localData.tempo) updateBpmUI(localData.tempo);
        } else {
            const saved = loadLastScale() || getAllScales()[0];
            loadScale(saved, true);
        }
    }
}

// --- Core Logic ---

function loadScale(scale, isInitialLoad = false) {
    if (!scale) return;
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

    // Clear Progression? User might want to keep it?
    // If it's the initial page load, do not clear the progression or trigger an empty save!
    if (!isInitialLoad) {
        clearProgression(true);
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
            if (chordData.element) {
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
            }
            const canvasBtn = document.getElementById('canvas-play-btn');
            if (canvasBtn) {
                canvasBtn.classList.remove('playing');
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

        if (btn) {
            btn.textContent = 'Stop ■';
            btn.classList.add('playing');
        }
        if (canvasBtn) {
            canvasBtn.classList.add('playing');
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
            const modals = document.querySelectorAll('.modal, .modal-overlay');
            modals.forEach(m => {
                if (m.style.display !== 'none' && !m.classList.contains('hidden')) {
                    // Try to find a close button inside or just hide it
                    // Best to use the specific close logic if possible, but hiding works for "emergency" ESC
                    m.style.display = 'none';
                }
            });
            // Also ensure overlay is gone if it's separate
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

        // Click outside handpan (background/container) plays Tak
        const container = document.querySelector('.handpan-container');
        if (container) {
            container.addEventListener('pointerdown', (e) => {
                // If it's the container itself (outside SVG entirely) 
                // OR it's the SVG element but NOT the handpan body/notes (which stopPropagation)
                if ((e.target === container || e.target.id === 'handpan-svg')) {
                    import('./audio/engine.js').then(module => {
                        module.playTak(0);
                    });
                }
            });
        }
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
