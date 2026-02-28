
import { playTone, playTak, getAudioContext, initAudio } from '../audio/engine.js';
import { getFrequencyForNoteName } from '../logic/chords.js';
import { startProgression, stopProgression, getTempo } from '../logic/progression.js';
import { NOTE_TO_MIDI } from '../data/constants.js';

let dependencies = {};
// { addToProgression }

let voicingModal = null;
let currentModalLoopId = null;
let currentModalNotes = null; // To toggle off if clicked again
let currentModalBtn = null; // Track active button to toggle text/style
let currentVisualTimeouts = []; // Track visualizer timeouts to clear them

// Sorting State
let isSortedByPitch = false;
let lastRenderedChords = [];
let lastDingNotes = [];

export function toggleChordSort() {
    isSortedByPitch = !isSortedByPitch;
    const btn = document.getElementById('sort-chords-btn');
    if (btn) {
        btn.style.opacity = isSortedByPitch ? '1' : '0.5';
        btn.innerHTML = isSortedByPitch ? '⚡' : '⇅';
        btn.setAttribute('title', isSortedByPitch ? 'Sorted by Pitch' : 'Grouped by Type');
    }
    // Re-render with cached data
    if (lastRenderedChords.length > 0) {
        renderChordGrid(lastRenderedChords, lastDingNotes);
    }
}

export function initChordGrid(deps) {
    dependencies = deps;
    voicingModal = document.getElementById('voicing-modal');

    // Voicing modal close logic
    document.getElementById('close-voicing-modal')?.addEventListener('click', () => {
        closeVoicingModal();
    });

    // Close on overlay click
    if (voicingModal) {
        voicingModal.addEventListener('click', (e) => {
            if (e.target === voicingModal) {
                closeVoicingModal();
            }
        });
    }
}

