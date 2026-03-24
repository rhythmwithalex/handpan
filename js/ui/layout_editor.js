import { layout, renderHandpanSVG } from './visualizer.js';
import { exportScaleToFile } from '../utils/export.js';

let dependencies = {};
let currentLayout = {};
let draggedElement = null;
let resizingHandle = null;
let rotationHandle = null;
let activeValueDragger = null;
let copiedParams = null; // Store { rx, ry, angle }

let selectedNotes = []; // Array of { name, default: { x, y, rx, ry } }
let dragOffset = { x: 0, y: 0 };
let scaleOnStart = null;
let isMultiSelectMode = false; // For iPad/touch support

let initialResizeData = null;
let initialRotationData = null;
let initialDraggerData = null;
let lastClickTime = 0;
let lastClickedNote = null;

const MIN_RADIUS = 10;
const CANVAS_SIZE = 500;

function isValidNote(name) {
    // Validates formats like D3, F#4, Bb2
    return /^[A-G][b#]?\d$/.test(name);
}

export function initLayoutEditor(deps) {
    dependencies = deps;

    const openBtn = document.getElementById('layout-editor-open-btn');
    const closeBtn = document.getElementById('layout-editor-close');
    const saveBtn = document.getElementById('layout-editor-save');
    const resetBtn = document.getElementById('layout-editor-reset');
    const exportBtn = document.getElementById('layout-editor-export');
    const addNoteBtn = document.getElementById('btn-add-note-exec');
    const svg = document.getElementById('layout-editor-svg');

    if (openBtn) openBtn.addEventListener('click', () => openLayoutEditor());
    if (closeBtn) closeBtn.addEventListener('click', closeLayoutEditor);
    if (saveBtn) saveBtn.addEventListener('click', saveLayout);
    if (resetBtn) resetBtn.addEventListener('click', resetLayout);
    if (exportBtn) exportBtn.addEventListener('click', exportCurrentLayout);
    if (addNoteBtn) addNoteBtn.addEventListener('click', addNoteToLayout);
    
    const fabBtn = document.getElementById('btn-fab-add');
    if (fabBtn) {
        fabBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('new-note-name');
            if (nameInput) {
                nameInput.focus();
                nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    if (svg) {
        svg.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        
        // Clear selection if clicking background
        const modal = document.getElementById('layout-editor-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                // Ignore if clicking sidebar
                const sidebar = document.getElementById('editor-sidebar');
                if (sidebar && sidebar.contains(e.target)) return;

                // Deselect if clicking modal background, canvas area, or SVG empty space
                if (e.target.id === 'layout-editor-modal' || 
                    e.target.id === 'layout-editor-canvas-container' || 
                    e.target.id === 'layout-editor-svg' || 
                    e.target.classList.contains('hp-body-editor')) {
                    console.log("Deselecting all");
                    selectedNotes = [];
                    renderEditorSVG();
                    renderPropertiesPanel();
                }
            });
        }
    }
}

export function openLayoutEditor(forceScale = null) {
    const modal = document.getElementById('layout-editor-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    scaleOnStart = forceScale || dependencies.getCurrentScale();
    if (!scaleOnStart) {
        alert("No active scale found.");
        return;
    }
    console.log("Opening Layout Editor for scale:", scaleOnStart);
    // Deep clone the layout or initialize if empty
    currentLayout = (scaleOnStart.layout && typeof scaleOnStart.layout === 'object') ? JSON.parse(JSON.stringify(scaleOnStart.layout)) : {};
    console.log("Initial currentLayout:", currentLayout);
    selectedNotes = [];

    renderEditorSVG();
}

function closeLayoutEditor() {
    const modal = document.getElementById('layout-editor-modal');
    if (modal) modal.style.display = 'none';
}

function saveLayout() {
    const scale = dependencies.getCurrentScale();
    scale.layout = currentLayout;
    
    // If it's a custom scale, ensure it's saved to the custom scales library
    if (scale.id && scale.id.startsWith('custom-') && dependencies.saveCustomScale) {
        dependencies.saveCustomScale(scale.id, scale);
    }
    
    // Trigger a global re-render of the visualizer
    renderHandpanSVG(scale);
    
    // Proactively save state
    if (dependencies.saveCurrentState) {
        dependencies.saveCurrentState();
    }
    
    closeLayoutEditor();
}

function exportCurrentLayout() {
    if (!scaleOnStart) return;
    
    // Create a temporary scale object that includes the current (possibly unsaved) layout
    const exportData = {
        ...scaleOnStart,
        layout: currentLayout
    };
    
    exportScaleToFile(exportData);
}

function resetLayout() {
    if (confirm('Reset layout to default positions and sizes?')) {
        currentLayout = {};
        selectedNotes = [];
        renderEditorSVG();
    }
}

function renderEditorSVG() {
    console.log("Rendering Editor SVG...");
    const svg = document.getElementById('layout-editor-svg');
    if (!svg) return;
    svg.innerHTML = '';

    if (!layout || !layout.cx) {
        console.error("Layout object from visualizer.js is missing or invalid!", layout);
        alert("Critial Error: Designer layout engine failed to load. Please refresh.");
        return;
    }

    // Reuse defs from main visualizer
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
    body.setAttribute("fill", "rgba(255,255,255,0.03)");
    body.setAttribute("stroke", "rgba(255,255,255,0.2)");
    body.setAttribute("stroke-dasharray", "8 8");
    body.classList.add('hp-body-editor');
    svg.appendChild(body);

    // Guide rings
    const createRing = (r, opacity = 0.1) => {
        const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        ring.setAttribute("cx", layout.cx);
        ring.setAttribute("cy", layout.cy);
        ring.setAttribute("r", r);
        ring.setAttribute("fill", "none");
        ring.setAttribute("stroke", `rgba(255,255,255,${opacity})`);
        ring.setAttribute("stroke-dasharray", "4 6");
        svg.appendChild(ring);
    };
    createRing(layout.rNotesTop, 0.15);
    createRing(layout.rNotesBottom, 0.08);

    // Get all notes from scale (including any newly added ones in currentLayout not in scale yet)
    const scaleNotesTop = Array.isArray(scaleOnStart.top) ? scaleOnStart.top : [];
    const scaleNotesBottom = (scaleOnStart.bottom && typeof scaleOnStart.bottom === 'object') ? Object.keys(scaleOnStart.bottom) : [];
    
    // Union of notes from scale and custom layout
    const layoutKeys = (currentLayout && typeof currentLayout === 'object') ? Object.keys(currentLayout) : [];
    const allKnownNotes = new Set([...scaleNotesTop, ...scaleNotesBottom, ...layoutKeys]);
    console.log("All known notes for editing:", Array.from(allKnownNotes));

    const parentPositions = {};

    // First pass: define parent positions (approximate for auto-layout)
    const topSideNotes = scaleNotesTop.slice(1);
    const N = topSideNotes.length;
    const stepAngle = (2 * Math.PI) / N;
    
    parentPositions[scaleNotesTop[0]] = { x: layout.cx, y: layout.cy };
    topSideNotes.forEach((name, i) => {
        const direction = (i % 2 === 1) ? 1 : -1;
        const stepCount = Math.ceil(i / 2);
        const angle = (Math.PI / 2) + (i === 0 ? 0 : direction * stepCount * stepAngle);
        parentPositions[name] = {
            x: layout.cx + layout.rNotesTop * Math.cos(angle),
            y: layout.cy + layout.rNotesTop * Math.sin(angle)
        };
    });

    // Second pass: define approximate positions for bottom notes to avoid overlap
    scaleNotesBottom.forEach(note => {
        const parent = scaleOnStart.bottom[note];
        const pPos = parentPositions[parent];
        if (pPos) {
            const dx = pPos.x - layout.cx;
            const dy = pPos.y - layout.cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            parentPositions[note] = {
                x: layout.cx + (dx / dist) * layout.rNotesBottom,
                y: layout.cy + (dy / dist) * layout.rNotesBottom
            };
        }
    });

    // Render all notes
    try {
        allKnownNotes.forEach(name => {
            const isDing = name === scaleNotesTop[0] || (currentLayout[name]?.isDing);
            const isBottom = scaleNotesBottom.includes(name) || (currentLayout[name]?.isBottom);
            
            let defaultPos = parentPositions[name] || { x: layout.cx, y: layout.cy + 100 };
            let defaultR = isDing ? 43 : 36;
            if (isBottom) defaultR = 27;

            // PERSISTENCE FIX: If the note doesn't have a layout entry yet, 
            // save the calculated default position to currentLayout immediately.
            // This prevents the note from "jumping" if the automatic layout 
            // logic recalculates (e.g., when a new note is added and 'N' changes).
            if (!currentLayout[name]) {
                currentLayout[name] = {
                    x: defaultPos.x,
                    y: defaultPos.y,
                    rx: defaultR,
                    ry: defaultR,
                    angle: 0,
                    isDing,
                    isBottom
                };
            }

            console.log(`Rendering note: ${name}`, { isDing, isBottom, defaultPos });
            renderDraggableNote(name, defaultPos, defaultR, defaultR, isDing, isBottom);
        });
    } catch (err) {
        console.error("Error during note rendering loop:", err);
    }

    // Render Controls & Properties
    renderPropertiesPanel();
    if (selectedNotes.length === 1) {
        const sel = selectedNotes[0];
        const noteData = currentLayout[sel.name] || sel.default;
        renderHandles(sel.name, noteData.x, noteData.y, noteData.rx, noteData.ry, noteData.angle || 0);
    }
}

function renderDraggableNote(name, defaultPos, defaultRX, defaultRY, isDing = false, isBottom = false) {
    const svg = document.getElementById('layout-editor-svg');
    const layoutData = currentLayout[name] || { ...defaultPos, rx: defaultRX, ry: defaultRY, angle: 0 };
    
    if (layoutData.x === undefined || isNaN(layoutData.x)) layoutData.x = defaultPos.x;
    if (layoutData.y === undefined || isNaN(layoutData.y)) layoutData.y = defaultPos.y;
    if (layoutData.rx === undefined || isNaN(layoutData.rx)) layoutData.rx = defaultRX;
    if (layoutData.ry === undefined || isNaN(layoutData.ry)) layoutData.ry = defaultRY;
    if (layoutData.angle === undefined || isNaN(layoutData.angle)) layoutData.angle = 0;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const isSelected = selectedNotes.some(sn => sn.name === name);
    
    g.setAttribute("class", "hp-note draggable" + (isDing ? " ding" : "") + (isBottom ? " side-note" : "") + (isSelected ? " selected" : ""));
    g.setAttribute("data-note", name);
    g.setAttribute("data-default-x", defaultPos.x);
    g.setAttribute("data-default-y", defaultPos.y);
    g.setAttribute("data-default-rx", defaultRX);
    g.setAttribute("data-default-ry", defaultRY);
    
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
    text.style.fontSize = "12px";
    text.style.fontWeight = "700";
    text.style.pointerEvents = "none";
    text.textContent = name.replace(/^D:/, '');
    g.appendChild(text);

    svg.appendChild(g);
}

function renderHandles(name, x, y, rx, ry, angle) {
    const svg = document.getElementById('layout-editor-svg');
    const controlsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    controlsG.id = "editor-controls";
    controlsG.setAttribute("transform", `rotate(${angle} ${x} ${y})`);

    // Resize Handles
    const points = [
        { pos: [x, y - ry], type: 'n' }, { pos: [x, y + ry], type: 's' },
        { pos: [x - rx, y], type: 'w' }, { pos: [x + rx, y], type: 'e' },
        { pos: [x - rx, y - ry], type: 'nw' }, { pos: [x + rx, y - ry], type: 'ne' },
        { pos: [x - rx, y + ry], type: 'sw' }, { pos: [x + rx, y + ry], type: 'se' }
    ];

    points.forEach(p => {
        const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.setAttribute("cx", p.pos[0]);
        handle.setAttribute("cy", p.pos[1]);
        handle.setAttribute("r", 6);
        handle.setAttribute("fill", "var(--accent-color)");
        handle.setAttribute("stroke", "white");
        handle.setAttribute("stroke-width", "2");
        handle.setAttribute("class", "resize-handle");
        handle.setAttribute("data-handle-type", p.type);
        handle.style.cursor = p.type + "-resize";
        controlsG.appendChild(handle);
    });

    // Rotation Handle
    const stalk = document.createElementNS("http://www.w3.org/2000/svg", "line");
    stalk.setAttribute("x1", x); stalk.setAttribute("y1", y - ry);
    stalk.setAttribute("x2", x); stalk.setAttribute("y2", y - ry - 40);
    stalk.setAttribute("stroke", "var(--accent-color)");
    stalk.setAttribute("stroke-width", "2");
    stalk.setAttribute("stroke-dasharray", "2 2");
    controlsG.appendChild(stalk);

    const rotHandle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    rotHandle.setAttribute("cx", x); rotHandle.setAttribute("cy", y - ry - 40);
    rotHandle.setAttribute("r", 8);
    rotHandle.setAttribute("fill", "#ff4b2b");
    rotHandle.setAttribute("stroke", "white");
    rotHandle.setAttribute("stroke-width", "2");
    rotHandle.setAttribute("class", "rotation-handle");
    rotHandle.style.cursor = "alias";
    controlsG.appendChild(rotHandle);

    svg.appendChild(controlsG);
}

function renderPropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    if (!panel) return;

    if (selectedNotes.length === 0) {
        panel.innerHTML = '<p class="empty-selection-msg">Select a note to edit its properties</p>';
        return;
    }

    if (selectedNotes.length > 1) {
        // Multi-selection view
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div style="font-weight: 700; color: white; font-size: 1.1rem;">Selected: ${selectedNotes.length}</div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Style:</span>
                    <button id="btn-copy-params" class="premium-btn" style="padding: 4px 10px; font-size: 0.75rem; color: #000; font-weight: 700;">Copy</button>
                    <button id="btn-paste-params" class="premium-btn" style="padding: 4px 10px; font-size: 0.75rem; color: #000; font-weight: 700;" ${!copiedParams ? 'disabled' : ''}>Paste</button>
                    <button id="btn-clone-selected" class="premium-btn" style="padding: 4px 10px; font-size: 0.75rem; color: #000; font-weight: 700;">Clone</button>
                </div>
            </div>

            <div class="sidebar-instruction" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #fff; font-size: 0.9rem;">
                    <input type="checkbox" id="chk-multi-select" ${isMultiSelectMode ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-color);">
                    Multi-select Mode
                </label>
            </div>

            <button id="btn-delete-selected" class="secondary-btn" style="width: 100%; color: #ff4b2b; border-color: rgba(255,75,43,0.3);">Remove Selected</button>
        `;
        
        document.getElementById('chk-multi-select').addEventListener('change', (e) => {
            isMultiSelectMode = e.target.checked;
        });
        
        document.getElementById('btn-copy-params').addEventListener('click', copySelectedParams);
        document.getElementById('btn-paste-params').addEventListener('click', pasteParamsToSelection);
        document.getElementById('btn-clone-selected').addEventListener('click', cloneSelectedNotes);
        document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedNotes);
        return;
    }

    // Single selection view
    const sel = selectedNotes[0];
    const name = sel.name;
    const data = currentLayout[name] || sel.default;

    panel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-weight: 700; color: white; font-size: 1.1rem;">${name}</div>
                <button id="btn-clone-icon" class="icon-btn" title="Clone Note" style="background: rgba(255,255,255,0.15); border-radius: 6px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1); color: #fff; cursor: pointer; transition: all 0.2s;">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">Style:</span>
                <button id="btn-copy-params" class="premium-btn" style="padding: 4px 10px; font-size: 0.75rem; color: #000; font-weight: 700;">Copy</button>
                <button id="btn-paste-params" class="premium-btn" style="padding: 4px 10px; font-size: 0.75rem; color: #000; font-weight: 700;" ${!copiedParams ? 'disabled' : ''}>Paste</button>
            </div>
        </div>

        <div class="sidebar-instruction" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; color: #fff; font-size: 0.9rem;">
                <input type="checkbox" id="chk-multi-select" ${isMultiSelectMode ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-color);">
                Multi-select Mode
            </label>
        </div>
        <div class="prop-row">
            <label class="prop-label">Position X</label>
            <div class="prop-input-wrap"><input type="number" data-prop="x" class="premium-text-input" value="${Math.round(data.x)}"></div>
            <div class="value-dragger" data-prop="x"></div>
        </div>
        <div class="prop-row">
            <label class="prop-label">Position Y</label>
            <div class="prop-input-wrap"><input type="number" data-prop="y" class="premium-text-input" value="${Math.round(data.y)}"></div>
            <div class="value-dragger" data-prop="y"></div>
        </div>
        <div class="prop-row">
            <label class="prop-label">Radius X</label>
            <div class="prop-input-wrap"><input type="number" data-prop="rx" class="premium-text-input" value="${Math.round(data.rx)}"></div>
            <div class="value-dragger" data-prop="rx"></div>
        </div>
        <div class="prop-row">
            <label class="prop-label">Radius Y</label>
            <div class="prop-input-wrap"><input type="number" data-prop="ry" class="premium-text-input" value="${Math.round(data.ry)}"></div>
            <div class="value-dragger" data-prop="ry"></div>
        </div>
        <div class="prop-row">
            <label class="prop-label">Angle</label>
            <div class="prop-input-wrap"><input type="number" data-prop="angle" class="premium-text-input" value="${Math.round(data.angle || 0)}"></div>
            <div class="value-dragger" data-prop="angle"></div>
        </div>
        
        <div class="sidebar-section" style="margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
            <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; margin-bottom: 12px;">Note data</div>
            
            <div class="input-group" style="margin-bottom: 12px;">
                <label class="prop-label" style="display: block; margin-bottom: 5px;">Note Name</label>
                <input type="text" id="edit-note-name" value="${name}" class="premium-text-input" style="font-family: monospace;">
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 12px;">
                <div style="flex: 1;">
                    <label class="prop-label" style="display: block; margin-bottom: 5px;">Sphere</label>
                    <select id="edit-note-sphere" class="premium-select" style="width: 100%; border-radius: 8px;">
                        <option value="top" ${currentLayout[name]?.sphere === 'top' || dependencies.getCurrentScale().top.includes(name) ? 'selected' : ''}>Top</option>
                        <option value="bottom" ${currentLayout[name]?.sphere === 'bottom' || dependencies.getCurrentScale().bottom[name] ? 'selected' : ''}>Bottom</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <label class="prop-label" style="display: block; margin-bottom: 5px;">Type</label>
                    <select id="edit-note-type" class="premium-select" style="width: 100%; border-radius: 8px;">
                        <option value="note" ${!name.toLowerCase().includes('ding') && !currentLayout[name]?.isDing ? 'selected' : ''}>Note</option>
                        <option value="ding" ${name.toLowerCase().includes('ding') || currentLayout[name]?.isDing ? 'selected' : ''}>Ding</option>
                    </select>
                </div>
            </div>

            <button id="btn-update-note-meta" class="premium-btn" style="width: 100%; font-size: 0.85rem; padding: 10px; color: #000; font-weight: 700;">Update note</button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
            <button id="btn-delete-selected" class="secondary-btn" style="width: 100%; color: #ff4b2b; border-color: rgba(255,75,43,0.3);">Remove Note</button>
        </div>
    `;

    document.getElementById('chk-multi-select').addEventListener('change', (e) => {
        isMultiSelectMode = e.target.checked;
    });

    const triggerUpdate = () => {
        const newName = document.getElementById('edit-note-name').value.trim();
        const newSphere = document.getElementById('edit-note-sphere').value;
        const isDing = document.getElementById('edit-note-type').value === 'ding';

        if (!isValidNote(newName) && !newName.toLowerCase().includes('ding')) {
             return alert(`Invalid note name: "${newName}". Use format like F2, G#4, or include "Ding"`);
        }
        
        handleNoteMetaUpdate(name, newName, newSphere, isDing);
    };

    document.getElementById('edit-note-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerUpdate();
    });

    document.getElementById('btn-update-note-meta').addEventListener('click', triggerUpdate);

    // Attach listeners
    panel.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', (e) => {
            const prop = e.target.getAttribute('data-prop');
            updateSelectionProperty(prop, parseFloat(e.target.value));
        });
    });

    panel.querySelectorAll('.value-dragger').forEach(dragger => {
        dragger.addEventListener('pointerdown', (e) => {
            activeValueDragger = dragger;
            activeValueDragger.setPointerCapture(e.pointerId);
            initialDraggerData = {
                startY: e.clientY,
                startVal: parseFloat(panel.querySelector(`input[data-prop="${dragger.getAttribute('data-prop')}"]`).value),
                prop: dragger.getAttribute('data-prop')
            };
            e.stopPropagation();
        });
    });

    document.getElementById('btn-copy-params').onclick = copySelectedParams;
    document.getElementById('btn-paste-params').onclick = pasteParamsToSelection;
    const cloneBtn = document.getElementById('btn-clone-selected') || document.getElementById('btn-clone-icon');
    if (cloneBtn) cloneBtn.onclick = cloneSelectedNotes;
    document.getElementById('btn-delete-selected').onclick = deleteSelectedNotes;
}

