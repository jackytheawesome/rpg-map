/**
 * Интерактивная карта для НРИ:
 * - загрузка изображения и разбивка на клетки
 * - точки проверок (маркеры)
 * - открытие клеток по мере прохождения (туман войны)
 * - сохранение в localStorage
 */

const STORAGE_KEY = 'rpg-map-state';

const dom = {
  imageInput: document.getElementById('imageInput'),
  cols: document.getElementById('cols'),
  rows: document.getElementById('rows'),
  mapPlaceholder: document.getElementById('mapPlaceholder'),
  mapContainer: document.getElementById('mapContainer'),
  mapImage: document.getElementById('mapImage'),
  gridLayer: document.getElementById('gridLayer'),
  fogLayer: document.getElementById('fogLayer'),
  markersLayer: document.getElementById('markersLayer'),
  markersList: document.getElementById('markersList'),
  revealSize: document.getElementById('revealSize'),
  modeReveal: document.getElementById('modeReveal'),
  modeMarker: document.getElementById('modeMarker'),
  resetBtn: document.getElementById('resetBtn'),
  markerModal: document.getElementById('markerModal'),
  markerName: document.getElementById('markerName'),
  markerCheck: document.getElementById('markerCheck'),
  markerSave: document.getElementById('markerSave'),
  markerCancel: document.getElementById('markerCancel'),
};

let state = {
  imageDataUrl: null,
  cols: 8,
  rows: 6,
  revealed: {}, // { "i,j": true }
  markers: [],  // { id, x, y, name, check }
  nextMarkerId: 1,
  mode: 'reveal', // 'reveal' | 'marker'
  pendingMarker: null, // { x, y } в процентах при добавлении маркера
};

// --- Инициализация ---

function init() {
  loadState();
  applyGridInputs();
  bindEvents();
  if (state.imageDataUrl) {
    showMap(state.imageDataUrl);
    renderAll();
  }
}

function applyGridInputs() {
  state.cols = Math.max(4, Math.min(24, parseInt(dom.cols.value, 10) || 8));
  state.rows = Math.max(4, Math.min(24, parseInt(dom.rows.value, 10) || 6));
  dom.cols.value = state.cols;
  dom.rows.value = state.rows;
}

function bindEvents() {
  dom.imageInput.addEventListener('change', onImageSelect);
  dom.cols.addEventListener('change', onGridChange);
  dom.rows.addEventListener('change', onGridChange);
  dom.modeReveal.addEventListener('click', () => setMode('reveal'));
  dom.modeMarker.addEventListener('click', () => setMode('marker'));
  dom.resetBtn.addEventListener('click', onReset);
  dom.markerSave.addEventListener('click', onMarkerSave);
  dom.markerCancel.addEventListener('click', closeMarkerModal);

  dom.fogLayer.addEventListener('click', onMapClick);
}

function setMode(mode) {
  state.mode = mode;
  dom.modeReveal.classList.toggle('active', mode === 'reveal');
  dom.modeMarker.classList.toggle('active', mode === 'marker');
}

// --- Загрузка изображения и сетка ---

function onImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.imageDataUrl = reader.result;
    state.revealed = {};
    showMap(state.imageDataUrl);
    renderAll();
    saveState();
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function onGridChange() {
  applyGridInputs();
  if (state.imageDataUrl) {
    renderGrid();
    renderFog();
  }
  saveState();
}

function showMap(dataUrl) {
  dom.mapPlaceholder.hidden = true;
  dom.mapContainer.hidden = false;
  dom.mapImage.src = dataUrl;
  dom.mapImage.onload = () => {
    renderGrid();
    renderFog();
    renderMarkers();
  };
}

function renderAll() {
  renderGrid();
  renderFog();
  renderMarkers();
  renderMarkersList();
}

function renderGrid() {
  const cols = state.cols;
  const rows = state.rows;
  dom.gridLayer.innerHTML = '';
  dom.gridLayer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  dom.gridLayer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.i = i;
      cell.dataset.j = j;
      cell.dataset.key = `${i},${j}`;
      if (state.revealed[`${i},${j}`]) cell.classList.add('revealed');
      dom.gridLayer.appendChild(cell);
    }
  }
}

function renderFog() {
  const cols = state.cols;
  const rows = state.rows;
  const img = dom.mapImage;
  if (!img.complete || !img.naturalWidth) return;
  const rect = img.getBoundingClientRect();
  const cellW = rect.width / cols;
  const cellH = rect.height / rows;

  dom.fogLayer.innerHTML = '';
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const key = `${i},${j}`;
      const fogCell = document.createElement('div');
      fogCell.className = 'fog-cell' + (state.revealed[key] ? ' revealed' : '');
      fogCell.dataset.i = i;
      fogCell.dataset.j = j;
      fogCell.dataset.key = key;
      fogCell.style.left = `${(i / cols) * 100}%`;
      fogCell.style.top = `${(j / rows) * 100}%`;
      fogCell.style.width = `${100 / cols}%`;
      fogCell.style.height = `${100 / rows}%`;
      dom.fogLayer.appendChild(fogCell);
    }
  }
}

