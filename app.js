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
  masterShowAll: document.getElementById('masterShowAll'),
  masterHide: document.getElementById('masterHide'),
  resetBtn: document.getElementById('resetBtn'),
  markerModal: document.getElementById('markerModal'),
  markerName: document.getElementById('markerName'),
  markerCheck: document.getElementById('markerCheck'),
  markerSave: document.getElementById('markerSave'),
  markerCancel: document.getElementById('markerCancel'),
  diceCount: document.getElementById('diceCount'),
  diceType: document.getElementById('diceType'),
  diceRoll: document.getElementById('diceRoll'),
  diceResult: document.getElementById('diceResult'),
};

let state = {
  imageDataUrl: null,
  cols: 8,
  rows: 6,
  revealed: {}, // { "i,j": true }
  markers: [],  // { id, x, y, name, check }
  nextMarkerId: 1,
  mode: 'marker', // 'reveal' | 'marker' — по умолчанию клик добавляет точку
  pendingMarker: null, // { x, y } в процентах при добавлении маркера
  masterViewAll: false, // режим мастера: показывать всю карту (не сохраняется)
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
  dom.modeReveal.addEventListener('click', () => setMode(state.mode === 'reveal' ? 'marker' : 'reveal'));
  dom.masterShowAll.addEventListener('click', onMasterShowAll);
  dom.masterHide.addEventListener('click', onMasterHide);
  dom.resetBtn.addEventListener('click', onReset);
  dom.markerSave.addEventListener('click', onMarkerSave);
  dom.markerCancel.addEventListener('click', closeMarkerModal);
  dom.markerModal.addEventListener('hidden.bs.modal', () => { state.pendingMarker = null; });
  dom.diceRoll.addEventListener('click', onDiceRoll);

  dom.mapContainer.addEventListener('click', onMapClick);
}

function setMode(mode) {
  state.mode = mode;
  dom.modeReveal.classList.toggle('active', mode === 'reveal');
}

function isCellVisible(key) {
  return state.revealed[key] || state.masterViewAll;
}

function onMasterShowAll() {
  state.masterViewAll = true;
  renderFog();
  renderGrid();
  dom.masterShowAll.classList.add('active');
  dom.masterHide.classList.remove('active');
}

function onMasterHide() {
  state.masterViewAll = false;
  renderFog();
  renderGrid();
  dom.masterShowAll.classList.remove('active');
  dom.masterHide.classList.remove('active');
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
  dom.mapImage.src = dataUrl;
  dom.mapImage.onload = () => {
    dom.mapPlaceholder.hidden = true;
    dom.mapContainer.hidden = false;
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
      if (isCellVisible(`${i},${j}`)) cell.classList.add('revealed');
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
      fogCell.className = 'fog-cell' + (isCellVisible(key) ? ' revealed' : '');
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
  const gridCell = e.target.closest('.cell');
  const cellEl = fogCell || gridCell;
  if (!cellEl) return;

  const i = parseInt(cellEl.dataset.i, 10);
  const j = parseInt(cellEl.dataset.j, 10);

  if (state.mode === 'reveal') {
    const radius = parseInt(dom.revealSize?.value || '0', 10);
    const ci = i;
    const cj = j;
    for (let jj = cj - radius; jj <= cj + radius; jj++) {
      for (let ii = ci - radius; ii <= ci + radius; ii++) {
        if (ii < 0 || ii >= state.cols || jj < 0 || jj >= state.rows) continue;
        const k = `${ii},${jj}`;
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

// --- Кубики ---

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function formatD20Roll(value) {
  if (value === 20) return '20 ⭐️';
  if (value === 1) return '1 🔻';
  return String(value);
}

function formatRollForDisplay(value, sides) {
  return sides === 20 ? formatD20Roll(value) : String(value);
}

function onDiceRoll() {
  const count = Math.max(1, Math.min(99, parseInt(dom.diceCount.value, 10) || 1));
  const sides = parseInt(dom.diceType.value, 10);
  dom.diceCount.value = count;

  const rolls = [];
  for (let i = 0; i < count; i++) {
    rolls.push(rollDie(sides));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);

  const label = count === 1 ? `d${sides}` : `${count}d${sides}`;
  const formattedRolls = rolls.map((r) => formatRollForDisplay(r, sides));
  let finalText;
  if (count <= 15) {
    finalText = `${label}: ${formattedRolls.join(' + ')}${count > 1 ? ` = ${sum}` : ''}`;
  } else {
    finalText = `${label}: ${formattedRolls.slice(0, 6).join(', ')}… (всего ${count}) = ${sum}`;
  }

  // Показать анимацию «крутящегося» кубика 600ms
  dom.diceResult.hidden = false;
  dom.diceResult.classList.add('is-rolling');
  dom.diceResult.innerHTML = `
    <span class="dice-roll-preview">
      ${label}: <span class="dice-roll-value" aria-hidden="true">?</span>
    </span>
  `;
  const valueEl = dom.diceResult.querySelector('.dice-roll-value');

  const ROLL_DURATION = 600;
  const TICK = 80;
  const intervalId = setInterval(() => {
    if (valueEl) valueEl.textContent = rollDie(sides);
  }, TICK);

  setTimeout(() => {
    clearInterval(intervalId);
    if (valueEl) valueEl.textContent = count === 1 ? rolls[0] : `= ${sum}`;
    setTimeout(() => {
      dom.diceResult.classList.remove('is-rolling');
      dom.diceResult.innerHTML = '';
      dom.diceResult.textContent = finalText;
    }, 80);
  }, ROLL_DURATION);
}

// --- Маркеры (точки проверок) ---

let markerModalInstance = null;

function openMarkerModal(pos) {
  state.pendingMarker = pos;
  dom.markerName.value = '';
  dom.markerCheck.value = '';
  if (!markerModalInstance) {
    markerModalInstance = bootstrap.Modal.getOrCreateInstance(dom.markerModal);
  }
  markerModalInstance.show();
}

function closeMarkerModal() {
  if (markerModalInstance) markerModalInstance.hide();
  state.pendingMarker = null;
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
    li.className = 'list-group-item d-flex justify-content-between align-items-start';
    li.innerHTML = `
      <span>
        <strong>${index + 1}. ${escapeHtml(m.name)}</strong>
        ${m.check ? `<div class="marker-check text-muted small">${escapeHtml(m.check)}</div>` : ''}
      </span>
      <button type="button" class="btn btn-sm btn-outline-danger" aria-label="Удалить" data-id="${m.id}">×</button>
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
