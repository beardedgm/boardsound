// Global state management
let currentTab = 0;
let tabCounter = 1;
let soundCounter = 0;
let audioElements = new Map();
let tabData = new Map();
let renamingTabId = null;
let masterVolume = 1.0;
let draggedCard = null;
let libraryCounter = 0;
let libraryData = new Map();
// Track temporary object URLs for cleanup
const temporaryFiles = new Set();
const LOCAL_STORAGE_KEY = 'soundboardState';
// Web Audio context setup
let audioCtx = null;
let masterGain = null;

function initAudioContext() {
    if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = masterVolume;
        masterGain.connect(audioCtx.destination);
    }
}

function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function dataURLToBlob(url) {
    const arr = url.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function setupWebAudio(audio, initialVolume = 1.0) {
    initAudioContext();
    if (!audioCtx) return null;
    const source = audioCtx.createMediaElementSource(audio);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = initialVolume;
    source.connect(gainNode);
    gainNode.connect(masterGain);
    return gainNode;
}

// Initialize first tab
tabData.set(0, {
    name: 'Main Sounds',
    sounds: new Map()
});

// Tab management
function addNewTab() {
    renamingTabId = null;
    document.getElementById('modalTitle').textContent = 'Name Your Tab';
    document.querySelector('.btn.primary').textContent = 'Create';
    document.getElementById('tabNameInput').value = '';
    document.getElementById('tabModal').classList.remove('hidden');
    document.getElementById('tabNameInput').focus();
}

function renameTab(tabId) {
    renamingTabId = tabId;
    const tab = tabData.get(tabId);
    document.getElementById('modalTitle').textContent = 'Rename Tab';
    document.querySelector('.btn.primary').textContent = 'Rename';
    document.getElementById('tabNameInput').value = tab.name;
    document.getElementById('tabModal').classList.remove('hidden');
    document.getElementById('tabNameInput').select();
}

function confirmTabAction() {
    const nameInput = document.getElementById('tabNameInput');
    const name = nameInput.value.trim();
    
    if (renamingTabId !== null) {
        // Renaming existing tab
        if (name) {
            const tab = tabData.get(renamingTabId);
            tab.name = name;
            document.querySelector(`[data-tab="${renamingTabId}"] span`).textContent = name;
            saveState();
        }
    } else {
        // Creating new tab
        const tabName = name || `Tab ${tabCounter + 1}`;
        setTimeout(() => {
            createTab(tabName);
        }, 100);
    }
    
    closeTabModal();
}

function cancelTabAction() {
    closeTabModal();
}

function closeTabModal() {
    const modal = document.getElementById('tabModal');
    const nameInput = document.getElementById('tabNameInput');
    modal.classList.add('hidden');
    nameInput.value = '';
    nameInput.blur();
    renamingTabId = null;
}

function createTabElement(id, name) {
    const tabContainer = document.querySelector('.tab-container');
    const addTabBtn = document.querySelector('.add-tab');

    const newTab = document.createElement('div');
    newTab.className = 'tab';
    newTab.dataset.tab = id;
    newTab.innerHTML = `
        <span>${name}</span>
        <button class="tab-close" onclick="removeTab(${id})">×</button>
    `;
    newTab.onclick = () => switchToTab(id);

    const tabSpan = newTab.querySelector('span');
    tabSpan.ondblclick = (e) => {
        e.stopPropagation();
        renameTab(id);
    };
    tabSpan.style.cursor = 'pointer';
    tabSpan.title = 'Double-click to rename';

    tabContainer.insertBefore(newTab, addTabBtn);

    const mainContent = document.querySelector('.main-content');
    const newPanel = document.createElement('div');
    newPanel.className = 'panel-content hidden';
    newPanel.id = `panel-${id}`;
    const grid = document.createElement('div');
    grid.className = 'sound-grid';
    grid.id = `grid-${id}`;
    grid.appendChild(createEmptySlot(id));
    newPanel.appendChild(grid);
    mainContent.appendChild(newPanel);

    tabData.set(id, {
        name: name,
        sounds: new Map()
    });
}

function createTab(name) {
    createTabElement(tabCounter, name);
    switchToTab(tabCounter);
    tabCounter++;
    saveState();
    showToast(`Tab "${name}" created`);
}

function removeTab(tabId) {
    if (tabData.size <= 1) return; // Don't remove last tab
    
    // Stop all sounds in this tab
    const tab = tabData.get(tabId);
    if (tab) {
        tab.sounds.forEach(sound => {
            if (sound.audio) {
                sound.audio.pause();
                sound.audio.src = '';
                if (sound.gainNode) sound.gainNode.disconnect();
            }
        });
    }
    
    // Remove tab data and elements
    tabData.delete(tabId);
    document.querySelector(`[data-tab="${tabId}"]`).remove();
    document.getElementById(`panel-${tabId}`).remove();
    
    // Switch to first available tab if current tab was removed
    if (currentTab === tabId) {
        const firstTab = Array.from(tabData.keys())[0];
        switchToTab(firstTab);
    }
    saveState();
}

function switchToTab(tabId) {
    // Update tab appearance
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Update panel visibility
    document.querySelectorAll('.panel-content').forEach(panel => {
        panel.classList.add('hidden');
    });
    document.getElementById(`panel-${tabId}`).classList.remove('hidden');

    currentTab = tabId;
    saveState();
}

// Sound management
async function loadSound(input, tabId, isTemporary = false) {
    const file = input.files[0];
    if (!file) return;

    const soundId = `sound-${soundCounter++}`;
    const fileId = isTemporary ? null : `file-${libraryCounter++}`;

    try {
        if (!isTemporary) {
            await storage.put(fileId, file);
        }
        const objectUrl = URL.createObjectURL(file);
        const audio = new Audio(objectUrl);
        const gainNode = setupWebAudio(audio);

        // Create sound card
        const soundCard = createSoundCard(soundId, file.name, audio, tabId, isTemporary);

        // Replace the empty slot
        const grid = document.getElementById(`grid-${tabId}`);
        const emptySlot = input.closest('.empty-slot');
        emptySlot.replaceWith(soundCard);

        // Create new empty slot
        const newEmptySlot = createEmptySlot(tabId);
        grid.appendChild(newEmptySlot);

        const tab = tabData.get(tabId);
        tab.sounds.set(soundId, {
            name: file.name,
            audio: audio,
            gainNode: gainNode,
            isLooping: false,
            element: soundCard,
            volume: 1.0,
            fileKey: fileId,
            isTemporary,
            objectUrl
        });

        if (!isTemporary && fileId) {
            libraryData.set(fileId, { name: file.name });
        } else {
            temporaryFiles.add(objectUrl);
        }

        audioElements.set(soundId, audio);

        setupAudioEvents(audio, soundId, tabId);
        saveState();
        showToast(isTemporary ? 'Quick Play loaded' : 'Sound added');
    } catch (e) {
        console.error('Failed to load sound file', e);
        showToast('Error loading file');
    }
}

async function loadSoundFromUrl(url, tabId, isTemporary = false) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
        }
        const blob = await res.blob();
        if (!blob.type.includes('audio')) {
            showToast('URL must point to an audio file');
            return;
        }
        const name = url.split('/').pop().split('?')[0] || 'audio';
        const fileId = isTemporary ? null : `file-${libraryCounter++}`;
        const soundId = `sound-${soundCounter++}`;
        if (!isTemporary) {
            await storage.put(fileId, blob);
        }
        const objectUrl = URL.createObjectURL(blob);
        const audio = new Audio(objectUrl);
        const gainNode = setupWebAudio(audio);

        const soundCard = createSoundCard(soundId, name, audio, tabId, isTemporary);

        const grid = document.getElementById(`grid-${tabId}`);
        const emptySlot = grid.querySelector('.empty-slot');
        if (emptySlot) emptySlot.replaceWith(soundCard);
        grid.appendChild(createEmptySlot(tabId));

        const tab = tabData.get(tabId);
        tab.sounds.set(soundId, {
            name,
            audio,
            gainNode: gainNode,
            isLooping: false,
            element: soundCard,
            volume: 1.0,
            fileKey: fileId,
            isTemporary,
            objectUrl
        });

        if (!isTemporary && fileId) {
            libraryData.set(fileId, { name });
        } else {
            temporaryFiles.add(objectUrl);
        }

        audioElements.set(soundId, audio);
        setupAudioEvents(audio, soundId, tabId);
        saveState();
        showToast(isTemporary ? 'Temporary sound added from URL' : 'Sound added from URL');
    } catch (e) {
        console.error('Failed to load audio from URL', e);
        showToast(`Error loading audio: ${e.message}`);
    }
}

