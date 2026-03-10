<img src="https://socialify.git.ci/mmelokuhlemaphisa/React-Native-Audio-Recorder/image?language=1&owner=1&name=1&stargazers=1&theme=Light" alt="React-Native-Audio-Recorder" width="640" height="320" />


# React Native Audio Recorder 🎙️

A small voice journal app (Task 3, Lesson 5) built with Expo and React Native. Record, save, play, rename, delete, and search voice notes. Designed for easy testing 

---

## 🚀 Features

- Record audio (start/pause/resume/stop) and save locally 
- List of voice notes with date & duration 
- Playback with play/pause, seek (scrub), skip ±10s, speed & repeat 
- Rename and delete recordings (delete shows confirmation) 
- Search notes by name 
- Persistent storage: saves metadata to `notes.json` and files under app document directory 

---

## 💻 Run (development)

1. Install dependencies

```bash
npm install
```

2. Start Expo

```bash
npm  start
```

3. Open on device/emulator (Expo Go or Simulator)



---

## ✅ Quick test checklist

- Record a short note in the main screen (allow microphone access)
- Save and verify the note appears in the list with a duration
- Play the note (list or detail) and test play/pause
- Scrub quickly back and forth — the progress bar and audio should follow
- Rename a note and confirm it updates in the list
- Delete a note (confirm prompt) and ensure it is removed
- Restart the app to confirm persistence (notes remain)

---

## 📁 Important files

- `app/index.tsx` — Recording UI & save logic
- `app/list.tsx` — Notes list, playback controls and scrub UI
- `app/note/audioDetails.tsx` — Per-note detail (playback, rename, delete, speed)