function updateSelectionProperty(prop, value) {
    let finalVal = value;
    
    // Constraints
    if (prop === 'rx' || prop === 'ry') finalVal = Math.max(MIN_RADIUS, value);
    if (prop === 'x' || prop === 'y') finalVal = Math.max(0, Math.min(CANVAS_SIZE, value));

    selectedNotes.forEach(sn => {
        if (!currentLayout[sn.name]) {
            currentLayout[sn.name] = { ...sn.default, angle: 0 };
        }
        currentLayout[sn.name][prop] = finalVal;
        
        // Partially update SVG for each note for smoothness
        const svg = document.getElementById('layout-editor-svg');
        const g = svg.querySelector(`[data-note="${sn.name}"]`);
        if (g) {
            const ellipse = g.querySelector('ellipse');
            const text = g.querySelector('text');
            const d = currentLayout[sn.name];
            
            ellipse.setAttribute('cx', d.x);
            ellipse.setAttribute('cy', d.y);
            ellipse.setAttribute('rx', d.rx);
            ellipse.setAttribute('ry', d.ry);
            if (d.angle) ellipse.setAttribute('transform', `rotate(${d.angle} ${d.x} ${d.y})`);
            else ellipse.removeAttribute('transform');
            
            text.setAttribute('x', d.x);
            text.setAttribute('y', d.y + 5);
        }
    });

    // Update handles only if a single note is selected
    if (selectedNotes.length === 1) {
        const d = currentLayout[selectedNotes[0].name];
        const controlsG = document.getElementById('editor-controls');
        if (controlsG) {
            controlsG.setAttribute("transform", `rotate(${d.angle || 0} ${d.x} ${d.y})`);
            const x = d.x; const y = d.y; const rx = d.rx; const ry = d.ry;
            const points = [
                { type: 'n', pos: [x, y - ry] }, { type: 's', pos: [x, y + ry] },
                { type: 'w', pos: [x - rx, y] }, { type: 'e', pos: [x + rx, y] },
                { type: 'nw', pos: [x - rx, y - ry] }, { type: 'ne', pos: [x + rx, y - ry] },
                { type: 'sw', pos: [x - rx, y + ry] }, { type: 'se', pos: [x + rx, y + ry] }
            ];
            points.forEach(p => {
                const h = controlsG.querySelector(`[data-handle-type="${p.type}"]`);
                if (h) { h.setAttribute('cx', p.pos[0]); h.setAttribute('cy', p.pos[1]); }
            });
            const stalk = controlsG.querySelector('line');
            const rot = controlsG.querySelector('.rotation-handle');
            if (stalk) { stalk.setAttribute('x1', x); stalk.setAttribute('y1', y - ry); stalk.setAttribute('x2', x); stalk.setAttribute('y2', y - ry - 40); }
            if (rot) { rot.setAttribute('cx', x); rot.setAttribute('cy', y - ry - 40); }
        }
    }
}