function promptLoadFromUrl(tabId, isTemporary = false) {
    const url = prompt('Enter MP3/WAV URL');
    if (url) {
        loadSoundFromUrl(url.trim(), tabId, isTemporary);
    }
}

function loadTemporaryFile(tabId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav';
    input.onchange = () => loadSound(input, tabId, true);
    input.click();
}

function loadFileForSave(tabId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mp3,.wav';
    input.onchange = () => loadSound(input, tabId, false);
    input.click();
}

function createSoundCard(soundId, name, audio, tabId, isTemporary = false) {
    const card = document.createElement('div');
    card.className = 'sound-card';
    if (isTemporary) card.classList.add('temporary');
    card.dataset.soundId = soundId;
    card.dataset.tabId = tabId;

    card.innerHTML = `
        <button class="remove-sound" onclick="removeSound('${soundId}', ${tabId})">×</button>
        <button class="rename-sound" onclick="startRenameSound('${soundId}', ${tabId})" title="Rename">✎</button>
        ${isTemporary ? '<div class="temp-indicator">⚡ Quick Play</div>' : ''}
        <div class="sound-header">
            <div class="sound-title" title="${name}">${name}</div>
            <div class="sound-status" id="status-${soundId}"></div>
        </div>
        <div class="sound-controls">
            <button class="sound-btn play" id="play-${soundId}" onclick="playSound('${soundId}', ${tabId})">▶ Play</button>
            <button class="sound-btn pause" onclick="pauseSound('${soundId}', ${tabId})">⏸ Pause</button>
            <button class="sound-btn stop" onclick="stopSound('${soundId}', ${tabId})">⏹ Stop</button>
            <button class="sound-btn loop-toggle" onclick="toggleLoop('${soundId}', ${tabId})" id="loop-${soundId}">🔁 Loop</button>
        </div>
        <div class="sound-volume">
            <label>Vol</label>
            <input type="range" class="sound-volume-slider" id="volume-${soundId}"
                   min="0" max="100" value="100"
                   oninput="updateSoundVolume('${soundId}', ${tabId}, this.value)">

            <span class="sound-volume-value" id="volumeValue-${soundId}">100%</span>
        </div>
        <div class="time-controls">
            <button class="time-btn" onclick="skipBack('${soundId}', 5)">-5s</button>
            <button class="time-btn" onclick="skipBack('${soundId}', 15)">-15s</button>
            <button class="time-btn" onclick="skipBack('${soundId}', 20)">-20s</button>
        </div>
        <div class="progress-container">
            <div class="progress-bar" id="progress-${soundId}"></div>
        </div>
    `;
    const titleEl = card.querySelector('.sound-title');
    titleEl.ondblclick = () => startRenameSound(soundId, tabId);

    // Prevent dragging the card when interacting with the volume slider
    const volumeSlider = card.querySelector(`#volume-${soundId}`);
    if (volumeSlider) {
        volumeSlider.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            card.draggable = false;
        });
        const enableDrag = () => { card.draggable = true; };
        volumeSlider.addEventListener('pointerup', enableDrag);
        volumeSlider.addEventListener('pointercancel', enableDrag);
        volumeSlider.addEventListener('pointerleave', enableDrag);
    }

    setupDragAndDrop(card);
    return card;
}

