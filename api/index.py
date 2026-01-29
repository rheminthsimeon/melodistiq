from flask import Flask, request, jsonify
import music21
import os
import tempfile

try:
    import audio_processor
except ImportError:
    try:
        from api import audio_processor
    except ImportError:
        # Fallback if neither works (shouldn't happen if file exists)
        audio_processor = None

app = Flask(__name__)

# Basic health check
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "music21-chord-finder"})

@app.route('/api/analyze-audio', methods=['POST'])
def analyze_audio():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Save temp audio file
    original_ext = os.path.splitext(file.filename)[1]
    if not original_ext:
        original_ext = ".mp3" # Default or guess
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=original_ext) as temp_file:
        file.save(temp_file.name)
        temp_audio_path = temp_file.name

    midi_path = None
    try:
        # 1. Process Audio -> MIDI
        print(f"Processing audio file: {file.filename}")
        midi_path = audio_processor.process_audio(temp_audio_path)
        print(f"MIDI created successfully at: {midi_path}")
        
        # 2. Process MIDI -> Chords (Re-using logic)
        print("Analyzing MIDI for chords...")
        result = analyze_midi_file(midi_path)
        print("Chord analysis complete!")
        return result

    except Exception as e:
        import traceback
        error_msg = f"Error processing audio: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({"error": str(e)}), 500
    finally:
        # Cleanup audio
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        # Cleanup MIDI if created and we are done
        if midi_path and os.path.exists(midi_path):
             os.remove(midi_path)

def analyze_midi_file(file_path):
    """
    Core logic to analyze a local MIDI file object/path using music21.
    """
    try:
        score = music21.converter.parse(file_path)
        
        # Chordify to reduce everything to chords in one part
        chord_score = score.chordify()
        
        # Analyze key (scale)
        key = score.analyze('key')
        scale_name = f"{key.tonic.name} {key.mode}"

        chords_list = []
        is_monophonic = True
        
        # Iterate through measures
        measures = chord_score.makeMeasures()
        
        formatted_result = []
        current_line_bars = []
        
        for m in measures.recurse().getElementsByClass('Measure'):
            
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
             # Logic for melody
             note_lines = []
             current_note_bar = []
             
             # Use chord_score flattened measures
             for m in chord_score.makeMeasures().getElementsByClass('Measure'):
                 bar_notes = []
                 for element in m.flatten().notes:
                     if element.isNote:
                         bar_notes.append(element.name) 
                     elif element.isChord:
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
        raise e

@app.route('/api/analyze', methods=['POST'])
def analyze_midi():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not (file.filename.endswith('.mid') or file.filename.endswith('.midi')):
         return jsonify({"error": "Invalid file type. Only MIDI files are allowed."}), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix='.mid') as temp_file:
        file.save(temp_file.name)
        temp_path = temp_file.name

    try:
        return analyze_midi_file(temp_path)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# For Vercel, we need to export the app
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024 # 100MB limit

if __name__ == "__main__":
    app.run(debug=True, port=5001)
