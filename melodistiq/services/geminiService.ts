import { GoogleGenAI, Type } from "@google/genai";
import { SongSettings, MidiNote } from '../types';
import { chordProgressions } from '../data/musicTheoryProgressions';
import { getMoodCategory, mapEmotionToMoodCategory } from '../utils/mood';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateLyrics = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Generate song lyrics based on the following prompt: "${prompt}". Make them creative and evocative.`,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating lyrics:", error);
        return "Sorry, I couldn't generate lyrics at the moment. Please try again.";
    }
};

export const generateChords = async (lyrics: string, settings: SongSettings): Promise<string> => {
    try {
        const hasLyrics = lyrics.trim().length > 0;
        let finalMood = settings.mood;
        let moodCategory: string;

        // Step 1: Determine mood from lyrics if set to 'any'
        if (settings.mood === 'any' && hasLyrics) {
            const emotionPrompt = `Analyze the following lyrics and classify them into one of these seven emotions: anger, disgust, fear, joy, neutral, sadness, surprise. Respond with ONLY the single emotion word in lowercase.

Lyrics:
---
${lyrics}
---`;
            const emotionResponse = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: emotionPrompt,
            });
            const detectedEmotion = emotionResponse.text.trim();
            moodCategory = mapEmotionToMoodCategory(detectedEmotion);
            finalMood = moodCategory; // Use the mapped category for both filtering and the final prompt
        } else {
            moodCategory = getMoodCategory(settings.mood);
        }
        
        let pathOptions: { genre: string; key: 'Major' | 'Minor'; complexity: string[] }[] = [];

        // Step 2: Determine progression filtering criteria based on rules
        switch (moodCategory) {
            case 'Romantic / Happy':
                pathOptions = [
                    { genre: 'Pop', key: 'Major', complexity: ['Easy'] },
                    { genre: 'Blues', key: 'Major', complexity: ['Easy', 'Medium'] },
                    { genre: 'Jazz', key: 'Major', complexity: ['Easy', 'Medium', 'Complex'] },
                ];
                break;
            case 'Motivational / Energetic':
                 pathOptions = [
                    { genre: 'Rock', key: 'Minor', complexity: ['Easy', 'Medium'] }, 
                    { genre: 'Rock', key: 'Major', complexity: ['Easy', 'Medium'] }, 
                    { genre: 'Pop', key: 'Minor', complexity: ['Easy'] }
                ];
                break;
            case 'Lust / Disgust':
                 pathOptions = [
                    { genre: 'Jazz', key: 'Minor', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Pop', key: 'Minor', complexity: ['Medium', 'Complex'] }
                ];
                break;
            case 'Sad':
                 pathOptions = [
                    { genre: 'Pop', key: 'Minor', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Blues', key: 'Major', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Blues', key: 'Minor', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Jazz', key: 'Major', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Jazz', key: 'Minor', complexity: ['Easy', 'Medium', 'Complex'] }, 
                    { genre: 'Rock', key: 'Minor', complexity: ['Easy', 'Medium', 'Complex'] }
                ];
                break;
            default: // 'Others' or no category
                pathOptions = chordProgressions.reduce((acc, p) => {
                    let entry = acc.find(e => e.genre === p.genre && e.key === p.key);
                    if (!entry) {
                        entry = { genre: p.genre, key: p.key, complexity: [] };
                        acc.push(entry);
                    }
                    if (!entry.complexity.includes(p.chordComplexity)) {
                        entry.complexity.push(p.chordComplexity);
                    }
                    return acc;
                }, [] as { genre: string; key: 'Major' | 'Minor'; complexity: string[] }[]);
                break;
        }
        
        // Filter paths based on user settings
        let finalPathOptions = pathOptions;
        if (settings.genre !== 'any') {
            finalPathOptions = finalPathOptions.filter(p => p.genre.toLowerCase() === settings.genre.toLowerCase());
        }
        if (settings.key !== 'any') {
            const key = settings.key === 'major' ? 'Major' : 'Minor';
            finalPathOptions = finalPathOptions.filter(p => p.key === key);
        }

        if (finalPathOptions.length === 0) { // Fallback if user settings are too restrictive
           finalPathOptions = pathOptions;
        }

        const chosenPath = finalPathOptions[Math.floor(Math.random() * finalPathOptions.length)];
        const chosenGenre = chosenPath.genre;

        let complexitiesToUse = chosenPath.complexity.map(c => c); // Clone
        if (settings.chordComplexity !== 'any' && settings.chordComplexity !== 'randomize') {
            if (complexitiesToUse.map(c => c.toLowerCase()).includes(settings.chordComplexity.toLowerCase())) {
                complexitiesToUse = [settings.chordComplexity];
            }
        }

        // Step 3: Filter progressions from data
        const complexitiesToUseLower = complexitiesToUse.map(c => c.toLowerCase());
        let availableProgressions = chordProgressions.filter(p =>
            p.genre.toLowerCase() === chosenPath.genre.toLowerCase() &&
            p.key.toLowerCase() === chosenPath.key.toLowerCase() &&
            (settings.chordComplexity === 'randomize' || complexitiesToUseLower.includes(p.chordComplexity.toLowerCase()))
        );

        if (availableProgressions.length === 0) {
            return "Sorry, I couldn't find any matching chord progressions for your settings. Please try different options.";
        }

        // Step 4: Select progressions for each part
        const getRandomProgression = (part: 'stanza' | 'prechorus' | 'chorus' | 'bridge') => {
            const partProgressions = availableProgressions.filter(p => p[part]);
            if (partProgressions.length === 0) return availableProgressions[Math.floor(Math.random() * availableProgressions.length)].chorus; // fallback to chorus
            return partProgressions[Math.floor(Math.random() * partProgressions.length)][part];
        };
        
        const progressionParts: { partName: string; progression: string }[] = [];
        const addPart = (partName: string, countStr: string, progressionType: 'stanza' | 'prechorus' | 'chorus' | 'bridge') => {
            let count = 0;
            if (countStr === 'any') {
                if (progressionType === 'stanza') count = 2;
                else if (progressionType === 'chorus') count = 3;
                else if (progressionType === 'prechorus') count = 0; // Don't add prechorus by default
                else count = 1;
            } else {
                count = parseInt(countStr, 10);
            }
            
            for (let i = 1; i <= count; i++) {
                progressionParts.push({
                    partName: `${partName} ${count > 1 ? i : ''}`.trim(),
                    progression: getRandomProgression(progressionType)
                });
            }
        };

        addPart('Verse', settings.stanza, 'stanza');
        addPart('Pre-Chorus', settings.preChorus, 'prechorus');
        addPart('Chorus', settings.chorus, 'chorus');
        addPart('Bridge', settings.bridge, 'bridge');
        
        if (progressionParts.length === 0) {
             progressionParts.push({ partName: 'Verse', progression: getRandomProgression('stanza') });
             progressionParts.push({ partName: 'Chorus', progression: getRandomProgression('chorus') });
        }

        const finalProgressionText = progressionParts.map(p => `${p.partName}: ${p.progression}`).join('\n');
        
        // Step 5: Build final prompt for Gemini to realize the chords
        let prompt = `You are a music theory expert. Your task is to generate a chord progression based on Roman numerals.
        
