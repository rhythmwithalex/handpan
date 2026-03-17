import { NOTE_TO_MIDI } from '../data/constants.js';

let noteClickCallback = null;
let bodyClickCallback = null;
let visualTimeouts = [];
const KICK_LIMIT_PX = 70;
const BOTTOM_NOTE_DEADZONE_PX = 50;

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

export const layout = {
    cx: 250,
    cy: 250,
    rBody: 165,
    rRing: 64,
    rMarker: 185,
    rNotesTop: 110,
    rNotesBottom: 185
};

// Caches for geometry
let cachedBottomDeadzones = [];

export function renderHandpanSVG(currentScale, mode = 'notes') {
    const oldSvg = document.getElementById('handpan-svg');
    if (!oldSvg) return;

    // Remove old listeners to avoid duplicates on re-render by cloning
    const svg = oldSvg.cloneNode(false);
    oldSvg.parentNode.replaceChild(svg, oldSvg);

    // --- Cache Geometry for Performance ---
    const topNotes = currentScale.top;
    const customLayout = currentScale.layout || {};
    const topSideNotes = sortNotesByPitchLocal(topNotes.slice(1));
    const parentPositions = {};
    const N = topSideNotes.length;
    const stepAngle = (2 * Math.PI) / N;

    topSideNotes.forEach((name, i) => {
        const cleanName = name.replace(/^D:/, '');
        if (customLayout[name]) {
            parentPositions[cleanName] = { x: customLayout[name].x, y: customLayout[name].y };
        } else {
            const direction = (i % 2 === 1) ? 1 : -1;
            const stepCount = Math.ceil(i / 2);
            const angle = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);
            parentPositions[cleanName] = {
                x: layout.cx + layout.rNotesTop * Math.cos(angle),
                y: layout.cy + layout.rNotesTop * Math.sin(angle)
            };
        }
    });

    const bottomKeys = Object.keys(currentScale.bottom);
    const sortedBottom = sortNotesByPitchLocal(bottomKeys);
    cachedBottomDeadzones = sortedBottom.map(note => {
        const parent = currentScale.bottom[note].replace(/^D:/, '');
        const parentPos = parentPositions[parent];
        
        let x, y, rx, ry, angle;
        
        if (customLayout[note]) {
            x = customLayout[note].x;
            y = customLayout[note].y;
            rx = customLayout[note].rx;
            ry = customLayout[note].ry;
            angle = customLayout[note].angle || 0;
        } else if (parentPos) {
            const pdx = parentPos.x - layout.cx;
            const pdy = parentPos.y - layout.cy;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
            x = layout.cx + (pdx / pdist) * layout.rNotesBottom;
            y = layout.cy + (pdy / pdist) * layout.rNotesBottom;
            angle = 0;
        } else {
            return null;
        }

        return { x, y, rx, ry, angle };
    }).filter(Boolean);

    // Catch background taps for "Tak" (Body Hit)
    const handleSvgTap = (e) => {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        const dx = svgP.x - layout.cx;
        const dy = svgP.y - layout.cy;
        const distSq = dx * dx + dy * dy;

        // 1. Strict Boundary Check: Band between rBody - 25 and rBody + KICK_LIMIT_PX
        const limit = layout.rBody + KICK_LIMIT_PX;
        const innerLimit = layout.rBody - 25;
        if (distSq > limit * limit || distSq < innerLimit * innerLimit) return;

        // 2. Deadzone check for bottom notes (using cached positions, sizes, and rotation)
        for (let i = 0; i < cachedBottomDeadzones.length; i++) {
            const dz = cachedBottomDeadzones[i];
            const drx = dz.rx || BOTTOM_NOTE_DEADZONE_PX;
            const dry = dz.ry || BOTTOM_NOTE_DEADZONE_PX;
            const angleRad = (dz.angle || 0) * Math.PI / 180;
            
            // Translate point to origin relative to ellipse center
            const tx = svgP.x - dz.x;
            const ty = svgP.y - dz.y;
            
            // Rotate point inversely to ellipse rotation
            const cos = Math.cos(-angleRad);
            const sin = Math.sin(-angleRad);
            const rx = tx * cos - ty * sin;
            const ry = tx * sin + ty * cos;
            
            // Standard axis-aligned elliptical distance check
            const normX = rx / drx;
            const normY = ry / dry;
            if (normX * normX + normY * normY < 1) return;
        }

        if (bodyClickCallback) {
            bodyClickCallback();
        }
    };

    svg.addEventListener('pointerdown', handleSvgTap);
    svg.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    // Inject Metallic Gradient Defs for light mode
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    // Helper to create gradients
    const createGradient = (id, stopsArr, cx = "50%", cy = "50%", fx = "35%", fy = "30%", r = "50%") => {
        const grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        grad.setAttribute("id", id);
        grad.setAttribute("cx", cx);
        grad.setAttribute("cy", cy);
        grad.setAttribute("r", r);
        grad.setAttribute("fx", fx);
        grad.setAttribute("fy", fy);
        stopsArr.forEach(s => {
            const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
            stop.setAttribute("offset", s.offset);
            stop.setAttribute("stop-color", s.color);
            grad.appendChild(stop);
        });
        return grad;
    };

    defs.appendChild(createGradient("metallic-body-light", [
        { offset: "0%", color: "#f8f9fa" },
        { offset: "50%", color: "#e2e6ea" },
        { offset: "90%", color: "#ced4da" },
        { offset: "100%", color: "#adb5bd" }
    ]));

    defs.appendChild(createGradient("metallic-note-light", [
        { offset: "0%", color: "#dee2e6" },
        { offset: "70%", color: "#ced4da" },
        { offset: "100%", color: "#adb5bd" }
    ], "50%", "50%", "50%", "50%", "50%"));

    defs.appendChild(createGradient("metallic-body-dark", [
        { offset: "0%", color: "#495057" },
        { offset: "50%", color: "#343a40" },
        { offset: "90%", color: "#212529" },
        { offset: "100%", color: "#111214" }
    ]));

    defs.appendChild(createGradient("metallic-note-dark", [
        { offset: "0%", color: "#343a40" },
        { offset: "70%", color: "#212529" },
        { offset: "100%", color: "#111214" }
    ], "50%", "50%", "50%", "50%", "50%"));

    svg.appendChild(defs);



    // Main Body
    const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    body.setAttribute("cx", layout.cx);
    body.setAttribute("cy", layout.cy);
    body.setAttribute("r", layout.rBody);
    body.classList.add("hp-body");
    // Removed separate listener for body to unify it in handleSvgTap
    body.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    svg.appendChild(body);

    // Percussion Visualizer Ring removed as it stayed centered regardless of Ding movements
    // We now use the Kick limit boundary for feedback

    // Bottom Side Notes Marker (Dashed line)
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    marker.setAttribute("cx", layout.cx);
    marker.setAttribute("cy", layout.cy);
    marker.setAttribute("r", layout.rMarker);
    marker.setAttribute("fill", "none");
    marker.setAttribute("stroke", "var(--glass-border)");
    marker.setAttribute("stroke-dasharray", "4 4");
    marker.setAttribute("opacity", "0.4");
    svg.appendChild(marker);

    // Kick limit boundary (Dashed line) - now also used for visual feedback
    const kickLimitCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    kickLimitCircle.setAttribute("cx", layout.cx);
    kickLimitCircle.setAttribute("cy", layout.cy);
    kickLimitCircle.setAttribute("r", layout.rBody + KICK_LIMIT_PX);
    kickLimitCircle.setAttribute("fill", "transparent");
    kickLimitCircle.setAttribute("stroke", "rgba(128, 128, 128, 0.3)");
    kickLimitCircle.setAttribute("stroke-dasharray", "6 6");
    kickLimitCircle.style.pointerEvents = "none";
    kickLimitCircle.classList.add("kick-boundary");
    svg.appendChild(kickLimitCircle);

    // "body sound" label
    const kickLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    kickLabel.setAttribute("x", layout.cx);
    kickLabel.setAttribute("y", layout.cy + layout.rBody + KICK_LIMIT_PX - 8);
    kickLabel.setAttribute("text-anchor", "middle");
    kickLabel.setAttribute("fill", "gray");
    kickLabel.setAttribute("font-size", "10px");
    kickLabel.setAttribute("opacity", "0.6");
    kickLabel.style.pointerEvents = "none";
    kickLabel.style.userSelect = "none";
    kickLabel.textContent = "body sound";
    svg.appendChild(kickLabel);

    const dingName = topNotes[0];

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

    // Render Ding (Center or Custom)
    const dingPos = customLayout[dingName] || { x: layout.cx, y: layout.cy };
    const dingLabel = getLabel(dingName, -1);
    const dingRX = customLayout[dingName]?.rx || 43;
    const dingRY = customLayout[dingName]?.ry || 43;
    const dingAngle = customLayout[dingName]?.angle || 0;
    const dingG = createNoteG(dingName, dingLabel, dingPos.x, dingPos.y, dingRX, dingRY, dingAngle, true);
    nodesGroup.appendChild(dingG);
    notePositions[dingName] = dingPos;

    // Render Top Side Notes
    const radius = layout.rNotesTop;

    // Calculate dynamic scaling factor to prevent overlapping if N is large
    const maxAllowedTopR = N > 1 ? (radius * Math.sin(Math.PI / N)) * 0.85 : 50;
    const scaleFactor = N > 1 ? Math.min(1, maxAllowedTopR / 36) : 1;

    topSideNotes.forEach((name, i) => {
        const isExtraDing = name.startsWith('D:');
        let x, y, rx, ry, angle;
        
        if (customLayout[name]) {
            x = customLayout[name].x;
            y = customLayout[name].y;
            rx = customLayout[name].rx;
            ry = customLayout[name].ry;
            angle = customLayout[name].angle || 0;
        } else {
            const direction = (i % 2 === 1) ? 1 : -1;
            const stepCount = Math.ceil(i / 2);
            const a = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);
            x = layout.cx + radius * Math.cos(a);
            y = layout.cy + radius * Math.sin(a);
            angle = 0;
        }

        const baseR = (isExtraDing ? 46 : 36) * scaleFactor;
        rx = rx || baseR;
        ry = ry || baseR;
        const label = getLabel(name, i);

        const g = createNoteG(name, label, x, y, rx, ry, angle, isExtraDing);
        nodesGroup.appendChild(g);
        notePositions[name] = { x, y };
    });

    // Render Bottom Notes
    sortedBottom.forEach((note, i) => {
        const parent = currentScale.bottom[note];
        const parentPos = notePositions[parent];
        if (!parentPos && !customLayout[note]) return;

        let x, y, rx, ry, angle;
        if (customLayout[note]) {
            x = customLayout[note].x;
            y = customLayout[note].y;
            rx = customLayout[note].rx;
            ry = customLayout[note].ry;
            angle = customLayout[note].angle || 0;
        } else {
            const dx = parentPos.x - layout.cx;
            const dy = parentPos.y - layout.cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const outerRadius = layout.rNotesBottom;
            x = layout.cx + (dx / dist) * outerRadius;
            y = layout.cy + (dy / dist) * outerRadius;
            angle = 0;
        }

        const baseR = (note.startsWith('D:') ? 36 : 27) * scaleFactor;
        rx = rx || baseR;
        ry = ry || baseR;
        
        const label = getLabel(note, topSideNotes.length + i);

        const g = createNoteG(note, label, x, y, rx, ry, angle, note.startsWith('D:'), true);
        nodesGroup.appendChild(g);
    });
}

