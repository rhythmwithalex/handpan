import { layout, renderHandpanSVG } from './visualizer.js';

let dependencies = {};
let currentLayout = {};
let draggedElement = null;
let resizingHandle = null;
let rotationHandle = null;
let selectedNote = null;
let dragOffset = { x: 0, y: 0 };
let scaleOnStart = null;
let initialResizeData = null;
let initialRotationData = null;

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

    // Render Controls if something is selected
    if (selectedNote) {
        const noteData = currentLayout[selectedNote.name] || selectedNote.default;
        renderControls(selectedNote.name, noteData.x, noteData.y, noteData.rx, noteData.ry, noteData.angle || 0);
    }
}

function renderDraggableNote(name, defaultPos, defaultRX, defaultRY, isDing = false, isBottom = false) {
    const svg = document.getElementById('layout-editor-svg');
    const layoutData = currentLayout[name] || { ...defaultPos, rx: defaultRX, ry: defaultRY, angle: 0 };
    
    // Ensure rx/ry/angle exist
    if (layoutData.rx === undefined) layoutData.rx = defaultRX;
    if (layoutData.ry === undefined) layoutData.ry = defaultRY;
    if (layoutData.angle === undefined) layoutData.angle = 0;

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
    if (layoutData.angle) {
        ellipse.setAttribute("transform", `rotate(${layoutData.angle} ${layoutData.x} ${layoutData.y})`);
    }
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

function renderControls(name, x, y, rx, ry, angle) {
    const svg = document.getElementById('layout-editor-svg');
    const controlsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    controlsG.id = "editor-controls";
    controlsG.setAttribute("transform", `rotate(${angle} ${x} ${y})`);

    // 1. Resize Handles
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
        controlsG.appendChild(handle);
    });

    // 2. Rotation Handle
    const stalk = document.createElementNS("http://www.w3.org/2000/svg", "line");
    stalk.setAttribute("x1", x);
    stalk.setAttribute("y1", y - ry);
    stalk.setAttribute("x2", x);
    stalk.setAttribute("y2", y - ry - 30);
    stalk.setAttribute("stroke", "var(--accent-color)");
    stalk.setAttribute("stroke-width", "2");
    controlsG.appendChild(stalk);

    const rotHandle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rotHandle.setAttribute("cx", x);
    rotHandle.setAttribute("cy", y - ry - 30);
    rotHandle.setAttribute("r", 8);
    rotHandle.setAttribute("fill", "#ff4b2b");
    rotHandle.setAttribute("stroke", "white");
    rotHandle.setAttribute("stroke-width", "2");
    rotHandle.setAttribute("class", "rotation-handle");
    rotHandle.style.cursor = "alias";
    controlsG.appendChild(rotHandle);

    svg.appendChild(controlsG);
}