function setupDragAndDrop(card) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
        draggedCard = card;
        e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    card.addEventListener('dragenter', () => card.classList.add('drag-over'));
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedCard || draggedCard === card) return;
        const grid = card.parentElement;
        grid.insertBefore(draggedCard, card);
        updateSoundOrder(grid);
        saveState();
        card.classList.remove('drag-over');
    });
    card.addEventListener('dragend', () => {
        draggedCard = null;
        card.classList.remove('drag-over');
    });
}

function setupEmptySlotDrag(slot) {
    slot.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    slot.addEventListener('dragenter', () => slot.classList.add('drag-over'));
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedCard) {
            const grid = slot.parentElement;
            grid.insertBefore(draggedCard, slot);
            updateSoundOrder(grid);
            saveState();
        }
        slot.classList.remove('drag-over');
    });
}

function createEmptySlot(tabId) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'empty-slot';
    emptySlot.innerHTML = `
        <div class="button-grid">
            <button class="btn small" onclick="loadFileForSave(${tabId})">💾 Save to Library</button>
            <button class="btn small" onclick="loadTemporaryFile(${tabId})">⚡ Quick Play</button>
            <button class="btn small" onclick="promptLoadFromUrl(${tabId})">🌐 URL (Save)</button>
            <button class="btn small" onclick="promptLoadFromUrl(${tabId}, true)">🌐 URL (Temp)</button>
        </div>
    `;
    setupEmptySlotDrag(emptySlot);
    return emptySlot;
}

