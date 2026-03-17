import { layout, renderHandpanSVG } from './visualizer.js';

let dependencies = {};
let currentLayout = {};
let draggedElement = null;
let resizingHandle = null;
let selectedNote = null;
let dragOffset = { x: 0, y: 0 };
let scaleOnStart = null;
let initialResizeData = null;

const MIN_RADIUS = 15;

export function initLayoutEditor(deps) {
    dependencies = deps;

    const openBtn = document.getElementById('layout-editor-open-btn');
    const closeBtn = document.getElementById('layout-editor-close');
    const saveBtn = document.getElementById('layout-editor-save');
    const resetBtn = document.getElementById('layout-editor-reset');
    const modal = document.getElementById('layout-editor-modal');
    const svg = document.getElementById('layout-editor-svg');

    if (openBtn) openBtn.addEventListener('click', openLayoutEditor);
    if (closeBtn) closeBtn.addEventListener('click', closeLayoutEditor);
    if (saveBtn) saveBtn.addEventListener('click', saveLayout);
    if (resetBtn) resetBtn.addEventListener('click', resetLayout);

    if (svg) {
        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        // Clear selection if clicking background
        svg.addEventListener('click', (e) => {
            if (e.target === svg || e.target.classList.contains('hp-body-editor')) {
                selectedNote = null;
                renderEditorSVG();
            }
        });
    }
}

function openLayoutEditor() {
    const modal = document.getElementById('layout-editor-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    scaleOnStart = dependencies.getCurrentScale();
    // Deep clone the layout or initialize if empty
    currentLayout = JSON.parse(JSON.stringify(scaleOnStart.layout || {}));
    selectedNote = null;

    renderEditorSVG();
}

function closeLayoutEditor() {
    const modal = document.getElementById('layout-editor-modal');
    if (modal) modal.style.display = 'none';
}

function saveLayout() {
    const scale = dependencies.getCurrentScale();
    scale.layout = currentLayout;
    
    // Trigger a global re-render of the visualizer
    renderHandpanSVG(scale);
    
    // Proactively save state
    if (dependencies.saveCurrentState) {
        dependencies.saveCurrentState();
    }
    
    closeLayoutEditor();
}

function resetLayout() {
    if (confirm('Reset layout to default positions and sizes?')) {
        currentLayout = {};
        selectedNote = null;
        renderEditorSVG();
    }
}

function renderEditorSVG() {
    const svg = document.getElementById('layout-editor-svg');
    if (!svg) return;
    svg.innerHTML = '';

    const mainSvg = document.getElementById('handpan-svg');
    if (mainSvg) {
        const defs = mainSvg.querySelector('defs');
        if (defs) {
            svg.appendChild(defs.cloneNode(true));
        }
    }

    // Main Body
    const body = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    body.setAttribute("cx", layout.cx);
    body.setAttribute("cy", layout.cy);
    body.setAttribute("r", layout.rBody);
    body.setAttribute("fill", "rgba(255,255,255,0.05)");
    body.setAttribute("stroke", "rgba(255,255,255,0.2)");
    body.setAttribute("stroke-dasharray", "5 5");
    body.classList.add('hp-body-editor');
    svg.appendChild(body);

    // Guide rings
    const rTop = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rTop.setAttribute("cx", layout.cx);
    rTop.setAttribute("cy", layout.cy);
    rTop.setAttribute("r", layout.rNotesTop);
    rTop.setAttribute("fill", "none");
    rTop.setAttribute("stroke", "rgba(255,255,255,0.1)");
    rTop.setAttribute("stroke-dasharray", "2 4");
    svg.appendChild(rTop);

    const rBottom = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rBottom.setAttribute("cx", layout.cx);
    rBottom.setAttribute("cy", layout.cy);
    rBottom.setAttribute("r", layout.rNotesBottom);
    rBottom.setAttribute("fill", "none");
    rBottom.setAttribute("stroke", "rgba(255,255,255,0.05)");
    rBottom.setAttribute("stroke-dasharray", "2 4");
    svg.appendChild(rBottom);

    // Get all notes from scale
    const topNotes = scaleOnStart.top;
    const bottomKeys = Object.keys(scaleOnStart.bottom);
    const topSideNotes = topNotes.slice(1);
    const N = topSideNotes.length;
    const stepAngle = (2 * Math.PI) / N;
    
    // Scale factor
    const radius = layout.rNotesTop;
    const maxAllowedTopR = N > 1 ? (radius * Math.sin(Math.PI / N)) * 0.85 : 50;
    const scaleFactor = N > 1 ? Math.min(1, maxAllowedTopR / 36) : 1;

    const parentPositions = {};

    // Ding
    const dingName = topNotes[0];
    const dingDPos = { x: layout.cx, y: layout.cy };
    renderDraggableNote(dingName, dingDPos, 43, 43, true);
    parentPositions[dingName.replace(/^D:/, '')] = dingDPos;

    // Top Side
    topSideNotes.forEach((name, i) => {
        const isExtraDing = name.startsWith('D:');
        const direction = (i % 2 === 1) ? 1 : -1;
        const stepCount = Math.ceil(i / 2);
        const angle = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);
        const dPos = {
            x: layout.cx + layout.rNotesTop * Math.cos(angle),
            y: layout.cy + layout.rNotesTop * Math.sin(angle)
        };
        const r = (isExtraDing ? 46 : 36) * scaleFactor;
        renderDraggableNote(name, dPos, r, r, isExtraDing);
        parentPositions[name.replace(/^D:/, '')] = dPos;
    });

    // Bottom
    bottomKeys.forEach((note) => {
        const parent = scaleOnStart.bottom[note].replace(/^D:/, '');
        const pPos = parentPositions[parent] || { x: layout.cx, y: layout.cy };
        const dx = pPos.x - layout.cx;
        const dy = pPos.y - layout.cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const dPos = {
            x: layout.cx + (dx / dist) * layout.rNotesBottom,
            y: layout.cy + (dy / dist) * layout.rNotesBottom
        };
        const r = (note.startsWith('D:') ? 36 : 27) * scaleFactor;
        renderDraggableNote(note, dPos, r, r, note.startsWith('D:'), true);
    });

    // Render Resize Handles if something is selected
    if (selectedNote) {
        const noteData = currentLayout[selectedNote.name] || selectedNote.default;
        renderResizeHandles(selectedNote.name, noteData.x, noteData.y, noteData.rx, noteData.ry);
    }
}