function onPointerDown(e) {
    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);

    // 1. Check for rotation handle
    const rot = e.target.closest('.rotation-handle');
    if (rot && selectedNote) {
        rotationHandle = rot;
        rotationHandle.setPointerCapture(e.pointerId);
        const noteData = currentLayout[selectedNote.name] || selectedNote.default;
        
        initialRotationData = {
            centerX: noteData.x,
            centerY: noteData.y,
            startAngle: noteData.angle || 0,
            startMouseAngle: Math.atan2(pt.y - noteData.y, pt.x - noteData.x) * 180 / Math.PI
        };
        e.stopPropagation();
        return;
    }

    // 2. Check for resize handle
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
            startAngle: noteData.angle || 0,
            type: handle.getAttribute('data-handle-type')
        };
        e.stopPropagation();
        return;
    }

    // 3. Check for note dragging
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

    if (rotationHandle && selectedNote) {
        const currentMouseAngle = Math.atan2(pt.y - initialRotationData.centerY, pt.x - initialRotationData.centerX) * 180 / Math.PI;
        let delta = currentMouseAngle - initialRotationData.startMouseAngle;
        
        let newAngle = (initialRotationData.startAngle + delta) % 360;
        
        const noteData = currentLayout[selectedNote.name] || { ...selectedNote.default };
        noteData.angle = Math.round(newAngle);
        currentLayout[selectedNote.name] = noteData;
        
        updateControlsUI(noteData);
    } else if (resizingHandle && selectedNote) {
        const type = initialResizeData.type;
        const angleRad = (initialResizeData.startAngle || 0) * Math.PI / 180;
        
        // Transform mouse delta into local (unrotated) space
        const dxRaw = pt.x - initialResizeData.startX;
        const dyRaw = pt.y - initialResizeData.startY;
        
        const dx = dxRaw * Math.cos(-angleRad) - dyRaw * Math.sin(-angleRad);
        const dy = dxRaw * Math.sin(-angleRad) + dyRaw * Math.cos(-angleRad);
        
        const noteData = currentLayout[selectedNote.name] || { ...selectedNote.default };

        if (type.includes('e')) noteData.rx = Math.max(MIN_RADIUS, initialResizeData.startRX + dx);
        if (type.includes('w')) noteData.rx = Math.max(MIN_RADIUS, initialResizeData.startRX - dx);
        if (type.includes('s')) noteData.ry = Math.max(MIN_RADIUS, initialResizeData.startRY + dy);
        if (type.includes('n')) noteData.ry = Math.max(MIN_RADIUS, initialResizeData.startRY - dy);

        currentLayout[selectedNote.name] = noteData;
        updateControlsUI(noteData);
    } else if (draggedElement) {
        const nx = Math.round(pt.x - dragOffset.x);
        const ny = Math.round(pt.y - dragOffset.y);

        const noteName = draggedElement.getAttribute('data-note');
        if (!currentLayout[noteName]) {
            currentLayout[noteName] = {
                x: nx,
                y: ny,
                rx: parseFloat(draggedElement.getAttribute('data-default-rx')),
                ry: parseFloat(draggedElement.getAttribute('data-default-ry')),
                angle: 0
            };
        } else {
            currentLayout[noteName].x = nx;
            currentLayout[noteName].y = ny;
        }

        updateControlsUI(currentLayout[noteName]);
    }
}

function updateControlsUI(noteData) {
    const svg = document.getElementById('layout-editor-svg');
    const g = svg.querySelector(`[data-note="${selectedNote.name}"]`);
    if (!g) return;

    const ellipse = g.querySelector('ellipse');
    const text = g.querySelector('text');
    
    ellipse.setAttribute('cx', noteData.x);
    ellipse.setAttribute('cy', noteData.y);
    ellipse.setAttribute('rx', noteData.rx);
    ellipse.setAttribute('ry', noteData.ry);
    ellipse.setAttribute('transform', `rotate(${noteData.angle || 0} ${noteData.x} ${noteData.y})`);
    
    text.setAttribute('x', noteData.x);
    text.setAttribute('y', noteData.y + 5);

    const controlsG = document.getElementById('editor-controls');
    if (controlsG) {
        controlsG.setAttribute("transform", `rotate(${noteData.angle || 0} ${noteData.x} ${noteData.y})`);
        
        const x = noteData.x;
        const y = noteData.y;
        const rx = noteData.rx;
        const ry = noteData.ry;

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
            const handle = controlsG.querySelector(`[data-handle-type="${p.type}"]`);
            if (handle) {
                handle.setAttribute('cx', p.pos[0]);
                handle.setAttribute('cy', p.pos[1]);
            }
        });

        const stalk = controlsG.querySelector('line');
        const rot = controlsG.querySelector('.rotation-handle');
        if (stalk) {
            stalk.setAttribute('x1', x);
            stalk.setAttribute('y1', y - ry);
            stalk.setAttribute('x2', x);
            stalk.setAttribute('y2', y - ry - 30);
        }
        if (rot) {
            rot.setAttribute('cx', x);
            rot.setAttribute('cy', y - ry - 30);
        }
    }
}

function onPointerUp(e) {
    if (draggedElement) {
        draggedElement.style.opacity = "1";
        draggedElement = null;
    }
    if (resizingHandle) resizingHandle = null;
    if (rotationHandle) rotationHandle = null;
}

function getMousePos(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}
