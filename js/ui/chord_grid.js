
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

    // Sort or Use Default
    let displayChords = [...chords];
    if (isSortedByPitch) {
        // 2. Define Type Priority
        const typePriority = {
            'Major': 0, 'Minor': 0, 'Maj7': 0, 'Min7': 0, 'Dim': 0, 'Min7b5': 0, 'Dim7': 0,
            'Sus2': 1, 'Sus4': 1,
            '5': 2,
            'M3': 3, 'm3': 3 // Dyads last
        };
        const getPriority = (type) => typePriority[type] !== undefined ? typePriority[type] : 4;

        displayChords.sort((a, b) => {
            const rootA = a.root;
            const rootB = b.root;

            // Priority 1: Scale Degree Order (Relative to Ding)
            // Calculate semitone distance from Ding (0-11)
            const valA = ((NOTE_TO_MIDI[rootA] || 0) - (dingVal || 0) + 12) % 12;
            const valB = ((NOTE_TO_MIDI[rootB] || 0) - (dingVal || 0) + 12) % 12;

            if (valA !== valB) return valA - valB;

            // Priority 2: Type Relevance 
            const pA = getPriority(a.type);
            const pB = getPriority(b.type);
            if (pA !== pB) return pA - pB;

            // Priority 3: Alphabetical Type
            return a.type.localeCompare(b.type);
        });
    }

    displayChords.forEach(chord => {
        const card = document.createElement('div');
        card.className = 'glass-card chord-card'; // Removed 'compact' to match original style if needed

        // Add type-specific class for color coding
        const cType = chord.type;
        if (cType === 'Major' || cType === 'Maj7' || cType === 'M3') card.classList.add('type-major');
        else if (cType === 'Minor' || cType === 'Min7' || cType === 'm3') card.classList.add('type-minor');
        else if (cType.includes('Sus')) card.classList.add('type-sus');
        else if (cType === '5') card.classList.add('type-power');
        else if (cType === '7' || cType.includes('Dim') || cType === 'Min7b5') card.classList.add('type-seventh');

        const baseNotes = [...new Set(chord.notes.map(n => n.note))];

        // Sort notes by interval from root (Root, 3rd, 5th...)
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
        const degreeHTML = degree ? `<span style="font-size:0.8em; color:rgba(255,255,255,0.5); font-weight:normal; margin-left:6px;">(${degree})</span>` : '';

        card.innerHTML = `
            <div class="card-main">
                <div class="card-info">
                    <div class="card-title-row">
                        <h2>${chord.root}${degreeHTML} <span style="font-weight:300; font-size: 0.9em; opacity: 0.9;">${chord.type}</span></h2>
                    </div>
                    <div class="card-notes-row">
                        ${noteBadges}
                    </div>
                </div>
                <div class="card-actions">
                    <button class="icon-btn open-options" title="View Options">▼</button>
                    <button class="icon-btn add-chord" title="Add to Progression">+</button>
                </div>
            </div>
        `;

        // Interactions
        const openBtn = card.querySelector('.open-options');
        const addBtn = card.querySelector('.add-chord');

        // Toggle Modal (via button)
        openBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openVoicingModal(chord, dingNotes);
        };

        addBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dependencies.addToProgression) {
                dependencies.addToProgression(chord);
            }
        };

        // Play Audio (via card click)
        card.onclick = (e) => {
            // detailed interactions managed by buttons, card click plays
            if (!e.target.closest('button')) {
                playChordStub(chord);
            }
        };

        grid.appendChild(card);
    });
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
            <div class="voicing-info">
                <span class="voicing-label">${label}</span>
                <div class="voicing-notes-container">${notePills}</div>
            </div>
            <div class="voicing-actions">
                <button class="icon-btn add-variant-btn" title="Add this variant">+</button>
                <button class="premium-btn play-btn" style="padding: 5px 15px; font-size: 0.9rem;">Play ▶</button>
            </div>
        `;

        // Actions
        const playBtn = row.querySelector('.play-btn');
        const pillsDiv = row.querySelector('.voicing-notes-container');

        playBtn.onclick = (e) => {
            e.stopPropagation();
            startModalLoop(notes, pillsDiv, playBtn);
        };

        const addBtn = row.querySelector('.add-variant-btn');
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (dependencies.addToProgression) {
                const chordLabel = chord ? (chord.name === 'Custom Chord' ? label : chord.name) : label;
                dependencies.addToProgression(chord, notes, chordLabel);
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
