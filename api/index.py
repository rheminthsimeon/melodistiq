from flask import Flask, request, jsonify
import music21
import os
import tempfile

app = Flask(__name__)

# Basic health check
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "music21-chord-finder"})

@app.route('/api/analyze', methods=['POST'])
def analyze_midi():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not (file.filename.endswith('.mid') or file.filename.endswith('.midi')):
         return jsonify({"error": "Invalid file type. Only MIDI files are allowed."}), 400

    # Save to temp file because music21 needs a file path
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mid') as temp_file:
        file.save(temp_file.name)
        temp_path = temp_file.name

    try:
        # Load the MIDI file
        score = music21.converter.parse(temp_path)
        
        # Chordify to reduce everything to chords in one part
        chord_score = score.chordify()
        
        # Analyze key (scale)
        key = score.analyze('key')
        scale_name = f"{key.tonic.name} {key.mode}"

        # Check if monophonic (mostly single notes)
        # We can check the average number of notes sounding at once in the chordified version
        # Or just extract chords and see if they are mostly single pitches
        
        chords_list = []
        is_monophonic = True
        
        # Iterate through measures
        measures = chord_score.makeMeasures()
        
        formatted_result = []
        current_line_bars = []
        
        # We'll just grab the simplified chords per measure
        for m in measures.recurse().getElementsByClass('Measure'):
            # Get the chord symbol for the measure (simplified)
            # This is a bit complex in music21 to get *one* chord per bar.
            # A common approach is to root extraction or just taking the first/dominant chord.
            # For this requirement: "each line should have 4 bars of chords"
            
            # Let's try to get the harmony for the measure
            # If we simply look at the notes in the measure
            
            # music21's chordify creates complex chords. 
            # Let's check if we have mainly single notes or actual chords.
            
            measure_chords = m.flatten().getElementsByClass(music21.chord.Chord)
            
            if len(measure_chords) > 0:
                # Check for polyphony
                for c in measure_chords:
                    if len(c.pitches) > 1: # Check if it has multiple pitches
                        is_monophonic = False
                        break
                
                # Let's grab the chord on beat 1 (or the first chord)
                c = measure_chords[0]
                try:
                    root = c.root().name
                except:
                    # If root detection fails (e.g. empty chord or rest treated as chord), skip
                    current_line_bars.append("N.C.")
                    continue

                symbol = root
                
                # Determine quality safely
                if c.isMinorTriad():
                    symbol += "m"
                elif c.isDiminishedTriad():
                    symbol += "dim"
                elif c.isAugmentedTriad():
                    symbol += "aug"
                # If it's something else (e.g. 7th chord), we can check further or just leave as Major/Root
                # For basic pop chords, this is often enough. 
                # If we want to be more specific, we can use harmony.chordSymbolFigureFromChord
                
                current_line_bars.append(symbol)
            else:
                 current_line_bars.append("N.C.")

            # Formatting: 4 bars per line
            if len(current_line_bars) == 4:
                formatted_result.append(" | ".join(current_line_bars))
                current_line_bars = []
        
        # Add remaining bars
        if current_line_bars:
             formatted_result.append(" | ".join(current_line_bars))

        # Check monophonic fallback
        if is_monophonic:
             # Logic for melody: "Chords not found, however, here are the notes"
             # Extract all notes
             all_notes_list = []
             # We need to iterate through measures to respect the bar lines
             
             note_lines = []
             current_note_bar = []
             
             # Re-parse measures from the original score (not chordified) for better note lists
             # But chordified is easier to just get the notes in time order
             # Let's use the original score parts[0] if possible, or just the chord_score
             
             # Use chord_score flattened measures
             for m in chord_score.makeMeasures().getElementsByClass('Measure'):
                 bar_notes = []
                 for element in m.flatten().notes:
                     if element.isNote:
                         bar_notes.append(element.name) # name without octave? User asked for "notes being played". Name is C, D#. nameWithOctave is C4. Let's use name.
                     elif element.isChord:
                         # Diads logic or just single notes in the chord
                         # If it's monophonic but has some chords (diads), show them
                         notes_in_chord = [p.name for p in element.pitches]
                         bar_notes.append("-".join(notes_in_chord))
                 
                 current_note_bar.append(" ".join(bar_notes) if bar_notes else "Rest")
                 
                 if len(current_note_bar) == 4:
                     note_lines.append(" | ".join(current_note_bar))
                     current_note_bar = []
            
             if current_note_bar:
                 note_lines.append(" | ".join(current_note_bar))
                 
             return jsonify({
                 "type": "melody",
                 "scale": scale_name,
                 "content": "Chords not found, however, here are the notes being played:\n" + "\n".join(note_lines)
             })

        return jsonify({
            "type": "chords",
            "scale": scale_name,
            "content": "\n".join(formatted_result)
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# For Vercel, we need to export the app
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16MB limit

if __name__ == "__main__":
    app.run(debug=True, port=5000)
