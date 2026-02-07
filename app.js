(function () {
  'use strict';

  const STORAGE_KEY = 'voicetasks_data';
  const CARD_LIST = document.getElementById('card-list');
  const EMPTY_STATE = document.getElementById('empty-state');
  const RECORD_BTN = document.getElementById('record-btn');
  const RECORD_BTN_LABEL = document.getElementById('record-btn-label');
  const RECORDING_INDICATOR = document.getElementById('recording-indicator');
  const RESET_BTN = document.getElementById('reset-btn');
  const CARD_TEMPLATE = document.getElementById('card-template');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  let tasks = [];
  let nextRecordingNumber = 1;
  let mediaRecorder = null;
  let recordingChunks = [];
  let activeRecordingCardId = null;
  let speechRecognizer = null;
  let recordingTranscript = '';
  let interimTranscript = '';

  /* ---------- Persistence ---------- */
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      tasks = data.tasks || [];
      nextRecordingNumber = Math.max(nextRecordingNumber, (data.nextRecordingNumber || 1));
      for (const t of tasks) {
        if (t.audioBase64) {
          t.audioUrl = blobUrlFromBase64(t.audioBase64);
        }
      }
    } catch (_) {
      tasks = [];
    }
  }

  function saveToStorage() {
    const toSave = tasks.map(t => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      done: t.done,
      transcript: t.transcript,
      category: t.category,
      audioBase64: t.audioBase64 || null,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks: toSave,
      nextRecordingNumber,
    }));
  }

  function blobUrlFromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/webm' });
    return URL.createObjectURL(blob);
  }

  function base64FromBlob(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => {
        const base64 = r.result.split(',')[1] || '';
        resolve(base64);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /* ---------- UI helpers ---------- */
  function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function updateEmptyState() {
    EMPTY_STATE.classList.toggle('hidden', tasks.length > 0);
  }

  function setRecordingUI(active) {
    RECORD_BTN.classList.toggle('recording', active);
    RECORD_BTN.setAttribute('aria-pressed', active ? 'true' : 'false');
    RECORD_BTN_LABEL.textContent = active ? 'Recording' : 'Tap to record';
    RECORDING_INDICATOR.classList.toggle('hidden', !active);
    if (active) RECORDING_INDICATOR.classList.add('flex');
  }

  /* ---------- Gemini: refine task and categorize (simulated) ---------- */
  async function analyzeWithGemini(audioBlob, transcription) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
    const trimmed = (transcription || '').trim();
    const title = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : (trimmed || 'Recording');
    const category = deriveCategory(trimmed);
    return {
      transcript: trimmed || '（No speech detected）',
      title: title || 'Task',
      category,
    };
  }

  function deriveCategory(transcript) {
    if (!transcript) return '';
    const t = transcript;
    if (/牙醫|醫生|檢查|健康|食藥|病|dentist|doctor|health/.test(t)) return 'Health';
    if (/買|街市|餸|超市|購物|grocer|shop/.test(t)) return 'Shopping';
    if (/電郵|報告|開會|項目|工作|email|meeting|report|work/.test(t)) return 'Work';
    if (/機票|旅行|機場|飛|flight|travel/.test(t)) return 'Travel';
    if (/訂枱|餐廳|食飯|book|restaurant/.test(t)) return 'Personal';
    return '';
  }

  /* ---------- Live transcript update (for active card) ---------- */
  function updateActiveCardTranscript(finalText, interimText) {
    if (!activeRecordingCardId) return;
    const card = CARD_LIST.querySelector(`[data-id="${activeRecordingCardId}"]`);
    if (!card) return;
    const textarea = card.querySelector('.transcript-area');
    if (!textarea) return;
    const combined = (finalText || '') + (interimText || '');
    textarea.value = combined;
  }

  /* ---------- Card DOM ---------- */
  function createCard(task) {
    const frag = CARD_TEMPLATE.content.cloneNode(true);
    const card = frag.querySelector('.card');
    card.dataset.id = task.id;

    const playPauseBtn = card.querySelector('.play-pause');
    const durationEl = card.querySelector('.duration');
    const completeCheckbox = card.querySelector('.complete-checkbox');
    const menuBtn = card.querySelector('.menu-btn');
    const transcriptArea = card.querySelector('.transcript-area');
    const categoryLine = card.querySelector('.category-line');

    durationEl.textContent = formatDuration(task.duration || 0);
    completeCheckbox.checked = task.done || false;
    if (task.done) card.classList.add('done');

    if (task.transcript != null) {
      transcriptArea.value = task.transcript || '';
      transcriptArea.placeholder = '';
      if (task.category) {
        categoryLine.textContent = task.category;
        categoryLine.classList.remove('hidden');
      }
    }

    playPauseBtn.addEventListener('click', () => togglePlay(card, task));
    completeCheckbox.addEventListener('change', () => {
      task.done = completeCheckbox.checked;
      card.classList.toggle('done', task.done);
      saveToStorage();
    });
    menuBtn.addEventListener('click', () => {
      if (confirm('Delete this recording?')) {
        removeTask(task.id);
      }
    });

    return { card };
  }

  function renderCards() {
    CARD_LIST.innerHTML = '';
    tasks.forEach(t => {
      const { card } = createCard(t);
      CARD_LIST.appendChild(card);
    });
    updateEmptyState();
  }

  function updateCardWithGeminiResult(task, result) {
    task.transcript = result.transcript;
    task.category = result.category;
    task.title = result.title || task.defaultTitle;
    const card = CARD_LIST.querySelector(`[data-id="${task.id}"]`);
    if (!card) return;
    const textarea = card.querySelector('.transcript-area');
    const categoryLine = card.querySelector('.category-line');
    if (textarea) {
      textarea.value = task.transcript;
      textarea.placeholder = '';
    }
    if (categoryLine) {
      categoryLine.textContent = task.category || '';
      categoryLine.classList.toggle('hidden', !task.category);
    }
    saveToStorage();
  }

  function removeTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task && task.audioUrl) URL.revokeObjectURL(task.audioUrl);
    tasks = tasks.filter(t => t.id !== id);
    const card = CARD_LIST.querySelector(`[data-id="${id}"]`);
    if (card) card.remove();
    updateEmptyState();
    saveToStorage();
  }

  /* ---------- Recording ---------- */
  function startSpeechRecognition(stream) {
    if (!SpeechRecognition) return;
    recordingTranscript = '';
    interimTranscript = '';
    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = true;
    speechRecognizer.interimResults = true;
    speechRecognizer.lang = 'zh-HK';
    speechRecognizer.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          recordingTranscript += chunk;
          interim = '';
        } else {
          interim += chunk;
        }
      }
      interimTranscript = interim;
      updateActiveCardTranscript(recordingTranscript, interimTranscript);
    };
    speechRecognizer.onerror = () => {};
    speechRecognizer.start();
  }

  function stopSpeechRecognition() {
    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch (_) {}
      speechRecognizer = null;
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordingChunks = [];
    recordingTranscript = '';
    interimTranscript = '';

    const id = 'task-' + Date.now();
    const defaultTitle = `Recording ${String(nextRecordingNumber).padStart(3, '0')}`;
    nextRecordingNumber++;
    const task = {
      id,
      defaultTitle,
      title: defaultTitle,
      duration: 0,
      done: false,
      transcript: null,
      category: null,
      recordStartTime: Date.now(),
    };
    tasks.unshift(task);

    CARD_LIST.innerHTML = '';
    tasks.forEach(t => {
      const { card } = createCard(t);
      CARD_LIST.appendChild(card);
    });
    updateEmptyState();

    const newCard = CARD_LIST.querySelector(`[data-id="${id}"]`);
    if (newCard) {
      newCard.classList.add('recording');
      const textarea = newCard.querySelector('.transcript-area');
      if (textarea) textarea.placeholder = 'Listening...';
    }
    activeRecordingCardId = id;
    startSpeechRecognition(stream);

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => {
      if (e.data.size) recordingChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      stopSpeechRecognition();
      stream.getTracks().forEach(t => t.stop());
      setRecordingUI(false);
      const blob = new Blob(recordingChunks, { type: 'audio/webm' });
      const currentTask = tasks.find(t => t.id === activeRecordingCardId);
      if (currentTask) {
        currentTask.audioUrl = URL.createObjectURL(blob);
        currentTask.audioBase64 = await base64FromBlob(blob);
        currentTask.duration = Math.round((Date.now() - currentTask.recordStartTime) / 1000);
        const card = CARD_LIST.querySelector(`[data-id="${currentTask.id}"]`);
        if (card) {
          card.classList.remove('recording');
          const durEl = card.querySelector('.duration');
          if (durEl) durEl.textContent = formatDuration(currentTask.duration);
        }
        const finalTranscript = (recordingTranscript + interimTranscript).trim();
        analyzeWithGemini(blob, finalTranscript).then(result => {
          updateCardWithGeminiResult(currentTask, result);
        });
        saveToStorage();
      }
      activeRecordingCardId = null;
    };
    mediaRecorder.start(100);

    setRecordingUI(true);
    requestAnimationFrame(() => {
      if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    setRecordingUI(false);
  }

  function toggleRecord() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
      return;
    }
    startRecording();
  }

  /* ---------- Playback ---------- */
  let currentAudio = null;
  let currentCardId = null;

  function togglePlay(card, task) {
    if (!task.audioUrl) return;
    const cardId = task.id;
    if (currentCardId === cardId && currentAudio && !currentAudio.paused) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentCardId = null;
      currentAudio = null;
      card.classList.remove('playing');
      card.querySelector('.play-icon').classList.remove('hidden');
      card.querySelector('.pause-icon').classList.add('hidden');
      return;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      const prev = CARD_LIST.querySelector(`[data-id="${currentCardId}"]`);
      if (prev) {
        prev.classList.remove('playing');
        prev.querySelector('.play-icon').classList.remove('hidden');
        prev.querySelector('.pause-icon').classList.add('hidden');
      }
    }
    currentAudio = new Audio(task.audioUrl);
    currentCardId = cardId;
    card.classList.add('playing');
    card.querySelector('.play-icon').classList.add('hidden');
    card.querySelector('.pause-icon').classList.remove('hidden');
    currentAudio.onended = () => {
      card.classList.remove('playing');
      card.querySelector('.play-icon').classList.remove('hidden');
      card.querySelector('.pause-icon').classList.add('hidden');
      currentAudio = null;
      currentCardId = null;
    };
    currentAudio.play();
  }

  /* ---------- Reset (remove all recordings) ---------- */
  function resetAll() {
    if (!confirm('Remove all recordings? This cannot be undone.')) return;
    tasks.forEach(t => {
      if (t.audioUrl) URL.revokeObjectURL(t.audioUrl);
    });
    tasks = [];
    nextRecordingNumber = 1;
    renderCards();
    saveToStorage();
  }

  /* ---------- Init ---------- */
  RECORD_BTN.addEventListener('click', toggleRecord);
  if (RESET_BTN) RESET_BTN.addEventListener('click', resetAll);
  loadFromStorage();
  renderCards();
})();
