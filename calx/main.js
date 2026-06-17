/**
 * main.js — Core app logic, nutrition math, setup wizard
 */

// ─── Nutrition Math (improved) ─────────────────────────────────────────────────

const Nutrition = {
  // Mifflin-St Jeor BMR
  calcBMR({ weight, height, age, sex }) {
    const base = 10 * weight + 6.25 * height - 5 * age;
    return sex === 'female' ? base - 161 : base + 5;
  },

  ACTIVITY: {
    sedentary: { mult: 1.2,   label: 'Sedentary',         desc: 'Desk job, little or no exercise' },
    light:     { mult: 1.375, label: 'Lightly active',    desc: 'Light exercise 1–3 days/week' },
    moderate:  { mult: 1.55,  label: 'Moderately active', desc: 'Moderate exercise 3–5 days/week' },
    active:    { mult: 1.725, label: 'Very active',       desc: 'Hard exercise 6–7 days/week' },
  },

  /**
   * Improved calorie target using goal weight + rate of change.
   * Uses 7700 kcal/kg body-fat rule with a safe weekly rate (0.25–0.75 kg/wk).
   */
  calcGoals(profile) {
    const bmr  = this.calcBMR(profile);
    const mult = (this.ACTIVITY[profile.activity] || this.ACTIVITY.sedentary).mult;
    const tdee = bmr * mult;

    // Determine weekly weight change target (capped for safety)
    const currentW = Number(profile.weight)       || 70;
    const targetW  = Number(profile.targetWeight)  || currentW;
    const diff     = targetW - currentW;           // positive = gain, negative = lose

    let adjustment = 0;
    if (profile.goal === 'maintain' || Math.abs(diff) < 0.5) {
      adjustment = 0;
    } else if (profile.goal === 'lose') {
      // Aim to lose ~0.5 kg/week (3500 kcal deficit/week → 500/day)
      // Scale by how far target is, but cap
      const weeklyRate = Math.min(0.75, Math.max(0.25, Math.abs(diff) / 8));
      adjustment = -(weeklyRate * 7700 / 7); // kcal/day deficit
    } else if (profile.goal === 'gain') {
      const weeklyRate = Math.min(0.5, Math.max(0.2, Math.abs(diff) / 8));
      adjustment = +(weeklyRate * 7700 / 7);
    }

    const calories = Math.round(Math.max(1200, tdee + adjustment));

    // Protein: 2.0g/kg for deficit, 1.8g/kg for surplus, 1.6g/kg maintain
    const proteinPerKg = profile.goal === 'lose' ? 2.0 : profile.goal === 'gain' ? 1.8 : 1.6;
    const protein = Math.round(currentW * proteinPerKg);

    // Fat: 25–30% of calories
    const fatPct = profile.goal === 'lose' ? 0.28 : 0.25;
    const fat    = Math.round((calories * fatPct) / 9);

    // Carbs: remaining
    const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));

    // Estimated weeks to goal
    const weeksToGoal = adjustment !== 0
      ? Math.round(Math.abs(diff * 7700) / (Math.abs(adjustment) * 7))
      : null;

    return {
      calories, protein, fat, carbs,
      bmr:   Math.round(bmr),
      tdee:  Math.round(tdee),
      weeksToGoal,
      adjustment: Math.round(adjustment),
    };
  },

  calcBMI(weight, height) {
    const hm = height / 100;
    return +(weight / (hm * hm)).toFixed(1);
  },

  getBMICategory(bmi) {
    if (bmi < 18.5) return { label:'Underweight', color:'var(--md-warning)' };
    if (bmi < 25)   return { label:'Normal weight', color:'var(--md-success)' };
    if (bmi < 30)   return { label:'Overweight', color:'var(--md-warning)' };
    return               { label:'Obese', color:'var(--md-error)' };
  },

  formatAdjustment(adj) {
    if (!adj) return 'At maintenance';
    return adj > 0 ? `+${Math.round(adj)} kcal surplus` : `${Math.round(adj)} kcal deficit`;
  },
};

// ─── App State ─────────────────────────────────────────────────────────────────

