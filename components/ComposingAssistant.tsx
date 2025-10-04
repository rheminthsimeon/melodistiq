import React, { useState, useCallback, useMemo } from 'react';
import { SongSettings, MidiNote } from '../types';
import { generateLyrics, generateChords, generateTuneMidiData } from '../services/geminiService';
import GenerateLyricsModal from './GenerateLyricsModal';
import ChevronDownIcon from './icons/ChevronDownIcon';
import { transpose } from '../utils/transpose';
import { generateChordMidi, generateTuneMidi, generateSampleMidi } from '../utils/midi';
import { getMoodCategory } from '../utils/mood';

const SettingsDropdown: React.FC<{
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string | number; label: string }[];
}> = ({ label, value, onChange, options }) => (
    <div className="flex-1 min-w-[120px]">
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={onChange}
        className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
);

const structureOptions = [
    { value: 'any', label: 'Any' },
    ...Array.from({ length: 17 }, (_, i) => ({ value: i, label: i.toString() }))
];

const ComposingAssistant: React.FC = () => {
    const [lyrics, setLyrics] = useState('');
    const [generatedChords, setGeneratedChords] = useState('');
    const [transposeAmount, setTransposeAmount] = useState(0);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAccordionOpen, setIsAccordionOpen] = useState(false);
    const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
    const [isLoadingChords, setIsLoadingChords] = useState(false);
    const [isLoadingTune, setIsLoadingTune] = useState(false);
    const [tuneMidiData, setTuneMidiData] = useState<MidiNote[] | null>(null);

    const [songSettings, setSongSettings] = useState<SongSettings>({
        genre: 'any',
        bpm: '',
        stanza: 'any',
        preChorus: 'any',
        chorus: 'any',
        bridge: 'any',
        key: 'any',
        mood: 'any',
        chordComplexity: 'any',
        barsPerLine: 'any',
    });
    
    const handleSettingsChange = useCallback(<K extends keyof SongSettings,>(field: K, value: SongSettings[K]) => {
        setSongSettings(prev => ({ ...prev, [field]: value }));
    }, []);

    const handleGenerateLyrics = useCallback(async (prompt: string) => {
        setIsLoadingLyrics(true);
        setTuneMidiData(null);
        const result = await generateLyrics(prompt);
        setLyrics(result);
        setIsLoadingLyrics(false);
        setIsModalOpen(false);
    }, []);

    const handleGenerateChords = useCallback(async () => {
        if (!lyrics.trim() && songSettings.mood === 'any') {
            alert("Please provide lyrics or select a mood before generating chords.");
            return;
        }
        setIsLoadingChords(true);
        setGeneratedChords('');
        setTransposeAmount(0);
        setTuneMidiData(null);
        const result = await generateChords(lyrics, songSettings);
        setGeneratedChords(result);
        setIsLoadingChords(false);
    }, [lyrics, songSettings]);
    
    const { scale, chords, bpm, mood, genre } = useMemo(() => {
        if (!generatedChords) return { scale: '', chords: '', bpm: null, mood: '', genre: '' };
        const lines = generatedChords.split('\n');
        const scaleLine = lines.find(line => line.toLowerCase().startsWith('scale:'));
        const bpmLine = lines.find(line => line.toLowerCase().startsWith('bpm:'));
        const moodLine = lines.find(line => line.toLowerCase().startsWith('mood:'));
        const genreLine = lines.find(line => line.toLowerCase().startsWith('genre:'));

        const bpmValue = bpmLine ? parseInt(bpmLine.split(':')[1]?.trim()) : null;
        const moodValue = moodLine ? moodLine.split(':')[1]?.trim() : '';
        const genreValue = genreLine ? genreLine.split(':')[1]?.trim() : '';
        
        const chordLines = lines.filter(line => 
            !line.toLowerCase().startsWith('scale:') && 
            !line.toLowerCase().startsWith('bpm:') &&
            !line.toLowerCase().startsWith('mood:') &&
            !line.toLowerCase().startsWith('genre:')
        ).join('\n');
        const transposedChords = transpose(chordLines, transposeAmount);

        const originalScaleText = scaleLine ? scaleLine.substring('scale:'.length).trim() : '';
        const transposedScaleText = transpose(originalScaleText, transposeAmount);
        const displayScale = transposedScaleText ? `Scale: ${transposedScaleText}` : (scaleLine || 'Scale: Not found');

        return {
            scale: displayScale,
            chords: transposedChords,
            bpm: bpmValue && !isNaN(bpmValue) ? bpmValue : null,
            mood: moodValue,
            genre: genreValue,
        };
    }, [generatedChords, transposeAmount]);

    const moodCategory = getMoodCategory(mood);

    const handleDownloadChordMidi = useCallback(() => {
        if(!generatedChords) return;
        const midiBlob = generateChordMidi(chords);
        const url = URL.createObjectURL(midiBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chords.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [chords, generatedChords]);

    const handleDownloadSampleMidi = useCallback(() => {
        if(!generatedChords || !bpm || !genre || !mood) return;
        const midiBlob = generateSampleMidi(chords, bpm, genre, mood);
        const url = URL.createObjectURL(midiBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chord_sample.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [chords, generatedChords, bpm, genre, mood]);

    const handleGenerateTune = useCallback(async () => {
        if (!lyrics || !chords) {
            alert("Please generate lyrics and chords first.");
            return;
        }
        setIsLoadingTune(true);
        setTuneMidiData(null);

        try {
            const tuneDataJson = await generateTuneMidiData(lyrics, chords, scale);
            const tuneData: MidiNote[] = JSON.parse(tuneDataJson);

            if (tuneData.length === 0) {
                throw new Error("Generated tune data is empty.");
            }
            setTuneMidiData(tuneData);

        } catch (error) {
            console.error("Failed to generate tune:", error);
            alert("Sorry, I couldn't generate the tune. Please try again.");
        } finally {
            setIsLoadingTune(false);
        }

    }, [lyrics, chords, scale]);

    const handleDownloadTuneMidi = useCallback(() => {
        if (!tuneMidiData || !bpm) return;
         const midiBlob = generateTuneMidi(tuneMidiData, bpm);
        const url = URL.createObjectURL(midiBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tune.mid';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [tuneMidiData, bpm]);

    const isChordGenerationDisabled = isLoadingChords || (!lyrics.trim() && songSettings.mood === 'any');
    const isTuneGenerationDisabled = isLoadingTune || !lyrics || !chords;

    return (
        <>
            <GenerateLyricsModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onGenerate={handleGenerateLyrics}
                isLoading={isLoadingLyrics}
            />

            <div className="max-w-7xl mx-auto flex flex-col gap-6 animate-slide-up">
                {/* Lyrics */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 flex flex-col">
                     <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-white">Lyrics</h2>
                     <textarea
                        value={lyrics}
                        onChange={(e) => {
                            setLyrics(e.target.value);
                            setTuneMidiData(null);
                        }}
                        placeholder="Type your lyrics here, or use the generator..."
                        className="flex-grow w-full p-4 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none resize-y text-base"
                        style={{ minHeight: '300px' }}
                    />
                     <button
                        onClick={() => setIsModalOpen(true)}
                        className="mt-4 w-full bg-cyan-600 text-white font-bold py-3 px-5 rounded-md hover:bg-cyan-700 transition-transform duration-200 hover:scale-105"
                    >
                        Generate with AI
                    </button>
                </div>

                {/* Settings Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg">
                    <button
                        onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                        className="w-full flex justify-between items-center p-4 text-left font-semibold text-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-t-xl"
                    >
                        <span className="text-slate-800 dark:text-white">Songwriting Settings</span>
                        <ChevronDownIcon className={`w-6 h-6 transform transition-transform duration-300 text-slate-500 ${isAccordionOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isAccordionOpen && (
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-4 animate-fade-in">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <SettingsDropdown label="Genre" value={songSettings.genre} onChange={e => handleSettingsChange('genre', e.target.value)} options={[
                                    {value: 'any', label: 'Any'}, {value: 'pop', label: 'Pop'}, {value: 'rock', label: 'Rock'}, {value: 'jazz', label: 'Jazz'}, {value: 'blues', label: 'Blues'}
                                ]} />
                                <SettingsDropdown label="Key" value={songSettings.key} onChange={e => handleSettingsChange('key', e.target.value)} options={[
                                    {value: 'any', label: 'Any'}, {value: 'major', label: 'Major'}, {value: 'minor', label: 'Minor'}
                                ]} />
                                <SettingsDropdown label="Mood" value={songSettings.mood} onChange={e => handleSettingsChange('mood', e.target.value)} options={[
                                    {value: 'any', label: 'Any (detect from lyrics)'}, {value: 'happy', label: 'Happy'}, {value: 'sad', label: 'Sad'}, {value: 'romantic', label: 'Romantic'}, {value: 'motivational', label: 'Motivational'}, {value: 'energetic', label: 'Energetic'}, {value: 'disgust', label: 'Disgust'}
                                ]} />
                                <div className="flex-1 min-w-[120px]">
                                    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">BPM</label>
                                    <input type="text" value={songSettings.bpm} onChange={e => handleSettingsChange('bpm', e.target.value)} placeholder="e.g., 120 or 'any'" className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md p-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                                </div>
                                <SettingsDropdown label="Chord Complexity" value={songSettings.chordComplexity} onChange={e => handleSettingsChange('chordComplexity', e.target.value)} options={[
                                    {value: 'any', label: 'Any (from mood)'}, {value: 'easy', label: 'Easy'}, {value: 'medium', label: 'Medium'}, {value: 'complex', label: 'Complex'}, {value: 'randomize', label: 'Randomize'}
                                ]} />
                                <SettingsDropdown label="Bars Per Line" value={songSettings.barsPerLine} onChange={e => handleSettingsChange('barsPerLine', e.target.value)} options={[
                                    {value: 'any', label: 'Any (default)'}, {value: '1', label: '1'}, {value: '2', label: '2'}, {value: '3', label: '3'}, {value: '4', label: '4'},
                                ]} />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Song Structure</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <SettingsDropdown label="Stanzas" value={songSettings.stanza} onChange={e => handleSettingsChange('stanza', e.target.value)} options={structureOptions} />
                                    <SettingsDropdown label="Pre-Choruses" value={songSettings.preChorus} onChange={e => handleSettingsChange('preChorus', e.target.value)} options={structureOptions} />
                                    <SettingsDropdown label="Choruses" value={songSettings.chorus} onChange={e => handleSettingsChange('chorus', e.target.value)} options={structureOptions} />
                                    <SettingsDropdown label="Bridges" value={songSettings.bridge} onChange={e => handleSettingsChange('bridge', e.target.value)} options={structureOptions} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chords Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 space-y-4">
                     <button 
                        onClick={handleGenerateChords}
                        disabled={isChordGenerationDisabled}
                        className="w-full bg-purple-600 text-white font-bold py-3 px-4 rounded-md hover:bg-purple-700 transition-transform duration-200 hover:scale-105 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center"
                    >
                        {isLoadingChords ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Generating Chords...
                            </>
                            ) : (
                            'Generate Chords'
                        )}
                    </button>
                    <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md">
                        <div className="p-3 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-slate-300 dark:border-slate-700">
                            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
                                <span className="font-semibold text-purple-600 dark:text-purple-400">{scale}</span>
                                {bpm !== null && <span className="font-semibold text-purple-600 dark:text-purple-400">BPM: {bpm}</span>}
                                {genre && <span className="font-semibold text-purple-600 dark:text-purple-400">Genre: {genre}</span>}
                                {moodCategory && <span className="font-semibold text-purple-600 dark:text-purple-400">Mood: {moodCategory}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium hidden sm:inline">Transpose:</span>
                                <button onClick={() => setTransposeAmount(t => t - 1)} className="bg-slate-200 dark:bg-slate-700 rounded-md px-3 py-1 hover:bg-slate-300 dark:hover:bg-slate-600">-</button>
                                <span className="font-bold w-8 text-center">{transposeAmount > 0 ? `+${transposeAmount}` : transposeAmount}</span>
                                <button onClick={() => setTransposeAmount(t => t + 1)} className="bg-slate-200 dark:bg-slate-700 rounded-md px-3 py-1 hover:bg-slate-300 dark:hover:bg-slate-600">+</button>
                            </div>
                        </div>
                        <textarea
                            value={isLoadingChords ? 'Generating...' : chords}
                            readOnly
                            placeholder="Your generated chords will appear here..."
                            className="w-full h-52 p-4 bg-transparent focus:outline-none resize-y whitespace-pre-wrap font-mono text-sm"
                        />
                         <div className="p-3 border-t border-slate-300 dark:border-slate-700 flex flex-col sm:flex-row gap-2">
                            <button 
                                onClick={handleDownloadChordMidi}
                                disabled={!generatedChords}
                                className="flex-1 bg-green-600 text-white font-bold py-2 px-3 rounded-md hover:bg-green-700 transition-colors duration-200 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-sm"
                            >
                                Download Chords MIDI
                            </button>
                             <button 
                                onClick={handleDownloadSampleMidi}
                                disabled={!generatedChords || !bpm}
                                className="flex-1 bg-sky-600 text-white font-bold py-2 px-3 rounded-md hover:bg-sky-700 transition-colors duration-200 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-sm"
                            >
                                Download Chord Sample Play
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tune Card */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                       <div className='flex-grow'>
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Tune Generator</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">generate a tune for ur song</p>
                       </div>
                       <div className='flex w-full sm:w-auto space-x-2'>
                        <button
                            onClick={handleGenerateTune}
                            disabled={isTuneGenerationDisabled}
                            className="flex-1 bg-teal-600 text-white font-bold py-2 px-4 rounded-md hover:bg-teal-700 transition-colors duration-200 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center text-sm"
                        >
                            {isLoadingTune ? (
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                'Generate'
                            )}
                        </button>
                        {tuneMidiData && (
                            <button
                                onClick={handleDownloadTuneMidi}
                                className="flex-1 bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 transition-colors duration-200 text-sm"
                            >
                                Download
                            </button>
                        )}
                       </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ComposingAssistant;