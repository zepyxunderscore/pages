/**
 * ui.js — All rendering, pages, charts, modals
 * Uses Material Symbols icons throughout (no emojis)
 */

const UI = {

  // ─── Theme ─────────────────────────────────────────────────────────────────
  applyTheme({ mode, scheme }) {
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.setAttribute('data-scheme', scheme);
    Storage.saveTheme({ mode, scheme });
  },

  // ─── Toast ─────────────────────────────────────────────────────────────────
  showToast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success:'check_circle', error:'error', info:'info', warning:'warning' };
    toast.innerHTML = `<span class="material-symbols-rounded icon-sm">${icons[type]||'info'}</span><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, duration);
  },

  // ─── Nav ───────────────────────────────────────────────────────────────────
  updateNavBar() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === App.currentPage);
    });
  },

  // ─── Router ────────────────────────────────────────────────────────────────
  renderPage(page) {
    const main = document.getElementById('main-content');
    main.innerHTML = '';
    main.classList.remove('page-enter');
    void main.offsetWidth;
    main.classList.add('page-enter');
    ({ dashboard: this.renderDashboard, scan: this.renderScan,
       log: this.renderLog, progress: this.renderProgress, settings: this.renderSettings
     }[page] || this.renderDashboard).call(this, main);
  },

  // ══════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════
  renderDashboard(container) {
    const profile = Storage.getProfile() || {};
    const goals   = Storage.getGoals()   || {};
    const dayLog  = Storage.getTodayLog();
    const streak  = Storage.getStreak();
    const totals  = dayLog.totals;
    const weightLog = Storage.getWeightLog();
    const lastWeight = weightLog.length ? weightLog[weightLog.length-1].weight : profile.weight;

    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const consumed  = totals.calories;
    const goalCal   = goals.calories || 2000;
    const remaining = Math.max(0, goalCal - consumed);
    const over      = consumed > goalCal;

    container.innerHTML = `
      <div>
        <!-- Top bar -->
        <div class="dashboard-topbar">
          <div>
            <p class="greeting-label">${greeting},</p>
            <h1 class="greeting-name">${profile.name || 'there'}</h1>
          </div>
          <div class="avatar-wrap" onclick="App.navigate('settings')" title="Settings">
            ${profile.pfp
              ? `<img src="${profile.pfp}" class="avatar" alt="Profile">`
              : `<div class="avatar-initials">${(profile.name||'?')[0].toUpperCase()}</div>`}
            ${streak.current > 1 ? `<div class="streak-badge">${streak.current} day streak</div>` : ''}
          </div>
        </div>

        <!-- Weight quick log -->
        <div class="card weight-log-card">
          <div class="card-row">
            <div>
              <p class="card-label">Today's weight</p>
              <p class="card-value">${lastWeight || '—'}<span class="card-unit"> kg</span></p>
              ${profile.targetWeight ? `<p class="label-sm text-muted">Target: ${profile.targetWeight} kg</p>` : ''}
            </div>
            <button class="btn-tonal btn-sm" onclick="UI.showWeightDialog()">
              <span class="material-symbols-rounded icon-sm">add</span> Log
            </button>
          </div>
        </div>

        <!-- Calorie ring -->
        <div class="card calorie-hero">
          <div class="calorie-ring-wrap">
            ${this.renderRing(consumed, goalCal, 160, 60, 14)}
            <div class="ring-center">
              <span class="ring-eaten">${consumed.toLocaleString()}</span>
              <span class="ring-sublabel">kcal eaten</span>
            </div>
          </div>
          <div class="calorie-stats">
            <div class="cal-stat">
              <span class="cal-stat-value">${goalCal.toLocaleString()}</span>
              <span class="cal-stat-label">Goal</span>
            </div>
            <div class="cal-stat ${over ? 'over' : ''}">
              <span class="cal-stat-value">${over ? consumed - goalCal : remaining}</span>
              <span class="cal-stat-label">${over ? 'Over by' : 'Left'}</span>
            </div>
            <div class="cal-stat">
              <span class="cal-stat-value">${goals.bmr || '—'}</span>
              <span class="cal-stat-label">BMR</span>
            </div>
          </div>
        </div>

        <!-- Macros -->
        <div class="card">
          <h3 class="card-title">Macros</h3>
          <div class="macros-list">
            ${this.macroBar('Protein', totals.protein, goals.protein, '#4ade80', '#16a34a')}
            ${this.macroBar('Carbohydrates', totals.carbs, goals.carbs, '#fbbf24', '#b45309')}
            ${this.macroBar('Fat', totals.fat, goals.fat, '#f87171', '#b91c1c')}
          </div>
        </div>

        <!-- Today's log preview -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Today's log</h3>
            <button class="btn-text" onclick="App.navigate('log')">
              View all <span class="material-symbols-rounded icon-sm">chevron_right</span>
            </button>
          </div>
          ${dayLog.entries.length === 0
            ? `<div class="empty-state">
                <div class="empty-icon-wrap"><span class="material-symbols-rounded icon-lg text-muted">restaurant</span></div>
                <p class="body-sm">No food logged today.</p>
                <button class="btn-tonal btn-sm" onclick="App.navigate('scan')">
                  <span class="material-symbols-rounded icon-sm">photo_camera</span> Scan food
                </button>
               </div>`
            : dayLog.entries.slice(-3).reverse().map(e => this.foodItem(e, true)).join('')
          }
        </div>

        <div style="height:4rem"></div>
      </div>`;
  },

  renderRing(consumed, goal, size, r, strokeW) {
    const cx = size / 2, cy = size / 2;
    const circ = 2 * Math.PI * r;
    const pct  = Math.min(1, goal ? consumed / goal : 0);
    const dash = pct * circ;
    const over = consumed > goal;
    return `
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle class="ring-track" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${strokeW}"/>
        <circle class="ring-fill ${over?'ring-over':''}" cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke-width="${strokeW}" stroke-linecap="round"
          stroke-dasharray="${dash} ${circ}"
          transform="rotate(-90 ${cx} ${cy})"
          style="transition:stroke-dasharray .9s cubic-bezier(.4,0,.2,1)"/>
      </svg>`;
  },

  macroBar(label, consumed, goal, fillLight, fillDark) {
    const pct = Math.min(100, goal ? (consumed / goal) * 100 : 0);
    const over = goal && consumed > goal;
    return `
      <div class="macro-row">
        <div class="macro-row-header">
          <span class="macro-row-label">
            <span class="macro-dot" style="background:${fillLight}"></span>${label}
          </span>
          <span class="macro-row-nums">
            <strong>${consumed}g</strong> / ${goal||'?'}g
          </span>
        </div>
        <div class="macro-track">
          <div class="macro-fill" style="width:${pct}%;background:${over ? 'var(--md-error)' : fillLight}"></div>
        </div>
      </div>`;
  },

  foodItem(entry, compact = false) {
    return `
      <div class="food-item" data-id="${entry.id}">
        ${entry.image
          ? `<img src="${entry.image}" class="food-thumb" alt="${entry.name}">`
          : `<div class="food-thumb-icon"><span class="material-symbols-rounded">nutrition</span></div>`}
        <div class="food-info">
          <p class="food-name">${entry.name}</p>
          <p class="food-meta">${entry.servingSize||'1 serving'}${entry.description ? ' · ' + entry.description.slice(0,40) : ''}</p>
          ${!compact ? `<p class="food-macros-row">P ${entry.protein||0}g · F ${entry.fat||0}g · C ${entry.carbs||0}g</p>` : ''}
        </div>
        <div class="food-actions">
          <span class="food-kcal">${entry.calories}</span>
          ${!compact ? `
            <div style="display:flex;gap:4px;margin-top:4px">
              <button class="btn-icon-sm" onclick="UI.editFoodEntry('${entry.id}')" title="Edit">
                <span class="material-symbols-rounded icon-sm">edit</span>
              </button>
              <button class="btn-icon-sm danger" onclick="UI.deleteFoodEntry('${entry.id}')" title="Delete">
                <span class="material-symbols-rounded icon-sm">delete</span>
              </button>
            </div>` : ''}
        </div>
      </div>`;
  },

  // ══════════════════════════════════════════════════════════
  // SCAN PAGE — tabs: Image | Describe | Manual
  // ══════════════════════════════════════════════════════════
  renderScan(container) {
    const hasKey = !!Storage.getApiSettings().apiKey;

    container.innerHTML = `
      <div>
        <div class="page-header">
          <h2 class="page-title">Add Food</h2>
          <p class="page-subtitle">Scan, describe, or enter manually</p>
        </div>

        ${!hasKey ? `
          <div class="alert alert-warning">
            <span class="material-symbols-rounded icon-sm alert-icon">warning</span>
            <span>No API key set. <button class="btn-text btn-sm" onclick="App.navigate('settings')">Add in Settings →</button></span>
          </div>` : ''}

        <div class="scan-tabs" id="scan-tabs">
          <button class="scan-tab active" data-tab="image" onclick="UI.switchScanTab('image')">
            <span class="material-symbols-rounded icon-sm">photo_camera</span> Image
          </button>
          <button class="scan-tab" data-tab="text" onclick="UI.switchScanTab('text')">
            <span class="material-symbols-rounded icon-sm">text_fields</span> Describe
          </button>
          <button class="scan-tab" data-tab="manual" onclick="UI.switchScanTab('manual')">
            <span class="material-symbols-rounded icon-sm">edit</span> Manual
          </button>
        </div>

        <!-- IMAGE TAB -->
        <div id="tab-image" class="scan-tab-panel">
          <div class="card">
            <div class="drop-zone" id="drop-zone" onclick="document.getElementById('food-img-input').click()">
              <div class="drop-content" id="drop-content">
                <div class="drop-icon-wrap">
                  <span class="material-symbols-rounded icon-lg">upload_file</span>
                </div>
                <p>Tap to upload or take a photo</p>
                <small>Drag &amp; drop · or Ctrl+V / Cmd+V to paste</small>
              </div>
            </div>
            <input type="file" id="food-img-input" accept="image/*" capture="environment"
              style="display:none" onchange="UI.handleScanImage(this)">
            <div style="margin-top:12px">
              <label class="form-label">Context (optional)</label>
              <div class="context-input-wrap">
                <span class="material-symbols-rounded icon-sm">edit_note</span>
                <textarea class="context-textarea" id="scan-context" rows="2"
                  placeholder="e.g. 'large bowl', 'homemade', '2 pieces'…"></textarea>
              </div>
            </div>
            <button class="btn-primary btn-full" id="scan-btn" style="display:none;margin-top:8px" onclick="UI.performImageScan()">
              <span class="material-symbols-rounded icon-sm">search</span> Analyse with AI
            </button>
          </div>
        </div>

        <!-- TEXT TAB -->
        <div id="tab-text" class="scan-tab-panel" style="display:none">
          <div class="card">
            <p class="card-subtitle">Type what you ate and AI will estimate the nutrition. Great for Indian meals!</p>
            <div class="text-scan-examples">
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">2 rotis + dal</span>
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">1 cup rice + rajma</span>
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">poha with peanuts</span>
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">3 idli + sambar</span>
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">curd rice bowl</span>
              <span class="text-scan-chip" onclick="UI.setTextExample(this)">banana milkshake</span>
            </div>
            <div class="form-group" style="margin-top:4px">
              <label class="form-label">Describe your meal</label>
              <div class="context-input-wrap" style="align-items:flex-start">
                <span class="material-symbols-rounded icon-sm" style="margin-top:3px">restaurant_menu</span>
                <textarea class="context-textarea" id="text-scan-input" rows="4"
                  placeholder="e.g. 2 rotis, 1 bowl curd, aloo sabzi with a bit of ghee"
                  style="min-height:90px"></textarea>
              </div>
            </div>
            <button class="btn-primary btn-full" id="text-scan-btn" onclick="UI.performTextScan()">
              <span class="material-symbols-rounded icon-sm">auto_awesome</span> Get Nutrition Estimate
            </button>
          </div>
        </div>

        <!-- MANUAL TAB -->
        <div id="tab-manual" class="scan-tab-panel" style="display:none">
          <div class="card" id="manual-card">
            <div id="manual-form">${this.manualFormHTML()}</div>
          </div>
        </div>

        <div id="scan-result-area"></div>
        <div style="height:4rem"></div>
      </div>`;

    this._setupDropZone();
    this._setupPaste();
  },

  switchScanTab(tab) {
    document.querySelectorAll('.scan-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    ['image','text','manual'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    const area = document.getElementById('scan-result-area');
    if (area) area.innerHTML = '';
  },

  setTextExample(el) {
    const input = document.getElementById('text-scan-input');
    if (input) { input.value = el.textContent.trim(); input.focus(); }
  },

  _scanFile: null,
  _pasteHandler: null,

  _setupDropZone() {
    const dz = document.getElementById('drop-zone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) UI._loadImageFile(file);
    });
  },

  _setupPaste() {
    if (this._pasteHandler) document.removeEventListener('paste', this._pasteHandler);
    this._pasteHandler = (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            UI.switchScanTab('image');
            UI._loadImageFile(file);
            e.preventDefault();
            UI.showToast('Image pasted!', 'success', 2000);
            break;
          }
        }
      }
    };
    document.addEventListener('paste', this._pasteHandler);
  },

  _loadImageFile(file) {
    this._scanFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dc = document.getElementById('drop-content');
      if (dc) dc.innerHTML =
        '<img src="' + ev.target.result + '" style="max-height:200px;max-width:100%;border-radius:12px;object-fit:contain" alt="Preview">' +
        '<p class="body-sm text-muted" style="margin-top:6px"><span class="material-symbols-rounded icon-sm" style="vertical-align:middle">check_circle</span> Image ready</p>';
      const btn = document.getElementById('scan-btn');
      if (btn) btn.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  },

  handleScanImage(input) {
    const file = input.files && input.files[0];
    if (file) this._loadImageFile(file);
  },

  async performImageScan() {
    if (!this._scanFile) return;
    const btn = document.getElementById('scan-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded icon-sm">hourglass_top</span> Analysing\u2026'; }
    const context = (document.getElementById('scan-context') || {}).value || '';
    try {
      const result = await FoodAPI.scanFood(this._scanFile, context.trim());
      App.scanResult = result;
      const reader = new FileReader();
      reader.onload = (ev) => { App.scanResult.image = ev.target.result; UI.showScanResult(result); };
      reader.readAsDataURL(this._scanFile);
    } catch(err) {
      this.showToast(err.message || 'Scan failed. Check your API key.', 'error', 5000);
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded icon-sm">search</span> Analyse with AI'; }
    }
  },

  async performTextScan() {
    const input = document.getElementById('text-scan-input');
    const desc  = input ? input.value.trim() : '';
    if (!desc) return this.showToast('Please describe your meal first', 'warning');
    const btn = document.getElementById('text-scan-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded icon-sm">hourglass_top</span> Estimating\u2026'; }
    try {
      const result = await FoodAPI.scanText(desc);
      App.scanResult = result;
      this.showScanResult(result);
    } catch(err) {
      this.showToast(err.message || 'Failed. Check your API key.', 'error', 5000);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded icon-sm">auto_awesome</span> Get Nutrition Estimate'; }
    }
  },
  showScanResult(result) {
    const area = document.getElementById('scan-result-area');
    if (!area) return;
    area.innerHTML = `
      <div class="card">
        <div class="scan-result-header">
          ${result.image ? `<img src="${result.image}" class="scan-result-img" alt="Scanned food">` : ''}
          <div>
            <h3 class="card-title" style="margin-bottom:6px">Scan Result</h3>
            <span class="confidence-badge confidence-${result.confidence}">
              <span class="material-symbols-rounded icon-sm">${result.confidence==='high'?'verified':'warning'}</span>
              ${result.confidence} confidence
            </span>
          </div>
        </div>
        ${result.notes ? `<p class="body-sm text-muted" style="margin-bottom:10px;font-style:italic">${result.notes}</p>` : ''}
        <p class="label-sm text-muted" style="margin-bottom:12px">Review and edit values if needed:</p>

        <div class="form-group">
          <label class="form-label">Food name</label>
          <input class="form-input" id="sr-name" value="${result.name}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Serving size</label>
            <input class="form-input" id="sr-serving" value="${result.servingSize}">
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <input class="form-input" id="sr-desc" placeholder="notes…" value="${result.description||''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Calories</label>
            <input class="form-input" id="sr-cal" type="number" value="${result.calories}">
          </div>
          <div class="form-group">
            <label class="form-label">Protein (g)</label>
            <input class="form-input" id="sr-pro" type="number" value="${result.protein}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Fat (g)</label>
            <input class="form-input" id="sr-fat" type="number" value="${result.fat}">
          </div>
          <div class="form-group">
            <label class="form-label">Carbs (g)</label>
            <input class="form-input" id="sr-carb" type="number" value="${result.carbs}">
          </div>
        </div>
        <button class="btn-primary btn-full" onclick="UI.confirmScanResult()">
          <span class="material-symbols-rounded icon-sm">add_circle</span> Add to Log
        </button>
      </div>`;
    area.scrollIntoView({ behavior:'smooth' });
  },

  confirmScanResult() {
    const entry = {
      name:        document.getElementById('sr-name')?.value    || 'Unknown food',
      servingSize: document.getElementById('sr-serving')?.value || '1 serving',
      description: document.getElementById('sr-desc')?.value    || '',
      calories:    Number(document.getElementById('sr-cal')?.value)  || 0,
      protein:     Number(document.getElementById('sr-pro')?.value)  || 0,
      fat:         Number(document.getElementById('sr-fat')?.value)  || 0,
      carbs:       Number(document.getElementById('sr-carb')?.value) || 0,
      image:       App.scanResult?.image || null,
    };
    Storage.addFoodEntry(entry);
    this.showToast(`${entry.name} added to log`, 'success');
    App.scanResult = null; this._scanFile = null;
    App.navigate('dashboard');
  },

  manualFormHTML(prefill = {}) {
    return `
      <div class="form-group">
        <label class="form-label">Food name *</label>
        <input class="form-input" id="manual-name" type="text" placeholder="e.g. Chicken breast, grilled" value="${prefill.name||''}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Serving size</label>
          <input class="form-input" id="manual-serving" placeholder="e.g. 200g, 1 cup" value="${prefill.servingSize||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="manual-desc" placeholder="optional notes" value="${prefill.description||''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Calories *</label>
          <input class="form-input" id="manual-cal" type="number" min="0" placeholder="350" value="${prefill.calories||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Protein (g)</label>
          <input class="form-input" id="manual-pro" type="number" min="0" placeholder="30" value="${prefill.protein||''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Fat (g)</label>
          <input class="form-input" id="manual-fat" type="number" min="0" placeholder="10" value="${prefill.fat||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Carbs (g)</label>
          <input class="form-input" id="manual-carb" type="number" min="0" placeholder="30" value="${prefill.carbs||''}">
        </div>
      </div>
      <button class="btn-primary btn-full" onclick="UI.addManualFood()">
        <span class="material-symbols-rounded icon-sm">add_circle</span>
        ${App.editingEntryId ? 'Update Entry' : 'Add to Log'}
      </button>
      ${App.editingEntryId ? `<button class="btn-ghost btn-full mt-2" onclick="UI.cancelEdit()">Cancel edit</button>` : ''}`;
  },

  addManualFood() {
    const name = document.getElementById('manual-name')?.value?.trim();
    const cal  = Number(document.getElementById('manual-cal')?.value);
    if (!name) return this.showToast('Please enter a food name', 'error');
    if (!cal)  return this.showToast('Please enter calories', 'error');

    const entry = {
      name,
      servingSize:  document.getElementById('manual-serving')?.value || '1 serving',
      description:  document.getElementById('manual-desc')?.value    || '',
      calories: cal,
      protein:  Number(document.getElementById('manual-pro')?.value)  || 0,
      fat:      Number(document.getElementById('manual-fat')?.value)  || 0,
      carbs:    Number(document.getElementById('manual-carb')?.value) || 0,
    };

    if (App.editingEntryId) {
      Storage.updateFoodEntry(App.editingEntryId, entry);
      App.editingEntryId = null;
      this.showToast('Entry updated', 'success');
    } else {
      Storage.addFoodEntry(entry);
      this.showToast(`${name} added to log`, 'success');
    }
    App.navigate('dashboard');
  },

  cancelEdit() {
    App.editingEntryId = null;
    App.navigate('log');
  },

  editFoodEntry(id) {
    const dayLog = Storage.getTodayLog();
    const entry  = dayLog.entries.find(e => e.id === id);
    if (!entry) return;
    App.editingEntryId = id;
    App.navigate('scan');
    setTimeout(() => {
      const form = document.getElementById('manual-form');
      if (form) {
        form.innerHTML = this.manualFormHTML(entry);
        document.getElementById('manual-card')?.scrollIntoView({ behavior:'smooth' });
      }
    }, 120);
  },

  deleteFoodEntry(id) {
    if (!confirm('Delete this entry?')) return;
    Storage.deleteFoodEntry(id);
    this.showToast('Entry deleted', 'info');
    App.navigate('log');
  },

  // ══════════════════════════════════════════════════════════
  // LOG PAGE — today + history accordion
  // ══════════════════════════════════════════════════════════
  renderLog(container) {
    const dayLog = Storage.getTodayLog();
    const goals  = Storage.getGoals() || {};
    const totals = dayLog.totals;

    const dateLabel = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

    container.innerHTML = `
      <div>
        <div class="page-header">
          <h2 class="page-title">Food Log</h2>
          <p class="page-subtitle">${dateLabel}</p>
        </div>

        <!-- Macro circles -->
        <div class="card">
          <div class="macro-circles-row">
            ${this.macroCircle('Cal',  totals.calories, goals.calories, 'var(--md-primary)')}
            ${this.macroCircle('Pro',  totals.protein,  goals.protein,  '#4ade80')}
            ${this.macroCircle('Fat',  totals.fat,      goals.fat,      '#f87171')}
            ${this.macroCircle('Carb', totals.carbs,    goals.carbs,    '#fbbf24')}
          </div>
        </div>

        <!-- Today's entries -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Today (${dayLog.entries.length} items)</h3>
            <button class="btn-tonal btn-sm" onclick="App.navigate('scan')">
              <span class="material-symbols-rounded icon-sm">add</span> Add
            </button>
          </div>
          ${dayLog.entries.length === 0
            ? `<div class="empty-state">
                <div class="empty-icon-wrap"><span class="material-symbols-rounded icon-lg text-muted">inbox</span></div>
                <p class="body-sm">No entries yet today.</p>
               </div>`
            : dayLog.entries.slice().reverse().map(e => this.foodItem(e, false)).join('')}
        </div>

        <!-- History -->
        <p class="settings-section-label">Past days</p>
        <div class="history-section" id="history-section">
          ${this.renderHistoryAccordion()}
        </div>

        <div style="height:4rem"></div>
      </div>`;
  },

  macroCircle(label, consumed, goal, color) {
    const r = 30, circ = 2 * Math.PI * r;
    const pct  = Math.min(1, goal ? consumed / goal : 0);
    const dash = pct * circ;
    return `
      <div class="macro-circle-block">
        <svg viewBox="0 0 72 72" width="72" height="72">
          <circle class="ring-track" cx="36" cy="36" r="${r}" fill="none" stroke-width="7"/>
          <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="7"
            stroke-linecap="round" stroke-dasharray="${dash} ${circ}"
            transform="rotate(-90 36 36)"
            style="transition:stroke-dasharray .6s var(--ease-emphasized)"/>
        </svg>
        <div class="macro-circle-center">
          <div class="macro-circle-val">${consumed}</div>
        </div>
        <div class="macro-circle-name">${label}</div>
        <div class="macro-circle-goal">/ ${goal||'?'}</div>
      </div>`;
  },

  renderHistoryAccordion() {
    const allLogs = Storage.getAllLogs();
    const today   = Storage.getTodayKey();

    // Get all past dates with entries, sorted descending
    const pastDates = Object.keys(allLogs)
      .filter(d => d !== today && allLogs[d].entries.length > 0)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 30);

    if (pastDates.length === 0) {
      return `<div class="card"><div class="empty-state">
        <div class="empty-icon-wrap"><span class="material-symbols-rounded icon-lg text-muted">history</span></div>
        <p class="body-sm">No history yet. Keep logging!</p>
      </div></div>`;
    }

    return pastDates.map((date, idx) => {
      const log     = allLogs[date];
      const totals  = log.totals || { calories:0, protein:0, fat:0, carbs:0 };
      const d       = new Date(date + 'T00:00:00');
      const label   = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      const isToday = idx === 0;

      return `
        <div class="history-date-group">
          <div class="history-date-header" onclick="UI.toggleHistory('${date}')" id="hdr-${date}">
            <div class="history-date-title">
              <span class="material-symbols-rounded icon-sm text-muted">calendar_today</span>
              ${label}
              <span class="label-sm text-muted">(${log.entries.length} items)</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="history-date-kcal">${totals.calories} kcal</span>
              <span class="material-symbols-rounded history-date-chevron">expand_more</span>
            </div>
          </div>
          <div class="history-entries" id="hist-${date}">
            ${log.entries.length === 0
              ? '<p class="history-empty">No entries</p>'
              : log.entries.slice().reverse().map(e => `
                  <div class="food-item">
                    ${e.image ? `<img src="${e.image}" class="food-thumb" alt="${e.name}">` : `<div class="food-thumb-icon"><span class="material-symbols-rounded">nutrition</span></div>`}
                    <div class="food-info">
                      <p class="food-name">${e.name}</p>
                      <p class="food-meta">${e.servingSize||'1 serving'}${e.description?' · '+e.description:''}</p>
                      <p class="food-macros-row">P ${e.protein||0}g · F ${e.fat||0}g · C ${e.carbs||0}g</p>
                    </div>
                    <span class="food-kcal">${e.calories}</span>
                  </div>`).join('')}
            <div style="padding:8px 0;display:flex;gap:8px;border-top:1px solid var(--md-outline-var);margin-top:4px">
              <span class="label-sm text-muted">P ${totals.protein}g</span>
              <span class="label-sm text-muted">·</span>
              <span class="label-sm text-muted">F ${totals.fat}g</span>
              <span class="label-sm text-muted">·</span>
              <span class="label-sm text-muted">C ${totals.carbs}g</span>
            </div>
          </div>
        </div>`;
    }).join('');
  },

  toggleHistory(date) {
    const hdr  = document.getElementById(`hdr-${date}`);
    const body = document.getElementById(`hist-${date}`);
    if (!hdr || !body) return;
    const open = body.classList.toggle('open');
    hdr.classList.toggle('open', open);
  },

  // ══════════════════════════════════════════════════════════
  // PROGRESS
  // ══════════════════════════════════════════════════════════
  renderProgress(container) {
    const weekLogs  = Storage.getWeeklyLogs();
    const goals     = Storage.getGoals()     || {};
    const streak    = Storage.getStreak();
    const weightLog = Storage.getWeightLog();
    const profile   = Storage.getProfile()   || {};

    const days = weekLogs.map(l => {
      const d = new Date(l.date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { weekday:'short' }).slice(0,1);
    });
    const cals   = weekLogs.map(l => l.totals.calories);
    const maxCal = Math.max(...cals, goals.calories||2000, 100);

    const recent14w = weightLog.slice(-14);

    container.innerHTML = `
      <div>
        <div class="page-header">
          <h2 class="page-title">Progress</h2>
        </div>

        <!-- Streak -->
        <div class="card streak-card">
          <div class="streak-row">
            <div class="streak-stat">
              <div class="streak-label">Current streak</div>
              <div class="streak-value">${streak.current} <span style="font-size:1rem">days</span> 🔥</div>
            </div>
            <div style="width:1px;background:var(--md-outline-var)"></div>
            <div class="streak-stat">
              <div class="streak-label">Longest streak</div>
              <div class="streak-value">${streak.longest} <span style="font-size:1rem">days</span></div>
            </div>
          </div>
        </div>

        <!-- Weekly calorie chart -->
        <div class="card">
          <h3 class="card-title">Weekly Calories</h3>
          <div class="chart-wrap">
            <svg viewBox="0 0 320 160" class="bar-chart">
              ${this.barChart(days, cals, maxCal, goals.calories)}
            </svg>
          </div>
          <div class="chart-legend">
            <span class="legend-dot" style="background:var(--md-primary)"></span><span>Calories</span>
            <span class="legend-line" style="margin-left:8px"></span><span>Goal</span>
          </div>
        </div>

        <!-- Week stats -->
        <div class="card">
          <h3 class="card-title">This Week</h3>
          <div class="stats-row">
            ${this.statBox('Total', cals.reduce((a,b)=>a+b,0).toLocaleString(), 'kcal')}
            ${this.statBox('Daily avg', Math.round(cals.reduce((a,b)=>a+b,0)/7).toLocaleString(), 'kcal')}
            ${this.statBox('Days logged', cals.filter(c=>c>0).length, 'of 7')}
          </div>
        </div>

        <!-- Weight trend -->
        ${recent14w.length >= 2 ? `
          <div class="card">
            <h3 class="card-title">Weight Trend</h3>
            ${profile.targetWeight ? `
              <div class="card-row" style="margin-bottom:12px">
                <span class="label-sm text-muted">Current: <strong>${recent14w[recent14w.length-1].weight} kg</strong></span>
                <span class="label-sm text-muted">Target: <strong>${profile.targetWeight} kg</strong></span>
              </div>` : ''}
            <div class="chart-wrap">
              <svg viewBox="0 0 320 140" class="line-chart">
                ${this.lineChart(recent14w)}
              </svg>
            </div>
            <div class="weight-range">
              <span>Low: ${Math.min(...recent14w.map(e=>e.weight))} kg</span>
              <span>High: ${Math.max(...recent14w.map(e=>e.weight))} kg</span>
            </div>
          </div>` : `
          <div class="card">
            <h3 class="card-title">Weight Trend</h3>
            <div class="empty-state">
              <div class="empty-icon-wrap"><span class="material-symbols-rounded icon-lg text-muted">show_chart</span></div>
              <p class="body-sm">Log your weight for 2+ days to see a trend.</p>
            </div>
          </div>`}

        <!-- BMI -->
        ${profile.weight && profile.height ? (() => {
          const bmi = Nutrition.calcBMI(profile.weight, profile.height);
          const cat = Nutrition.getBMICategory(bmi);
          return `
            <div class="card">
              <h3 class="card-title">BMI</h3>
              <div class="bmi-row">
                <span class="bmi-value" style="color:${cat.color}">${bmi}</span>
                <span class="bmi-category" style="color:${cat.color}">${cat.label}</span>
              </div>
              <div class="bmi-scale">
                <div class="bmi-segment" style="background:#3b82f6">Under<br><small>&lt;18.5</small></div>
                <div class="bmi-segment" style="background:#22c55e">Normal<br><small>18–25</small></div>
                <div class="bmi-segment" style="background:#f59e0b">Over<br><small>25–30</small></div>
                <div class="bmi-segment" style="background:#ef4444">Obese<br><small>&gt;30</small></div>
              </div>
            </div>`;
        })() : ''}

        <div style="height:4rem"></div>
      </div>`;
  },

  barChart(labels, values, maxVal, goalLine) {
    const W=320, H=140, pL=4, pB=20, pT=10, pR=4;
    const cW = W-pL-pR, cH = H-pB-pT;
    const gap = cW / labels.length;
    const bW  = gap * 0.55;

    const bars = labels.map((lbl, i) => {
      const x   = pL + i * gap + gap * 0.225;
      const bH  = values[i] ? Math.max(4, (values[i]/maxVal)*cH) : 2;
      const y   = pT + cH - bH;
      const today = i === labels.length - 1;
      return `
        <rect x="${x}" y="${y}" width="${bW}" height="${bH}" rx="5"
          fill="${today ? 'var(--md-primary)' : 'var(--md-primary-container)'}"
          opacity="${values[i]?1:0.4}"/>
        <text x="${x+bW/2}" y="${H-5}" text-anchor="middle" font-size="9"
          fill="var(--md-on-surface-muted)" font-family="Inter,sans-serif">${lbl}</text>`;
    }).join('');

    const goalSvg = goalLine ? (() => {
      const gy = pT + cH - (goalLine/maxVal)*cH;
      return `<line x1="${pL}" y1="${gy}" x2="${W-pR}" y2="${gy}"
        stroke="var(--md-error)" stroke-width="1.5" stroke-dasharray="4 3" opacity=".7"/>`;
    })() : '';

    return bars + goalSvg;
  },

  lineChart(entries) {
    const W=320, H=120, pL=32, pB=18, pT=8, pR=8;
    const cW=W-pL-pR, cH=H-pB-pT;
    const weights = entries.map(e=>e.weight);
    const minW = Math.min(...weights)-0.5, maxW = Math.max(...weights)+0.5;
    const range = maxW - minW || 1;

    const pts = entries.map((e, i) => {
      const x = pL + (i/(entries.length-1))*cW;
      const y = pT + cH - ((e.weight-minW)/range)*cH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const dots = entries.map((e, i) => {
      const [x,y] = pts[i].split(',');
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--md-primary)" stroke="var(--md-surface-2)" stroke-width="2"/>`;
    }).join('');

    // Gradient area
    const areaPath = `M ${pts[0]} ` + pts.slice(1).map(p => `L ${p}`).join(' ')
      + ` L ${pL+cW},${pT+cH} L ${pL},${pT+cH} Z`;

    const yLabels = `
      <text x="${pL-4}" y="${pT+6}" text-anchor="end" font-size="9"
        fill="var(--md-on-surface-muted)" font-family="Inter,sans-serif">${maxW.toFixed(1)}</text>
      <text x="${pL-4}" y="${pT+cH}" text-anchor="end" font-size="9"
        fill="var(--md-on-surface-muted)" font-family="Inter,sans-serif">${minW.toFixed(1)}</text>`;

    return `
      <defs>
        <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--md-primary)" stop-opacity=".2"/>
          <stop offset="100%" stop-color="var(--md-primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#wGrad)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--md-primary)"
        stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${yLabels}`;
  },

  statBox(label, value, unit) {
    return `<div class="stat-box">
      <span class="stat-box-value">${value}</span>
      <span class="stat-box-unit">${unit}</span>
      <span class="stat-box-label">${label}</span>
    </div>`;
  },

  // ══════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════
  renderSettings(container) {
    const profile = Storage.getProfile()    || {};
    const api     = Storage.getApiSettings();
    const theme   = Storage.getTheme();
    const goals   = Storage.getGoals()      || {};

    const cw = profile.weight       || 60;
    const tw = profile.targetWeight || cw;

    container.innerHTML = `
      <div>
        <div class="page-header">
          <h2 class="page-title">Settings</h2>
        </div>

        <!-- Profile -->
        <p class="settings-section-label">Profile</p>
        <div class="card">
          <div class="pfp-upload-area" style="margin-bottom:16px">
            <div class="pfp-ring" id="settings-pfp" onclick="document.getElementById('settings-pfp-input').click()">
              ${profile.pfp
                ? `<img src="${profile.pfp}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="Profile">`
                : `<span class="material-symbols-rounded icon-xl text-muted">person</span>`}
              <div class="pfp-ring-overlay">
                <span class="material-symbols-rounded" style="color:#fff">photo_camera</span>
              </div>
            </div>
            <input type="file" id="settings-pfp-input" accept="image/*" style="display:none" onchange="UI.updatePfp(this)">
          </div>

          <div class="form-group">
            <label class="form-label">Name</label>
            <input class="form-input" id="s-name" value="${profile.name||''}">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Age</label>
              <input class="form-input" id="s-age" type="number" value="${profile.age||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Sex</label>
              <select class="form-input" id="s-sex">
                <option value="male"   ${profile.sex==='male'?'selected':''}>Male</option>
                <option value="female" ${profile.sex==='female'?'selected':''}>Female</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Height (cm)</label>
              <input class="form-input" id="s-height" type="number" value="${profile.height||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Activity</label>
              <select class="form-input" id="s-activity">
                ${Object.entries(Nutrition.ACTIVITY).map(([v,a]) =>
                  `<option value="${v}" ${profile.activity===v?'selected':''}>${a.label}</option>`).join('')}
              </select>
            </div>
          </div>

          <!-- Current weight slider -->
          <div class="form-group">
            <label class="form-label">Current weight</label>
            <div class="range-wrap">
              <div class="weight-slider-display">
                <span class="weight-slider-val" id="s-cw-display">${cw}</span>
                <span class="weight-slider-unit">kg</span>
              </div>
              <input type="range" id="s-weight" min="30" max="200" step="0.5" value="${cw}"
                oninput="document.getElementById('s-cw-display').textContent=this.value">
              <div class="range-labels"><span>30 kg</span><span>200 kg</span></div>
            </div>
          </div>

          <!-- Target weight slider -->
          <div class="form-group">
            <label class="form-label">Target weight</label>
            <div class="range-wrap">
              <div class="weight-slider-display">
                <span class="weight-slider-val" id="s-tw-display">${tw}</span>
                <span class="weight-slider-unit">kg</span>
              </div>
              <input type="range" id="s-target-weight" min="30" max="200" step="0.5" value="${tw}"
                oninput="document.getElementById('s-tw-display').textContent=this.value">
              <div class="range-labels"><span>30 kg</span><span>200 kg</span></div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Goal</label>
            <select class="form-input" id="s-goal">
              <option value="lose"     ${profile.goal==='lose'?    'selected':''}>Lose weight</option>
              <option value="maintain" ${profile.goal==='maintain'?'selected':''}>Maintain weight</option>
              <option value="gain"     ${profile.goal==='gain'?    'selected':''}>Gain weight</option>
            </select>
          </div>

          <button class="btn-primary btn-full" onclick="UI.saveProfile()">
            <span class="material-symbols-rounded icon-sm">save</span> Save Profile
          </button>
        </div>

        <!-- Appearance -->
        <p class="settings-section-label">Appearance</p>
        <div class="card">
          <div class="form-group">
            <label class="form-label">Colour scheme</label>
            <div class="theme-picker">
              ${['green','blue','purple','orange','red'].map(s => `
                <button class="theme-dot scheme-${s} ${theme.scheme===s?'active':''}"
                  onclick="UI.pickScheme('${s}',this)" title="${s}"></button>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Mode</label>
            <div style="display:flex;gap:8px">
              <button id="s-mode-light" class="btn-outline flex-1 ${theme.mode==='light'?'active':''}" onclick="UI.pickMode('light')">
                <span class="material-symbols-rounded icon-sm">light_mode</span> Light
              </button>
              <button id="s-mode-dark" class="btn-outline flex-1 ${theme.mode==='dark'?'active':''}" onclick="UI.pickMode('dark')">
                <span class="material-symbols-rounded icon-sm">dark_mode</span> Dark
              </button>
            </div>
          </div>
        </div>

        <!-- AI API -->
        <p class="settings-section-label">AI Scanning</p>
        <div class="card">
          <p class="card-subtitle">
            <span class="material-symbols-rounded icon-sm">lock</span>
            Keys stored locally only — never sent to our servers.
          </p>
          <div class="form-group">
            <label class="form-label">Provider</label>
            <select class="form-input" id="s-provider" onchange="UI.toggleCustomFields()">
              <option value="openai"  ${api.provider==='openai'?'selected':''}>OpenAI (GPT-4o)</option>
              <option value="gemini"  ${api.provider==='gemini'?'selected':''}>Google Gemini 2.0 Flash</option>
              <option value="custom"  ${api.provider==='custom'?'selected':''}>Custom / OpenRouter</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input class="form-input" id="s-apikey" type="password" placeholder="sk-… or AIza…" value="${api.apiKey||''}">
          </div>
          <div id="custom-fields" style="display:${api.provider==='custom'?'block':'none'}">
            <div class="form-group">
              <label class="form-label">Endpoint URL</label>
              <input class="form-input" id="s-endpoint" type="url" placeholder="https://openrouter.ai/api/v1/chat/completions" value="${api.customEndpoint||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Model name</label>
              <input class="form-input" id="s-model" placeholder="e.g. openai/gpt-4o" value="${api.customModel||'openai/gpt-4o'}">
              <p class="label-sm text-muted" style="margin-top:4px">Supports OpenRouter, Together AI, Groq, Ollama</p>
            </div>
          </div>
          <button class="btn-primary btn-full" onclick="UI.saveApi()">
            <span class="material-symbols-rounded icon-sm">save</span> Save API Settings
          </button>
        </div>

        <!-- Nutrition goals override -->
        <p class="settings-section-label">Nutrition Goals</p>
        <div class="card">
          <p class="card-subtitle">Auto-calculated from profile. Override manually if needed.</p>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Calories</label>
              <input class="form-input" id="s-gcal" type="number" value="${goals.calories||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Protein (g)</label>
              <input class="form-input" id="s-gpro" type="number" value="${goals.protein||''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Fat (g)</label>
              <input class="form-input" id="s-gfat" type="number" value="${goals.fat||''}">
            </div>
            <div class="form-group">
              <label class="form-label">Carbs (g)</label>
              <input class="form-input" id="s-gcar" type="number" value="${goals.carbs||''}">
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-outline flex-1" onclick="UI.saveGoals()">Save Goals</button>
            <button class="btn-text" onclick="UI.recalcGoals()">
              <span class="material-symbols-rounded icon-sm">refresh</span> Recalculate
            </button>
          </div>
        </div>

        <!-- Danger zone -->
        <p class="settings-section-label">Data</p>
        <div class="card danger-card">
          <button class="btn-outline danger btn-full" onclick="UI.resetToday()">
            <span class="material-symbols-rounded icon-sm">restart_alt</span> Reset Today's Log
          </button>
          <div style="height:8px"></div>
          <button class="btn-outline danger btn-full" onclick="UI.resetAll()">
            <span class="material-symbols-rounded icon-sm">delete_forever</span> Reset Entire App
          </button>
        </div>

        <div style="height:4rem"></div>
      </div>`;
  },

  pickScheme(scheme, el) {
    const theme = Storage.getTheme();
    document.querySelectorAll('.theme-dot').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    this.applyTheme({ mode: theme.mode, scheme });
  },

  pickMode(mode) {
    const theme = Storage.getTheme();
    document.getElementById('s-mode-light')?.classList.toggle('active', mode==='light');
    document.getElementById('s-mode-dark')?.classList.toggle('active', mode==='dark');
    this.applyTheme({ mode, scheme: theme.scheme });
  },

  toggleCustomFields() {
    const provider = document.getElementById('s-provider')?.value;
    const fields = document.getElementById('custom-fields');
    if (fields) fields.style.display = provider === 'custom' ? 'block' : 'none';
  },

  updatePfp(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const preview = document.getElementById('settings-pfp');
      if (preview) {
        preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="Profile">
          <div class="pfp-ring-overlay"><span class="material-symbols-rounded" style="color:#fff">photo_camera</span></div>`;
      }
      const profile = Storage.getProfile() || {};
      profile.pfp = e.target.result;
      Storage.saveProfile(profile);
    };
    reader.readAsDataURL(file);
  },

  saveProfile() {
    const profile = Storage.getProfile() || {};
    const updated = {
      ...profile,
      name:         document.getElementById('s-name')?.value?.trim()      || profile.name,
      age:          Number(document.getElementById('s-age')?.value)        || profile.age,
      sex:          document.getElementById('s-sex')?.value                || profile.sex,
      height:       Number(document.getElementById('s-height')?.value)     || profile.height,
      weight:       Number(document.getElementById('s-weight')?.value)     || profile.weight,
      targetWeight: Number(document.getElementById('s-target-weight')?.value) || profile.targetWeight,
      goal:         document.getElementById('s-goal')?.value               || profile.goal,
      activity:     document.getElementById('s-activity')?.value           || profile.activity,
    };
    Storage.saveProfile(updated);
    Storage.saveGoals(Nutrition.calcGoals(updated));
    this.showToast('Profile saved & goals recalculated', 'success');
    App.navigate('settings');
  },

  saveApi() {
    Storage.saveApiSettings({
      provider:       document.getElementById('s-provider')?.value  || 'openai',
      apiKey:         document.getElementById('s-apikey')?.value    || '',
      customEndpoint: document.getElementById('s-endpoint')?.value  || '',
      customModel:    document.getElementById('s-model')?.value     || 'openai/gpt-4o',
    });
    this.showToast('API settings saved', 'success');
  },

  saveGoals() {
    Storage.saveGoals({
      calories: Number(document.getElementById('s-gcal')?.value)||0,
      protein:  Number(document.getElementById('s-gpro')?.value)||0,
      fat:      Number(document.getElementById('s-gfat')?.value)||0,
      carbs:    Number(document.getElementById('s-gcar')?.value)||0,
    });
    this.showToast('Goals saved', 'success');
  },

  recalcGoals() {
    const p = Storage.getProfile();
    if (!p) return this.showToast('No profile found', 'error');
    Storage.saveGoals(Nutrition.calcGoals(p));
    this.showToast('Goals recalculated from profile', 'success');
    App.navigate('settings');
  },

  resetToday() {
    if (!confirm('Reset today\'s food log?')) return;
    Storage.resetTodayLog();
    this.showToast('Today\'s log cleared', 'info');
    App.navigate('dashboard');
  },

  resetAll() {
    if (!confirm('Delete ALL data and reset the app?')) return;
    if (!confirm('This cannot be undone. Continue?')) return;
    Storage.resetAll();
    location.reload();
  },

  // ── Weight dialog ───────────────────────────────────────────────────────────
  showWeightDialog() {
    document.getElementById('weight-modal')?.remove();
    const wLog = Storage.getWeightLog();
    const prof = Storage.getProfile() || {};
    const last = wLog.length ? wLog[wLog.length-1].weight : prof.weight || 70;

    const modal = document.createElement('div');
    modal.id = 'weight-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-sheet">
        <div class="sheet-handle"></div>
        <h3 class="modal-title">Log Today's Weight</h3>
        <div class="form-group">
          <label class="form-label">Weight</label>
          <div class="range-wrap">
            <div class="weight-slider-display">
              <span class="weight-slider-val" id="wdial-display">${last}</span>
              <span class="weight-slider-unit">kg</span>
            </div>
            <input type="range" id="wdial-slider" min="30" max="200" step="0.5" value="${last}"
              oninput="document.getElementById('wdial-display').textContent=Number(this.value).toFixed(1)">
            <div class="range-labels"><span>30 kg</span><span>200 kg</span></div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-outline" onclick="document.getElementById('weight-modal').remove()">Cancel</button>
          <button class="btn-primary" onclick="UI.saveWeight()">
            <span class="material-symbols-rounded icon-sm">check</span> Save
          </button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  },

  saveWeight() {
    const val = Number(document.getElementById('wdial-slider')?.value);
    if (!val || val < 30 || val > 200) return this.showToast('Invalid weight value', 'error');
    Storage.addWeightEntry(val);
    document.getElementById('weight-modal')?.remove();
    this.showToast(`Weight logged: ${val} kg`, 'success');
    App.navigate('dashboard');
  },
};
