
let dependencies = {};
// { addToProgression }

export function initInspirations(deps) {
    dependencies = deps;
    renderInspirations();
}

const INSPIRATIONS = [
    { name: 'Basic Arp', notes: '(1 3 5 8)/1', repeats: 4 },
    { name: 'Waltz', notes: 'D (1 3 5) (1 3 5)', repeats: 4 }, // 3/4
    { name: 'Groove A', notes: 'K (1 3) t (2 4) K t', repeats: 4 },
    { name: 'Syncopation', notes: '1 - 3 - 5 - 2 -', repeats: 2 },
    { name: 'Alternating', notes: '(1 5) (2 6) (3 7) (4 8)', repeats: 2 },
    { name: 'Cascading', notes: '8 7 6 5 4 3 2 1', repeats: 1 },
    { name: 'Root Pulse', notes: '(D 1) 3 5 3 (D 1) 4 6 4', repeats: 2 }
];

function renderInspirations() {
    const container = document.getElementById('inspirations-list');
    if (!container) return;

    container.innerHTML = '';

    INSPIRATIONS.forEach(insp => {
        const div = document.createElement('div');
        div.className = 'inspiration-item glass-card-small';

        div.innerHTML = `
            <div class="insp-name">${insp.name}</div>
            <div class="insp-preview">${insp.notes}</div>
            <button class="icon-btn add-insp" title="Add to Progression">+</button>
        `;

        const addBtn = div.querySelector('.add-insp');
        addBtn.onclick = (e) => {
            e.stopPropagation();
            if (dependencies.addToProgression) {
                // We add as a Custom Chord with parsed text
                // We don't have specific note objects here, just text.
                // The Logic expects: addToProgression(chord, specificNotes, label, rawText)
                // If specificNotes is null, it tries to render from chord or needs to be parsed?
                // `progression.js` implementation: 
                // if (!chord) ... if (specificNotes) ... else customArp.
                // It doesn't seem to parse rawText automatically inside `addToProgression`.
                // It expects `specificNotes` (array of audio events).

                // So we must parse it here before calling add.
                // We need `parser` dependency for that?
                // Or `main.js` provides a wrapper `addFromText`?
                // Let's assume `dependencies.addFromText(name, text, repeats)` exists.

                if (dependencies.addFromText) {
                    dependencies.addFromText(insp.name, insp.notes, insp.repeats);
                }
            }
        };

        container.appendChild(div);
    });
}