function updateSoundOrder(grid) {
    const tabId = parseInt(grid.id.split('-')[1]);
    const tab = tabData.get(tabId);
    const newMap = new Map();
    grid.querySelectorAll('.sound-card').forEach(card => {
        const id = card.dataset.soundId;
        const sound = tab.sounds.get(id);
        if (sound) {
            newMap.set(id, sound);
        }
    });
    tab.sounds = newMap;
}

function setupAudioEvents(audio, soundId, tabId) {
    const card = document.querySelector(`[data-sound-id="${soundId}"]`);
    const status = document.getElementById(`status-${soundId}`);
    const progress = document.getElementById(`progress-${soundId}`);
    const playBtn = document.getElementById(`play-${soundId}`);

    // Set initial volume
    updateAudioVolume(soundId);
    
    audio.addEventListener('play', () => {
        card.classList.remove('paused');
        card.classList.add('playing');
        status.classList.remove('paused');
        status.classList.add('playing');
        if (playBtn) playBtn.classList.add('active');
    });
    
    audio.addEventListener('pause', () => {
        card.classList.remove('playing');
        card.classList.add('paused');
        status.classList.remove('playing');
        status.classList.add('paused');
        if (playBtn) playBtn.classList.remove('active');
    });
    
    audio.addEventListener('ended', () => {
        card.classList.remove('playing', 'paused');
        status.classList.remove('playing', 'paused');
        progress.style.width = '0%';
        if (playBtn) playBtn.classList.remove('active');
    });
    
    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            const progressPercent = (audio.currentTime / audio.duration) * 100;
            progress.style.width = progressPercent + '%';
        }
    });
}

// Audio control functions
function playSound(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);
    if (sound && sound.audio) {
        initAudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        sound.audio.play().catch(e => console.log('Playback failed:', e));
    }
}

function pauseSound(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);
    if (sound && sound.audio) {
        sound.audio.pause();
    }
}

