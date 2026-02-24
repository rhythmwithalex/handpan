
import { NOTE_TO_MIDI } from '../data/constants.js';

let noteClickCallback = null;
let bodyClickCallback = null;
let visualTimeouts = [];

console.log("Visualizer Module v6 Loaded");

export function initInteraction(onNoteClick, onBodyClick) {
    noteClickCallback = onNoteClick;
    bodyClickCallback = onBodyClick;
}

// Local helper for parsing and sorting
function parseForSort(str) {
    const clean = str.replace(/^D:/, '');
    const m = clean.match(/^([A-G][#b]?)([0-8])$/);
    if (!m) return { note: 'C', octave: 0, value: 0, original: str };
    const note = m[1];
    const octave = parseInt(m[2]);
    const val = (octave * 12) + (NOTE_TO_MIDI[note] || 0);
    return { note, octave, value: val, original: str };
}

function sortNotesByPitchLocal(noteStrings) {
    const parsed = noteStrings.map(s => parseForSort(s));
    parsed.sort((a, b) => a.value - b.value);
    return parsed.map(p => p.original);
}

export function renderHandpanSVG(currentScale, mode = 'notes') {
    const svg = document.getElementById('handpan-svg');
    if (!svg) return;

    svg.innerHTML = '';

    // Main Body
    const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    body.setAttribute("cx", "200");
    body.setAttribute("cy", "200");
    body.setAttribute("r", "165");
    body.classList.add("hp-body");
    svg.appendChild(body);

    // Percussion Visualizer Ring (Dotted/Dashed, hidden by default)
    const percRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    percRing.setAttribute("cx", "200");
    percRing.setAttribute("cy", "200");
    percRing.setAttribute("r", "64");
    percRing.setAttribute("fill", "none");
    percRing.classList.add("perc-ring");
    svg.appendChild(percRing);

    // Bottom Side Notes Marker (Dashed line)
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    marker.setAttribute("cx", "200");
    marker.setAttribute("cy", "200");
    marker.setAttribute("r", "185");
    marker.setAttribute("fill", "none");
    marker.setAttribute("stroke", "var(--glass-border)");
    marker.setAttribute("stroke-dasharray", "4 4");
    marker.setAttribute("opacity", "0.4");
    svg.appendChild(marker);

    const topNotes = currentScale.top;
    const dingName = topNotes[0];

    // Sort Side Notes
    const topSideNotes = sortNotesByPitchLocal(topNotes.slice(1));
    const bottomKeys = Object.keys(currentScale.bottom);
    const sortedBottom = sortNotesByPitchLocal(bottomKeys);

    const nodesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(nodesGroup);

    const notePositions = {};

    // Helper for labels
    const getDingRoot = (str) => {
        const clean = str.replace(/^D:/, '');
        const m = clean.match(/^([A-G][#b]?)/);
        return m ? m[1] : clean;
    };
    const dingRootStr = getDingRoot(dingName);
    const dingVal = NOTE_TO_MIDI[dingRootStr];

    // Numbering Logic (123)
    let allSideNotes = [...topSideNotes, ...sortedBottom];
    let numberingCandidates = allSideNotes.filter(n => !n.startsWith('D:'));
    numberingCandidates = sortNotesByPitchLocal(numberingCandidates);
    const numberingMap = {};
    numberingCandidates.forEach((n, i) => {
        numberingMap[n] = (i + 1).toString();
    });

    const getLabel = (noteStr, index = -1) => {
        if (index === -1) return noteStr.replace(/^D:/, ''); // Center Ding always Note Name

        const isDing = noteStr.startsWith('D:');

        if (mode === 'numbers') {
            if (isDing) return noteStr.replace(/^D:/, '');
            return numberingMap[noteStr] || '?';
        }

        if (mode === 'degrees') {
            const rootStr = getDingRoot(noteStr);
            const val = NOTE_TO_MIDI[rootStr];
            if (val === undefined || dingVal === undefined) return '?';
            const semitones = (val - dingVal + 12) % 12;

            // Map to Roman Numerals
            const degreeMap = {
                0: 'I',
                1: 'bII',
                2: 'II',
                3: 'bIII',
                4: 'III',
                5: 'IV',
                6: 'bV',
                7: 'V',
                8: 'bVI',
                9: 'VI',
                10: 'bVII',
                11: 'VII'
            };
            return degreeMap[semitones] || '?';
        }

        // Default: notes
        return noteStr.replace(/^D:/, '');
    };

    // Render Ding (Center)
    const dingLabel = getLabel(dingName, -1);
    const dingG = createNoteG(dingName, dingLabel, 200, 200, 43, true);
    nodesGroup.appendChild(dingG);
    notePositions[dingName] = { x: 200, y: 200 };

    // Render Top Side Notes
    const radius = 110;
    const N = topSideNotes.length;
    const stepAngle = (2 * Math.PI) / N;

    topSideNotes.forEach((name, i) => {
        const isExtraDing = name.startsWith('D:');
        const direction = (i % 2 === 1) ? 1 : -1;
        const stepCount = Math.ceil(i / 2);
        const angle = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);

        const x = 200 + radius * Math.cos(angle);
        const y = 200 + radius * Math.sin(angle);
        const r = isExtraDing ? 38 : 30;

        const label = getLabel(name, i);

        const g = createNoteG(name, label, x, y, r, isExtraDing);
        nodesGroup.appendChild(g);
        notePositions[name] = { x, y };
    });

    // Render Bottom Notes
    sortedBottom.forEach((note, i) => {
        const parent = currentScale.bottom[note];
        const parentPos = notePositions[parent];
        if (!parentPos) return;

        const dx = parentPos.x - 200;
        const dy = parentPos.y - 200;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const outerRadius = 185;
        const x = 200 + (dx / dist) * outerRadius;
        const y = 200 + (dy / dist) * outerRadius;
        const r = note.startsWith('D:') ? 30 : 22;

        const label = getLabel(note, topSideNotes.length + i);

        const g = createNoteG(note, label, x, y, r, note.startsWith('D:'), true);
        nodesGroup.appendChild(g);
    });
}

function createNoteG(noteName, labelText, x, y, r, isDing = false, isBottom = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const cleanName = noteName.replace(/^D:/, '');
    g.id = `note-${cleanName}`;
    g.classList.add("hp-note");
    if (isDing) g.classList.add("ding");
    if (isBottom) g.classList.add("side-note");
    g.setAttribute("data-note", noteName);

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", r);
    circle.classList.add("note-area");
    g.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + (r * 0.15));
    text.setAttribute("text-anchor", "middle");
    text.classList.add(r < 25 ? "note-label-small" : "note-label");
    text.textContent = labelText;
    g.appendChild(text);

    g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (noteClickCallback) {
            noteClickCallback(cleanName);
        }
    });
    return g;
}

export function highlightNote(noteName, delaySeconds = 0) {
    const cleanName = noteName.replace(/^D:/, '');
    const el = document.getElementById(`note-${cleanName}`);
    if (!el) return;

    const trigger = () => {
        el.classList.add('note-active');
        const offTimeout = setTimeout(() => {
            el.classList.remove('note-active');
            visualTimeouts = visualTimeouts.filter(id => id !== offTimeout);
        }, 200);
        visualTimeouts.push(offTimeout);
    };

    if (delaySeconds <= 0) {
        trigger();
    } else {
        const onTimeout = setTimeout(trigger, delaySeconds * 1000);
        visualTimeouts.push(onTimeout);
    }
}

export function highlightBody(delaySeconds = 0, isGhost = false) {
    const ring = document.querySelector('.perc-ring');
    if (!ring) return;

    const trigger = () => {
        if (isGhost) {
            ring.classList.add('ghost-ring');
        } else {
            ring.classList.remove('ghost-ring');
        }
        ring.classList.add('flash');
        const offTimeout = setTimeout(() => {
            ring.classList.remove('flash');
            ring.classList.remove('ghost-ring');
            visualTimeouts = visualTimeouts.filter(id => id !== offTimeout);
        }, 100);
        visualTimeouts.push(offTimeout);
    };

    if (delaySeconds <= 0) {
        trigger();
    } else {
        const onTimeout = setTimeout(trigger, delaySeconds * 1000);
        visualTimeouts.push(onTimeout);
    }
}

export function resetVisuals() {
    visualTimeouts.forEach(id => clearTimeout(id));
    visualTimeouts = [];
    document.querySelectorAll('.note-active').forEach(el => el.classList.remove('note-active'));
    document.querySelectorAll('.flash').forEach(el => el.classList.remove('flash'));
}