function onPointerDown(e) {
    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);

    // 1. Rotation handle
    const rot = e.target.closest('.rotation-handle');
    if (rot && selectedNotes.length === 1) {
        const sn = selectedNotes[0];
        rotationHandle = rot;
        rotationHandle.setPointerCapture(e.pointerId);
        const data = currentLayout[sn.name] || sn.default;
        initialRotationData = {
            centerX: data.x, centerY: data.y, startAngle: data.angle || 0,
            startMouseAngle: Math.atan2(pt.y - data.y, pt.x - data.x) * 180 / Math.PI
        };
        e.stopPropagation(); return;
    }

    // 2. Resize handle
    const handle = e.target.closest('.resize-handle');
    if (handle && selectedNotes.length === 1) {
        const sn = selectedNotes[0];
        resizingHandle = handle;
        resizingHandle.setPointerCapture(e.pointerId);
        const data = currentLayout[sn.name] || sn.default;
        initialResizeData = {
            startX: pt.x, startY: pt.y, startRX: data.rx, startRY: data.ry,
            startAngle: data.angle || 0, type: handle.getAttribute('data-handle-type')
        };
        e.stopPropagation(); return;
    }

    const g = e.target.closest('.draggable');
    if (g) {
        const name = g.getAttribute('data-note');
        
        // Simulated Double-Click detection
        const now = Date.now();
        if (now - lastClickTime < 400 && lastClickedNote === name) {
            console.log("Simulated double-click on:", name);
            // Re-render and focus
            selectedNotes = [{
                name: name,
                default: { 
                    x: parseFloat(g.getAttribute('data-default-x')),
                    y: parseFloat(g.getAttribute('data-default-y')),
                    rx: parseFloat(g.getAttribute('data-default-rx')),
                    ry: parseFloat(g.getAttribute('data-default-ry'))
                }
            }];
            renderEditorSVG();
            setTimeout(() => {
                const input = document.getElementById('edit-note-name');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);
            
            lastClickTime = 0;
            e.stopPropagation();
            return;
        }
        lastClickTime = now;
        lastClickedNote = name;

        const noteInfo = {
            name: name,
            default: {
                x: parseFloat(g.getAttribute('data-default-x')),
                y: parseFloat(g.getAttribute('data-default-y')),
                rx: parseFloat(g.getAttribute('data-default-rx')),
                ry: parseFloat(g.getAttribute('data-default-ry'))
            }
        };

        if (e.shiftKey || isMultiSelectMode) {
            const idx = selectedNotes.findIndex(sn => sn.name === name);
            if (idx > -1) selectedNotes.splice(idx, 1);
            else selectedNotes.push(noteInfo);
        } else {
            // If already selected, don't clear (keep for multi-drag)
            if (!selectedNotes.some(sn => sn.name === name)) {
                selectedNotes = [noteInfo];
            }
        }

        renderEditorSVG();
        
        // Start drag - FIND THE NEW ELEMENT IN DOM after re-render
        draggedElement = svg.querySelector(`[data-note="${name}"]`);
        if (!draggedElement) draggedElement = g; // Fallback

        draggedElement.setPointerCapture(e.pointerId);
        
        // Use the clicked note as the reference for drag offset
        const ellipse = g.querySelector('ellipse');
        dragOffset.x = pt.x - parseFloat(ellipse.getAttribute('cx'));
        dragOffset.y = pt.y - parseFloat(ellipse.getAttribute('cy'));
        
        // Store start positions for all selected notes for relative movement
        selectedNotes.forEach(sn => {
            const d = currentLayout[sn.name] || sn.default;
            sn.startDragPos = { x: d.x, y: d.y };
        });

        draggedElement.style.opacity = "0.7";
        e.stopPropagation();
    }
}

