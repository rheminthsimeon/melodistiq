# Melodistiq

A powerful and highly customizable song composing tool that has various features including sensing emotion of lyrics to generate chords and tune in the form of midi, identifying chord progressions and melody from midi files and audio files using multiple AI models.
## Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Python 3.13** (Recommended for compatibility with the current ONNX implementation)
- **FFmpeg** (Required for audio processing)

**Installing FFmpeg:**
- **macOS:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg`
- **Windows:** Download from [ffmpeg.org](https://ffmpeg.org/download.html)

### Local Setup

#### 1. Frontend Setup
```bash
npm install
```

#### 2. Backend Setup (Python)
It is highly recommended to use a virtual environment.
```bash
# Create virtual environment
python3 -m venv .venv

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

> [!NOTE]
> If you encounter issues with TensorFlow on macOS, the project is configured to use **onnxruntime** for Basic Pitch to bypass TensorFlow compatibility problems.

#### 3. Environment Variables
Create or update your `.env.local` file:
```env
GEMINI_API_KEY=your_api_key_here
```

### Running the Application

You need to run both the frontend and the backend servers simultaneously:

#### Terminal 1: Frontend (Vite)
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

#### Terminal 2: Backend (Flask API)
```bash
# Ensure your venv is activated
python api/index.py
```
The API serves at `http://127.0.0.1:5001`.

## Troubleshooting

### Basic Pitch ONNX Model Path
In `api/audio_processor.py`, ensure the `ONNX_MODEL_PATH` points to the correct location of your `nmp.onnx` file. This is usually located within your site-packages for `basic-pitch`.
