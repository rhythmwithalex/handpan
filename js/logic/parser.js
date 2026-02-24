
import { getFrequencyForNoteName } from './chords.js';

export function parseRhythmString(text, currentScale) {
    const result = [];
    // Tokenize: Match groups like (A B)/1.5 or individual words
    // Regex explanation:
    // \([^\)]+\)  -> Match (...)
    // \/          -> Match /
    // [\d.,]+     -> Match numbers with dots or commas (e.g. 1.5, 2, 3,5)
    const regex = /(\([^\)]+\)\/[\d.,]+|[^\s]+)/g;
    const tokens = text.match(regex) || [];

    tokens.forEach(token => {
        // Check for group with divisor
        // Match group content (1) and divisor (2)
        const groupMatch = token.match(/^\(([^\)]+)\)\/([\d.,]+)$/);

        if (groupMatch) {
            const content = groupMatch[1];
            // Replace comma with dot for parseFloat
            const rawDivisor = groupMatch[2].replace(',', '.');
            const divisor = parseFloat(rawDivisor);

            // Safety check for zero or NaN
            const safeDivisor = (divisor && divisor > 0) ? divisor : 1;

            const subTokens = content.split(/\s+/).filter(t => t.trim());
            const multiplier = 1 / safeDivisor;

            subTokens.forEach(sub => {
                const event = parseNoteToken(sub, currentScale);
                if (event) {
                    // event might be an array if it returned a group? 
                    // parseNoteToken returns a single object (isGroup:true) or null currently.
                    event.duration = multiplier;
                    result.push(event);
                }
            });
        } else {
            // Single note or group Note1|Note2
            const event = parseNoteToken(token, currentScale);
            if (event) {
                event.duration = 1;
                result.push(event);
            }
        }
    });
    return result;
}

function parseNoteToken(token, currentScale) {
    // Support Note1|Note2|Note3 or special tokens like K, T, k, t
    const parts = token.split('|');
    const noteGroup = [];

    parts.forEach(p => {
        const raw = p.trim();
        const clean = raw.toUpperCase();

        if (clean === 'K' || clean === 'T') {
            noteGroup.push({
                type: 'percussion',
                hand: clean, // K or T
                isGhost: raw === 'k' || raw === 't'
            });
            return;
        }

        // Rest logic
        if (clean === '-') {
            noteGroup.push({
                type: 'rest',
                duration: 1
            });
            return;
        }

        // Check for Number Notation or Ding
        const numberMatch = raw.match(/^(\d+|D)$/i);
        if (numberMatch) {
            const symbol = numberMatch[1].toUpperCase();
            const sorted = getSortedScaleNotes(currentScale);

            if (symbol === 'D' || symbol === '0') {
                // Main Ding (lowest note)
                if (sorted.dings.length > 0) {
                    sorted.dings.sort((a, b) => a.freq - b.freq);
                    noteGroup.push(sorted.dings[0]);
                }
            } else {
                // Tone Circle Number (1-based index)
                const idx = parseInt(symbol) - 1;
                if (idx >= 0 && idx < sorted.toneCircle.length) {
                    noteGroup.push(sorted.toneCircle[idx]);
                }
            }
            return;
        }

        const match = raw.match(/^([A-G][#b]?)(\d)$/i);
        if (match) {
            noteGroup.push({
                note: match[1].toUpperCase(),
                octave: parseInt(match[2]),
                type: 'note', // Explicit type
                freq: getFrequencyForNoteName(match[0])
            });
        }
    });

    if (noteGroup.length > 0) {
        return {
            isGroup: true,
            notes: noteGroup
        };
    }
    return null;
}

function getSortedScaleNotes(currentScale) {
    // Collect all notes from current scale
    const allNotes = [];
    const topNotes = currentScale.top || [];
    const bottomNotes = currentScale.bottom ? Object.keys(currentScale.bottom) : [];

    // Helper to parse note string "E3" or "D:F#3" -> {note, octave, freq, name, isDing}
    const parse = (nStr) => {
        let isExplicitDing = false;
        let cleanStr = nStr;

        if (cleanStr.startsWith('D:')) {
            isExplicitDing = true;
            cleanStr = cleanStr.substring(2);
        }

        const m = cleanStr.match(/^([A-G][#b]?)(\d)$/);
        if (!m) return null;
        return {
            note: m[1],
            octave: parseInt(m[2]),
            freq: getFrequencyForNoteName(cleanStr),
            name: cleanStr,
            isDing: isExplicitDing
        };
    };

    [...topNotes, ...bottomNotes].forEach(n => {
        const p = parse(n);
        if (p) allNotes.push(p);
    });

    // Sort by frequency (pitch)
    allNotes.sort((a, b) => a.freq - b.freq);

    if (allNotes.length === 0) return { dings: [], toneCircle: [] };

    // Identify Dings
    const mainDingNameRaw = currentScale.top[0];
    const mainDingObj = allNotes.find(n => n.name === mainDingNameRaw || n.name === mainDingNameRaw.replace('D:', ''));

    let dings = [];
    if (mainDingObj) {
        dings.push(mainDingObj);
    }

    // Find other notes marked as Ding (isDing = true), EXCLUDING the main ding we just added
    const otherDings = allNotes.filter(n => n.isDing && n !== mainDingObj);
    otherDings.sort((a, b) => a.freq - b.freq);
    dings.push(...otherDings);

    // Tone Circle is everything else
    let toneCircle = allNotes.filter(n => !dings.includes(n));
    toneCircle.sort((a, b) => a.freq - b.freq);

    return { dings, toneCircle };
}