function onPointerMove(e) {
    if (activeValueDragger) {
        const prop = initialDraggerData.prop;
        const delta = initialDraggerData.startY - e.clientY;
        const speed = e.shiftKey ? 0.2 : 0.5;
        
        // Invert Y: Dragging mouse UP (delta > 0) should DECREASE Y value (move higher on screen)
        const multiplier = prop === 'y' ? -1 : 1;
        const newVal = Math.round(initialDraggerData.startVal + delta * speed * multiplier);
        
        updateSelectionProperty(prop, newVal);
        
        // Update input field manually as well
        const input = document.querySelector(`.properties-grid input[data-prop="${prop}"]`);
        if (input) input.value = newVal;
        return;
    }

    const svg = document.getElementById('layout-editor-svg');
    const pt = getMousePos(svg, e);

    if (rotationHandle) {
        const curA = Math.atan2(pt.y - initialRotationData.centerY, pt.x - initialRotationData.centerX) * 180 / Math.PI;
        const newA = (initialRotationData.startAngle + (curA - initialRotationData.startMouseAngle)) % 360;
        updateSelectionProperty('angle', Math.round(newA));
        renderPropertiesPanel(); // Keep inputs in sync
    } else if (resizingHandle) {
        const rad = (initialResizeData.startAngle || 0) * Math.PI / 180;
        const dxR = pt.x - initialResizeData.startX;
        const dyR = pt.y - initialResizeData.startY;
        const dx = dxR * Math.cos(-rad) - dyR * Math.sin(-rad);
        const dy = dxR * Math.sin(-rad) + dyR * Math.cos(-rad);
        
        const type = initialResizeData.type;
        if (type.includes('e')) updateSelectionProperty('rx', Math.max(MIN_RADIUS, initialResizeData.startRX + dx));
        if (type.includes('w')) updateSelectionProperty('rx', Math.max(MIN_RADIUS, initialResizeData.startRX - dx));
        if (type.includes('s')) updateSelectionProperty('ry', Math.max(MIN_RADIUS, initialResizeData.startRY + dy));
        if (type.includes('n')) updateSelectionProperty('ry', Math.max(MIN_RADIUS, initialResizeData.startRY - dy));
        renderPropertiesPanel();
    } else if (draggedElement) {
        const name = draggedElement.getAttribute('data-note');
        const refNote = selectedNotes.find(sn => sn.name === name);
        if (!refNote || !refNote.startDragPos) return;

        const dx = (pt.x - dragOffset.x) - refNote.startDragPos.x;
        const dy = (pt.y - dragOffset.y) - refNote.startDragPos.y;

        // Perform partial updates directly on the current selected group
        selectedNotes.forEach(sn => {
            if (!currentLayout[sn.name]) {
                currentLayout[sn.name] = { ...sn.default, angle: 0 };
            }
            currentLayout[sn.name].x = Math.round(sn.startDragPos.x + dx);
            currentLayout[sn.name].y = Math.round(sn.startDragPos.y + dy);
            
            // Move SVG element
            const g = svg.querySelector(`[data-note="${sn.name}"]`);
            if (g) {
                const ellipse = g.querySelector('ellipse');
                const text = g.querySelector('text');
                const d = currentLayout[sn.name];
                
                ellipse.setAttribute('cx', d.x);
                ellipse.setAttribute('cy', d.y);
                if (d.angle) ellipse.setAttribute('transform', `rotate(${d.angle} ${d.x} ${d.y})`);
                
                text.setAttribute('x', d.x);
                text.setAttribute('y', d.y + 5);
            }
        });

        // Sync single note handles if needed
        if (selectedNotes.length === 1) {
            const d = currentLayout[selectedNotes[0].name];
            const controlsG = document.getElementById('editor-controls');
            if (controlsG) {
                controlsG.setAttribute("transform", `rotate(${d.angle || 0} ${d.x} ${d.y})`);
                const x = d.x; const y = d.y; const rx = d.rx; const ry = d.ry;
                const points = [
                    { type: 'n', pos: [x, y - ry] }, { type: 's', pos: [x, y + ry] },
                    { type: 'w', pos: [x - rx, y] }, { type: 'e', pos: [x + rx, y] },
                    { type: 'nw', pos: [x - rx, y - ry] }, { type: 'ne', pos: [x + rx, y - ry] },
                    { type: 'sw', pos: [x - rx, y + ry] }, { type: 'se', pos: [x + rx, y + ry] }
                ];
                points.forEach(p => {
                    const h = controlsG.querySelector(`[data-handle-type="${p.type}"]`);
                    if (h) { h.setAttribute('cx', p.pos[0]); h.setAttribute('cy', p.pos[1]); }
                });
                const stalk = controlsG.querySelector('line');
                const rot = controlsG.querySelector('.rotation-handle');
                if (stalk) { stalk.setAttribute('x1', x); stalk.setAttribute('y1', y - ry); stalk.setAttribute('x2', x); stalk.setAttribute('y2', y - ry - 40); }
                if (rot) { rot.setAttribute('cx', x); rot.setAttribute('cy', y - ry - 40); }
            }
        }

        renderPropertiesPanel();
    }
}

