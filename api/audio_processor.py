import os

# Force single-threaded execution for TensorFlow/CREPE to avoid Python 3.13 mutex issues
os.environ['TF_NUM_INTEROP_THREADS'] = '1'
os.environ['TF_NUM_INTRAOP_THREADS'] = '1'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'

# Force torchaudio to use soundfile backend instead of torchcodec
# This avoids compatibility issues with FFmpeg versions
os.environ['TORCHAUDIO_BACKEND'] = 'soundfile'
os.environ['TORCHAUDIO_INCLUDE_TORCHCODEC'] = '0'

import demucs.separate
import librosa
import numpy as np
from scipy.io import wavfile
import shutil
import subprocess
import shlex
import sys
from music21 import converter, midi, stream, note, chord, tempo

def process_audio(file_path):
    """
    Full pipeline:
    1. Separate with Demucs (htdemucs_6s) using Python API
    2. Analyze stems for polyphony
    3. Select best stem
    4. Convert to MIDI with CREPE
    5. Return path to MIDI file
    """
    
    # Check for ffmpeg
    if not shutil.which("ffmpeg"):
        raise Exception("FFmpeg not found. Please install FFmpeg (brew install ffmpeg).")
    
    output_dir = os.path.join(os.path.dirname(file_path), "separated")
    os.makedirs(output_dir, exist_ok=True)
    
    # Use Demucs Python API directly
    import torch
    import torchaudio
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    
    print("Loading Demucs model...")
    model = get_model('htdemucs_6s')
    model.cpu()
    model.eval()
    
    print("Loading audio file...")
    # Load with soundfile to avoid torchaudio issues
    import soundfile as sf
    audio_data, sr = sf.read(file_path, always_2d=True)
    
    # Convert to torch tensor and resample if needed
    wav = torch.from_numpy(audio_data.T).float()
    
    # Resample to model's sample rate if needed
    if sr != model.samplerate:
        print(f"Resampling from {sr} to {model.samplerate}...")
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)
        sr = model.samplerate
    
    # Ensure stereo
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    elif wav.shape[0] > 2:
        wav = wav[:2]
    
    print("Separating audio with Demucs...")
    with torch.no_grad():
        sources = apply_model(model, wav.unsqueeze(0), device='cpu')[0]
    
    # Save separated stems using soundfile
    stem_names = model.sources
    filename_no_ext = os.path.splitext(os.path.basename(file_path))[0]
    stem_dir = os.path.join(output_dir, "htdemucs_6s", filename_no_ext)
    os.makedirs(stem_dir, exist_ok=True)
    
    print(f"Stems will be saved to: {stem_dir}")
    print("Saving separated stems...")
    for i, stem_name in enumerate(stem_names):
        stem_path = os.path.join(stem_dir, f"{stem_name}.wav")
        stem_audio = sources[i].cpu().numpy()
        sf.write(stem_path, stem_audio.T, sr)
        print(f"Saved {stem_name}")
    
    # 2. Polyphony Analysis
    scores = {}
    
    for stem in stem_names:
        if stem == "drums":
            continue  # Ignore drums as requested
            
        stem_path = os.path.join(stem_dir, f"{stem}.wav")
        if not os.path.exists(stem_path):
            continue
            
        score = calculate_polyphony_score(stem_path)
        scores[stem] = score
        print(f"Stem {stem} Score: {score}")

    # Select winner
    if not scores:
        raise Exception("No melodic stems found")
        
    best_stem = max(scores, key=scores.get)
    print(f"Selected Best Stem: {best_stem}")
    
    best_stem_path = os.path.join(stem_dir, f"{best_stem}.wav")
    
    # 3. CREPE -> MIDI
    midi_path = file_path.replace(os.path.splitext(file_path)[1], ".mid")
    audio_to_midi(best_stem_path, midi_path)
    
    # Cleanup
    # shutil.rmtree(output_dir) # Keep for debugging
    
    return midi_path

def calculate_polyphony_score(audio_path):
    """
    Calculates polyphony score:
    Average number of pitches in a stem over time.
    High score -> More likely to have consistent chords/harmony.
    """
    try:
        y, sr = librosa.load(audio_path)
        
        # Calculate Chroma Energy (Harmonic Content)
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        
        # Thresholding to count "active" pitches per frame
        # Normalize
        chroma_norm = librosa.util.normalize(chroma)
        
        # Count how many bins are above a threshold per frame
        threshold = 0.6  # Tunable parameter
        active_pitches_per_frame = np.sum(chroma_norm > threshold, axis=0)
        
        # Filter silent frames (energy check)
        rms = librosa.feature.rms(y=y)[0]
        silent_mask = rms < 0.01
        
        active_pitches_active_frames = active_pitches_per_frame[~silent_mask]
        
        if len(active_pitches_active_frames) == 0:
            return 0
            
        avg_polyphony = np.mean(active_pitches_active_frames)
        
        # Sustain Factor: Long sustained notes might have lower transient energy but high chroma constancy.
        # This formula is simple but effective for "how many notes are sounding?"
        
        return avg_polyphony
    except Exception as e:
        print(f"Error calculating score for {audio_path}: {e}")
        return 0

def audio_to_midi(audio_path, output_midi_path):
    """
    Uses librosa's pyin algorithm to extract pitch and convert to MIDI.
    This avoids CREPE's TensorFlow multiprocessing issues on Python 3.13.
    """
    print("Loading audio for pitch detection...")
    y, sr = librosa.load(audio_path, sr=None)
    
    print("Running pitch detection with librosa pyin...")
    # Use pyin for pitch tracking - more stable than CREPE on Python 3.13
    f0, voiced_flag, voiced_probs = librosa.pyin(
        y,
        sr=sr,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        frame_length=2048
    )
    
    # Get time stamps
    hop_length = 512
    times = librosa.frames_to_time(range(len(f0)), sr=sr, hop_length=hop_length)
    
    # Create Music21 Stream
    from music21 import stream, note
    s = stream.Stream()
    
    curr_note = None
    curr_start_time = 0
    
    # Confidence threshold
    conf_thresh = 0.5
    
    for t, freq, confidence in zip(times, f0, voiced_probs):
        if confidence > conf_thresh and not np.isnan(freq) and freq > 0:
            # Convert frequency to MIDI note number
            midi_num = int(round(librosa.hz_to_midi(freq)))
            
            if curr_note is None:
                # Start new note
                curr_note = midi_num
                curr_start_time = t
            elif curr_note != midi_num:
                # Note changed - add previous note
                duration = t - curr_start_time
                if duration > 0.05:  # Minimum duration
                    n = note.Note(curr_note)
                    n.duration.quarterLength = duration * 2  # Rough mapping
                    s.append(n)
                
                curr_note = midi_num
                curr_start_time = t
        else:
            if curr_note is not None:
                # Note ended
                duration = t - curr_start_time
                if duration > 0.05:
                    n = note.Note(curr_note)
                    n.duration.quarterLength = duration * 2
                    s.append(n)
                curr_note = None
    
    # Add final note if exists
    if curr_note is not None:
        duration = times[-1] - curr_start_time
        if duration > 0.05:
            n = note.Note(curr_note)
            n.duration.quarterLength = duration * 2
            s.append(n)
    
    # Write to file
    from music21 import midi
    mf = midi.translate.streamToMidiFile(s)
    mf.open(output_midi_path, 'wb')
    mf.write()
    mf.close()
    print(f"MIDI saved to {output_midi_path}")