// --- Клик по карте: открытие клеток или добавление маркера ---

function onMapClick(e) {
  const fogCell = e.target.closest('.fog-cell');
  if (!fogCell) return;

  const i = parseInt(fogCell.dataset.i, 10);
  const j = parseInt(fogCell.dataset.j, 10);
  const key = `${i},${j}`;

  if (state.mode === 'reveal') {
    const radius = parseInt(dom.revealSize?.value || '0', 10);
    const ci = parseInt(fogCell.dataset.i, 10);
    const cj = parseInt(fogCell.dataset.j, 10);
    for (let j = cj - radius; j <= cj + radius; j++) {
      for (let i = ci - radius; i <= ci + radius; i++) {
        if (i < 0 || i >= state.cols || j < 0 || j >= state.rows) continue;
        const k = `${i},${j}`;
        state.revealed[k] = true;
        const fc = dom.fogLayer.querySelector(`[data-key="${k}"]`);
        if (fc) fc.classList.add('revealed');
        const gc = dom.gridLayer.querySelector(`[data-key="${k}"]`);
        if (gc) gc.classList.add('revealed');
      }
    }
    saveState();
    return;
  }

  if (state.mode === 'marker') {
    const rect = dom.mapContainer.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    openMarkerModal({ x, y });
  }
}

// --- Маркеры (точки проверок) ---

function openMarkerModal(pos) {
  state.pendingMarker = pos;
  dom.markerName.value = '';
  dom.markerCheck.value = '';
  dom.markerModal.hidden = false;
}

function closeMarkerModal() {
  state.pendingMarker = null;
  dom.markerModal.hidden = true;
}

function onMarkerSave() {
  if (!state.pendingMarker) return;
  const name = dom.markerName.value.trim() || 'Проверка';
  const check = dom.markerCheck.value.trim() || '';
  state.markers.push({
    id: state.nextMarkerId++,
    x: state.pendingMarker.x,
    y: state.pendingMarker.y,
    name,
    check,
  });
  closeMarkerModal();
  renderMarkers();
  renderMarkersList();
  saveState();
}

function deleteMarker(id) {
  state.markers = state.markers.filter((m) => m.id !== id);
  renderMarkers();
  renderMarkersList();
  saveState();
}

function renderMarkers() {
  dom.markersLayer.innerHTML = '';
  state.markers.forEach((m, index) => {
    const dot = document.createElement('div');
    dot.className = 'marker-dot';
    dot.style.left = `${m.x}%`;
    dot.style.top = `${m.y}%`;
    dot.title = [m.name, m.check].filter(Boolean).join(' — ');
    dot.textContent = index + 1;
    dot.dataset.id = m.id;
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Удалить точку «${m.name}»?`)) deleteMarker(m.id);
    });
    dom.markersLayer.appendChild(dot);
  });
}

function renderMarkersList() {
  dom.markersList.innerHTML = '';
  state.markers.forEach((m, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>
        <strong>${index + 1}. ${escapeHtml(m.name)}</strong>
        ${m.check ? `<div class="marker-check">${escapeHtml(m.check)}</div>` : ''}
      </span>
      <button type="button" aria-label="Удалить" data-id="${m.id}">×</button>
    `;
    li.querySelector('button').addEventListener('click', () => deleteMarker(m.id));
    dom.markersList.appendChild(li);
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// --- Сброс ---

function onReset() {
  if (!confirm('Сбросить карту, все открытые клетки и точки проверок?')) return;
  state.imageDataUrl = null;
  state.revealed = {};
  state.markers = [];
  state.nextMarkerId = 1;
  dom.mapContainer.hidden = true;
  dom.mapPlaceholder.hidden = false;
  dom.markersList.innerHTML = '';
  saveState();
}

// --- Сохранение / загрузка ---

function saveState() {
  try {
    const payload = {
      imageDataUrl: state.imageDataUrl,
      cols: state.cols,
      rows: state.rows,
      revealed: state.revealed,
      markers: state.markers,
      nextMarkerId: state.nextMarkerId,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Не удалось сохранить состояние', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    if (payload.imageDataUrl) state.imageDataUrl = payload.imageDataUrl;
    if (typeof payload.cols === 'number') state.cols = payload.cols;
    if (typeof payload.rows === 'number') state.rows = payload.rows;
    if (payload.revealed && typeof payload.revealed === 'object') state.revealed = payload.revealed;
    if (Array.isArray(payload.markers)) state.markers = payload.markers;
    if (typeof payload.nextMarkerId === 'number') state.nextMarkerId = payload.nextMarkerId;
    dom.cols.value = state.cols;
    dom.rows.value = state.rows;
  } catch (e) {
    console.warn('Не удалось загрузить состояние', e);
  }
}

// Запуск
init();