function onPointerUp(e) {
    if (draggedElement) draggedElement.style.opacity = "1";
    draggedElement = null;
    resizingHandle = null;
    rotationHandle = null;
    activeValueDragger = null;
}


function addNoteToLayout() {
    const nameInput = document.getElementById('new-note-name');
    let name = nameInput.value.trim();
    if (!name) return alert('Enter note name (e.g. G4)');
    
    if (!isValidNote(name) && !name.toLowerCase().includes('ding')) {
        return alert(`Invalid note name: "${name}". Please use a name like D3, F#4, Bb2, or include "Ding".`);
    }

    name = name.toUpperCase(); // Convert to uppercase after validation

    const type = document.getElementById('new-note-type').value;
    const sphereSelect = document.getElementById('new-note-sphere');
    
    const isDing = type === 'ding';
    const isBottom = sphereSelect.value === 'bottom';
    const noteKey = isDing ? `D:${name}` : name;

    const scale = dependencies.getCurrentScale();
    
    // Add to currentLayout
    currentLayout[noteKey] = {
        x: 250, y: 350,
        rx: isDing ? 43 : 36,
        ry: isDing ? 43 : 36,
        angle: 0,
        isDing, isBottom
    };

    // Also update the scale object in memory
    if (isDing) {
        if (!scale.top.includes(noteKey)) scale.top.push(noteKey);
    } else if (isBottom) {
        if (!scale.bottom[noteKey]) {
            // Pick logical parent (Ding or closest top note)
            scale.bottom[noteKey] = scale.top[0];
        }
    } else {
        if (!scale.top.includes(noteKey)) scale.top.push(noteKey);
    }

    selectedNotes = [ { name: noteKey, default: { x: 250, y: 350, rx: 36, ry: 36 } } ];
    nameInput.value = '';
    renderEditorSVG();
}