Follow these constraints:
- Key Type: ${chosenPath.key}
- Key: ${settings.key === 'any' ? `Choose a suitable ${chosenPath.key} key.` : settings.key}
- BPM: Approximately ${settings.bpm === 'any' || !settings.bpm ? 'Choose a suitable BPM.' : settings.bpm}
- Mood: ${finalMood === 'any' ? (hasLyrics ? 'Based on the lyrics' : 'Creative and interesting') : finalMood}

The Roman numeral progression is:
${finalProgressionText}

Please convert these Roman numerals into concrete chords in the chosen key.
`;
        if (hasLyrics) {
            prompt += `
The chords should fit the following lyrics:
---
${lyrics}
---
`;
        }
        
        prompt += `
Output Format Rules:
1. The VERY FIRST line MUST be the scale, formatted as: "Scale: [key] [scale type]". (e.g., "Scale: C Major")
2. The SECOND line MUST be the BPM, formatted as: "BPM: [number]". (e.g., "BPM: 120")
3. The THIRD line MUST be the mood, formatted as: "Mood: [mood]". (e.g., "Mood: ${finalMood}")
4. The FOURTH line MUST be the genre, formatted as: "Genre: [genre]". It MUST be one of: Rock, Pop, Blues, Jazz. For this song, the genre is ${chosenGenre}, so your output for this line must be "Genre: ${chosenGenre}".
5. DO NOT include any other text before these four lines.
`;

        if (hasLyrics) {
            let barsPerLineInstruction = `Distribute the chords naturally over the lyrics, typically 2 to 4 chords per line, depending on phrasing.`;
            const barsPerLine = parseInt(settings.barsPerLine, 10);
        
            if (!isNaN(barsPerLine) && barsPerLine > 0) {
                if (barsPerLine === 1) {
                    barsPerLineInstruction = `Place exactly one chord above each line of lyrics. Cycle through the progression, one chord per line.`;
                } else {
                    barsPerLineInstruction = `Place exactly ${barsPerLine} chords, evenly spaced, above each line of lyrics. Cycle through the progression, using ${barsPerLine} chords for each line.`;
                }
            }

            prompt += `6. After the scale, BPM, mood, and genre lines, provide the lyrics with chord names above the words.