function createNoteG(noteName, labelText, x, y, rx, ry, angle, isDing = false, isBottom = false) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const cleanName = noteName.replace(/^D:/, '');
    g.id = `note-${cleanName}`;
    g.classList.add("hp-note");
    if (isDing) g.classList.add("ding");
    if (isBottom) g.classList.add("side-note");
    g.setAttribute("data-note", noteName);

    const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    ellipse.setAttribute("cx", x);
    ellipse.setAttribute("cy", y);
    ellipse.setAttribute("rx", rx);
    ellipse.setAttribute("ry", ry);
    if (angle) {
        ellipse.setAttribute("transform", `rotate(${angle} ${x} ${y})`);
    }
    ellipse.classList.add("note-area");
    g.appendChild(ellipse);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + (ry * 0.15));
    text.setAttribute("text-anchor", "middle");
    text.classList.add(ry < 25 ? "note-label-small" : "note-label");
    text.textContent = labelText;
    g.appendChild(text);

    const triggerNote = (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent body click
        if (e.type === 'pointerdown') {
            g.setPointerCapture(e.pointerId);
        }
        if (noteClickCallback) {
            noteClickCallback(cleanName);
        }
    };

    g.addEventListener('pointerdown', triggerNote, { passive: false });
    // Keep touchstart to purely prevent default scaling/scrolling on older iOS if pointer events fail
    g.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

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
    const boundary = document.querySelector('.kick-boundary');
    if (!boundary) return;

    const trigger = () => {
        if (isGhost) {
            boundary.classList.add('ghost-flash');
        } else {
            boundary.classList.remove('ghost-flash');
        }
        boundary.classList.add('boundary-flash');
        const offTimeout = setTimeout(() => {
            boundary.classList.remove('boundary-flash');
            boundary.classList.remove('ghost-flash');
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
