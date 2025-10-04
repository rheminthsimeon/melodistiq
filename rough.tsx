export const detectChordsFromFile = async (fileData: string, mimeType: string): Promise<string> => {
    try {
        const prompt = `You are a highly advanced music analysis AI. Your task is to analyze the provided music file and identify its key/scale and chord progression.

**Instructions:**
1.  The file data is provided in base64 format with the MIME type "${mimeType}".
2.  Analyze the music to determine the most likely musical scale.
3.  Analyze the music to determine the chord progression. Simplify the progression to the main chords of the song structure.
4.  You MUST format your response strictly as follows, with no extra text or explanations:
    -   Line 1: "Scale: [Detected Scale]" (e.g., "Scale: C Major")
    -   Line 2: "Chords: [Detected Chord Progression]" (e.g., "Chords: C - G - Am - F")

Example Response:
Scale: A Minor
Chords: Am - G - C - F - Am - E7 - Am`;

        const filePart = {
            inlineData: {
                mimeType: mimeType,
                data: fileData,
            },
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: prompt },
                    filePart,
                ],
            },
        });

        return response.text;
    } catch (error) {
        console.error("Error detecting chords from file:", error);
        throw new Error("The AI model could not process the file. It might be too long, corrupted, or in an unsupported format.");
    }
};