function stopSound(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);
    if (sound && sound.audio) {
        sound.audio.pause();
        sound.audio.currentTime = 0;
    }
}

function toggleLoop(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);
    const loopBtn = document.getElementById(`loop-${soundId}`);

    if (sound) {
        sound.isLooping = !sound.isLooping;
        sound.audio.loop = sound.isLooping;
        loopBtn.classList.toggle('active', sound.isLooping);
        sound.element.classList.toggle('looping', sound.isLooping);
        saveState();
    }
}

function skipBack(soundId, seconds) {
    const audio = audioElements.get(soundId);
    if (audio) {
        audio.currentTime = Math.max(0, audio.currentTime - seconds);
    }
}

function startRenameSound(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);
    if (!sound) return;

    const card = sound.element;
    const titleEl = card.querySelector('.sound-title');
    if (!titleEl || card.querySelector('.sound-title-input')) return;

    const oldName = sound.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'sound-title-input';

    const finish = (save) => {
        let name = oldName;
        if (save) {
            const val = input.value.trim();
            if (val) name = val;
        }
        const newTitle = document.createElement('div');
        newTitle.className = 'sound-title';
        newTitle.textContent = name;
        newTitle.title = name;
        newTitle.ondblclick = () => startRenameSound(soundId, tabId);
        input.replaceWith(newTitle);
        sound.name = name;

        if (save && sound.fileKey && libraryData.has(sound.fileKey)) {
            renameFile(sound.fileKey, name);
        } else {
            saveState();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finish(true);
        } else if (e.key === 'Escape') {
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));

    titleEl.replaceWith(input);
    input.focus();
    input.select();
}

function removeSound(soundId, tabId) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);

    if (sound) {
        // Stop and cleanup audio
        sound.audio.pause();
        sound.audio.src = '';
        if (sound.gainNode) sound.gainNode.disconnect();
        const fileKey = sound.fileKey;

        if (sound.isTemporary && sound.objectUrl) {
            URL.revokeObjectURL(sound.objectUrl);
            temporaryFiles.delete(sound.objectUrl);
        }

        // Remove from DOM and data structures
        sound.element.remove();
        tab.sounds.delete(soundId);
        audioElements.delete(soundId);

        if (fileKey && !isFileReferencedInTabs(fileKey) && !libraryData.has(fileKey)) {
            storage.remove(fileKey);
        }
    }
    saveState();
}

function isFileReferencedInTabs(fileKey) {
    for (const tab of tabData.values()) {
        for (const sound of tab.sounds.values()) {
            if (sound.fileKey === fileKey) {
                return true;
            }
        }
    }
    return false;
}

function renameFile(fileId, newName) {
    const data = libraryData.get(fileId);
    if (data) {
        data.name = newName;
    } else {
        libraryData.set(fileId, { name: newName });
    }

    tabData.forEach(tab => {
        tab.sounds.forEach(sound => {
            if (sound.fileKey === fileId) {
                sound.name = newName;
                const title = sound.element.querySelector('.sound-title');
                if (title) {
                    title.textContent = newName;
                    title.title = newName;
                }
            }
        });
    });

    if (!document.getElementById('libraryModal').classList.contains('hidden')) {
        refreshLibraryList();
    }

    saveState();
}

// Global controls
function stopAllSounds() {
    audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
    });
}

function clearCurrentPanel() {
    if (confirm('Are you sure you want to clear all sounds from this panel?')) {
        const tab = tabData.get(currentTab);
        
        // Stop and cleanup all sounds
        tab.sounds.forEach(sound => {
            sound.audio.pause();
            sound.audio.src = '';
            if (sound.gainNode) sound.gainNode.disconnect();
            const fileKey = sound.fileKey;
            sound.element.remove();
            if (fileKey && !isFileReferencedInTabs(fileKey) && !libraryData.has(fileKey)) {
                storage.remove(fileKey);
            }
        });
        
        // Clear data structures
        tab.sounds.clear();
        
        // Remove all audio elements for this tab
        audioElements.forEach((audio, soundId) => {
            if (tab.sounds.has(soundId)) {
                audioElements.delete(soundId);
            }
        });
        
        // Reset grid with empty slot
        const grid = document.getElementById(`grid-${currentTab}`);
        grid.innerHTML = '';
        grid.appendChild(createEmptySlot(currentTab));
        saveState();
    }
}