function renderDraggableNote(name, defaultPos, defaultRX, defaultRY, isDing = false, isBottom = false) {
    const svg = document.getElementById('layout-editor-svg');
    const layoutData = currentLayout[name] || { ...defaultPos, rx: defaultRX, ry: defaultRY };
    
    // Ensure rx/ry exist in stored data if it was only x/y before
    if (layoutData.rx === undefined) layoutData.rx = defaultRX;
    if (layoutData.ry === undefined) layoutData.ry = defaultRY;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const isSelected = selectedNote && selectedNote.name === name;
    g.setAttribute("class", "hp-note draggable" + (isDing ? " ding" : "") + (isBottom ? " side-note" : "") + (isSelected ? " selected" : ""));
    g.setAttribute("data-note", name);
    g.setAttribute("data-default-x", defaultPos.x);
    g.setAttribute("data-default-y", defaultPos.y);
    g.setAttribute("data-default-rx", defaultRX);
    g.setAttribute("data-default-ry", defaultRY);
    g.style.cursor = "move";
    
    const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
    ellipse.setAttribute("cx", layoutData.x);
    ellipse.setAttribute("cy", layoutData.y);
    ellipse.setAttribute("rx", layoutData.rx);
    ellipse.setAttribute("ry", layoutData.ry);
    ellipse.setAttribute("fill", isDing ? "rgba(243, 156, 18, 0.4)" : "rgba(118, 75, 162, 0.3)");
    ellipse.setAttribute("stroke", isSelected ? "var(--accent-color)" : "white");
    ellipse.setAttribute("stroke-width", isSelected ? "3" : "2");
    g.appendChild(ellipse);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", layoutData.x);
    text.setAttribute("y", layoutData.y + 5);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "white");
    text.style.fontSize = "11px";
    text.style.fontWeight = "600";
    text.style.pointerEvents = "none";
    text.style.userSelect = "none";
    text.textContent = name.replace(/^D:/, '');
    g.appendChild(text);

    svg.appendChild(g);
}

function renderResizeHandles(name, x, y, rx, ry) {
    const svg = document.getElementById('layout-editor-svg');
    const handlesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    handlesG.id = "resize-handles";

    const points = [
        { pos: [x, y - ry], type: 'n' },
        { pos: [x, y + ry], type: 's' },
        { pos: [x - rx, y], type: 'w' },
        { pos: [x + rx, y], type: 'e' },
        { pos: [x - rx, y - ry], type: 'nw' },
        { pos: [x + rx, y - ry], type: 'ne' },
        { pos: [x - rx, y + ry], type: 'sw' },
        { pos: [x + rx, y + ry], type: 'se' }
    ];

    points.forEach(p => {
        const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.setAttribute("cx", p.pos[0]);
        handle.setAttribute("cy", p.pos[1]);
        handle.setAttribute("r", 6);
        handle.setAttribute("fill", "var(--accent-color)");
        handle.setAttribute("stroke", "white");
        handle.setAttribute("stroke-width", "1.5");
        handle.setAttribute("class", "resize-handle");
        handle.setAttribute("data-handle-type", p.type);
        handle.style.cursor = p.type + "-resize";
        handlesG.appendChild(handle);
    });

    svg.appendChild(handlesG);
}

