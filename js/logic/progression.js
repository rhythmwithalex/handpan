
import { playTone, playTak, getAudioContext, stopAllSounds, initAudio } from '../audio/engine.js';
import { getFrequencyForNoteName } from './chords.js';

let isProgressionPlaying = false;
let progressionTimeoutId = null;
let currentLoopId = null;
let currentPlayBtn = null;
let nextNoteTime = 0.0;
let globalTempo = 100;

let progressionState = {
    idx: 0,
    repeat: 0,
    loop: true,
    chords: []
};

// Callbacks
let onStepCallback = null;
let onStopCallback = null;
let onNoteScheduleCallback = null;

export function setProgressionCallbacks(onStep, onStop, onNoteSchedule) {
    onStepCallback = onStep;
    onStopCallback = onStop;
    onNoteScheduleCallback = onNoteSchedule;
}

export function setTempo(bpm) {
    globalTempo = bpm;
}

export function getTempo() {
    return globalTempo;
}

export function isPlaying() {
    return isProgressionPlaying;
}

export async function startProgression(chords, settings = {}) {
    if (isProgressionPlaying) stopProgression();

    // Parse chords into audio events if they aren't already
    // chords = [{ notes: [NoteObjects], localRepeats: N, element: DOM }]
    // We need to ensure 'notes' are parsed events with frequency.
    // The 'notes' from getProgressionChords are just data objects (name, octave, type).
    // They MIGHT NOT have freq if loaded from JSON without re-parsing?
    // Parser.js adds freq. JSON stringify/parse preserves freq.
    // So 'notes' should be ready to play IF they came from parser.
    // However, we should double check or re-calculate freq if missing.
    // But `scheduleSequence` calls `playTone(evt.freq ...)` 
    // Let's trust they have freq.

    // BUT `scheduleSequence` takes `notes` and plays them.
    // The `chords` array items have `.notes`.
    // So we just pass the list.

    progressionState.chords = chords;
    progressionState.idx = 0;
    progressionState.repeat = 0;
    progressionState.loop = (settings.loop !== undefined) ? settings.loop : true;
    isProgressionPlaying = true;

    // Ensure Audio Context is ready
    initAudio();
    const audioCtx = getAudioContext();
    // console.log('[Progression] Starting... Ctx:', audioCtx?.state, 'Time:', audioCtx?.currentTime);

    if (audioCtx) {
        if (audioCtx.state === 'suspended') {
            // console.log('[Progression] Resuming suspended context');
            try {
                await audioCtx.resume();
            } catch (e) {
                console.warn('[Progression] Audio resume failed', e);
            }
        }

        // If user stopped during resume, abort
        if (!isProgressionPlaying) return;

        nextNoteTime = audioCtx.currentTime + 0.05;
        scheduleProgressionStep();
    } else {
        console.error('[Progression] No AudioContext!');
    }
}

export function stopProgression() {
    // console.log('[Progression] Stopping');
    isProgressionPlaying = false;
    clearTimeout(progressionTimeoutId);
    clearTimeout(currentLoopId);
    stopAllSounds();

    if (onStopCallback) onStopCallback();
}

export function toggleProgression(chords) {
    if (isProgressionPlaying) {
        stopProgression();
        return false;
    } else {
        startProgression(chords);
        return true;
    }
}

function scheduleProgressionStep() {
    if (!isProgressionPlaying) return;

    if (progressionState.chords.length === 0) {
        stopProgression();
        return;
    }

    // Wrap around or Stop
    if (progressionState.idx >= progressionState.chords.length) {
        if (!progressionState.loop) {
            stopProgression();
            return;
        }
        progressionState.idx = 0;
    }

    const chordData = progressionState.chords[progressionState.idx];

    // Notify UI
    if (onStepCallback) {
        onStepCallback(progressionState.idx, chordData);
    }

    // Scheduling
    const currentChord = chordData; // Object with .notes, .localRepeats, etc.
    // We assume chordData has 'notes' (array of objects with note info) or is a parsed structure

    // We need to know how long this step lasts to schedule the NEXT step.
    // The previous logic was: playArpeggio returns duration? 
    // No, playArpeggio calculates sequence length.
    // We need that length here to increment nextNoteTime.

    // We need to parse the "rhythm" or "notes" to determine duration.
    // In `script.js`:
    // const notes = chordData.notes; // This was the parsed audio events array!
    // Wait, in `script.js`, `startProgression` (specifically `toggleProgressionPlayback`) 
    // gathered `progressionItems`.
    // It parsed the DOM items to get `notes`.
    // We need to ensure `chords` passed to `startProgression` are PRE-PARSED into audio events.

    // Logic from script.js lines 810+ (runSequence) seems to handle the loop for *one* chord/card.
    // But `scheduleProgressionStep` handles the switching between cards.

    // Let's look at `script.js` line 699: `const notes = chordData.notes;`
    // And then line 710 calls `runSequence(notes, null, ...)`? 
    // No, line 704 `const totalDuration = runSequence(...)`.
    // Wait, `script.js` snippet 660-900 shows `scheduleProgressionStep` calling `runSequence`.
    // `runSequence` schedules all notes for that card and returns the total time.

    const audioCtx = getAudioContext();
    const notes = currentChord.notes || []; // Fixed: use .notes from dataset
    const repeats = currentChord.localRepeats || 1;

    if (notes.length === 0) {
        console.warn('[Progression] No notes for this chord!');
    }

    // Calculate distinct duration of one loop
    // In `runSequence`, it loops `repeats` times.
    // So we just need to schedule `runSequence`.

    // Refactoring `runSequence` to be inside `progression.js` or helper.
    // It schedules notes starting at `nextNoteTime`.

    const sequenceDuration = scheduleSequence(notes, nextNoteTime, repeats);

    // Advance time
    nextNoteTime += sequenceDuration;

    // Advance index
    progressionState.idx++;

    // Schedule next step check
    const delay = nextNoteTime - audioCtx.currentTime;
    // We want to wake up slightly before the next note time to schedule it.
    // But `setTimeout` is imprecise.
    // We effectively use "lookahead" logic.
    // `scheduleProgressionStep` should probably be called *recursively* via setTimeout.

    progressionTimeoutId = setTimeout(scheduleProgressionStep, Math.max(10, (delay - 0.1) * 1000));
}