// Volume control functions
function updateMasterVolume(value) {
    masterVolume = value / 100;
    document.getElementById('masterVolumeValue').textContent = value + '%';
    if (masterGain) masterGain.gain.value = masterVolume;
    
    // Update all currently loaded audio elements
    audioElements.forEach((audio, soundId) => {
        updateAudioVolume(soundId);
    });
    saveState();
}

function updateSoundVolume(soundId, tabId, value) {
    const tab = tabData.get(tabId);
    const sound = tab.sounds.get(soundId);

    if (sound) {
        sound.volume = value / 100;
        document.getElementById(`volumeValue-${soundId}`).textContent = value + '%';
        const slider = document.getElementById(`volume-${soundId}`);
        const number = document.getElementById(`volumeNum-${soundId}`);
        if (slider && slider.value !== value) slider.value = value;
        if (number && number.value !== value) number.value = value;
        updateAudioVolume(soundId);
        saveState();
    }
}

function updateAudioVolume(soundId) {
    const audio = audioElements.get(soundId);
    if (!audio) return;
    let soundData = null;
    for (const tab of tabData.values()) {
        if (tab.sounds.has(soundId)) {
            soundData = tab.sounds.get(soundId);
            break;
        }
    }
    const vol = soundData ? soundData.volume : 1.0;
    audio.volume = masterVolume * vol;
    if (soundData && soundData.gainNode) {
        soundData.gainNode.gain.value = vol;
    }
    if (masterGain) masterGain.gain.value = masterVolume;
}

function saveState() {
    const state = {
        masterVolume,
        tabCounter,
        soundCounter,
        libraryCounter,
        currentTab,
        tabs: [],
        library: []
    };

    tabData.forEach((tab, id) => {
        const tabInfo = { id, name: tab.name, sounds: [] };
        tab.sounds.forEach((sound, sid) => {
            if (sound.isTemporary) return;
            tabInfo.sounds.push({
                id: sid,
                name: sound.name,
                fileKey: sound.fileKey,
                volume: sound.volume,
                isLooping: sound.isLooping
            });
        });
        state.tabs.push(tabInfo);
    });

    libraryData.forEach((data, id) => {
        state.library.push({ id, name: data.name });
    });

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

async function loadState() {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!saved) return;

    try {
        const state = JSON.parse(saved);
        masterVolume = state.masterVolume ?? 1.0;
        tabCounter = state.tabCounter ?? 1;
        soundCounter = state.soundCounter ?? 0;
        libraryCounter = state.libraryCounter ?? 0;
        currentTab = state.currentTab ?? 0;

        document.getElementById('masterVolume').value = Math.round(masterVolume * 100);
        document.getElementById('masterVolumeValue').textContent = Math.round(masterVolume * 100) + '%';

        const tabContainer = document.querySelector('.tab-container');
        const addTabBtn = document.querySelector('.add-tab');
        tabContainer.querySelectorAll('.tab').forEach(t => t.remove());
        document.querySelectorAll('.panel-content').forEach(p => p.remove());
        tabData.clear();
        audioElements.clear();
        libraryData.clear();

        let migrated = false;
        libraryData.clear();
        if (Array.isArray(state.library)) {
            state.library.forEach(item => {
                libraryData.set(item.id, { name: item.name });
            });
        }

        for (const tab of state.tabs) {
            createTabElement(tab.id, tab.name);
            const grid = document.getElementById(`grid-${tab.id}`);
            grid.innerHTML = '';

            for (const s of tab.sounds) {
                if (s.dataUrl && !s.fileKey) {
                    const blob = dataURLToBlob(s.dataUrl);
                    await storage.put(s.id, blob);
                    s.fileKey = s.id;
                    delete s.dataUrl;
                    migrated = true;
                }

                const blob = await storage.get(s.fileKey);
                if (!blob) continue;
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                const gainNode = setupWebAudio(audio, s.volume);
                audio.loop = s.isLooping;
                const card = createSoundCard(s.id, s.name, audio, tab.id);
                grid.appendChild(card);

                tabData.get(tab.id).sounds.set(s.id, {
                    name: s.name,
                    audio,
                    gainNode: gainNode,
                    isLooping: s.isLooping,
                    element: card,
                    volume: s.volume,
                    fileKey: s.fileKey
                });

                if (!libraryData.has(s.fileKey)) {
                    libraryData.set(s.fileKey, { name: s.name });
                }

                audioElements.set(s.id, audio);
                setupAudioEvents(audio, s.id, tab.id);
                document.getElementById(`loop-${s.id}`).classList.toggle('active', s.isLooping);
                card.classList.toggle('looping', s.isLooping);
                document.getElementById(`volume-${s.id}`).value = Math.round(s.volume * 100);
                const numInput = document.getElementById(`volumeNum-${s.id}`);
                if (numInput) numInput.value = Math.round(s.volume * 100);
                document.getElementById(`volumeValue-${s.id}`).textContent = Math.round(s.volume * 100) + '%';
                updateAudioVolume(s.id);
            }

            const emptySlot = createEmptySlot(tab.id);
            grid.appendChild(emptySlot);
        }

        if (migrated) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
        }

        switchToTab(currentTab);
    } catch (e) {
        console.error('Failed to load state', e);
        showToast('Unable to restore saved sounds');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        stopAllSounds();
    }
});

