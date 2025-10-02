
const notesSharp = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const notesFlat = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const getNoteIndex = (note: string): number => {
    const sharpIndex = notesSharp.indexOf(note);
    if (sharpIndex !== -1) return sharpIndex;
    const flatIndex = notesFlat.indexOf(note);
    return flatIndex;
};

const transposeNote = (note: string, amount: number): string => {
    const root = note.substring(0, note.length === 1 || note[1] === '#' || note[1] === 'b' ? note.length : 1);
    const quality = note.substring(root.length);

    let normRoot = root;
    if (root.includes('b')) {
        const index = notesFlat.indexOf(root);
        if (index !== -1) normRoot = notesSharp[index];
    }
    
    const index = getNoteIndex(normRoot);
    if (index === -1) return note;

    const newIndex = (index + amount % 12 + 12) % 12;
    return `${notesSharp[newIndex]}${quality}`;
};

export const transpose = (text: string, amount: number): string => {
    if (amount === 0) return text;
    if (!text) return '';

    const chordRegex = /\b([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|M|m7|maj7|7|9|11|13|6|5|°|ø|\+)*)\b/g;
    
    try {
        return text.replace(chordRegex, (match) => {
            const rootNoteMatch = match.match(/^([A-G][#b]?)/);
            if (!rootNoteMatch) return match;
            
            const rootNote = rootNoteMatch[0];
            const chordQuality = match.substring(rootNote.length);
            
            let noteIndex = notesSharp.indexOf(rootNote);
            if (noteIndex === -1) {
                noteIndex = notesFlat.indexOf(rootNote);
            }
            if (noteIndex === -1) return match;

            const newNoteIndex = (noteIndex + amount + 12) % 12;

            // Prefer sharps, but could be more sophisticated
            const newRootNote = notesSharp[newNoteIndex];
            
            return newRootNote + chordQuality;
        });
    } catch (e) {
        console.error("Error transposing:", e);
        return text; // return original text on error
    }
};
