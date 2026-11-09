// ==========================================
// ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ОШИБОК
// ==========================================
window.onerror = function(message, source, lineno, colno, error) {
    console.error("JS ERROR:", message, "at line", lineno);
    const ul = document.getElementById('search-results');
    if (ul) {
        ul.innerHTML = `<li style="color:var(--neon)">JS Ошибка: ${message} (строка ${lineno})</li>`;
    }
    return false;
};

// ==========================================
// КОНСТАНТЫ И СОСТОЯНИЕ
// ==========================================
const API_BASE = 'http://127.0.0.1:8765/api';
const audioPlayer = document.getElementById('audio-player');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');

let playlists = [];
let currentPlaylistId = null;
let searchResults = [];
let currentTrackList = [];
let currentTrackIndex = -1;
let isPlaying = false;
let isRepeat = false;

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function log(msg) {
    console.log(`[JS] ${msg}`);
}

function getCoverUrl(coverUrl) {
    return coverUrl || null;
}

function showError(ulId, text) {
    const ul = document.getElementById(ulId);
    if (ul) ul.innerHTML = `<li style="color:var(--neon)">${text}</li>`;
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ==========================================
// ИНИЦИАЛИЗАЦИЯ
// ==========================================
window.onload = async () => {
    log("Страница загружена. Запрос плейлистов...");
    try {
        const res = await fetch(`${API_BASE}/playlists`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        playlists = await res.json();
        renderPlaylists();
    } catch (e) {
        log("Ошибка при загрузке плейлистов: " + e.message);
        showError('playlist-list', 'Ошибка загрузки плейлистов');
    }
};

// ==========================================
// ПОИСК
// ==========================================
async function doSearch() {
    const q = document.getElementById('search-input').value.trim();
    if (!q) return;

    log(`Начинаем поиск: "${q}"`);
    document.getElementById('search-results').innerHTML = '<li style="color:var(--dim)">Поиск...</li>';

    try {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`Сервер вернул ошибку: ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        searchResults = data;
        renderSearchResults();
    } catch (e) {
        log(`Ошибка поиска: ${e.message}`);
        showError('search-results', `Ошибка поиска: ${e.message}`);
    }
}

function renderSearchResults() {
    const ul = document.getElementById('search-results');
    ul.innerHTML = '';

    if (searchResults.length === 0) {
        ul.innerHTML = '<li style="color:var(--dim)">Ничего не найдено</li>';
        return;
    }

    searchResults.forEach((t, i) => {
        const coverUrl = getCoverUrl(t.cover_uri);
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="track-item">
                ${coverUrl ? `<img class="track-cover" src="${coverUrl}" alt="">` : '<div class="track-cover"></div>'}
                <div class="track-info">
                    <span class="track-title">${t.title}</span>
                    <span class="track-artist">${t.artist}</span>
                </div>
            </div>
            <button class="btn-sm" onclick="event.stopPropagation(); addToPlaylist(${i})">+</button>
        `;
        li.onclick = () => { currentTrackList = searchResults; playTrack(i); };
        ul.appendChild(li);
    });
}

// ==========================================
// ПЛЕЙЛИСТЫ
// ==========================================
function renderPlaylists() {
    const ul = document.getElementById('playlist-list');
    ul.innerHTML = '';

    if (playlists.length === 0) {
        ul.innerHTML = '<li style="color:var(--dim)">Нет плейлистов</li>';
        return;
    }

    playlists.forEach(pl => {
        const li = document.createElement('li');
        li.className = 'playlist-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = pl.name;
        nameSpan.style.cursor = 'pointer';
        nameSpan.style.flex = '1';
        nameSpan.onclick = () => selectPlaylist(pl.id);

        const actions = document.createElement('div');
        actions.className = 'playlist-actions';

        const renameBtn = document.createElement('button');
        renameBtn.innerHTML = '✎';
        renameBtn.title = 'Переименовать';
        renameBtn.onclick = (e) => { e.stopPropagation(); renamePlaylist(pl.id, pl.name); };

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '✕';
        deleteBtn.title = 'Удалить плейлист';
        deleteBtn.onclick = (e) => { e.stopPropagation(); deletePlaylist(pl.id); };

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(nameSpan);
        li.appendChild(actions);
        ul.appendChild(li);
    });
}

function selectPlaylist(id) {
    currentPlaylistId = id;
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;

    document.getElementById('playlist-title').textContent = pl.name.toUpperCase();
    renderPlaylistTracks(pl);
}

function renderPlaylistTracks(pl) {
    const ul = document.getElementById('playlist-tracks');
    ul.innerHTML = '';

    if (pl.tracks.length === 0) {
        ul.innerHTML = '<li style="color:var(--dim)">Плейлист пуст</li>';
        return;
    }

    pl.tracks.forEach((t, i) => {
        const coverUrl = getCoverUrl(t.cover_uri);
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="track-item">
                ${coverUrl ? `<img class="track-cover" src="${coverUrl}" alt="">` : '<div class="track-cover"></div>'}
                <div class="track-info">
                    <span class="track-title">${t.title}</span>
                    <span class="track-artist">${t.artist}</span>
                </div>
            </div>
            <button class="btn-sm" onclick="event.stopPropagation(); removeTrack('${t.id}')">✕</button>
        `;
        li.onclick = () => { currentTrackList = pl.tracks; playTrack(i); };
        ul.appendChild(li);
    });
}

async function createPlaylist() {
    const name = prompt('Название плейлиста:');
    if (!name || !name.trim()) return;

    try {
        const res = await fetch(`${API_BASE}/create_playlist`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: name.trim()})
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const newPl = await res.json();
        playlists.push(newPl);
        renderPlaylists();
        selectPlaylist(newPl.id);
    } catch (e) {
        alert('Ошибка создания плейлиста: ' + e.message);
    }
}

async function renamePlaylist(id, oldName) {
    const newName = prompt('Новое название плейлиста:', oldName);
    if (!newName || !newName.trim() || newName === oldName) return;

    try {
        const res = await fetch(`${API_BASE}/rename_playlist`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id, name: newName.trim()})
        });
        if (res.ok) {
            playlists = await (await fetch(`${API_BASE}/playlists`)).json();
            renderPlaylists();
            if (currentPlaylistId === id) selectPlaylist(id);
        }
    } catch (e) {
        alert('Ошибка переименования');
    }
}

async function deletePlaylist(id) {
    if (!confirm('Вы уверены, что хотите удалить этот плейлист?')) return;

    try {
        const res = await fetch(`${API_BASE}/delete_playlist`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({id: id})
        });
        if (res.ok) {
            playlists = await (await fetch(`${API_BASE}/playlists`)).json();
            if (currentPlaylistId === id) {
                currentPlaylistId = null;
                document.getElementById('playlist-title').textContent = "Выберите плейлист";
                document.getElementById('playlist-tracks').innerHTML = '';
            }
            renderPlaylists();
        }
    } catch (e) {
        alert('Ошибка удаления');
    }
}

async function addToPlaylist(index) {
    if (!currentPlaylistId) {
        alert('Сначала выберите плейлист!');
        return;
    }
    const track = searchResults[index];

    try {
        const res = await fetch(`${API_BASE}/add_track`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({playlist_id: currentPlaylistId, track: track})
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.ok) {
            playlists = await (await fetch(`${API_BASE}/playlists`)).json();
            const pl = playlists.find(p => p.id === currentPlaylistId);
            if (pl) renderPlaylistTracks(pl);
        } else {
            alert('Трек уже есть в плейлисте');
        }
    } catch (e) {
        alert('Ошибка добавления: ' + e.message);
    }
}

async function removeTrack(trackId) {
    if (!currentPlaylistId) return;

    try {
        await fetch(`${API_BASE}/remove_track`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({playlist_id: currentPlaylistId, track_id: trackId})
        });
        playlists = await (await fetch(`${API_BASE}/playlists`)).json();
        const pl = playlists.find(p => p.id === currentPlaylistId);
        if (pl) renderPlaylistTracks(pl);
    } catch (e) {
        alert('Ошибка удаления: ' + e.message);
    }
}

// ==========================================
// ПЛЕЕР
// ==========================================
async function playTrack(index) {
    if (index < 0 || index >= currentTrackList.length) return;
    currentTrackIndex = index;
    const track = currentTrackList[index];

    document.getElementById('now-playing').innerHTML = `<span>${track.title}</span> — ${track.artist}`;
    const playBtn = document.getElementById('play-btn');
    playBtn.textContent = '⏳';

    try {
        const res = await fetch(`${API_BASE}/stream?id=${track.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        audioPlayer.src = data.url;
        await audioPlayer.play();
        isPlaying = true;
        playBtn.textContent = '⏸';
    } catch (e) {
        playBtn.textContent = '▶';
        alert('Не удалось воспроизвести трек: ' + e.message);
    }
}

function togglePlay() {
    const playBtn = document.getElementById('play-btn');
    if (!audioPlayer.src) return;

    if (isPlaying) {
        audioPlayer.pause();
        playBtn.textContent = '▶';
    } else {
        audioPlayer.play();
        playBtn.textContent = '⏸';
    }
    isPlaying = !isPlaying;
}

function nextTrack() {
    if (currentTrackList.length === 0) return;
    playTrack((currentTrackIndex + 1) % currentTrackList.length);
}

function prevTrack() {
    if (currentTrackList.length === 0) return;
    playTrack((currentTrackIndex - 1 + currentTrackList.length) % currentTrackList.length);
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeat-btn').classList.toggle('active-repeat', isRepeat);
}

// ==========================================
// ПОЛЗУНОК И ВРЕМЯ
// ==========================================
audioPlayer.addEventListener('timeupdate', () => {
    if (!audioPlayer.duration) return;
    progressBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
});

audioPlayer.addEventListener('loadedmetadata', () => {
    progressBar.disabled = false;
    totalTimeEl.textContent = formatTime(audioPlayer.duration);
});

audioPlayer.addEventListener('ended', () => {
    progressBar.value = 0;
    currentTimeEl.textContent = '0:00';
    if (isRepeat) {
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    } else {
        nextTrack();
    }
});

progressBar.addEventListener('input', () => {
    if (!audioPlayer.duration) return;
    audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
});