const App = {
  currentPage:    'dashboard',
  scanResult:     null,
  editingEntryId: null,

  init() {
    UI.applyTheme(Storage.getTheme());
    if (!Storage.isSetupComplete()) {
      this.showSetup();
    } else {
      this.showApp();
      const hash = location.hash.slice(1);
      this.navigate(['dashboard','scan','log','progress','settings'].includes(hash) ? hash : 'dashboard');
    }
  },

  showSetup() {
    document.getElementById('setup-wizard').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    SetupWizard.init();
  },

  showApp() {
    document.getElementById('setup-wizard').style.display = 'none';
    document.getElementById('app-shell').style.display = 'flex';
    UI.updateNavBar();
  },

  navigate(page) {
    this.currentPage = page;
    UI.renderPage(page);
    UI.updateNavBar();
    history.replaceState(null, '', `#${page}`);
  },
};

// ─── Setup Wizard (5 steps) ────────────────────────────────────────────────────

const SetupWizard = {
  step: 1,
  TOTAL: 5,
  data: {},

  init() {
    this.step = 1;
    this.data = {};
    this.render();
  },

  render() {
    const c = document.getElementById('wizard-content');
    c.innerHTML = '';
    c.classList.remove('slide-in');
    void c.offsetWidth;
    c.classList.add('slide-in');

    [null, this.s1, this.s2, this.s3, this.s4, this.s5][this.step].call(this, c);

    const pct = (this.step / this.TOTAL) * 100;
    document.getElementById('wizard-progress').style.width = pct + '%';
    document.getElementById('wizard-step-label').textContent = `Step ${this.step} of ${this.TOTAL}`;
    document.getElementById('wizard-back').style.visibility = this.step > 1 ? 'visible' : 'hidden';
    document.getElementById('wizard-next').textContent = this.step === this.TOTAL ? 'Get started' : 'Continue';
  },

  // Step 1: Name, age, sex, profile photo
  s1(c) {
    c.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-icon-wrap">
          <span class="material-symbols-rounded icon-lg text-primary">waving_hand</span>
        </div>
        <h2 class="wizard-title">Welcome! Let's set up your profile</h2>
        <p class="wizard-subtitle">We'll use this to personalise your calorie and macro targets.</p>

        <div class="pfp-upload-area">
          <div class="pfp-ring" id="pfp-preview" onclick="document.getElementById('pfp-input').click()">
            <span class="material-symbols-rounded icon-xl text-muted" id="pfp-placeholder">person</span>
            <div class="pfp-ring-overlay">
              <span class="material-symbols-rounded" style="color:#fff">photo_camera</span>
            </div>
          </div>
          <button class="btn-text btn-sm" onclick="document.getElementById('pfp-input').click()">
            <span class="material-symbols-rounded icon-sm">upload</span> Upload photo
          </button>
          <input type="file" id="pfp-input" accept="image/*" style="display:none" onchange="SetupWizard.handlePfp(this)">
        </div>

        <div class="form-group">
          <label class="form-label">Your name *</label>
          <input class="form-input" id="sw-name" type="text" placeholder="e.g. Alex" value="${this.data.name||''}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Age *</label>
            <input class="form-input" id="sw-age" type="number" min="10" max="120" placeholder="25" value="${this.data.age||''}">
          </div>
          <div class="form-group">
            <label class="form-label">Biological sex *</label>
            <select class="form-input" id="sw-sex">
              <option value="male"   ${this.data.sex==='male'?'selected':''}>Male</option>
              <option value="female" ${this.data.sex==='female'?'selected':''}>Female</option>
            </select>
          </div>
        </div>
      </div>`;
  },

  // Step 2: Height + current weight (slider) + target weight (slider)
  s2(c) {
    const cw  = this.data.weight       || 70;
    const tw  = this.data.targetWeight || cw;
    const ht  = this.data.height       || 170;
    const diff = (tw - cw).toFixed(1);
    const diffStr = diff > 0 ? `+${diff}` : diff;
    const goal = this.data.goal || 'maintain';

    c.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-icon-wrap">
          <span class="material-symbols-rounded icon-lg text-primary">straighten</span>
        </div>
        <h2 class="wizard-title">Your measurements</h2>
        <p class="wizard-subtitle">Used for BMR calculation. Slide to set your current and target weight.</p>

        <div class="form-group">
          <label class="form-label">Height (cm) *</label>
          <input class="form-input" id="sw-height" type="number" min="100" max="250" placeholder="170" value="${ht}">
        </div>

        <div class="form-group">
          <label class="form-label">Current weight</label>
          <div class="range-wrap">
            <div class="weight-slider-display">
              <span class="weight-slider-val" id="cw-display">${cw}</span>
              <span class="weight-slider-unit">kg</span>
            </div>
            <input type="range" id="sw-weight" min="30" max="200" step="0.5" value="${cw}"
              oninput="SetupWizard.onCurrentWeightChange(this.value)">
            <div class="range-labels"><span>30 kg</span><span>200 kg</span></div>
          </div>
        </div>

        <div class="form-group" id="target-weight-group">
          <label class="form-label">Target weight</label>
          <div class="range-wrap">
            <div class="weight-slider-display">
              <span class="weight-slider-val" id="tw-display">${tw}</span>
              <span class="weight-slider-unit">kg</span>
            </div>
            <input type="range" id="sw-target-weight" min="30" max="200" step="0.5" value="${tw}"
              oninput="SetupWizard.onTargetWeightChange(this.value)">
            <div class="range-labels"><span>30 kg</span><span>200 kg</span></div>
          </div>
          <div class="weight-target-info" id="weight-diff-info">
            <span class="material-symbols-rounded icon-sm text-primary">info</span>
            <div>
              <span class="weight-diff-badge ${diff > 0 ? 'positive' : diff < 0 ? 'negative' : ''}" id="weight-diff-badge">${diffStr === '0.0' ? '—' : diffStr + ' kg'}</span>
              <span class="body-sm text-muted" id="weight-diff-label">${diff > 0 ? 'to gain' : diff < 0 ? 'to lose' : 'no change'}</span>
            </div>
          </div>
        </div>
      </div>`;
  },

  onCurrentWeightChange(val) {
    this.data.weight = Number(val);
    const display = document.getElementById('cw-display');
    if (display) display.textContent = val;
    this.updateWeightDiff();
  },

  onTargetWeightChange(val) {
    this.data.targetWeight = Number(val);
    const display = document.getElementById('tw-display');
    if (display) display.textContent = val;
    this.updateWeightDiff();
  },

  updateWeightDiff() {
    const cw   = this.data.weight       || 70;
    const tw   = this.data.targetWeight || cw;
    const diff = (tw - cw).toFixed(1);
    const badge = document.getElementById('weight-diff-badge');
    const label = document.getElementById('weight-diff-label');
    if (!badge) return;
    const diffStr = diff > 0 ? `+${diff}` : diff;
    badge.textContent = diff === '0.0' ? '—' : `${diffStr} kg`;
    badge.className   = `weight-diff-badge ${Number(diff) > 0 ? 'positive' : Number(diff) < 0 ? 'negative' : ''}`;
    if (label) label.textContent = Number(diff) > 0 ? 'to gain' : Number(diff) < 0 ? 'to lose' : 'no change';
  },

  // Step 3: Goal + activity
  s3(c) {
    const goals = [
      { value:'lose',     icon:'trending_down', label:'Lose weight',     desc:'Calorie deficit' },
      { value:'maintain', icon:'balance',        label:'Maintain weight', desc:'At your TDEE' },
      { value:'gain',     icon:'trending_up',    label:'Gain weight',     desc:'Calorie surplus' },
    ];

    c.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-icon-wrap">
          <span class="material-symbols-rounded icon-lg text-primary">flag</span>
        </div>
        <h2 class="wizard-title">Your goal & activity</h2>
        <p class="wizard-subtitle">This shapes your daily calorie and macro targets.</p>

        <div class="form-group">
          <label class="form-label">Primary goal</label>
          <div class="option-cards">
            ${goals.map(g => `
              <button class="option-card ${this.data.goal===g.value?'selected':''}"
                onclick="SetupWizard.pick('goal','${g.value}',this)">
                <div class="option-card-icon">
                  <span class="material-symbols-rounded">${g.icon}</span>
                </div>
                <strong>${g.label}</strong>
                <small>${g.desc}</small>
              </button>`).join('')}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Activity level</label>
          <div class="option-list">
            ${Object.entries(Nutrition.ACTIVITY).map(([val, a]) => `
              <button class="option-row ${this.data.activity===val?'selected':''}"
                onclick="SetupWizard.pick('activity','${val}',this)">
                <div>
                  <strong>${a.label}</strong>
                  <small>${a.desc}</small>
                </div>
                <span class="check-circle">
                  <span class="material-symbols-rounded" style="font-size:.8rem">check</span>
                </span>
              </button>`).join('')}
          </div>
        </div>
      </div>`;
  },

  // Step 4: Personalised plan preview
  s4(c) {
    let preview = null;
    try {
      preview = Nutrition.calcGoals({
        ...this.data,
        age:    Number(this.data.age),
        height: Number(this.data.height),
        weight: Number(this.data.weight),
        targetWeight: Number(this.data.targetWeight || this.data.weight),
      });
    } catch(_) {}

    const diff = (this.data.targetWeight || this.data.weight) - this.data.weight;

    c.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-icon-wrap">
          <span class="material-symbols-rounded icon-lg text-primary">fact_check</span>
        </div>
        <h2 class="wizard-title">Your personalised plan</h2>
        <p class="wizard-subtitle">Based on your goal to <strong>${this.data.goal || 'maintain'}</strong>${Math.abs(diff) > 0.4 ? ` from <strong>${this.data.weight} kg</strong> to <strong>${this.data.targetWeight} kg</strong>` : ''}.</p>

        ${preview ? `
          <div class="goals-preview">
            <div class="goal-stat">
              <span class="goal-stat-value">${preview.calories}</span>
              <span class="goal-stat-label">Calories / day</span>
            </div>
            <div class="goal-stat">
              <span class="goal-stat-value">${preview.protein}g</span>
              <span class="goal-stat-label">Protein</span>
            </div>
            <div class="goal-stat">
              <span class="goal-stat-value">${preview.fat}g</span>
              <span class="goal-stat-label">Fat</span>
            </div>
            <div class="goal-stat">
              <span class="goal-stat-value">${preview.carbs}g</span>
              <span class="goal-stat-label">Carbs</span>
            </div>
          </div>
          <div class="weight-target-info">
            <span class="material-symbols-rounded icon-sm text-primary">info</span>
            <div style="line-height:1.5">
              <div class="body-sm">BMR <strong>${preview.bmr}</strong> · TDEE <strong>${preview.tdee}</strong> · ${Nutrition.formatAdjustment(preview.adjustment)}</div>
              ${preview.weeksToGoal ? `<div class="body-sm text-muted">Estimated <strong>${preview.weeksToGoal}</strong> weeks to reach goal</div>` : ''}
            </div>
          </div>
        ` : `<p class="text-muted body-sm">Complete all steps for a preview.</p>`}
      </div>`;
  },

  // Step 5: Theme
  s5(c) {
    const theme = Storage.getTheme();
    c.innerHTML = `
      <div class="wizard-step">
        <div class="wizard-icon-wrap">
          <span class="material-symbols-rounded icon-lg text-primary">palette</span>
        </div>
        <h2 class="wizard-title">Customise your look</h2>
        <p class="wizard-subtitle">Pick a colour and choose light or dark mode.</p>

        <div class="form-group">
          <label class="form-label">Colour scheme</label>
          <div class="theme-picker">
            ${['green','blue','purple','orange','red'].map(s => `
              <button class="theme-dot scheme-${s} ${(this.data.scheme||theme.scheme||'green')===s?'active':''}"
                onclick="SetupWizard.pickScheme('${s}',this)" title="${s}"></button>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Appearance</label>
          <div style="display:flex;gap:8px">
            <button id="mode-light" class="btn-outline flex-1 ${(this.data.mode||theme.mode||'light')==='light'?'active':''}"
              onclick="SetupWizard.pickMode('light')">
              <span class="material-symbols-rounded icon-sm">light_mode</span> Light
            </button>
            <button id="mode-dark" class="btn-outline flex-1 ${(this.data.mode||theme.mode)==='dark'?'active':''}"
              onclick="SetupWizard.pickMode('dark')">
              <span class="material-symbols-rounded icon-sm">dark_mode</span> Dark
            </button>
          </div>
        </div>
      </div>`;
  },

  handlePfp(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      this.data.pfp = e.target.result;
      const preview = document.getElementById('pfp-preview');
      const placeholder = document.getElementById('pfp-placeholder');
      if (placeholder) placeholder.style.display = 'none';
      if (preview) {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        preview.insertBefore(img, preview.firstChild);
      }
    };
    reader.readAsDataURL(file);
  },

  pick(field, value, el) {
    this.data[field] = value;
    el.parentElement.querySelectorAll('.option-card, .option-row').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  },

  pickScheme(scheme, el) {
    this.data.scheme = scheme;
    document.querySelectorAll('.theme-dot').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    UI.applyTheme({ mode: this.data.mode || Storage.getTheme().mode || 'light', scheme });
  },

  pickMode(mode) {
    this.data.mode = mode;
    document.querySelectorAll('#mode-light,#mode-dark').forEach(b => b.classList.remove('active'));
    document.getElementById(`mode-${mode}`)?.classList.add('active');
    UI.applyTheme({ mode, scheme: this.data.scheme || Storage.getTheme().scheme || 'green' });
  },

  collectStep() {
    if (this.step === 1) {
      const name = document.getElementById('sw-name')?.value?.trim();
      const age  = document.getElementById('sw-age')?.value;
      const sex  = document.getElementById('sw-sex')?.value;
      if (!name)           return UI.showToast('Please enter your name', 'error'), false;
      if (!age || age < 10) return UI.showToast('Please enter a valid age', 'error'), false;
      Object.assign(this.data, { name, age: Number(age), sex });
    }
    if (this.step === 2) {
      const height = document.getElementById('sw-height')?.value;
      const weight = document.getElementById('sw-weight')?.value;
      const tw     = document.getElementById('sw-target-weight')?.value;
      if (!height || height < 100) return UI.showToast('Please enter a valid height', 'error'), false;
      if (!weight || weight < 30)  return UI.showToast('Please set your current weight', 'error'), false;
      Object.assign(this.data, {
        height: Number(height),
        weight: Number(weight),
        targetWeight: Number(tw || weight),
      });
      // Auto-detect goal from weights if not set
      if (!this.data.goal) {
        const diff = this.data.targetWeight - this.data.weight;
        this.data.goal = diff > 0.5 ? 'gain' : diff < -0.5 ? 'lose' : 'maintain';
      }
    }
    if (this.step === 3) {
      if (!this.data.goal)     return UI.showToast('Please select a goal', 'error'), false;
      if (!this.data.activity) return UI.showToast('Please select an activity level', 'error'), false;
    }
    return true;
  },

  next() {
    if (!this.collectStep()) return;
    if (this.step < this.TOTAL) { this.step++; this.render(); }
    else this.finish();
  },

  back() {
    if (this.step > 1) { this.step--; this.render(); }
  },

  finish() {
    const profile = {
      name:         this.data.name,
      age:          this.data.age,
      sex:          this.data.sex,
      height:       this.data.height,
      weight:       this.data.weight,
      targetWeight: this.data.targetWeight || this.data.weight,
      goal:         this.data.goal,
      activity:     this.data.activity,
      pfp:          this.data.pfp || null,
      createdAt:    Date.now(),
    };
    Storage.saveProfile(profile);
    Storage.saveGoals(Nutrition.calcGoals(profile));
    Storage.saveTheme({ mode: this.data.mode || 'light', scheme: this.data.scheme || 'green' });
    Storage.addWeightEntry(profile.weight);

    UI.showToast(`Welcome, ${profile.name}!`, 'success');
    App.showApp();
    App.navigate('dashboard');
  },
};

// ─── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  window.addEventListener('hashchange', () => {
    const page = location.hash.slice(1);
    if (['dashboard','scan','log','progress','settings'].includes(page)) App.navigate(page);
  });
  document.getElementById('wizard-next')?.addEventListener('click', () => SetupWizard.next());
  document.getElementById('wizard-back')?.addEventListener('click', () => SetupWizard.back());
});