7. Do NOT include section labels like [Verse].
8. **Chord Placement:** ${barsPerLineInstruction}
Example (placing 2 chords per line):
Scale: G Major
BPM: 128
Mood: Joyful
Genre: Pop
      G        D
These are the lyrics
     Em        C
for my amazing song.`;
        } else { // No lyrics
            prompt += `6. After the scale, BPM, mood, and genre lines, provide a chord progression for the specified structure.
7. List chords for each section. Use the section labels from the Roman numeral progression provided above.
Example:
Scale: E Minor
BPM: 90
Mood: Melancholic
Genre: Rock
Verse 1: Em - C - G - D
Chorus: G - D - Em - C`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error generating chords:", error);
        return "Sorry, I couldn't generate chords at the moment. Please try again.";
    }
};

export const generateTuneMidiData = async (lyrics: string, chordsWithLyrics: string, scale: string): Promise<string> => {
    try {
        const prompt = `You are a music composition expert. Your task is to generate a vocal melody for the provided lyrics that fits the accompanying chord progression and scale.

**Instructions:**
1. Create a simple, singable, and musically pleasant melody for the lyrics.
2. The melody should align with the specified chords and scale.
3. Output a JSON array of note objects. Each object must have three properties:
    - "note": The musical note in scientific pitch notation (e.g., "C4", "F#5"). Use "rest" for silences.
    - "time": The start time of the note in beats, as a number, from the beginning of the song.
    - "duration": The duration of the note in beats, as a number.

**Musical Context:**
-   **Scale:** ${scale}
-   **Lyrics with Chords:**
    \`\`\`
    ${chordsWithLyrics}
    \`\`\`
-   **Plain Lyrics:**
    \`\`\`
    ${lyrics}
    \`\`\`

**Output Format:**
Respond with ONLY the raw JSON array. Do not include markdown formatting or any other text.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            note: { type: Type.STRING, description: "The musical note (e.g., 'C4', 'F#5') or 'rest'." },
                            time: { type: Type.NUMBER, description: "The start time of the note in beats." },
                            duration: { type: Type.NUMBER, description: "The duration of the note in beats." },
                        },
                        required: ["note", "time", "duration"],
                    },
                },
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error generating tune data:", error);
        return "[]";
    }
};

export const detectChordsFromFile = async (
    fileData: string,
    mimeType: string
): Promise<string> => {
    try {
        // Convert base64 to Blob (so we can send as FormData)
        const byteCharacters = atob(fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const fileBlob = new Blob([byteArray], { type: mimeType });

        const formData = new FormData();
        formData.append("file", fileBlob, "song." + mimeType.split("/")[1]);

        const response = await fetch("https://api.klang.io/analyze", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.KLANGIO_API_KEY}`, // put your API key in .env
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Klangio API error: ${response.statusText}`);
        }

        const result = await response.json();

        // Assuming Klangio returns JSON with scale + chords
        // (you’ll need to check their actual field names in docs)
        const scale = result.key || result.scale || "Unknown";
        const chords = result.chords?.join(" - ") || "Unknown";

        return `Scale: ${scale}\nChords: ${chords}`;
    } catch (error) {
        console.error("Error detecting chords from file:", error);
        throw new Error("Could not process the file at the moment, please try again later.");
    }
};
