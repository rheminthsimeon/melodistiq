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

# Safety environment variables
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_NUM_INTEROP_THREADS'] = '1'
os.environ['TF_NUM_INTRAOP_THREADS'] = '1'

import shutil
import numpy as np
import librosa
import tempfile
import onnxruntime as ort

import basic_pitch.note_creation as infer
from music21 import converter, midi, stream, note, chord, tempo, instrument

# Basic Pitch Constants
AUDIO_SAMPLE_RATE = 22050
FFT_HOP = 256
AUDIO_WINDOW_LENGTH = 2
AUDIO_N_SAMPLES = AUDIO_SAMPLE_RATE * AUDIO_WINDOW_LENGTH - FFT_HOP
ANNOTATIONS_FPS = AUDIO_SAMPLE_RATE // FFT_HOP
ONNX_MODEL_PATH = "/Library/Frameworks/Python.framework/Versions/3.13/lib/python3.13/site-packages/basic_pitch/saved_models/icassp_2022/nmp.onnx"

def predict_onnx(audio_path):
    """
    Standalone ONNX inference for Basic Pitch to bypass TensorFlow.
    """
    session = ort.InferenceSession(ONNX_MODEL_PATH, providers=["CPUExecutionProvider"])
    
    n_overlapping_frames = 30
    overlap_len = n_overlapping_frames * FFT_HOP
    hop_size = AUDIO_N_SAMPLES - overlap_len

    output = {"note": [], "onset": [], "contour": []}
    original_length = 0
    
    # Audio loading and windowing logic
    audio_original, _ = librosa.load(audio_path, sr=AUDIO_SAMPLE_RATE, mono=True)
    original_length = audio_original.shape[0]
    audio_original = np.concatenate([np.zeros((int(overlap_len / 2),), dtype=np.float32), audio_original])
    
    for i in range(0, audio_original.shape[0], hop_size):
        window = audio_original[i : i + AUDIO_N_SAMPLES]
        if len(window) < AUDIO_N_SAMPLES:
            window = np.pad(window, pad_width=[(0, AUDIO_N_SAMPLES - len(window))])
        
        audio_windowed = np.expand_dims(np.expand_dims(window, axis=-1), axis=0)
        
        # ONNX inference
        res = session.run(
            ["StatefulPartitionedCall:1", "StatefulPartitionedCall:2", "StatefulPartitionedCall:0"],
            {"serving_default_input_2:0": audio_windowed.astype(np.float32)}
        )
        output["note"].append(res[0])
        output["onset"].append(res[1])
        output["contour"].append(res[2])

    def unwrap_output(output_list, audio_len, n_olap_frames):
        concatenated = np.concatenate(output_list)
        n_olap = int(0.5 * n_olap_frames)
        if n_olap > 0:
            concatenated = concatenated[:, n_olap:-n_olap, :]
        n_output_frames_original = int(np.floor(audio_len * (ANNOTATIONS_FPS / AUDIO_SAMPLE_RATE)))
        unwrapped = concatenated.reshape(concatenated.shape[0] * concatenated.shape[1], concatenated.shape[2])
        return unwrapped[:n_output_frames_original, :]

    unwrapped_output = {
        k: unwrap_output(output[k], original_length, n_overlapping_frames) for k in output
    }

    # Convert to notes
    onset_threshold = 0.5
    frame_threshold = 0.3
    minimum_note_length = 127.70
    min_note_len_frames = int(np.round(minimum_note_length / 1000 * (AUDIO_SAMPLE_RATE / FFT_HOP)))
    
    midi_data, note_events = infer.model_output_to_notes(
        unwrapped_output,
        onset_thresh=onset_threshold,
        frame_thresh=frame_threshold,
        min_note_len=min_note_len_frames,
        melodia_trick=True,
        midi_tempo=120,
    )
    
    return midi_data, note_events

