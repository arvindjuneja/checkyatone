# 🎵 Vocal Coach - Real-Time Vocal Pitch Analyzer

Vocal Coach is a modern web application for real-time vocal pitch analysis and visualization. Perfect for singers, vocal coaches, and anyone looking to improve their pitch accuracy.

![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-38bdf8?style=flat-square&logo=tailwind-css)

## ✨ Features

### 🎤 Real-Time Analysis
- **Live Pitch Detection**: Analyzes your voice in real-time using the YIN algorithm
- **Note Recognition**: Detects the exact note (C, C#, D, etc.) and octave you're singing
- **Pitch Accuracy**: Shows how many cents off you are from the perfect pitch
- **Visual Feedback**: Color-coded indicators (green = perfect, yellow = close, red = off)

### 🎓 Training Mode
- **Structured Exercises**: 8 vocal exercises including scales, arpeggios, and intervals
- **Reference Audio Playback**: Listen to the target notes before singing them
- **Accuracy Feedback**: Get detailed analysis of your performance for each note
- **Difficulty Levels**: Filter exercises by difficulty (Easy, Medium, Hard)
  - **Easy**: Simple intervals like major third (C-E), perfect fourth (C-F)
  - **Medium**: Perfect fifth, arpeggios, octave jumps
  - **Hard**: Full scales (C major up/down, A minor)
- **Performance Scoring**: See your accuracy percentage and cents deviation per note

### 🎮 Hit the Note Game
- **Random Note Challenge**: Hit randomly generated notes as fast as you can
- **Octave Range Selector**: Choose from Low (C3-B3), Medium (C3-B4), or High (C3-B5) ranges
- **Lives System**: 3 lives - lose one when you skip a note
- **Scoring**: Earn 10 points for each correct note
- **Real-time Progress**: Visual progress bar shows how close you are to hitting the note
- **Statistics**: Track your streak, accuracy, and total score
- **Replay Option**: Play any note again if you need to hear it

### 📊 Visual Components
- **Pitch Visualizer**: Real-time waveform display of pitch history
- **Current Note Display**: Large, easy-to-read note indicator
- **Timeline Analysis**: Historical view of your entire recording session
- **Recording Controls**: Start, stop, pause, and reset functionality

### ⚙️ Customizable Settings
- **Gain Control**: Adjustable microphone input gain (0.5x - 5.0x)
- **Sensitivity Settings**: Customize the detection threshold (0.001 - 0.01)
- **Audio Processing**: Optimized for vocal frequency range (65 Hz - 2100 Hz / C2 - C7)

### 🎯 Pitch Accuracy Levels
- **Perfect** (Green): Within ±10 cents of target note
- **Good** (Yellow): Within ±25 cents of target note
- **Off** (Red): More than ±25 cents from target note

## 🚀 Getting Started

### Prerequisites

- Node.js 18 or higher
- npm, yarn, pnpm, or bun package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd voice
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
```

This will create an optimized production build in the `out` directory (static export).

## 🎮 How to Use

### Live Mode
1. **Grant Microphone Access**: Allow the browser to access your microphone when prompted
2. **Adjust Settings**: Configure gain and sensitivity based on your microphone and environment
3. **Start Recording**: Click the record button to begin pitch analysis
4. **Sing or Hum**: The app will display your current note and pitch accuracy in real-time
5. **View Analysis**: Switch to the "Analiza" tab to see your complete pitch history
6. **Reset**: Clear the recording to start a new session

### Training Mode
1. **Select Mode**: Choose between "Ćwiczenia" (Exercises) or "Hit the Note!" (Game)
2. **Filter by Difficulty**: Use the difficulty filter to show only exercises you're comfortable with
3. **Listen & Repeat**: 
   - Exercises: Listen to the reference notes, then sing them back
   - Game: Hit random notes as fast as possible
4. **Get Feedback**: See detailed accuracy results and scoring

### Available Exercises
- **Tercja wielka** (Easy) - Major third interval
- **Kwarta czysta** (Easy) - Perfect fourth interval
- **Kwinta czysta** (Medium) - Perfect fifth interval
- **Arpeggio C-dur** (Medium) - C major arpeggio
- **Skok oktawowy** (Medium) - Octave jump
- **Gama C-dur w górę** (Hard) - C major scale ascending
- **Gama C-dur w dół** (Hard) - C major scale descending
- **Gama a-moll** (Hard) - A minor natural scale

## 🔧 Technical Details

### Architecture

```
voice/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main application page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── audio-settings.tsx
│   ├── current-note-display.tsx
│   ├── pitch-visualizer.tsx
│   ├── recording-controls.tsx
│   ├── timeline-analysis.tsx
│   ├── training-hub.tsx       # Training mode menu
│   ├── training-mode.tsx      # Exercise training component
│   ├── hit-the-note-game.tsx  # Game mode component
│   └── ui/               # Reusable UI components
├── hooks/
│   ├── use-audio-recorder.ts     # Audio recording & processing hook
│   ├── use-training-mode.ts      # Training exercises logic
│   └── use-hit-the-note-game.ts  # Game state management
├── lib/
│   ├── pitch-detector.ts     # YIN algorithm implementation
│   ├── audio-synth.ts        # Audio synthesis for reference tones
│   ├── analytics.ts          # Analytics tracking
│   └── utils.ts              # Utility functions
└── public/                   # Static assets
```

### Pitch Detection Algorithm

Vocal Coach uses the **YIN algorithm** for fundamental frequency estimation:

1. **Audio Capture**: Uses Web Audio API to capture microphone input
2. **Signal Processing**:
   - FFT size: 2048 samples
   - No smoothing (smoothingTimeConstant = 0)
   - Disabled echo cancellation, noise suppression, and auto-gain control
3. **YIN Algorithm**:
   - Difference function calculation
   - Cumulative mean normalized difference
   - Threshold-based period detection (0.25)
   - Parabolic interpolation for sub-sample accuracy
4. **Harmonic Rejection**:
   - Filters out overtones (2x, 3x, 4x harmonics)
   - Frequency history tracking with median filtering
   - Prevents octave jumping
5. **Note Conversion**: Converts frequency to musical note using A4 = 440 Hz reference

### Key Technologies

- **Next.js 16**: React framework with static export
- **React 19**: UI library with hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS 4**: Utility-first styling
- **Web Audio API**: Real-time audio processing
- **Radix UI**: Accessible component primitives
- **Lucide React**: Beautiful icon set
- **Recharts**: Data visualization

## 📦 Deployment

### Vercel (Recommended)

The easiest way to deploy Vocal Coach:

```bash
npm install -g vercel
vercel
```

### Cloudflare Pages

1. **Build command**: `npm run build`
2. **Build output directory**: `out`
3. **Framework preset**: Next.js (Static HTML Export)

### Netlify

1. **Build command**: `npm run build`
2. **Publish directory**: `out`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 🎨 Browser Compatibility

- Chrome/Edge 89+ (recommended)
- Firefox 88+
- Safari 14.1+
- Opera 75+

**Note**: Requires browser support for:
- Web Audio API
- MediaDevices API (getUserMedia)
- ES2020+ features

## 🔒 Privacy

Vocal Coach runs entirely in your browser. No audio data is sent to any server. All processing happens locally on your device.

## 🐛 Troubleshooting

### Microphone Not Working
- Check browser permissions for microphone access
- Ensure microphone is not being used by another application
- Try refreshing the page and granting permissions again

### Inaccurate Pitch Detection
- Adjust the **Gain** setting (increase if too quiet, decrease if too loud)
- Adjust the **Sensitivity** setting (increase for quieter environments)
- Sing closer to the microphone
- Reduce background noise

### Octave Jumping
- Decrease sensitivity
- Sing with a more stable tone
- Ensure microphone gain is not too high (causing clipping)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- YIN pitch detection algorithm by Alain de Cheveigné and Hideki Kawahara
- Built with [v0.dev](https://v0.dev) components
- Icons by [Lucide](https://lucide.dev)

---

Made with ❤️ for singers and vocal enthusiasts

© 2026 Arvind Juneja | [Instagram](https://instagram.com/ajuneja) | [LinkedIn](https://www.linkedin.com/in/arvindjuneja/)