// Modal keyboard handling
document.getElementById('tabNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmTabAction();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelTabAction();
    }
});

// Click outside modal to close
document.getElementById('tabModal').addEventListener('click', (e) => {
    if (e.target.id === 'tabModal') {
        cancelTabAction();
    }
});

function openLibrary() {
    refreshLibraryList();
    document.getElementById('libraryModal').classList.remove('hidden');
}

function closeLibrary() {
    document.getElementById('libraryModal').classList.add('hidden');
    const input = document.getElementById('libraryFileInput');
    if (input) input.value = '';
}

function refreshLibraryList() {
    const list = document.getElementById('libraryList');
    list.innerHTML = '';
    libraryData.forEach((data, fileId) => {
        const item = document.createElement('div');
        item.className = 'library-item';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = data.name;
        const btnContainer = document.createElement('div');
        btnContainer.className = 'library-buttons';

        const addBtn = document.createElement('button');
        addBtn.className = 'btn small';
        addBtn.textContent = 'Add to Tab';
        addBtn.onclick = () => addFromLibrary(fileId, currentTab);

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn small';
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = () => libraryRenameFile(fileId);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn small danger';
        delBtn.textContent = 'Delete';
        delBtn.onclick = () => libraryDeleteFile(fileId);

        btnContainer.appendChild(addBtn);
        btnContainer.appendChild(renameBtn);
        btnContainer.appendChild(delBtn);

        item.appendChild(nameSpan);
        item.appendChild(btnContainer);
        list.appendChild(item);
    });
}

