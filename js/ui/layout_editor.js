import { layout, renderHandpanSVG } from './visualizer.js';

let dependencies = {};
let currentLayout = {};
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let scaleOnStart = null;

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
    }
}

function openLayoutEditor() {
    const modal = document.getElementById('layout-editor-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    scaleOnStart = dependencies.getCurrentScale();
    // Deep clone the layout or initialize if empty
    currentLayout = JSON.parse(JSON.stringify(scaleOnStart.layout || {}));

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
    if (confirm('Reset layout to default positions?')) {
        currentLayout = {};
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

    // Render nodes using logic similar to visualizer.js for default positions
    const topSideNotes = topNotes.slice(1);
    const N = topSideNotes.length;
    const stepAngle = (2 * Math.PI) / N;
    
    // Exact same scaling logic as visualizer.js
    const radius = layout.rNotesTop;
    const maxAllowedTopR = N > 1 ? (radius * Math.sin(Math.PI / N)) * 0.85 : 50;
    const scaleFactor = N > 1 ? Math.min(1, maxAllowedTopR / 36) : 1;

    const parentPositions = {};

    // Ding
    const dingName = topNotes[0];
    const dingDPos = { x: layout.cx, y: layout.cy };
    renderDraggableNote(dingName, dingDPos, 43, true);
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
        renderDraggableNote(name, dPos, r, isExtraDing);
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
        renderDraggableNote(note, dPos, r, note.startsWith('D:'), true);
    });
}

function renderDraggableNote(name, defaultPos, r, isDing = false, isBottom = false) {
    const svg = document.getElementById('layout-editor-svg');
    const finalPos = currentLayout[name] || defaultPos;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "hp-note draggable" + (isDing ? " ding" : "") + (isBottom ? " side-note" : ""));
    g.setAttribute("data-note", name);
    g.style.cursor = "move";
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", finalPos.x);
    circle.setAttribute("cy", finalPos.y);
    circle.setAttribute("r", r);
    circle.setAttribute("fill", isDing ? "rgba(243, 156, 18, 0.4)" : "rgba(118, 75, 162, 0.3)");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "2");
    g.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", finalPos.x);
    text.setAttribute("y", finalPos.y + 5);
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

function onPointerDown(e) {
    const g = e.target.closest('.draggable');
    if (!g) return;

    draggedElement = g;
    draggedElement.setPointerCapture(e.pointerId);

    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);
    const circle = g.querySelector('circle');
    
    dragOffset.x = pt.x - parseFloat(circle.getAttribute('cx'));
    dragOffset.y = pt.y - parseFloat(circle.getAttribute('cy'));
    
    g.style.opacity = "0.7";
}

function onPointerMove(e) {
    if (!draggedElement) return;

    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);
    const nx = Math.round(pt.x - dragOffset.x);
    const ny = Math.round(pt.y - dragOffset.y);

    const circle = draggedElement.querySelector('circle');
    const text = draggedElement.querySelector('text');
    
    circle.setAttribute("cx", nx);
    circle.setAttribute("cy", ny);
    text.setAttribute("x", nx);
    text.setAttribute("y", ny + 5);
    
    const noteName = draggedElement.getAttribute('data-note');
    currentLayout[noteName] = { x: nx, y: ny };
}

function onPointerUp(e) {
    if (!draggedElement) return;
    draggedElement.style.opacity = "1";
    draggedElement = null;
}

function getMousePos(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}
