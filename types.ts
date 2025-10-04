export enum View {
  COMPOSING_ASSISTANT = 'Composing Assistant',
  CHORD_FINDER = 'Chord Finder',
}

export interface SongSettings {
  genre: string;
  bpm: string;
  stanza: string;
  preChorus: string;
  chorus: string;
  bridge: string;
  key: string;
  mood: string;
  chordComplexity: string;
  barsPerLine: string;
}

export interface MidiNote {
  note: string; // e.g., "C4", "F#5", or "rest"
  time: number; // start time in beats
  duration: number; // duration in beats
}