function addFromLibrary(fileId, tabId) {
    const data = libraryData.get(fileId);
    if (!data) return;
    storage.get(fileId).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        const gainNode = setupWebAudio(audio);
        const soundId = `sound-${soundCounter++}`;

        const soundCard = createSoundCard(soundId, data.name, audio, tabId);
        const grid = document.getElementById(`grid-${tabId}`);
        const emptySlot = grid.querySelector('.empty-slot');
        if (emptySlot) emptySlot.replaceWith(soundCard);
        grid.appendChild(createEmptySlot(tabId));

        const tab = tabData.get(tabId);
        tab.sounds.set(soundId, {
            name: data.name,
            audio,
            gainNode: gainNode,
            isLooping: false,
            element: soundCard,
            volume: 1.0,
            fileKey: fileId
        });

        audioElements.set(soundId, audio);
        setupAudioEvents(audio, soundId, tabId);
        saveState();
        showToast('Sound added from library');
    });
}

function libraryRenameFile(fileId) {
    const data = libraryData.get(fileId);
    if (!data) return;
    const name = prompt('Enter new file name', data.name);
    if (name && name.trim()) {
        renameFile(fileId, name.trim());
        showToast('File renamed');
    }
}

async function libraryAddFile() {
    const input = document.getElementById('libraryFileInput');
    const file = input.files[0];
    if (!file) return;

    const fileId = `file-${libraryCounter++}`;
    try {
        await storage.put(fileId, file);
        libraryData.set(fileId, { name: file.name });
        input.value = '';
        refreshLibraryList();
        saveState();
        showToast('File added to library');
    } catch (e) {
        console.error('Failed to add file to library', e);
        showToast('Error adding file to library');
    }
}

async function libraryDeleteFile(fileId) {
    const data = libraryData.get(fileId);
    if (!data) return;

    if (isFileReferencedInTabs(fileId)) {
        const proceed = confirm('This file is used in one or more tabs. Deleting it may break those sounds after reload. Continue?');
        if (!proceed) return;
    }

    try {
        await storage.remove(fileId);
    } catch (e) {
        console.error('Failed to remove file from storage', e);
        showToast('Error deleting file');
        return;
    }

    libraryData.delete(fileId);
    refreshLibraryList();
    saveState();
    showToast('File deleted from library');
}

async function exportBoard() {
    saveState();
    const stateStr = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stateStr) {
        showToast('Nothing to export');
        return;
    }

    const state = JSON.parse(stateStr);
    const files = {};
    for (const [fileId, data] of libraryData.entries()) {
        const blob = await storage.get(fileId);
        if (!blob) continue;
        files[fileId] = {
            name: data.name,
            dataUrl: await blobToDataURL(blob)
        };
    }

    const exportData = { state, files };
    const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soundboard-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported board');
}

function triggerImport() {
    const input = document.getElementById('importInput');
    if (input) input.click();
}

function handleImportFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);
            await importBoardData(data);
            input.value = '';
        } catch (e) {
            console.error('Import failed', e);
            showToast('Failed to import');
        }
    };
    reader.onerror = () => {
        showToast('Error reading file');
    };
    reader.readAsText(file);
}

async function importBoardData(data) {
    if (!data || !data.state) {
        showToast('Invalid import');
        return;
    }

    await storage.clear();
    libraryData.clear();

    if (data.files) {
        for (const [fileId, info] of Object.entries(data.files)) {
            try {
                const blob = dataURLToBlob(info.dataUrl);
                await storage.put(fileId, blob);
                libraryData.set(fileId, { name: info.name });
            } catch (e) {
                console.error('Failed to import file', e);
            }
        }
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data.state));
    await loadState();
    showToast('Import complete');
}

// Initialize first tab with rename functionality
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    const firstTabSpan = document.querySelector('[data-tab="0"] span');
    if (firstTabSpan) {
        firstTabSpan.ondblclick = (e) => {
            e.stopPropagation();
            renameTab(0);
        };
        firstTabSpan.style.cursor = 'pointer';
        firstTabSpan.title = 'Double-click to rename';
    }
});

// Prevent default drag behavior
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// Cleanup temporary object URLs on page unload
window.addEventListener('beforeunload', () => {
    temporaryFiles.forEach(url => URL.revokeObjectURL(url));
    temporaryFiles.clear();
});