export function renderChordGrid(chords, dingNotes) {
    const grid = document.getElementById('chord-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (chords.length === 0) {
        grid.innerHTML = '<p style="color:white; text-align:center; grid-column: 1/-1;">No standard chords found with these notes.</p>';
        return;
    }

    // Cache for sorting
    // Only update cache if we received NEW chords (not re-rendering from toggle)
    if (chords !== lastRenderedChords) {
        lastRenderedChords = chords;
        lastDingNotes = dingNotes;
    }

    // Determine Ding Info always (needed for Interval display)
    const getNoteName = (str) => {
        const m = str.match(/^([A-G][#b]?)/);
        return m ? m[1] : str;
    };
    const dingRootStr = dingNotes && dingNotes.length > 0 ? getNoteName(dingNotes[0]) : 'C';
    const dingVal = NOTE_TO_MIDI[dingRootStr];

    const getDegreeName = (note) => {
        const val = NOTE_TO_MIDI[note];
        if (val === undefined || dingVal === undefined) return '';
        const semitones = (val - dingVal + 12) % 12;
        const map = {
            0: 'I', 1: 'bII', 2: 'II', 3: 'bIII', 4: 'III', 5: 'IV', 6: 'bV', 7: 'V', 8: 'bVI', 9: 'VI', 10: 'bVII', 11: 'VII'
        };
        return map[semitones] || '?';
    };

    // Categorize Chords
    const mainChords = [];
    const dyadChords = [];
    const colorChords = [];

    chords.forEach(chord => {
        const t = chord.type;
        if (t === 'Major' || t === 'Minor') {
            mainChords.push(chord);
        } else if (t === '5' || t === 'M3' || t === 'm3') {
            dyadChords.push(chord);
        } else {
            colorChords.push(chord);
        }
    });

    // Helper to get exact lowest pitch value of the root note for a chord
    const getRootPitchValue = (chord) => {
        // Find the specific note object in the arpeggio that matches the chord root
        const rootNoteObj = chord.arpeggio.find(n => n.note === chord.root);
        // If it exists, use its absolute midi value, otherwise use a generic high number
        return rootNoteObj ? rootNoteObj.value : 999;
    };

    const sortByRootPitch = (a, b) => {
        return getRootPitchValue(a) - getRootPitchValue(b);
    };

    mainChords.sort(sortByRootPitch);
    dyadChords.sort(sortByRootPitch);
    colorChords.sort(sortByRootPitch);

    const renderChordList = (chordList, title) => {
        if (chordList.length === 0) return;

        // Container for category
        const section = document.createElement('div');
        section.style.gridColumn = "1 / -1";
        section.style.marginBottom = "20px";

        const header = document.createElement('h3');
        header.textContent = title;
        header.style.color = "var(--text-main)";
        header.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
        header.style.paddingBottom = "5px";
        header.style.marginBottom = "15px";
        header.style.fontSize = "1.1rem";
        section.appendChild(header);

        const subGrid = document.createElement('div');
        subGrid.className = 'card-grid'; // Reuse layout mechanics internally
        subGrid.style.display = "grid";
        subGrid.style.gap = "15px";
        subGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";

        chordList.forEach(chord => {
            const card = document.createElement('div');
            card.className = 'glass-card chord-card';

            // Add type-specific class for color coding
            const cType = chord.type;
            if (cType === 'Major' || cType === 'Maj7' || cType === 'M3') card.classList.add('type-major');
            else if (cType === 'Minor' || cType === 'Min7' || cType === 'm3') card.classList.add('type-minor');
            else if (cType.includes('Sus')) card.classList.add('type-sus');
            else if (cType === '5') card.classList.add('type-power');
            else if (cType === '7' || cType.includes('Dim') || cType === 'Min7b5') card.classList.add('type-seventh');

            const baseNotes = [...new Set(chord.notes.map(n => n.note))];

            // Sort notes by interval from root
            const rootVal = NOTE_TO_MIDI[chord.root];
            baseNotes.sort((a, b) => {
                const valA = (NOTE_TO_MIDI[a] - rootVal + 12) % 12;
                const valB = (NOTE_TO_MIDI[b] - rootVal + 12) % 12;
                return valA - valB;
            });

            // Render Note Badges
            const noteBadges = baseNotes.map(n => `<span class="note-badge" style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${n}</span>`).join('');

            // Interval Display
            const degree = getDegreeName(chord.root);
            const degreeHTML = degree ? `<span style="font-size:0.8em; opacity: 0.5; font-weight:normal; margin-left:6px;">(${degree})</span>` : '';

            card.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                    <!-- Row 1: Title -->
                    <div style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <h2 style="margin: 0; font-size: 1.2rem; color: var(--text-main);">${chord.root}${degreeHTML} <span style="font-weight:300; font-size: 0.9em; opacity: 0.9;">${chord.type}</span></h2>
                    </div>
                    <!-- Row 2: Notes & Options -->
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; gap: 4px; flex-wrap: wrap; flex: 1;">
                            ${noteBadges}
                        </div>
                        <button class="icon-btn open-options" title="View Options" style="font-size: 0.8rem; padding: 4px 8px; margin-left: 10px;">▼</button>
                    </div>
                    <!-- Row 3: Add Buttons -->
                    <div style="display: flex; gap: 8px; margin-top: 4px;">
                        <button class="premium-btn-small add-chord" title="Add Arpeggio" style="flex: 1; padding: 6px 0; font-size: 0.85rem;">Arpeggio +</button>
                        <button class="premium-btn-small add-chord-sim" title="Add as Chord (Simultaneous)" style="flex: 1; padding: 6px 0; font-size: 0.85rem;">Chord |+</button>
                    </div>
                </div>
            `;

            // Interactions
            const openBtn = card.querySelector('.open-options');
            const addSimBtn = card.querySelector('.add-chord-sim');
            const addBtn = card.querySelector('.add-chord');

            openBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                openVoicingModal(chord, dingNotes);
            };

            addSimBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dependencies.addToProgression) {
                    dependencies.addToProgression(chord, null, null, null, 4, true);
                }
            };

            addBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dependencies.addToProgression) {
                    dependencies.addToProgression(chord, null, null, null, 4, false);
                }
            };

            card.onclick = (e) => {
                if (!e.target.closest('button')) {
                    playChordStub(chord);
                }
            };

            subGrid.appendChild(card);
        });

        section.appendChild(subGrid);
        grid.appendChild(section);
    };

    renderChordList(mainChords, "Main Chords (Triads)");
    renderChordList(dyadChords, "Basic Dyads");
    renderChordList(colorChords, "Color Chords");
}

function openVoicingModal(chord, dingNotes) {
    if (!voicingModal) return;

    const title = document.getElementById('voicing-modal-title');
    const list = document.getElementById('voicing-list');

    if (title) title.textContent = `${chord.root} ${chord.type} Options`;
    if (list) list.innerHTML = '';

    // Helper to render row
    const renderRow = (notes, label, voicingIndex) => {
        // Sort notes by pitch for display?
        // notes is array of objects.

        const row = document.createElement('div');
        row.className = 'voicing-row-large'; // MATCH CSS
        if (label === 'Full Arpeggio') {
            row.classList.add('arpeggio-highlight');
        }

        const notePills = notes.map(n => {
            if (n.type === 'percussion') return `<span class="note-pill" style="background:#ff8c00; color:black;">${n.hand}</span>`;

            const noteName = `${n.note}${n.octave}`;
            const isDing = dingNotes && dingNotes.includes(noteName);
            const extraClass = isDing ? ' ding-pill' : '';
            return `<span class="note-pill${extraClass}">${noteName}</span>`;
        }).join('');

        row.innerHTML = `
            <div class="voicing-info" style="flex: 1;">
                <span class="voicing-label" style="font-weight: bold; margin-bottom: 4px; display: block;">${label}</span>
                <div class="voicing-notes-container" style="margin-bottom: 8px;">${notePills}</div>
            </div>
            <div class="voicing-actions" style="display: flex; flex-direction: column; gap: 6px; align-items: flex-end;">
                <div style="display: flex; gap: 6px; justify-content: flex-end;">
                    <button class="premium-btn-small add-variant-btn" title="Add Arpeggio" style="padding: 4px 8px; font-size: 0.8rem;">Arpeggio +</button>
                    <button class="premium-btn-small add-variant-sim-btn" title="Add as Chord (Simultaneous)" style="padding: 4px 8px; font-size: 0.8rem;">Chord |+</button>
                </div>
                <button class="premium-btn play-btn" style="padding: 6px 15px; font-size: 0.85rem; width: 100%;">Play ▶</button>
            </div>
        `;

        // Actions
        const playBtn = row.querySelector('.play-btn');
        const pillsDiv = row.querySelector('.voicing-notes-container');

        playBtn.onclick = (e) => {
            e.stopPropagation();
            startModalLoop(notes, pillsDiv, playBtn);
        };

        const addSimBtn = row.querySelector('.add-variant-sim-btn');
        addSimBtn.onclick = (e) => {
            e.stopPropagation();
            if (dependencies.addToProgression) {
                const chordLabel = voicingIndex >= 0 ? `${chord.name} (V${voicingIndex + 1})` : chord.name;
                dependencies.addToProgression(chord, notes, chordLabel, null, 4, true); // true for isSimultaneous
            }
            closeVoicingModal();
        };

        const addBtn = row.querySelector('.add-variant-btn');
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (dependencies.addToProgression) {
                // Determine label if it's a specific voicing
                const chordLabel = voicingIndex >= 0 ? `${chord.name} (V${voicingIndex + 1})` : chord.name;
                dependencies.addToProgression(chord, notes, chordLabel, null, 4, false);
            }
            closeVoicingModal();
        };

        list.appendChild(row);
    };

    // 1. Render Arpeggio first (if exists)
    if (chord.arpeggio) {
        // Sort by frequency/pitch
        const sortedArp = [...chord.arpeggio].sort((a, b) => {
            const fA = getFrequencyForNoteName(`${a.note}${a.octave}`) || 0;
            const fB = getFrequencyForNoteName(`${b.note}${b.octave}`) || 0;
            return fA - fB;
        });
        renderRow(sortedArp, 'Full Arpeggio', -1);
    }

    // 2. Render standard voicings
    chord.voicings.forEach((voicing, index) => {
        renderRow(voicing, `Option ${index + 1}`, index);
    });

    voicingModal.style.display = 'flex';
    document.getElementById('modal-overlay').style.display = 'block';
}

export function closeVoicingModal() {
    stopModalLoop();
    if (voicingModal) voicingModal.style.display = 'none';
    // Check if other modals are open? 
    // For now, main.js handles overlay closure logic if generic, but here we explicitly close overlay if we are the only one.
    // But `modals.js` handles generic overlay clicks.
    // We should probably check. But simple 'none' is safe if we don't block others.
    // Actually, if we close this, we should hide overlay if no others are open.
    // But `modals.js` is the master of overlay?
    // Let's just hide overlay here for simplicity, assuming this modal is modal.
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Simple playback helpers for the grid (not the full scheduler)
function playChordStub(chord) {
    // Just play the first voicing or arpeggio quickly
    const voicing = chord.voicings[0] || chord.arpeggio;
    playSequenceStub(voicing);
}

function playSequenceStub(notes) {
    // Stop any existing playback
    stopProgression();

    // Ensure Audio Context is ready (Synchronous wake-up)
    initAudio();
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    // Create a temporary chord object for the scheduler
    // The scheduler expects an array of chord objects: { notes: [], repeats: 1 }
    // 'notes' here array of objects {note, octave, type}. 
    // We need to ensure they have 'freq' if missing? 
    // `progression.js` handles freq lookup if missing.

    const tempProgression = [
        {
            notes: notes,
            repeats: 1,
            element: null // No UI element to highlight
        }
    ];

    // Start playback
    startProgression(tempProgression, { loop: false });
}

function playModalSequence(notes, pillsContainer) {
    initAudio();
    const audioCtx = getAudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopProgression();

    const bpm = getTempo();
    const beatDuration = 60 / bpm;
    // Use semi-quavers or quavers depending on preference. 
    // User wanted not "fast strum". 
    // 8th notes (0.5 beat) is a good standard for arpeggios.
    const noteDuration = beatDuration / 2;
    const now = audioCtx.currentTime;

    notes.forEach((n, i) => {
        const t = now + (i * noteDuration);

        // Audio
        if (n.type === 'percussion') {
            playTak(t);
        } else {
            const freq = getFrequencyForNoteName(`${n.note}${n.octave}`);
            const fullNoteName = `${n.note}${n.octave}`;
            if (freq) playTone(freq, fullNoteName, 2.5, t, true); // suppressVisuals=true for main visualizer
        }

        // Visuals (Modal Pills)
        if (pillsContainer) {
            // Find the pill corresponding to this note
            // We can match by text content.
            // Or simpler: assume pills are in same order as notes.
            const pills = pillsContainer.querySelectorAll('.note-pill');
            if (pills[i]) {
                const delayMs = (t - now) * 1000;
                const tid = setTimeout(() => {
                    pills[i].classList.add('note-active-modal');
                    // Remove class after duration
                    const tid2 = setTimeout(() => pills[i].classList.remove('note-active-modal'), noteDuration * 1000);
                    currentVisualTimeouts.push(tid2);
                }, delayMs);
                currentVisualTimeouts.push(tid);
            }
        }
    });
}

function stopModalLoop() {
    if (currentModalLoopId) {
        clearTimeout(currentModalLoopId);
        currentModalLoopId = null;
    }

    // Clear visual timeouts
    if (window.currentVisualTimeouts) { // Safety check if defined globally or scope
        // Actually it is in module scope.
    }
    // Using variable directly
    currentVisualTimeouts.forEach(id => clearTimeout(id));
    currentVisualTimeouts = [];

    // Clear active classes manually just in case
    document.querySelectorAll('.note-active-modal').forEach(el => el.classList.remove('note-active-modal'));

    currentModalNotes = null;

    // Reset button UI
    if (currentModalBtn) {
        currentModalBtn.innerHTML = 'Play ▶';
        currentModalBtn.classList.remove('playing');
        currentModalBtn = null;
    }

    stopProgression(); // Stops audio engine too
}

function startModalLoop(notes, pillsContainer, btnElement) {
    // If clicking the same thing, stop it (toggle)
    // If clicking the same thing, stop it (toggle)
    if (currentModalNotes === notes) {
        stopModalLoop();
        return;
    }

    stopModalLoop(); // Stop previous, clear visuals, reset previous button

    currentModalNotes = notes;
    currentModalBtn = btnElement;

    // Update UI
    if (currentModalBtn) {
        currentModalBtn.innerHTML = 'Stop ■';
        currentModalBtn.classList.add('playing');
    }

    const playLoop = () => {
        // Calculate duration first to know when to loop
        const bpm = getTempo();
        const beatDuration = 60 / bpm;
        const noteDuration = beatDuration / 2;
        const totalDuration = notes.length * noteDuration;

        playModalSequence(notes, pillsContainer);

        currentModalLoopId = setTimeout(playLoop, totalDuration * 1000);
    };

    playLoop();
}
