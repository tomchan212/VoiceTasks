# VoiceTasks

A mobile-first voice-to-task web app. Record Cantonese (or other speech), see live transcription, and get tasks refined and categorized—all in the browser.

## Tech stack

- **HTML5**
- **CSS3** with [Tailwind CSS](https://tailwindcss.com/) (CDN)
- **Vanilla JavaScript**
- **Web Speech API** (real-time transcription)
- **MediaRecorder API** (audio capture)
- **localStorage** (persistence)

## Features

- **Record** — Tap the mic to start/stop. Audio is captured with the MediaRecorder API.
- **Live transcription** — Speech is transcribed in real time in the card’s text area (Web Speech API, Cantonese `zh-HK`).
- **Task refinement** — After recording stops, `analyzeWithGemini(audioBlob, transcription)` runs (simulated by default) to refine the task and assign a category.
- **Playback** — Play recorded audio from each card.
- **Complete** — Mark tasks done with the checkbox.
- **More menu** — Delete a recording from the 3-dot menu.
- **Persistence** — Tasks and transcripts are saved in localStorage and restored on reload.
- **Recording indicator** — Header shows “Recording” and the mic button pulses red while recording.
- **Auto-scroll** — New recordings scroll into view.

## Project structure

```
VoiceTasks/
├── index.html   # Markup, Tailwind, card template
├── styles.css   # Wave visualizer, record pulse, layout tweaks
├── app.js       # Recording, speech recognition, Gemini flow, persistence
├── .gitignore
└── README.md
```

## Publish to GitHub

1. **Create a new repository** on [GitHub](https://github.com/new). Do not add a README, .gitignore, or license (this repo already has them).

2. **From your project folder**, run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: VoiceTasks web app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/VoiceTasks.git
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your GitHub username (or use the repo URL GitHub shows).

3. **Optional — GitHub Pages:** In the repo go to **Settings → Pages**, choose **Deploy from a branch**, select branch `main` and folder **/ (root)**, then Save. The app will be at `https://YOUR_USERNAME.github.io/VoiceTasks/`.  
   Note: Microphone and Speech Recognition work on GitHub Pages (HTTPS).

## How to run

1. **From the filesystem**  
   Open `index.html` in a browser.  
   Note: Microphone and Speech Recognition usually require a secure context (HTTPS or `localhost`).

2. **Local server (recommended)**  
   From the project folder:

   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```

   Then open `http://localhost:3000` (or `http://localhost:8000`) in your browser.

3. **Grant permissions**  
   Allow microphone access when the browser prompts.

## Browser support

- **Chrome / Edge** — Full support (MediaRecorder, Speech Recognition).
- **Safari** — May need `webkit` prefixes; Speech Recognition support varies.
- **Firefox** — MediaRecorder supported; Speech Recognition is limited or unsupported (no live transcript, refinement still runs with empty text).

## Gemini integration

The app calls `analyzeWithGemini(audioBlob, transcription)` when recording stops. The default implementation is a **simulation** (delay + keyword-based category). To use the real Gemini API:

1. Add a backend (or use an API key from a safe server-side flow).
2. In `app.js`, replace the body of `analyzeWithGemini` with a request that:
   - Sends `audioBlob` and `transcription` to your backend (or to Gemini with proper auth).
   - Returns `{ transcript, title, category }` and then call `updateCardWithGeminiResult(task, result)` as already done in the code.

## License

MIT.
