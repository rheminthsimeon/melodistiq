import { MidiNote } from '../types';

const noteToMidiMap: { [key: string]: number } = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
};

const getChordTones = (rootMidi: number, quality: string): number[] => {
    if (quality.includes('sus4')) {
        // root, perfect fourth, perfect fifth
        return [rootMidi, rootMidi + 5, rootMidi + 7];
    }
    if (quality.includes('sus2')) {
        // root, major second, perfect fifth
        return [rootMidi, rootMidi + 2, rootMidi + 7];
    }

    const tones = [rootMidi, rootMidi + 4, rootMidi + 7]; // Major triad by default
    if (quality.startsWith('m') && !quality.startsWith('maj')) { // minor
        tones[1] = rootMidi + 3;
    }
    // This is a simplified logic, can be expanded for 7ths, dim, aug, etc.
    return tones;
};

const chordToMidiNotes = (chord: string, octave: number = 4): number[] => {
    const rootMatch = chord.match(/^[A-G][#b]?/);
    if (!rootMatch) return [];
    const root = rootMatch[0];
    const quality = chord.substring(root.length);
    const rootMidiVal = noteToMidiMap[root];
    if (rootMidiVal === undefined) return [];
    const rootMidi = rootMidiVal + 12 * octave;
    return getChordTones(rootMidi, quality);
};

const noteStringToMidi = (noteString: string): number | null => {
    if (noteString.toLowerCase() === 'rest') return null;
    const match = noteString.match(/^([A-G][#b]?)(\d+)$/);
    if (!match) return null;
    const [, noteName, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteVal = noteToMidiMap[noteName];
    if (noteVal === undefined) return null;
    return noteVal + 12 * (octave + 1); // MIDI octave convention
};


const writeVariableLength = (value: number): number[] => {
    let buffer: number[] = [];
    buffer.unshift(value & 0x7F);
    while (value >>= 7) {
        buffer.unshift((value & 0x7F) | 0x80);
    }
    return buffer;
};

export const generateChordMidi = (chordData: string): Blob => {
    const chordRegex = /\b([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M|m7|maj7|7|9|11|13|6|5|°|ø|\+)*)\b/g;
    const chords = chordData.match(chordRegex) || [];

    const header = [
        0x4d, 0x54, 0x68, 0x64, // MThd
        0x00, 0x00, 0x00, 0x06, // chunk length
        0x00, 0x00, // format 0
        0x00, 0x01, // one track
        0x01, 0xe0, // 480 ticks per quarter
    ];

    let track = [
        0x4d, 0x54, 0x72, 0x6b, // MTrk
        0x00, 0x00, 0x00, 0x00, // chunk length (placeholder)
    ];

    const noteDuration = 480 * 4; // whole note in ticks, for one chord per bar

    chords.forEach(chord => {
        const notes = chordToMidiNotes(chord);
        if (notes.length === 0) return;
        
        notes.forEach(note => {
            track.push(0x00, 0x90, note, 100); // delta, note on, note, velocity
        });

        notes.forEach((note, index) => {
            const delta = index === 0 ? noteDuration : 0;
            track.push(...writeVariableLength(delta), 0x80, note, 64);
        });
    });

    track.push(0x01, 0xFF, 0x2F, 0x00); // End of track

    const trackLength = track.length - 8;
    track[4] = (trackLength >> 24) & 0xFF;
    track[5] = (trackLength >> 16) & 0xFF;
    track[6] = (trackLength >> 8) & 0xFF;
    track[7] = trackLength & 0xFF;

    const midiData = new Uint8Array([...header, ...track]);
    return new Blob([midiData], { type: 'audio/midi' });
};

type MidiEvent = { tick: number; command: number; note: number; velocity: number };

export const generateSampleMidi = (chordData: string, bpm: number, genre: string, mood: string): Blob => {
    const TPB = 480; // Ticks per beat
    const chordRegex = /\b([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M|m7|maj7|7|9|11|13|6|5|°|ø|\+)*)\b/g;
    const chords = chordData.match(chordRegex) || [];

    const header = [
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
        (TPB >> 8) & 0xFF, TPB & 0xFF
    ];
    
    let track = [
        0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x00, // MTrk + length placeholder
    ];
    
    const microSecondsPerBeat = Math.round(60000000 / bpm);
    track.push(0x00, 0xFF, 0x51, 0x03);
    track.push((microSecondsPerBeat >> 16) & 0xFF);
    track.push((microSecondsPerBeat >> 8) & 0xFF);
    track.push(microSecondsPerBeat & 0xFF);
    
    let midiEvents: MidiEvent[] = [];
    let currentTimeInBeats = 0;
    const barDuration = 4; // Assume 4/4 time, one chord per bar

    const lowerMood = mood.toLowerCase();
    const lowerGenre = genre.toLowerCase();

    let patternType: 'arpeggio' | 'syncopated' | 'block' = 'block';

    if (['sad', 'melancholic', 'romantic', 'pensive', 'somber'].some(m => lowerMood.includes(m))) {
        patternType = 'arpeggio';
    } else if (['pop', 'rock'].includes(lowerGenre) || ['happy', 'energetic', 'motivational', 'upbeat'].some(m => lowerMood.includes(m))) {
        patternType = 'syncopated';
    }

    chords.forEach(chordStr => {
        const chordTones = chordToMidiNotes(chordStr, 4);
        if (chordTones.length === 0) {
            currentTimeInBeats += barDuration;
            return;
        }

        switch (patternType) {
            case 'arpeggio': { // Broken chords for ballads
                const [root, third, fifth] = chordTones;
                const notesToPlay = [root, third, fifth, third];
                notesToPlay.forEach((note, i) => {
                    if (note === undefined) return;
                    const startTick = Math.round((currentTimeInBeats + i) * TPB);
                    const endTick = startTick + Math.round(TPB * 0.9); // Quarter note with small gap
                    midiEvents.push({ tick: startTick, command: 0x90, note, velocity: 80 + i * 5 });
                    midiEvents.push({ tick: endTick, command: 0x80, note, velocity: 64 });
                });
                break;
            }
            case 'syncopated': { // Pop/Rock syncopated rhythm
                const bassNote = chordToMidiNotes(chordStr, 2)[0]; // Bass note 2 octaves down
                if (bassNote !== undefined) {
                    const bassStart = Math.round(currentTimeInBeats * TPB);
                    const bassEnd = Math.round((currentTimeInBeats + barDuration) * TPB) -1;
                    midiEvents.push({ tick: bassStart, command: 0x90, note: bassNote, velocity: 100 });
                    midiEvents.push({ tick: bassEnd, command: 0x80, note: bassNote, velocity: 64 });
                }
                
                const stabs = [1.5, 2.5, 3.5];
                stabs.forEach(beat => {
                    const stabStart = Math.round((currentTimeInBeats + beat) * TPB);
                    const stabEnd = stabStart + Math.round(TPB * 0.4);
                    chordTones.forEach(note => {
                        midiEvents.push({ tick: stabStart, command: 0x90, note, velocity: 90 });
                        midiEvents.push({ tick: stabEnd, command: 0x80, note, velocity: 64 });
                    });
                });
                break;
            }
            case 'block':
            default: { // Simple block chords, same as original
                const startTick = Math.round(currentTimeInBeats * TPB);
                const endTick = startTick + Math.round(barDuration * TPB);
                chordTones.forEach(note => {
                     midiEvents.push({ tick: startTick, command: 0x90, note, velocity: 100 });
                     midiEvents.push({ tick: endTick, command: 0x80, note, velocity: 64 });
                });
                break;
            }
        }
        currentTimeInBeats += barDuration;
    });
    
    midiEvents.sort((a, b) => a.tick - b.tick);

    let lastTick = 0;
    midiEvents.forEach(event => {
        const deltaTick = event.tick - lastTick;
        track.push(...writeVariableLength(deltaTick));
        track.push(event.command, event.note, event.velocity);
        lastTick = event.tick;
    });

    track.push(0x01, 0xFF, 0x2F, 0x00); // End of track

    const trackLength = track.length - 8;
    track[4] = (trackLength >> 24) & 0xFF;
    track[5] = (trackLength >> 16) & 0xFF;
    track[6] = (trackLength >> 8) & 0xFF;
    track[7] = trackLength & 0xFF;

    const midiData = new Uint8Array([...header, ...track]);
    return new Blob([midiData], { type: 'audio/midi' });
};


export const generateTuneMidi = (notes: MidiNote[], bpm: number): Blob => {
    const TPB = 480; // Ticks per beat

    const header = [
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01,
        (TPB >> 8) & 0xFF, TPB & 0xFF
    ];
    
    let track = [
        0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x00, // MTrk + length placeholder
    ];
    
    const microSecondsPerBeat = Math.round(60000000 / bpm);
    track.push(0x00, 0xFF, 0x51, 0x03);
    track.push((microSecondsPerBeat >> 16) & 0xFF);
    track.push((microSecondsPerBeat >> 8) & 0xFF);
    track.push(microSecondsPerBeat & 0xFF);

    let midiEvents: { tick: number; command: number; note: number; velocity: number }[] = [];
    notes.forEach(noteInfo => {
        const midiNote = noteStringToMidi(noteInfo.note);
        if (midiNote !== null) {
            const startTick = Math.round(noteInfo.time * TPB);
            const endTick = startTick + Math.round(noteInfo.duration * TPB);
            midiEvents.push({ tick: startTick, command: 0x90, note: midiNote, velocity: 100 });
            midiEvents.push({ tick: endTick, command: 0x80, note: midiNote, velocity: 64 });
        }
    });

    midiEvents.sort((a, b) => a.tick - b.tick);

    let lastTick = 0;
    midiEvents.forEach(event => {
        const deltaTick = event.tick - lastTick;
        track.push(...writeVariableLength(deltaTick));
        track.push(event.command, event.note, event.velocity);
        lastTick = event.tick;
    });

    track.push(0x01, 0xFF, 0x2F, 0x00); // End of track

    const trackLength = track.length - 8;
    track[4] = (trackLength >> 24) & 0xFF;
    track[5] = (trackLength >> 16) & 0xFF;
    track[6] = (trackLength >> 8) & 0xFF;
    track[7] = trackLength & 0xFF;

    const midiData = new Uint8Array([...header, ...track]);
    return new Blob([midiData], { type: 'audio/midi' });
};