function scheduleSequence(notes, startTime, repeats) {
    // Calculates total duration and schedules notes
    const beatDuration = 60 / globalTempo;
    const eighthNote = beatDuration / 2;

    // 1. Calculate the duration of ONE complete sequence loop
    let singleSequenceDuration = 0;
    notes.forEach(evt => {
        const stepDuration = eighthNote * (evt.duration || 1);
        singleSequenceDuration += stepDuration;
    });

    // 2. Schedule events for N repeats
    for (let r = 0; r < repeats; r++) {
        const loopStart = startTime + (r * singleSequenceDuration);

        let localTime = 0;
        notes.forEach(evt => {
            const absTime = loopStart + localTime;
            const dur = eighthNote * (evt.duration || 1);

            if (evt.type === 'rest') {
                // do nothing for audio, but time advances
            } else if (evt.type === 'percussion') {
                const isAlt = evt.hand === 'T';
                playTak(absTime, isAlt, evt.isGhost);
            } else if (evt.isGroup) {
                // Polyphonic
                evt.notes.forEach(n => {
                    if (n.type === 'percussion') {
                        const isAlt = n.hand === 'T';
                        playTak(absTime, isAlt, n.isGhost);
                    } else {
                        const f = n.freq || getFrequencyForNoteName(`${n.note}${n.octave}`);
                        const fullNoteName = `${n.note}${n.octave}`;
                        if (f) {
                            // Play for fixed 3.0s (Handpan sustain)
                            playTone(f, fullNoteName, 3.0, absTime);

                            // Schedule Visuals
                            if (onNoteScheduleCallback) {
                                onNoteScheduleCallback(fullNoteName, absTime);
                            }
                        } else console.error('[Progression] Group freq failed', n);
                    }
                });
            } else if (evt.note) {
                // Monophonic Note
                const noteName = `${evt.note}${evt.octave}`;
                const f = evt.freq || getFrequencyForNoteName(noteName);

                if (f) {
                    playTone(f, noteName, 3.0, absTime);
                    // Schedule Visuals
                    if (onNoteScheduleCallback) {
                        onNoteScheduleCallback(noteName, absTime);
                    }
                } else {
                    console.error('[Progression] Freq failed for', noteName, evt);
                }
            }
            // Advance time by THIS step's duration
            localTime += dur;
        });
    }

    return repeats * singleSequenceDuration;
}

// We need a parser! `parseRhythmString` logic is crucial.
// I should put `parseRhythmString` in `js/logic/chords.js` or `js/logic/parser.js`.
// Or just keep it in `progression.js` if it's only used here.
// But the Editor needs it to validate? 
// The Editor just saves text.
// Processing happens at Play time.
// So `progression.js` can have a `parse` helper.

// Let's copy `parseRhythmString` (approx logic) 
// but wait, `script.js` `runSequence` uses `notes` which are ALREADY PARSED objects?
// Line 699: `const notes = chordData.notes;`
// In `addToProgression`, `notes` attribute of the element is set.
// It seems `notes` is the ARRAY OF NOTE OBJECTS (from `currentScale`).
// BUT user can edit the text!
// The `chordData` logic in `scheduleProgressionStep` (684) pulls from `pState.chords`.
// `pState.chords` is populated in `toggleProgressionPlayback` (lines 750-790).
// It maps `progressionItems`:
// `const chords = progressionItems.map(item => { ... return { notes: parsedEvents, ... } })`
// So the parsing happens BEFORE start.
// I need `parseRhythmSequence` exported from somewhere to be used by `main.js` to clear data for `startProgression`.

// I will put `parseRhythmSequence` in `js/logic/chords.js` or `utils.js`.
// It depends on `currentScale` notes?
// `script.js` `parseNoteToken` uses `handpanNotes`.
// So it needs `handpanNotes` passed in.