def process_audio(file_path):
    """
    Full pipeline:
    1. Separate with Demucs.
    2. Calculate scores for Piano, Guitar, Other.
    3. Select BEST stem based on smart logic.
    4. Convert ONLY the best stem to MIDI using Basic Pitch (ONNX).
    """
    if not shutil.which("ffmpeg"):
        raise Exception("FFmpeg not found. Please install FFmpeg.")
    
    output_dir = os.path.join(os.path.dirname(file_path), "separated")
    os.makedirs(output_dir, exist_ok=True)
    
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    
    print("Loading Demucs model...")
    model = get_model('htdemucs_6s')
    model.cpu()
    model.eval()
    
    print("Loading audio file...")
    import soundfile as sf
    audio_data, sr = sf.read(file_path, always_2d=True)
    wav = torch.from_numpy(audio_data.T).float()
    
    if sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)
        sr = model.samplerate
    
    if wav.shape[0] == 1: wav = wav.repeat(2, 1)
    elif wav.shape[0] > 2: wav = wav[:2]
    
    print("Separating audio with Demucs...")
    with torch.no_grad():
        sources = apply_model(model, wav.unsqueeze(0), device='cpu')[0]
    
    stem_names = model.sources
    filename_no_ext = os.path.splitext(os.path.basename(file_path))[0]
    stem_dir = os.path.join(output_dir, "htdemucs_6s", filename_no_ext)
    os.makedirs(stem_dir, exist_ok=True)
    
    for i, stem_name in enumerate(stem_names):
        stem_path = os.path.join(stem_dir, f"{stem_name}.wav")
        stem_audio = sources[i].cpu().numpy()
        sf.write(stem_path, stem_audio.T, sr)
    
    print("Calculating polyphony scores for selection...")
    scores = {}
    # Check only piano and guitar as requested
    for stem in ['piano', 'guitar']:
        stem_path = os.path.join(stem_dir, f"{stem}.wav")
        scores[stem] = calculate_polyphony_score(stem_path) if os.path.exists(stem_path) else -1.0
            
    # Simplified logic: compare piano (keys) and guitar, pick the higher one.
    # If one is missing (-1.0), the other will be higher.
    if scores['piano'] >= scores['guitar']:
        best_stem = 'piano'
    else:
        best_stem = 'guitar'
    
    print(f"Selected Best Stem based on score (Piano: {scores['piano']}, Guitar: {scores['guitar']}): {best_stem}")
    
    best_stem_path = os.path.join(stem_dir, f"{best_stem}.wav")
    
    # Use Basic Pitch (ONNX)
    full_score = stream.Score()
    try:
        midi_data, _ = predict_onnx(best_stem_path)
        with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as tmp_midi:
            tmp_midi_path = tmp_midi.name
            midi_data.write(tmp_midi_path)
        
        try:
            converted_score = converter.parse(tmp_midi_path)
            parts = converted_score.getElementsByClass(stream.Part)
            if len(parts) > 0:
                part = parts[0]
                part.id = best_stem
                part.partName = best_stem.capitalize()
                full_score.insert(0, part)
        finally:
            if os.path.exists(tmp_midi_path): os.remove(tmp_midi_path)
    except Exception as e:
        print(f"Basic Pitch (ONNX) failed: {e}. Falling back to Essentia.")
        part = stem_to_midi_part_essentia(best_stem_path, stem_name=best_stem)
        if part: full_score.insert(0, part)

    midi_path = file_path.replace(os.path.splitext(file_path)[1], ".mid")
    mf = midi.translate.streamToMidiFile(full_score)
    mf.open(midi_path, 'wb')
    mf.write()
    mf.close()
    
    # Also copy the best stem to a predictable temp location for download
    final_stem_path = file_path.replace(os.path.splitext(file_path)[1], f"_{best_stem}.wav")
    shutil.copy(best_stem_path, final_stem_path)
    
    print(f"Final MIDI saved to {midi_path}")
    print(f"Final Stem saved to {final_stem_path}")
    return midi_path, final_stem_path

def calculate_polyphony_score(audio_path):
    try:
        y, sr = librosa.load(audio_path, duration=30)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_norm = librosa.util.normalize(chroma)
        active_pitches = np.sum(chroma_norm > 0.6, axis=0)
        rms = librosa.feature.rms(y=y)[0]
        mask = rms > 0.01
        return float(np.mean(active_pitches[mask])) if any(mask) else 0.0
    except: return 0.0

def stem_to_midi_part_essentia(audio_path, stem_name="Piano"):
    import essentia.standard as es
    loader = es.MonoLoader(filename=audio_path)
    audio = loader()
    multipitch = es.MultiPitchKlapuri(frameSize=2048, hopSize=128)
    frequencies = multipitch(audio)
    
    part = stream.Part()
    part.id = stem_name
    part.partName = stem_name.capitalize()
    
    active_notes = {}
    frame_time = 128 / 44100
    
    for i, frame_freqs in enumerate(frequencies):
        current_time = i * frame_time
        frame_midi_notes = {int(round(librosa.hz_to_midi(f))) for f in frame_freqs if f > 20}
        
        for note_num in list(active_notes.keys()):
            if note_num not in frame_midi_notes:
                start_time = active_notes[note_num]
                duration = current_time - start_time
                if duration >= 0.1:
                    n = note.Note(note_num)
                    n.quarterLength = duration * 2 
                    part.insert(start_time * 2, n)
                del active_notes[note_num]
        
        for note_num in frame_midi_notes:
            if note_num not in active_notes: active_notes[note_num] = current_time
                
    return part
