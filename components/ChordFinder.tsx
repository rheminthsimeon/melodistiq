import React, { useState, useRef } from 'react';

const ChordFinder: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ type: 'chords' | 'melody'; scale: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const midiInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze MIDI file');
      }

      const data = await response.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'An error occurred during analysis.');
      console.error(e);
    } finally {
      setIsLoading(false);
      // Reset file input value to allow re-uploading the same file
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <svg className="animate-spin h-10 w-10 text-cyan-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-lg text-gray-500 dark:text-gray-400">Analyzing MIDI file... this may take a moment.</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
          <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">Analysis Failed</h3>
          <p className="text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
          <button
            onClick={() => { setError(null); setResult(null); }}
            className="mt-4 bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (result) {
      return (
        <div className="text-left p-6 bg-slate-100 dark:bg-slate-900/50 rounded-lg w-full max-w-2xl animate-fade-in">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Analysis Complete</h3>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Scale:</p>
              <p className="text-lg font-semibold text-cyan-600 dark:text-cyan-400">{result.scale}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {result.type === 'chords' ? 'Chords:' : 'Notes:'}
              </p>
              <pre className="text-lg font-semibold text-purple-600 dark:text-purple-400 whitespace-pre-wrap font-mono">
                {result.content}
              </pre>
            </div>
          </div>
          <button
            onClick={() => { setError(null); setResult(null); }}
            className="mt-6 bg-cyan-600 text-white font-bold py-2 px-4 rounded-md hover:bg-cyan-700 transition-colors"
          >
            Analyze Another Track
          </button>
        </div>
      );
    }

    return (
      <>
        <div className="p-6 bg-white dark:bg-slate-800 rounded-full shadow-lg mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">Chord Detector</h2>
        <p className="text-lg text-gray-500 dark:text-gray-400 max-w-md mb-8">Upload a MIDI file and let our AI analyze the chords and scale for you.</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <input type="file" ref={midiInputRef} onChange={handleFileChange} accept=".mid,.midi" style={{ display: 'none' }} />
          <button
            onClick={() => midiInputRef.current?.click()}
            className="w-full sm:w-auto bg-purple-600 text-white font-bold py-3 px-6 rounded-md hover:bg-purple-700 transition-transform duration-200 hover:scale-105 shadow-lg"
          >
            Import MIDI
          </button>
          <button
            onClick={() => { }}
            className="w-full sm:w-auto bg-sky-600 text-white font-bold py-3 px-6 rounded-md cursor-not-allowed opacity-50 pointer-events-none"
            title="Currently unavailable"
          >
            Import Audio Track
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4 animate-fade-in">
      {renderContent()}
    </div>
  );
};

export default ChordFinder;