function onPointerDown(e) {
    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);

    // 1. Check for resize handle first
    const handle = e.target.closest('.resize-handle');
    if (handle && selectedNote) {
        resizingHandle = handle;
        resizingHandle.setPointerCapture(e.pointerId);
        
        const noteData = currentLayout[selectedNote.name] || selectedNote.default;
        initialResizeData = {
            startX: pt.x,
            startY: pt.y,
            startRX: noteData.rx,
            startRY: noteData.ry,
            type: handle.getAttribute('data-handle-type')
        };
        e.stopPropagation();
        return;
    }

    // 2. Check for note dragging
    const g = e.target.closest('.draggable');
    if (g) {
        const name = g.getAttribute('data-note');
        const isNewSelection = !selectedNote || selectedNote.name !== name;

        selectedNote = {
            name: name,
            default: {
                x: parseFloat(g.getAttribute('data-default-x')),
                y: parseFloat(g.getAttribute('data-default-y')),
                rx: parseFloat(g.getAttribute('data-default-rx')),
                ry: parseFloat(g.getAttribute('data-default-ry'))
            }
        };

        if (isNewSelection) {
            renderEditorSVG(); // Re-render to show handles
            draggedElement = svg.querySelector(`[data-note="${name}"]`);
        } else {
            draggedElement = g;
        }

        draggedElement.setPointerCapture(e.pointerId);

        const ellipse = draggedElement.querySelector('ellipse');
        dragOffset.x = pt.x - parseFloat(ellipse.getAttribute('cx'));
        dragOffset.y = pt.y - parseFloat(ellipse.getAttribute('cy'));
        
        draggedElement.style.opacity = "0.7";
    }
}

function onPointerMove(e) {
    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);

    if (resizingHandle && selectedNote) {
        const type = initialResizeData.type;
        const dx = pt.x - initialResizeData.startX;
        const dy = pt.y - initialResizeData.startY;
        
        const noteData = currentLayout[selectedNote.name] || { ...selectedNote.default };

        if (type.includes('e')) noteData.rx = Math.max(MIN_RADIUS, initialResizeData.startRX + dx);
        if (type.includes('w')) noteData.rx = Math.max(MIN_RADIUS, initialResizeData.startRX - dx);
        if (type.includes('s')) noteData.ry = Math.max(MIN_RADIUS, initialResizeData.startRY + dy);
        if (type.includes('n')) noteData.ry = Math.max(MIN_RADIUS, initialResizeData.startRY - dy);

        currentLayout[selectedNote.name] = noteData;
        
        // Fast update without full re-render for performance
        const g = svg.querySelector(`[data-note="${selectedNote.name}"]`);
        if (g) {
            const el = g.querySelector('ellipse');
            el.setAttribute('rx', noteData.rx);
            el.setAttribute('ry', noteData.ry);
            // Move text if ry changed? center-based resizing keeps text at center
            
            // Move handles
            updateHandlesUI(noteData.x, noteData.y, noteData.rx, noteData.ry);
        }
    } else if (draggedElement) {
        const nx = Math.round(pt.x - dragOffset.x);
        const ny = Math.round(pt.y - dragOffset.y);

        const ellipse = draggedElement.querySelector('ellipse');
        const text = draggedElement.querySelector('text');
        
        ellipse.setAttribute("cx", nx);
        ellipse.setAttribute("cy", ny);
        text.setAttribute("x", nx);
        text.setAttribute("y", ny + 5);
        
        const noteName = draggedElement.getAttribute('data-note');
        if (!currentLayout[noteName]) {
            currentLayout[noteName] = {
                x: nx,
                y: ny,
                rx: parseFloat(draggedElement.getAttribute('data-default-rx')),
                ry: parseFloat(draggedElement.getAttribute('data-default-ry'))
            };
        } else {
            currentLayout[noteName].x = nx;
            currentLayout[noteName].y = ny;
        }

        updateHandlesUI(nx, ny, currentLayout[noteName].rx, currentLayout[noteName].ry);
    }
}

function updateHandlesUI(x, y, rx, ry) {
    const svg = document.getElementById('layout-editor-svg');
    const handlesG = document.getElementById('resize-handles');
    if (!handlesG) return;

    const points = [
        { type: 'n', pos: [x, y - ry] },
        { type: 's', pos: [x, y + ry] },
        { type: 'w', pos: [x - rx, y] },
        { type: 'e', pos: [x + rx, y] },
        { type: 'nw', pos: [x - rx, y - ry] },
        { type: 'ne', pos: [x + rx, y - ry] },
        { type: 'sw', pos: [x - rx, y + ry] },
        { type: 'se', pos: [x + rx, y + ry] }
    ];

    points.forEach(p => {
        const handle = handlesG.querySelector(`[data-handle-type="${p.type}"]`);
        if (handle) {
            handle.setAttribute('cx', p.pos[0]);
            handle.setAttribute('cy', p.pos[1]);
        }
    });
}

function onPointerUp(e) {
    if (draggedElement) {
        draggedElement.style.opacity = "1";
        draggedElement = null;
    }
    if (resizingHandle) {
        resizingHandle = null;
    }
}

function getMousePos(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}