function copySelectedParams() {
    if (selectedNotes.length === 0) return;
    const sn = selectedNotes[0];
    const data = currentLayout[sn.name] || sn.default;
    copiedParams = {
        rx: data.rx,
        ry: data.ry,
        angle: data.angle || 0
    };
    
    // Visual feedback
    const btn = document.getElementById('btn-copy-params');
    if (btn) {
        const oldText = btn.innerText;
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = oldText, 1000);
    }

    // Re-render properties to update Paste button's disabled state
    renderPropertiesPanel();
}

function pasteParamsToSelection() {
    if (!copiedParams || selectedNotes.length === 0) return;
    
    selectedNotes.forEach(sn => {
        if (!currentLayout[sn.name]) {
            currentLayout[sn.name] = { ...sn.default };
        }
        currentLayout[sn.name].rx = copiedParams.rx;
        currentLayout[sn.name].ry = copiedParams.ry;
        currentLayout[sn.name].angle = copiedParams.angle;
    });
    
    renderEditorSVG();
    renderPropertiesPanel();
}

function cloneSelectedNotes() {
    if (selectedNotes.length === 0) return;
    
    const scale = scaleOnStart;
    const newSelection = [];
    
    const noteToMidi = (nm) => {
        const notes = { 'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11 };
        const m = nm.match(/^([A-G][#b]?)(\d*)$/i);
        if (!m) return 60;
        return (parseInt(m[2] || 4) + 1) * 12 + notes[m[1].toUpperCase()];
    };
    const midiToNote = (midi) => {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
        return notes[midi % 12] + (Math.floor(midi / 12) - 1);
    };

    selectedNotes.forEach(sn => {
        const originalData = currentLayout[sn.name] || sn.default;
        const isDing = !!originalData.isDing;
        const isBottom = !!originalData.isBottom;
        const baseName = sn.name.replace(/^D:/, '');
        
        let midi = noteToMidi(baseName);
        let newName = baseName;
        let attempt = 0;
        
        while (attempt < 48) {
            midi++;
            newName = midiToNote(midi);
            if (!currentLayout[newName] && !currentLayout[`D:${newName}`]) break;
            attempt++;
        }
        
        const newKey = isDing ? `D:${newName}` : newName;
        
        currentLayout[newKey] = {
            ...JSON.parse(JSON.stringify(originalData)),
            x: Math.min(CANVAS_SIZE - 20, originalData.x + 30),
            y: Math.min(CANVAS_SIZE - 20, originalData.y + 30)
        };
        
        if (isDing) {
            if (!scale.top.includes(newKey)) scale.top.push(newKey);
        } else if (isBottom) {
            const parent = scale.bottom[sn.name] || scale.top[0];
            scale.bottom[newKey] = parent;
        } else {
            if (!scale.top.includes(newKey)) scale.top.push(newKey);
        }
        
        newSelection.push({
            name: newKey,
            default: { ...currentLayout[newKey] }
        });
    });
    
    selectedNotes = newSelection;
    renderEditorSVG(); 
}

function handleNoteMetaUpdate(oldName, newName, sphere, isDing) {
    const scale = dependencies.getCurrentScale();
    const data = currentLayout[oldName];

    // 1. Handling Rename
    if (newName !== oldName) {
        if (currentLayout[newName]) {
            return alert(`Note "${newName}" already exists in layout!`);
        }
        currentLayout[newName] = { ...data };
        delete currentLayout[oldName];
        
        // Update scale structure
        if (scale.top.includes(oldName)) {
            scale.top = scale.top.map(n => n === oldName ? newName : n);
        }
        if (scale.bottom[oldName]) {
            const parent = scale.bottom[oldName];
            delete scale.bottom[oldName];
            scale.bottom[newName] = parent;
        }
    }

    // 2. Handling Sphere Move
    const finalName = newName !== oldName ? newName : oldName;
    const isCurrentlyTop = scale.top.includes(finalName);
    
    if (sphere === 'bottom' && isCurrentlyTop) {
        scale.top = scale.top.filter(n => n !== finalName);
        scale.bottom[finalName] = "C4"; // Default parent if moving to bottom
    } else if (sphere === 'top' && !isCurrentlyTop) {
        delete scale.bottom[finalName];
        scale.top.push(finalName);
    }

    // 3. Handling Type (Ding)
    // For now we just store it in layout data as a hint
    currentLayout[finalName].isDing = isDing;

    // 4. Refresh everything
    selectedNotes = selectedNotes.map(sn => sn.name === oldName ? { ...sn, name: finalName } : sn);
    renderEditorSVG();
    // renderPropertiesPanel is called inside renderEditorSVG
}

function deleteSelectedNotes() {
    if (selectedNotes.length === 0) return;
    const scale = dependencies.getCurrentScale();
    
    if (confirm(`Remove ${selectedNotes.length} note(s) from layout?`)) {
        selectedNotes.forEach(sn => {
            const name = sn.name;
            delete currentLayout[name];
            scale.top = scale.top.filter(n => n !== name);
            delete scale.bottom[name];
        });
        selectedNotes = [];
        renderEditorSVG();
    }
}

function getMousePos(svg, e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
}
