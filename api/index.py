import sys
import os

# Stealth Mode: Completely hide TensorFlow from ALL dependencies
class TFBlocker:
    def find_spec(self, fullname, path, target=None):
        if fullname == 'tensorflow' or fullname.startswith('tensorflow.'):
            raise ImportError("TensorFlow is intentionally disabled for Python 3.13 (macOS) compatibility.")
        return None

sys.meta_path.insert(0, TFBlocker())

# Pre-emptively clear any existing halted state
if 'tensorflow' in sys.modules:
    del sys.modules['tensorflow']

from flask import Flask, request, jsonify, send_from_directory
import music21
import tempfile
import traceback

# Import audio_processor with better error reporting
try:
    # Try local import first (when running python3 api/index.py)
    if os.path.dirname(__file__) not in sys.path:
        sys.path.append(os.path.dirname(__file__))
    import audio_processor
    print("Successfully imported audio_processor")
except Exception as e:
    print(f"Error importing audio_processor: {e}")
    traceback.print_exc()
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
    stem_path = None
    try:
        # 1. Process Audio -> MIDI
        print(f"Processing audio file: {file.filename}")
        midi_path, stem_path = audio_processor.process_audio(temp_audio_path)
        print(f"MIDI created successfully at: {midi_path}")
        print(f"Stem saved at: {stem_path}")
        
        # 2. Process MIDI -> Chords (Re-using logic)
        print("Analyzing MIDI for chords...")
        analysis_response = analyze_midi_file(midi_path)
        
        # Inject file names into the response for download
        if analysis_response.is_json:
            data = analysis_response.get_json()
            data['midi_file'] = os.path.basename(midi_path)
            data['stem_file'] = os.path.basename(stem_path)
            return jsonify(data)
            
        print("Chord analysis complete!")
        return analysis_response

    except Exception as e:
        import traceback
        error_msg = f"Error processing audio: {str(e)}\n{traceback.format_exc()}"
        print(error_msg)
        return jsonify({"error": str(e)}), 500
    finally:
        # Cleanup audio
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        # Note: We keep the stem and MIDI for a while for download!

@app.route('/api/download-midi/<filename>', methods=['GET'])
def download_midi(filename):
    try:
        filename = os.path.basename(filename)
        directory = tempfile.gettempdir()
        return send_from_directory(directory, filename, as_attachment=True)
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route('/api/download-stem/<filename>', methods=['GET'])
def download_stem(filename):
    try:
        filename = os.path.basename(filename)
        directory = tempfile.gettempdir()
        return send_from_directory(directory, filename, as_attachment=True, mimetype="audio/wav")
    except Exception as e:
        return jsonify({"error": str(e)}), 404


def analyze_midi_file(file_path):
    """
    Core logic to analyze a local MIDI file object/path using music21.
    """
    try:
        score = music21.converter.parse(file_path)
        
        # Chordify to reduce everything to chords in one part
        chord_score = score.chordify()
        
        # Analyze key (scale)
        try:
            key = score.analyze('key')
            scale_name = f"{key.tonic.name} {key.mode}"
        except Exception:
            scale_name = "Unknown Scale"

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
