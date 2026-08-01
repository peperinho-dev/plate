(() => {
  "use strict";

  const STORAGE_KEY = "tique-data-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SCHEMA_VERSION = 5;
  const ADAPTIVE_CHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
  const ADAPTIVE_MIN_SPAN_DAYS = 14;
  const ADAPTIVE_THRESHOLD_KG_PER_WEEK = 0.15;
  const MIGRATION_BAND_HALF_WIDTH = 75; // kcal, ± around the old single goalCalories number
  const ACTIVITY_MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
  const KCAL_PER_KG = 7700; // approximate energy density of 1kg body-mass change
  const BAND_HALF_WIDTH_KCAL = 100; // ±100 kcal around the computed center
  const PROTEIN_G_PER_KG = 1.8; // reasonable target for a lifter in a surplus
  const PROTEIN_BAND_G = 15;
  const FAT_PCT_OF_CALORIES = 0.25; // fat as a share of the calorie-target center
  const FAT_BAND_G = 10;
  const CARBS_BAND_G = 25; // carbs fill whatever calories remain after protein+fat

  /* ---------- Data layer ---------- */

  function todayKey(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  function defaultProfile() {
    return { sex: null, age: null, heightCm: null, activityLevel: null, goalType: null, rateKgPerWeek: null, updatedAt: null };
  }

  function defaultCalorieTarget() {
    // "calculated" so a fresh profile+weight entry is adopted automatically;
    // migrateV1toV2 below deliberately uses "manual" instead, to respect an
    // existing user's already-customized goalCalories number.
    return { mode: "calculated", min: 1900, max: 2100, calculatedMin: null, calculatedMax: null, calculatedAt: null };
  }

  function defaultMacroTargets() {
    return { proteinMin: null, proteinMax: null, fatMin: null, fatMax: null, carbsMin: null, carbsMax: null, calculatedAt: null };
  }

  function defaultAdaptive() {
    return { lastCheckedAt: null, suggestion: null };
  }

  function defaultWorkoutGoal() {
    return { weeklySessions: 4 };
  }

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      days: {},
      profile: defaultProfile(),
      weightLog: [],
      calorieTarget: defaultCalorieTarget(),
      macroTargets: defaultMacroTargets(),
      adaptive: defaultAdaptive(),
      workouts: {},
      workoutGoal: defaultWorkoutGoal(),
      onboardingShown: false
    };
  }

  function migrateV1toV2(old) {
    const legacyGoal = (typeof old.goalCalories === "number" && old.goalCalories > 0) ? Math.round(old.goalCalories) : 2000;
    return {
      schemaVersion: 2,
      days: old.days || {},
      profile: defaultProfile(),
      weightLog: [],
      calorieTarget: {
        mode: "manual",
        min: Math.max(0, legacyGoal - MIGRATION_BAND_HALF_WIDTH),
        max: legacyGoal + MIGRATION_BAND_HALF_WIDTH,
        calculatedMin: null,
        calculatedMax: null,
        calculatedAt: null
      },
      onboardingShown: false
    };
  }

  function migrateData(parsed) {
    if (!parsed || typeof parsed !== "object") return defaultState();
    let data = parsed;
    if (!data.schemaVersion || data.schemaVersion < 2) data = migrateV1toV2(data);
    data.schemaVersion = SCHEMA_VERSION;
    if (!data.days) data.days = {};
    if (!data.profile) data.profile = defaultProfile();
    if (!data.weightLog) data.weightLog = [];
    if (!data.calorieTarget) data.calorieTarget = defaultCalorieTarget();
    if (!data.macroTargets) data.macroTargets = defaultMacroTargets();
    if (!data.adaptive) data.adaptive = defaultAdaptive();
    if (!data.workouts) data.workouts = {};
    if (!data.workoutGoal) data.workoutGoal = defaultWorkoutGoal();
    if (typeof data.onboardingShown !== "boolean") data.onboardingShown = false;
    return data;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return migrateData(JSON.parse(raw));
    } catch (e) {
      console.error("Error loading data", e);
      return defaultState();
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Error saving data", e);
      showToast("No se pudo guardar. ¿Memoria llena?");
    }
  }

  let state = loadData();
  recalculateTargets(); // keep targets fresh across days even without touching profile/weight
  checkAdaptiveSuggestion(); // weekly-cadence check, no-op if too soon or not enough data
  saveData(state); // durably persist migration/defaults even before the first user action
  let dayOffset = 0; // 0 = today, -1 = yesterday, etc.

  function currentDayKey() {
    return todayKey(dayOffset);
  }

  function currentDayEntries() {
    const key = currentDayKey();
    if (!state.days[key]) state.days[key] = { entries: [] };
    return state.days[key].entries;
  }

  /* ---------- Calorie target calculation ---------- */

  function latestWeightEntry(weightLog) {
    if (!weightLog || weightLog.length === 0) return null;
    return [...weightLog].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.addedAt || 0) - (a.addedAt || 0);
    })[0];
  }

  function calculateCalorieRange(profile, latestWeightKg) {
    if (!profile || !latestWeightKg) return null;
    const { sex, age, heightCm, activityLevel, goalType, rateKgPerWeek } = profile;
    if (!sex || !age || !heightCm || !activityLevel || !goalType) return null;
    if (goalType !== "maintain" && (rateKgPerWeek === null || rateKgPerWeek === undefined)) return null;

    const bmr = sex === "female"
      ? 10 * latestWeightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * latestWeightKg + 6.25 * heightCm - 5 * age + 5;

    const tdee = bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || ACTIVITY_MULTIPLIERS.sedentary);
    const dailyDelta = ((goalType === "maintain" ? 0 : rateKgPerWeek) * KCAL_PER_KG) / 7;
    const signedDelta = goalType === "lose" ? -dailyDelta : dailyDelta;
    const center = tdee + signedDelta;

    const min = Math.max(0, Math.round((center - BAND_HALF_WIDTH_KCAL) / 10) * 10);
    const max = Math.round((center + BAND_HALF_WIDTH_KCAL) / 10) * 10;
    return { min, max };
  }

  function calculateMacroTargets(latestWeightKg, calorieCenter) {
    if (!latestWeightKg || !calorieCenter) return null;

    const proteinCenter = latestWeightKg * PROTEIN_G_PER_KG;
    const fatCenter = (calorieCenter * FAT_PCT_OF_CALORIES) / 9;
    const carbsCenter = Math.max(0, (calorieCenter - proteinCenter * 4 - fatCenter * 9) / 4);

    const band = (center, half) => ({ min: Math.max(0, Math.round(center - half)), max: Math.round(center + half) });
    return {
      protein: band(proteinCenter, PROTEIN_BAND_G),
      fat: band(fatCenter, FAT_BAND_G),
      carbs: band(carbsCenter, CARBS_BAND_G)
    };
  }

  function recalculateTargets() {
    const latest = latestWeightEntry(state.weightLog);
    const latestWeightKg = latest ? latest.weightKg : null;
    const computed = calculateCalorieRange(state.profile, latestWeightKg);
    if (!computed) return; // insufficient profile/weight data — leave targets untouched
    state.calorieTarget.calculatedMin = computed.min;
    state.calorieTarget.calculatedMax = computed.max;
    state.calorieTarget.calculatedAt = Date.now();
    if (state.calorieTarget.mode === "calculated") {
      state.calorieTarget.min = computed.min;
      state.calorieTarget.max = computed.max;
    }

    const calorieCenter = (computed.min + computed.max) / 2;
    const macros = calculateMacroTargets(latestWeightKg, calorieCenter);
    if (macros) {
      state.macroTargets.proteinMin = macros.protein.min;
      state.macroTargets.proteinMax = macros.protein.max;
      state.macroTargets.fatMin = macros.fat.min;
      state.macroTargets.fatMax = macros.fat.max;
      state.macroTargets.carbsMin = macros.carbs.min;
      state.macroTargets.carbsMax = macros.carbs.max;
      state.macroTargets.calculatedAt = Date.now();
    }
  }

  /* ---------- Rendering ---------- */

  const entryListEl = document.getElementById("entryList");
  const emptyStateEl = document.getElementById("emptyState");
  const copyYesterdayBtnEl = document.getElementById("copyYesterdayBtn");
  const quickSectionEl = document.getElementById("quickSection");
  const quickRowEl = document.getElementById("quickRow");
  const totalKcalEl = document.getElementById("totalKcal");
  const rangeStatusLineEl = document.getElementById("rangeStatusLine");
  const rangeBandFillEl = document.getElementById("rangeBandFill");
  const rangeMarkerEl = document.getElementById("rangeMarker");
  const rangeMinLabelEl = document.getElementById("rangeMinLabel");
  const rangeMaxLabelEl = document.getElementById("rangeMaxLabel");
  const targetMinChipEl = document.getElementById("targetMinEl");
  const targetMaxChipEl = document.getElementById("targetMaxEl");
  const dateLabelEl = document.getElementById("dateLabel");
  const fullDateLabelEl = document.getElementById("fullDateLabel");

  const macroSectionEl = document.getElementById("macroSection");
  const proteinTotalEl = document.getElementById("proteinTotal");
  const proteinTargetEl = document.getElementById("proteinTarget");
  const proteinFillEl = document.getElementById("proteinFill");
  const fatTotalEl = document.getElementById("fatTotal");
  const fatTargetEl = document.getElementById("fatTarget");
  const fatFillEl = document.getElementById("fatFill");
  const carbsTotalEl = document.getElementById("carbsTotal");
  const carbsTargetEl = document.getElementById("carbsTarget");
  const carbsFillEl = document.getElementById("carbsFill");

  const WEEKDAYS = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
  const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

  function formatDateLabel(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const weekday = WEEKDAYS[d.getDay()];
    const day = d.getDate();
    const month = MONTHS[d.getMonth()];
    return { weekday, day, month, short: offset === 0 ? "Hoy" : offset === -1 ? "Ayer" : `${day} ${month}` };
  }

  function formatShortDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  }

  function previousDayEntries() {
    const key = todayKey(dayOffset - 1);
    return (state.days[key] && state.days[key].entries) || [];
  }

  function render() {
    const entries = currentDayEntries();
    const label = formatDateLabel(dayOffset);

    dateLabelEl.textContent = label.short;
    fullDateLabelEl.textContent = `${label.weekday}, ${label.day} de ${label.month}`.replace(/^./, c => c.toUpperCase());

    renderQuickAdd();

    entryListEl.innerHTML = "";
    if (entries.length === 0) {
      emptyStateEl.style.display = "block";
      copyYesterdayBtnEl.hidden = previousDayEntries().length === 0;
    } else {
      emptyStateEl.style.display = "none";
      entries.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="row-main">
            <span class="row-name">${escapeHtml(entry.name)}</span>
            <span class="row-qty">${entry.qtyLabel ? entry.qtyLabel + " · " : ""}${formatTime(entry.addedAt)}</span>
            ${(entry.protein || entry.fat || entry.carbs)
              ? `<span class="row-macros">${Math.round(entry.protein || 0)}P · ${Math.round(entry.fat || 0)}F · ${Math.round(entry.carbs || 0)}C</span>`
              : ""}
          </div>
          <span class="row-amount">${Math.round(entry.calories)} kcal</span>
          <button class="row-del" data-id="${entry.id}" aria-label="Quitar">✕</button>
        `;
        entryListEl.appendChild(row);
      });
    }

    const total = entries.reduce((sum, e) => sum + e.calories, 0);
    totalKcalEl.textContent = `${Math.round(total)} kcal`;

    const { min, max } = state.calorieTarget;
    targetMinChipEl.textContent = min;
    targetMaxChipEl.textContent = max;
    rangeMinLabelEl.textContent = min;
    rangeMaxLabelEl.textContent = max;

    const inRange = total >= min && total <= max;
    rangeStatusLineEl.textContent = inRange
      ? "dentro del rango"
      : total < min
        ? `${Math.round(min - total)} kcal por debajo del rango`
        : `${Math.round(total - max)} kcal por encima del rango`;
    rangeStatusLineEl.classList.toggle("in-range", inRange);

    const domainMax = Math.max(max, total) * 1.15 || 1;
    rangeBandFillEl.style.left = `${(min / domainMax) * 100}%`;
    rangeBandFillEl.style.width = `${((max - min) / domainMax) * 100}%`;
    rangeMarkerEl.style.left = `${Math.min(100, (total / domainMax) * 100)}%`;

    renderMacros(entries);
    renderAdaptiveBanner();
  }

  function renderMacros(entries) {
    const mt = state.macroTargets;
    if (mt.proteinMin === null) {
      macroSectionEl.hidden = true;
      return;
    }
    macroSectionEl.hidden = false;

    const totals = entries.reduce((acc, e) => {
      acc.protein += e.protein || 0;
      acc.fat += e.fat || 0;
      acc.carbs += e.carbs || 0;
      return acc;
    }, { protein: 0, fat: 0, carbs: 0 });

    fillMacroCol(proteinTotalEl, proteinTargetEl, proteinFillEl, totals.protein, mt.proteinMin, mt.proteinMax);
    fillMacroCol(fatTotalEl, fatTargetEl, fatFillEl, totals.fat, mt.fatMin, mt.fatMax);
    fillMacroCol(carbsTotalEl, carbsTargetEl, carbsFillEl, totals.carbs, mt.carbsMin, mt.carbsMax);
  }

  function fillMacroCol(totalEl, targetEl, fillEl, total, min, max) {
    totalEl.textContent = Math.round(total);
    targetEl.textContent = max;
    const pct = Math.min(100, (total / max) * 100 || 0);
    fillEl.style.width = `${pct}%`;
    fillEl.classList.toggle("in-range", total >= min && total <= max);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  entryListEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".row-del");
    if (!btn) return;
    const id = btn.dataset.id;
    const entries = currentDayEntries();
    const idx = entries.findIndex((en) => en.id === id);
    if (idx >= 0) {
      entries.splice(idx, 1);
      saveData(state);
      render();
    }
  });

  /* ---------- Quick add & copy from yesterday ---------- */

  function computeFrequentItems(limit = 8) {
    const tally = new Map();
    Object.values(state.days).forEach((day) => {
      day.entries.forEach((e) => {
        const key = e.name.trim().toLowerCase();
        if (!key) return;
        const existing = tally.get(key);
        if (existing) {
          existing.count += 1;
          if (e.addedAt > existing.lastAddedAt) {
            existing.lastAddedAt = e.addedAt;
            existing.calories = e.calories;
            existing.qtyLabel = e.qtyLabel;
            existing.name = e.name;
            existing.protein = e.protein;
            existing.fat = e.fat;
            existing.carbs = e.carbs;
          }
        } else {
          tally.set(key, { name: e.name, calories: e.calories, qtyLabel: e.qtyLabel, protein: e.protein, fat: e.fat, carbs: e.carbs, count: 1, lastAddedAt: e.addedAt });
        }
      });
    });
    return Array.from(tally.values())
      .sort((a, b) => b.count - a.count || b.lastAddedAt - a.lastAddedAt)
      .slice(0, limit);
  }

  function addEntryToCurrentDay(item) {
    const entries = currentDayEntries();
    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      calories: item.calories,
      qtyLabel: item.qtyLabel || "",
      protein: item.protein || 0,
      fat: item.fat || 0,
      carbs: item.carbs || 0,
      addedAt: Date.now()
    });
  }

  function renderQuickAdd() {
    const items = computeFrequentItems();
    quickRowEl.innerHTML = "";
    if (items.length === 0) {
      quickSectionEl.hidden = true;
      return;
    }
    quickSectionEl.hidden = false;
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(item.name)}</span>
        <span class="quick-chip-kcal">${Math.round(item.calories)} kcal</span>
      `;
      chip.addEventListener("click", () => {
        addEntryToCurrentDay(item);
        saveData(state);
        render();
        showToast("Añadido");
      });
      quickRowEl.appendChild(chip);
    });
  }

  copyYesterdayBtnEl.addEventListener("click", () => {
    const source = previousDayEntries();
    if (source.length === 0) return;
    source.forEach((e) => addEntryToCurrentDay(e));
    saveData(state);
    render();
    showToast("Copiado de ayer");
  });

  /* ---------- Day navigation ---------- */

  document.getElementById("prevDay").addEventListener("click", () => {
    dayOffset -= 1;
    render();
  });
  document.getElementById("nextDay").addEventListener("click", () => {
    if (dayOffset < 0) dayOffset += 1;
    render();
  });

  /* ---------- Toast ---------- */

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- Target modal ---------- */

  const targetModal = document.getElementById("targetModal");
  const targetForm = document.getElementById("targetForm");
  const targetMinInputEl = document.getElementById("targetMinInput");
  const targetMaxInputEl = document.getElementById("targetMaxInput");
  const targetResetBtn = document.getElementById("targetResetBtn");
  const targetIncompleteHintEl = document.getElementById("targetIncompleteHint");
  const targetCalcHintEl = document.getElementById("targetCalcHint");
  const targetHintWeightEl = document.getElementById("targetHintWeight");
  const targetHintDateEl = document.getElementById("targetHintDate");

  function openTargetModal() {
    targetMinInputEl.value = state.calorieTarget.min;
    targetMaxInputEl.value = state.calorieTarget.max;

    const hasCalculated = state.calorieTarget.calculatedMin !== null;
    targetResetBtn.hidden = !hasCalculated || state.calorieTarget.mode === "calculated";

    const latest = latestWeightEntry(state.weightLog);
    const p = state.profile;
    const profileComplete = !!(p.sex && p.age && p.heightCm && p.activityLevel && p.goalType);

    if (!profileComplete || !latest) {
      targetIncompleteHintEl.hidden = false;
      targetCalcHintEl.hidden = true;
    } else {
      targetIncompleteHintEl.hidden = true;
      targetCalcHintEl.hidden = false;
      targetHintWeightEl.textContent = `${latest.weightKg} kg`;
      targetHintDateEl.textContent = formatShortDate(latest.date);
    }

    openModal(targetModal);
  }

  document.getElementById("targetBtn").addEventListener("click", openTargetModal);
  document.getElementById("closeTargetModal").addEventListener("click", () => closeModal(targetModal));

  document.getElementById("targetGoProfile").addEventListener("click", () => {
    closeModal(targetModal);
    openProfileModal();
  });
  document.getElementById("targetGoWeight").addEventListener("click", () => {
    closeModal(targetModal);
    openWeightModal();
  });

  targetForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const min = parseFloat(targetMinInputEl.value);
    const max = parseFloat(targetMaxInputEl.value);
    if (!(min >= 0) || !(max >= min)) {
      showToast("Revisa el rango");
      return;
    }
    state.calorieTarget.mode = "manual";
    state.calorieTarget.min = Math.round(min);
    state.calorieTarget.max = Math.round(max);
    saveData(state);
    render();
    closeModal(targetModal);
  });

  targetResetBtn.addEventListener("click", () => {
    state.calorieTarget.mode = "calculated";
    recalculateTargets();
    saveData(state);
    render();
    closeModal(targetModal);
  });

  /* ---------- Profile modal ---------- */

  const profileModal = document.getElementById("profileModal");
  const profileForm = document.getElementById("profileForm");
  const profileSexEl = document.getElementById("profileSex");
  const profileAgeEl = document.getElementById("profileAge");
  const profileHeightEl = document.getElementById("profileHeight");
  const profileActivityEl = document.getElementById("profileActivity");
  const goalTypeToggleEl = document.getElementById("goalTypeToggle");
  const rateFieldEl = document.getElementById("rateField");
  const profileRateEl = document.getElementById("profileRate");
  const rateValueLabelEl = document.getElementById("rateValueLabel");

  let selectedGoalType = "gain";

  function setGoalTypeUI(goalType) {
    selectedGoalType = goalType;
    goalTypeToggleEl.querySelectorAll(".segmented-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.goal === goalType);
    });
    rateFieldEl.hidden = goalType === "maintain";
  }

  goalTypeToggleEl.querySelectorAll(".segmented-btn").forEach((btn) => {
    btn.addEventListener("click", () => setGoalTypeUI(btn.dataset.goal));
  });

  profileRateEl.addEventListener("input", () => {
    rateValueLabelEl.textContent = parseFloat(profileRateEl.value).toFixed(2);
  });

  function openProfileModal() {
    const p = state.profile;
    profileSexEl.value = p.sex || "male";
    profileAgeEl.value = p.age || "";
    profileHeightEl.value = p.heightCm || "";
    profileActivityEl.value = p.activityLevel || "sedentary";
    setGoalTypeUI(p.goalType || "gain");
    profileRateEl.value = p.rateKgPerWeek || 0.5;
    rateValueLabelEl.textContent = parseFloat(profileRateEl.value).toFixed(2);
    openModal(profileModal);
  }

  document.getElementById("profileBtn").addEventListener("click", openProfileModal);
  document.getElementById("closeProfileModal").addEventListener("click", () => closeModal(profileModal));

  function saveProfileFromForm() {
    const age = parseInt(profileAgeEl.value, 10);
    const heightCm = parseFloat(profileHeightEl.value);
    if (!(age > 0) || !(heightCm > 0)) {
      showToast("Revisa edad y altura");
      return false;
    }
    state.profile = {
      sex: profileSexEl.value,
      age,
      heightCm,
      activityLevel: profileActivityEl.value,
      goalType: selectedGoalType,
      rateKgPerWeek: selectedGoalType === "maintain" ? null : parseFloat(profileRateEl.value),
      updatedAt: Date.now()
    };
    recalculateTargets();
    saveData(state);
    render();
    return true;
  }

  document.getElementById("profileGoWeight").addEventListener("click", () => {
    if (!saveProfileFromForm()) return;
    closeModal(profileModal);
    openWeightModal();
  });

  profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!saveProfileFromForm()) return;
    closeModal(profileModal);
    showToast("Perfil guardado");
  });

  /* ---------- Weight log modal ---------- */

  const weightModal = document.getElementById("weightModal");
  const weightForm = document.getElementById("weightForm");
  const weightListEl = document.getElementById("weightList");
  const weightEmptyStateEl = document.getElementById("weightEmptyState");
  const weightDateEl = document.getElementById("weightDate");
  const weightKgEl = document.getElementById("weightKg");
  const weightSubmitBtnEl = document.getElementById("weightSubmitBtn");

  let editingWeightId = null;

  function sortedWeightLog() {
    return [...state.weightLog].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
  }

  function renderWeightList() {
    const sorted = sortedWeightLog();
    weightListEl.innerHTML = "";
    if (sorted.length === 0) {
      weightEmptyStateEl.style.display = "block";
    } else {
      weightEmptyStateEl.style.display = "none";
      sorted.forEach((w) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <button type="button" class="row-main row-edit" data-id="${w.id}">
            <span class="row-name">${formatShortDate(w.date)}</span>
          </button>
          <span class="row-amount">${w.weightKg} kg</span>
          <button class="row-del" data-id="${w.id}" aria-label="Quitar">✕</button>
        `;
        weightListEl.appendChild(row);
      });
    }
  }

  function resetWeightForm() {
    editingWeightId = null;
    weightDateEl.value = todayKey(0);
    weightDateEl.max = todayKey(0);
    weightKgEl.value = "";
    weightSubmitBtnEl.textContent = "Añadir peso";
  }

  function openWeightModal() {
    renderWeightList();
    resetWeightForm();
    openModal(weightModal);
  }

  document.getElementById("weightBackBtn").addEventListener("click", () => {
    closeModal(weightModal);
    openProfileModal();
  });
  document.getElementById("closeWeightModal").addEventListener("click", () => closeModal(weightModal));

  weightListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      const id = delBtn.dataset.id;
      const idx = state.weightLog.findIndex((w) => w.id === id);
      if (idx >= 0) {
        state.weightLog.splice(idx, 1);
        recalculateTargets();
        saveData(state);
        renderWeightList();
        render();
      }
      return;
    }
    const editBtn = e.target.closest(".row-edit");
    if (editBtn) {
      const id = editBtn.dataset.id;
      const entry = state.weightLog.find((w) => w.id === id);
      if (entry) {
        editingWeightId = id;
        weightDateEl.value = entry.date;
        weightKgEl.value = entry.weightKg;
        weightSubmitBtnEl.textContent = "Guardar cambios";
      }
    }
  });

  weightForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = weightDateEl.value;
    const weightKg = parseFloat(weightKgEl.value);
    if (!date || !(weightKg > 0)) {
      showToast("Revisa la fecha y el peso");
      return;
    }
    if (editingWeightId) {
      const entry = state.weightLog.find((w) => w.id === editingWeightId);
      if (entry) { entry.date = date; entry.weightKg = weightKg; }
    } else {
      state.weightLog.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date,
        weightKg,
        addedAt: Date.now()
      });
    }
    recalculateTargets();
    saveData(state);
    renderWeightList();
    resetWeightForm();
    render();
    showToast("Peso guardado");
  });

  /* ---------- Manual / confirm entry modal ---------- */

  const entryModal = document.getElementById("entryModal");
  const entryForm = document.getElementById("entryForm");
  const entryNameEl = document.getElementById("entryName");
  const entryKcalPer100El = document.getElementById("entryKcalPer100");
  const entryGramsEl = document.getElementById("entryGrams");
  const entryKcalTotalEl = document.getElementById("entryKcalTotal");
  const entryProteinPer100El = document.getElementById("entryProteinPer100");
  const entryFatPer100El = document.getElementById("entryFatPer100");
  const entryCarbsPer100El = document.getElementById("entryCarbsPer100");
  const entryModalTitleEl = document.getElementById("entryModalTitle");
  const foodSearchInputEl = document.getElementById("foodSearchInput");
  const foodSearchResultsEl = document.getElementById("foodSearchResults");
  const foodSearchHintEl = document.getElementById("foodSearchHint");

  function resetFoodSearch() {
    foodSearchInputEl.value = "";
    foodSearchResultsEl.innerHTML = "";
    foodSearchHintEl.hidden = true;
  }

  let foodSearchDebounce = null;

  foodSearchInputEl.addEventListener("input", () => {
    clearTimeout(foodSearchDebounce);
    const query = foodSearchInputEl.value.trim();
    foodSearchResultsEl.innerHTML = "";
    if (query.length < 2) {
      foodSearchHintEl.hidden = true;
      return;
    }
    foodSearchHintEl.hidden = false;
    foodSearchHintEl.textContent = "Buscando…";
    foodSearchDebounce = setTimeout(() => searchFoods(query), 450);
  });

  async function searchFoods(query) {
    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&lc=es&fields=product_name,product_name_es,nutriments`;
      const res = await fetch(url);
      const data = await res.json();
      renderFoodSearchResults(data.products || [], query);
    } catch (err) {
      console.error(err);
      foodSearchHintEl.hidden = false;
      foodSearchHintEl.textContent = "Error al buscar. Revisa tu conexión.";
    }
  }

  function renderFoodSearchResults(products, query) {
    if (foodSearchInputEl.value.trim() !== query) return; // stale response, a newer search superseded it
    foodSearchResultsEl.innerHTML = "";
    const valid = products.filter((p) => (p.product_name_es || p.product_name) && p.nutriments && typeof p.nutriments["energy-kcal_100g"] === "number");
    if (valid.length === 0) {
      foodSearchHintEl.hidden = false;
      foodSearchHintEl.textContent = "Sin resultados. Añádelo a mano abajo.";
      return;
    }
    foodSearchHintEl.hidden = true;
    valid.forEach((p) => {
      const name = p.product_name_es || p.product_name;
      const kcal = Math.round(p.nutriments["energy-kcal_100g"]);
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <button type="button" class="row-main">
          <span class="row-name">${escapeHtml(name)}</span>
          <span class="row-qty">${kcal} kcal /100g</span>
        </button>
      `;
      row.querySelector(".row-main").addEventListener("click", () => applyFoodSearchResult(p, name, kcal));
      foodSearchResultsEl.appendChild(row);
    });
  }

  function applyFoodSearchResult(product, name, kcal) {
    entryModalTitleEl.textContent = "Confirmar producto";
    entryForm.reset();
    entryNameEl.value = name;
    entryGramsEl.value = 100;
    entryKcalPer100El.value = kcal;
    const n = product.nutriments;
    if (typeof n.proteins_100g === "number") entryProteinPer100El.value = Math.round(n.proteins_100g);
    if (typeof n.fat_100g === "number") entryFatPer100El.value = Math.round(n.fat_100g);
    if (typeof n.carbohydrates_100g === "number") entryCarbsPer100El.value = Math.round(n.carbohydrates_100g);
    resetFoodSearch();
  }

  document.getElementById("manualBtn").addEventListener("click", () => {
    entryModalTitleEl.textContent = "Añadir alimento";
    entryForm.reset();
    entryGramsEl.value = 100;
    resetFoodSearch();
    openModal(entryModal);
    setTimeout(() => foodSearchInputEl.focus(), 50);
  });
  document.getElementById("closeEntryModal").addEventListener("click", () => closeModal(entryModal));

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = entryNameEl.value.trim();
    if (!name) return;

    const kcalTotal = parseFloat(entryKcalTotalEl.value);
    const kcalPer100 = parseFloat(entryKcalPer100El.value);
    const grams = parseFloat(entryGramsEl.value) || 100;

    let calories, qtyLabel;
    if (!isNaN(kcalTotal) && kcalTotal >= 0) {
      calories = kcalTotal;
      qtyLabel = "";
    } else if (!isNaN(kcalPer100) && kcalPer100 >= 0) {
      calories = (kcalPer100 * grams) / 100;
      qtyLabel = `${grams} g`;
    } else {
      showToast("Indica las kcal");
      return;
    }

    const proteinPer100 = parseFloat(entryProteinPer100El.value);
    const fatPer100 = parseFloat(entryFatPer100El.value);
    const carbsPer100 = parseFloat(entryCarbsPer100El.value);
    const scale = (v) => (!isNaN(v) && v >= 0 ? (v * grams) / 100 : 0);

    const entries = currentDayEntries();
    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      calories,
      qtyLabel,
      protein: scale(proteinPer100),
      fat: scale(fatPer100),
      carbs: scale(carbsPer100),
      addedAt: Date.now()
    });
    saveData(state);
    render();
    closeModal(entryModal);
    showToast("Añadido");
  });

  /* ---------- Modal helpers ---------- */

  function openModal(modal) {
    modal.hidden = false;
  }
  function closeModal(modal) {
    modal.hidden = true;
  }
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  /* ---------- Barcode scanning ---------- */

  const scanModal = document.getElementById("scanModal");
  const scannerHintEl = document.getElementById("scannerHint");
  let html5QrCode = null;
  let scanning = false;

  document.getElementById("scanBtn").addEventListener("click", async () => {
    openModal(scanModal);
    scannerHintEl.textContent = "Apunta al código de barras del producto.";
    try {
      if (typeof Html5Qrcode === "undefined") {
        scannerHintEl.textContent = "No se pudo cargar el lector de códigos. Comprueba tu conexión.";
        return;
      }
      html5QrCode = new Html5Qrcode("scannerViewport");
      scanning = true;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 140 } },
        onScanSuccess,
        () => {} // ignore per-frame scan failures
      );
    } catch (err) {
      console.error(err);
      scannerHintEl.textContent = "No se pudo acceder a la cámara. Revisa los permisos.";
    }
  });

  async function stopScanner() {
    if (html5QrCode && scanning) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (e) { /* already stopped */ }
    }
    scanning = false;
  }

  document.getElementById("closeScanModal").addEventListener("click", async () => {
    await stopScanner();
    closeModal(scanModal);
  });

  async function onScanSuccess(decodedText) {
    if (!scanning) return;
    scanning = false;
    await stopScanner();
    closeModal(scanModal);
    lookupBarcode(decodedText.trim());
  }

  async function lookupBarcode(barcode) {
    showToast(`Buscando ${barcode}…`);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
      const data = await res.json();

      if (data.status !== 1 || !data.product) {
        showToast("Producto no encontrado. Añádelo a mano.");
        entryModalTitleEl.textContent = "Añadir alimento";
        entryForm.reset();
        entryGramsEl.value = 100;
        resetFoodSearch();
        openModal(entryModal);
        return;
      }

      const p = data.product;
      const name = p.product_name_es || p.product_name || p.generic_name || "Producto sin nombre";
      const nutriments = p.nutriments || {};
      const kcalPer100 = nutriments["energy-kcal_100g"] ?? nutriments["energy-kcal"];

      entryModalTitleEl.textContent = "Confirmar producto";
      entryForm.reset();
      resetFoodSearch();
      entryNameEl.value = name;
      entryGramsEl.value = 100;
      if (typeof kcalPer100 === "number") {
        entryKcalPer100El.value = Math.round(kcalPer100);
      } else {
        showToast("Sin datos de calorías. Introdúcelas a mano.");
      }
      if (typeof nutriments.proteins_100g === "number") entryProteinPer100El.value = Math.round(nutriments.proteins_100g);
      if (typeof nutriments.fat_100g === "number") entryFatPer100El.value = Math.round(nutriments.fat_100g);
      if (typeof nutriments.carbohydrates_100g === "number") entryCarbsPer100El.value = Math.round(nutriments.carbohydrates_100g);
      openModal(entryModal);
      setTimeout(() => entryGramsEl.focus(), 50);
    } catch (err) {
      console.error(err);
      showToast("Error al consultar Open Food Facts.");
    }
  }

  /* ---------- Service worker ---------- */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((e) => console.error("SW failed", e));
    });
  }

  /* ---------- Tab navigation ---------- */

  /* ---------- Workout tracker ---------- */

  let workoutDayOffset = 0;
  let currentExerciseId = null;

  const exerciseListEl = document.getElementById("exerciseList");
  const workoutEmptyStateEl = document.getElementById("workoutEmptyState");
  const workoutDateLabelEl = document.getElementById("workoutDateLabel");
  const workoutFullDateLabelEl = document.getElementById("workoutFullDateLabel");
  const exerciseQuickSectionEl = document.getElementById("exerciseQuickSection");
  const exerciseQuickRowEl = document.getElementById("exerciseQuickRow");
  const sessionCountChipEl = document.getElementById("sessionCountChip");

  function currentWorkoutDayKey() {
    return todayKey(workoutDayOffset);
  }

  function currentWorkoutExercises() {
    const key = currentWorkoutDayKey();
    if (!state.workouts[key]) state.workouts[key] = { exercises: [] };
    return state.workouts[key].exercises;
  }

  function computeFrequentExercises(limit = 8) {
    const tally = new Map();
    Object.values(state.workouts).forEach((day) => {
      day.exercises.forEach((ex) => {
        const key = ex.name.trim().toLowerCase();
        if (!key) return;
        const existing = tally.get(key);
        if (existing) {
          existing.count += 1;
          if (ex.addedAt > existing.lastAddedAt) {
            existing.lastAddedAt = ex.addedAt;
            existing.name = ex.name;
          }
        } else {
          tally.set(key, { name: ex.name, count: 1, lastAddedAt: ex.addedAt });
        }
      });
    });
    return Array.from(tally.values())
      .sort((a, b) => b.count - a.count || b.lastAddedAt - a.lastAddedAt)
      .slice(0, limit);
  }

  function findLastExerciseSets(name, beforeDayKey) {
    const key = name.trim().toLowerCase();
    const candidates = [];
    Object.entries(state.workouts).forEach(([dayKey, day]) => {
      if (dayKey >= beforeDayKey) return; // only strictly earlier sessions count as "last time"
      day.exercises.forEach((ex) => {
        if (ex.name.trim().toLowerCase() === key && ex.sets.length > 0) {
          candidates.push({ dayKey, ex });
        }
      });
    });
    candidates.sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
    return candidates[0] || null;
  }

  function createExercise(name) {
    const exercises = currentWorkoutExercises();
    const ex = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, sets: [], addedAt: Date.now() };
    exercises.push(ex);
    saveData(state);
    renderWorkoutDay();
    return ex;
  }

  function renderExerciseQuickAdd() {
    const items = computeFrequentExercises();
    exerciseQuickRowEl.innerHTML = "";
    if (items.length === 0) {
      exerciseQuickSectionEl.hidden = true;
      return;
    }
    exerciseQuickSectionEl.hidden = false;
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `<span class="quick-chip-name">${escapeHtml(item.name)}</span>`;
      chip.addEventListener("click", () => {
        const ex = createExercise(item.name);
        openExerciseDetail(ex.id);
      });
      exerciseQuickRowEl.appendChild(chip);
    });
  }

  function summarizeExercise(ex) {
    const n = ex.sets.length;
    if (n === 0) return "Sin series";
    const label = `${n} serie${n === 1 ? "" : "s"}`;
    const hasWeight = ex.sets.some((s) => s.weightKg !== null && s.weightKg !== undefined);
    if (hasWeight) {
      const volume = ex.sets.reduce((sum, s) => sum + (s.weightKg || 0) * s.reps, 0);
      return `${label} · ${Math.round(volume)} kg vol.`;
    }
    const reps = ex.sets.map((s) => s.reps);
    const allSame = reps.every((r) => r === reps[0]);
    return allSame ? `${n}×${reps[0]} reps` : `${label} · ${reps.reduce((a, b) => a + b, 0)} reps`;
  }

  function countWorkoutSessions() {
    return Object.values(state.workouts).filter((day) => day.exercises.length > 0).length;
  }

  function renderWorkoutDay() {
    const exercises = currentWorkoutExercises();
    const label = formatDateLabel(workoutDayOffset);
    workoutDateLabelEl.textContent = label.short;
    workoutFullDateLabelEl.textContent = `${label.weekday}, ${label.day} de ${label.month}`.replace(/^./, (c) => c.toUpperCase());

    const sessions = countWorkoutSessions();
    sessionCountChipEl.textContent = `${sessions} sesión${sessions === 1 ? "" : "es"}`;

    renderExerciseQuickAdd();

    exerciseListEl.innerHTML = "";
    if (exercises.length === 0) {
      workoutEmptyStateEl.style.display = "block";
    } else {
      workoutEmptyStateEl.style.display = "none";
      exercises.forEach((ex) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <button type="button" class="row-main row-edit" data-id="${ex.id}">
            <span class="row-name">${escapeHtml(ex.name)}</span>
            <span class="row-qty">${summarizeExercise(ex)}</span>
          </button>
          <button class="row-del" data-id="${ex.id}" aria-label="Quitar">✕</button>
        `;
        exerciseListEl.appendChild(row);
      });
    }
  }

  document.getElementById("prevWorkoutDay").addEventListener("click", () => {
    workoutDayOffset -= 1;
    renderWorkoutDay();
  });
  document.getElementById("nextWorkoutDay").addEventListener("click", () => {
    if (workoutDayOffset < 0) workoutDayOffset += 1;
    renderWorkoutDay();
  });

  exerciseListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      const id = delBtn.dataset.id;
      const exercises = currentWorkoutExercises();
      const idx = exercises.findIndex((ex) => ex.id === id);
      if (idx >= 0) {
        exercises.splice(idx, 1);
        saveData(state);
        renderWorkoutDay();
      }
      return;
    }
    const editBtn = e.target.closest(".row-edit");
    if (editBtn) openExerciseDetail(editBtn.dataset.id);
  });

  /* ---------- Add exercise modal ---------- */

  const addExerciseModal = document.getElementById("addExerciseModal");
  const addExerciseForm = document.getElementById("addExerciseForm");
  const exerciseNameInputEl = document.getElementById("exerciseNameInput");

  document.getElementById("addExerciseBtn").addEventListener("click", () => {
    addExerciseForm.reset();
    openModal(addExerciseModal);
    setTimeout(() => exerciseNameInputEl.focus(), 50);
  });
  document.getElementById("closeAddExerciseModal").addEventListener("click", () => closeModal(addExerciseModal));

  addExerciseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = exerciseNameInputEl.value.trim();
    if (!name) return;
    const ex = createExercise(name);
    closeModal(addExerciseModal);
    openExerciseDetail(ex.id);
  });

  /* ---------- Exercise detail modal (sets) ---------- */

  const exerciseDetailModal = document.getElementById("exerciseDetailModal");
  const exerciseDetailTitleEl = document.getElementById("exerciseDetailTitle");
  const lastPerformanceHintEl = document.getElementById("lastPerformanceHint");
  const setListEl = document.getElementById("setList");
  const setEmptyStateEl = document.getElementById("setEmptyState");
  const setForm = document.getElementById("setForm");
  const setWeightEl = document.getElementById("setWeight");
  const setRepsEl = document.getElementById("setReps");

  function formatSet(s) {
    return s.weightKg !== null && s.weightKg !== undefined ? `${s.weightKg}×${s.reps}` : `${s.reps} reps`;
  }

  function openExerciseDetail(exerciseId) {
    currentExerciseId = exerciseId;
    const ex = currentWorkoutExercises().find((e) => e.id === exerciseId);
    if (!ex) return;
    exerciseDetailTitleEl.textContent = ex.name;

    const last = findLastExerciseSets(ex.name, currentWorkoutDayKey());
    if (last) {
      lastPerformanceHintEl.hidden = false;
      lastPerformanceHintEl.textContent = `Última vez (${formatShortDate(last.dayKey)}): ${last.ex.sets.map(formatSet).join(", ")}`;
    } else {
      lastPerformanceHintEl.hidden = true;
    }

    renderSetList();
    setForm.reset();
    openModal(exerciseDetailModal);
    setTimeout(() => setRepsEl.focus(), 50);
  }

  function renderSetList() {
    const ex = currentWorkoutExercises().find((e) => e.id === currentExerciseId);
    setListEl.innerHTML = "";
    if (!ex || ex.sets.length === 0) {
      setEmptyStateEl.style.display = "block";
    } else {
      setEmptyStateEl.style.display = "none";
      ex.sets.forEach((s, i) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="row-main">
            <span class="row-name">Serie ${i + 1}</span>
            <span class="row-qty">${formatSet(s)}</span>
          </div>
          <button class="row-del" data-id="${s.id}" aria-label="Quitar">✕</button>
        `;
        setListEl.appendChild(row);
      });
    }
  }

  document.getElementById("closeExerciseDetailModal").addEventListener("click", () => closeModal(exerciseDetailModal));

  setListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (!delBtn) return;
    const ex = currentWorkoutExercises().find((e2) => e2.id === currentExerciseId);
    if (!ex) return;
    const idx = ex.sets.findIndex((s) => s.id === delBtn.dataset.id);
    if (idx >= 0) {
      ex.sets.splice(idx, 1);
      saveData(state);
      renderSetList();
      renderWorkoutDay();
    }
  });

  setForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const weightRaw = setWeightEl.value.trim();
    const weight = weightRaw === "" ? null : parseFloat(weightRaw);
    const reps = parseInt(setRepsEl.value, 10);
    if ((weight !== null && !(weight >= 0)) || !(reps > 0)) {
      showToast("Revisa peso y reps");
      return;
    }
    const ex = currentWorkoutExercises().find((e2) => e2.id === currentExerciseId);
    if (!ex) return;
    ex.sets.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, weightKg: weight, reps, addedAt: Date.now() });
    saveData(state);
    renderSetList();
    renderWorkoutDay();
    // deliberately don't reset the form — same weight/reps stay filled in so
    // repeating an identical set (e.g. "3 sets of the same") is a single tap
    setRepsEl.focus();
    setRepsEl.select();
  });

  /* ---------- Analytics ---------- */

  let analyticsPeriodDays = 7;

  function getRecentDays(n) {
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = todayKey(-i);
      const entries = (state.days[key] && state.days[key].entries) || [];
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      result.push({ date: key, total });
    }
    return result;
  }

  function getAllDays() {
    const dayKeysWithFood = Object.keys(state.days).filter((k) => state.days[k].entries.length > 0);
    const weightDateKeys = state.weightLog.map((w) => w.date);
    const allKeys = [...dayKeysWithFood, ...weightDateKeys];
    if (allKeys.length === 0) return getRecentDays(7);
    const earliest = allKeys.reduce((min, k) => (k < min ? k : min));

    const result = [];
    const cursor = new Date(`${earliest}T00:00:00`);
    const end = new Date(`${todayKey(0)}T00:00:00`);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const entries = (state.days[key] && state.days[key].entries) || [];
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      result.push({ date: key, total });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  function buildCalorieChart(days, min, max) {
    const h = 140, padBottom = 18;
    const chartH = h - padBottom;
    const scrollable = days.length > 30;
    const w = scrollable ? days.length * 16 : 300;
    const barW = w / days.length;
    const maxVal = Math.max(max || 0, ...days.map((d) => d.total), 1) * 1.08;

    let band = "";
    if (max > min) {
      const bandY1 = chartH - (min / maxVal) * chartH;
      const bandY2 = chartH - (max / maxVal) * chartH;
      band = `<rect x="0" y="${bandY2.toFixed(1)}" width="${w}" height="${(bandY1 - bandY2).toFixed(1)}" fill="var(--accent-soft)"></rect>`;
    }

    let bars = "";
    days.forEach((d, i) => {
      const barH = (d.total / maxVal) * chartH;
      const x = i * barW + barW * 0.18;
      const bw = barW * 0.64;
      const y = chartH - barH;
      const inRange = d.total >= min && d.total <= max;
      const fill = d.total === 0 ? "var(--line)" : inRange ? "var(--accent)" : "var(--ink-faint)";
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, barH).toFixed(1)}" rx="3" fill="${fill}"></rect>`;
    });

    const showEvery = days.length > 10 ? Math.ceil(days.length / 7) : 1;
    let labels = "";
    days.forEach((d, i) => {
      if (i % showEvery !== 0 && i !== days.length - 1) return;
      const x = i * barW + barW / 2;
      const day = Number(d.date.slice(8, 10));
      labels += `<text x="${x.toFixed(1)}" y="${h - 4}" font-size="9" text-anchor="middle" fill="var(--ink-faint)">${day}</text>`;
    });

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${band}${bars}${labels}</svg>`;
  }

  function computeEma(sortedEntries, alpha = 0.25) {
    let ema = null;
    return sortedEntries.map((e) => {
      ema = ema === null ? e.weightKg : alpha * e.weightKg + (1 - alpha) * ema;
      return { date: e.date, raw: e.weightKg, ema };
    });
  }

  function buildWeightChart(entries) {
    const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
    const withEma = computeEma(sorted);
    const h = 140, pad = 12;
    const scrollable = withEma.length > 20;
    const w = scrollable ? Math.max(300, withEma.length * 20) : 300;
    const values = withEma.flatMap((p) => [p.raw, p.ema]);
    const minV = Math.min(...values), maxV = Math.max(...values);
    const range = Math.max(maxV - minV, 0.5);
    const x = (i) => (withEma.length <= 1 ? w / 2 : (i / (withEma.length - 1)) * (w - pad * 2) + pad);
    const y = (v) => h - pad - ((v - minV) / range) * (h - pad * 2);

    const dots = withEma.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.raw).toFixed(1)}" r="2.5" fill="var(--ink-faint)"></circle>`).join("");
    const linePoints = withEma.map((p, i) => `${x(i).toFixed(1)},${y(p.ema).toFixed(1)}`).join(" ");
    const line = withEma.length > 1
      ? `<polyline points="${linePoints}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></polyline>`
      : "";

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${line}${dots}</svg>`;
  }

  function computeTopContributors(days) {
    const tally = new Map();
    days.forEach((d) => {
      const entries = (state.days[d.date] && state.days[d.date].entries) || [];
      entries.forEach((e) => {
        const key = e.name.trim().toLowerCase();
        if (!key) return;
        const existing = tally.get(key);
        if (existing) existing.total += e.calories;
        else tally.set(key, { name: e.name, total: e.calories });
      });
    });
    return Array.from(tally.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  }

  function hasWorkoutSession(dateKey) {
    return !!(state.workouts[dateKey] && state.workouts[dateKey].exercises.length > 0);
  }

  function computeWeeklySessions(days) {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      const count = chunk.filter((d) => hasWorkoutSession(d.date)).length;
      weeks.push({ label: chunk[0].date, count });
    }
    return weeks;
  }

  function buildSessionsChart(weeks) {
    const h = 100, padBottom = 16;
    const chartH = h - padBottom;
    const scrollable = weeks.length > 8;
    const w = scrollable ? weeks.length * 32 : Math.max(300, weeks.length * 40);
    const barW = w / weeks.length;
    const maxVal = Math.max(...weeks.map((wk) => wk.count), 1);

    let bars = "";
    weeks.forEach((wk, i) => {
      const barH = (wk.count / maxVal) * chartH;
      const x = i * barW + barW * 0.2;
      const bw = barW * 0.6;
      const y = chartH - barH;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, barH).toFixed(1)}" rx="3" fill="${wk.count > 0 ? "var(--accent)" : "var(--line)"}"></rect>`;
    });

    let labels = "";
    weeks.forEach((wk, i) => {
      const x = i * barW + barW / 2;
      labels += `<text x="${x.toFixed(1)}" y="${h - 4}" font-size="9" text-anchor="middle" fill="var(--ink-faint)">${formatShortDate(wk.label)}</text>`;
    });

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${bars}${labels}</svg>`;
  }

  function renderWorkoutAnalytics(days) {
    const totalSessions = days.filter((d) => hasWorkoutSession(d.date)).length;
    const weeks = computeWeeklySessions(days);
    const avgPerWeek = weeks.length ? totalSessions / weeks.length : 0;

    document.getElementById("sessionsStatValue").textContent = totalSessions;
    document.getElementById("sessionsAvgLine").textContent = `${avgPerWeek.toFixed(1)} por semana de media`;

    const chartEl = document.getElementById("sessionsChart");
    chartEl.innerHTML = weeks.length > 1 ? buildSessionsChart(weeks) : "";

    renderSessionGoalProgress();
  }

  function mondayOf(date) {
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - dow);
    return d;
  }

  function countSessionsBetween(start, end) {
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      if (hasWorkoutSession(key)) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function computeCurrentWeekProgress() {
    const today = new Date(`${todayKey(0)}T00:00:00`);
    const start = mondayOf(today);
    const goal = state.workoutGoal.weeklySessions;
    return { done: countSessionsBetween(start, today), goal };
  }

  function computeCurrentMonthProgress() {
    const today = new Date(`${todayKey(0)}T00:00:00`);
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const weeksInMonth = Math.ceil(daysInMonth / 7);
    const goal = state.workoutGoal.weeklySessions * weeksInMonth;
    return { done: countSessionsBetween(start, today), goal };
  }

  function renderSessionGoalProgress() {
    const week = computeCurrentWeekProgress();
    const month = computeCurrentMonthProgress();

    const weekEl = document.getElementById("weekGoalProgress");
    weekEl.textContent = `${week.done}/${week.goal}`;
    weekEl.classList.toggle("goal-met", week.done >= week.goal);

    const monthEl = document.getElementById("monthGoalProgress");
    monthEl.textContent = `${month.done}/${month.goal}`;
    monthEl.classList.toggle("goal-met", month.done >= month.goal);
  }

  const sessionGoalSliderEl = document.getElementById("sessionGoalSlider");
  const sessionGoalValueLabelEl = document.getElementById("sessionGoalValueLabel");

  sessionGoalSliderEl.addEventListener("input", () => {
    sessionGoalValueLabelEl.textContent = sessionGoalSliderEl.value;
  });

  sessionGoalSliderEl.addEventListener("change", () => {
    state.workoutGoal.weeklySessions = parseInt(sessionGoalSliderEl.value, 10);
    saveData(state);
    renderSessionGoalProgress();
  });

  function renderAnalytics() {
    sessionGoalSliderEl.value = state.workoutGoal.weeklySessions;
    sessionGoalValueLabelEl.textContent = state.workoutGoal.weeklySessions;

    const days = analyticsPeriodDays === "all" ? getAllDays() : getRecentDays(analyticsPeriodDays);
    const { min, max } = state.calorieTarget;
    document.getElementById("calorieChart").innerHTML = buildCalorieChart(days, min, max);

    const periodDates = new Set(days.map((d) => d.date));
    const weightEntries = state.weightLog.filter((w) => periodDates.has(w.date));
    const weightChartEl = document.getElementById("weightChart");
    const weightChartEmptyEl = document.getElementById("weightChartEmpty");
    if (weightEntries.length === 0) {
      weightChartEl.innerHTML = "";
      weightChartEmptyEl.hidden = false;
    } else {
      weightChartEmptyEl.hidden = true;
      weightChartEl.innerHTML = buildWeightChart(weightEntries);
    }

    const contributors = computeTopContributors(days);
    const listEl = document.getElementById("topContributorsList");
    const emptyEl = document.getElementById("topContributorsEmpty");
    listEl.innerHTML = "";
    if (contributors.length === 0) {
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
      contributors.forEach((c) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="row-main"><span class="row-name">${escapeHtml(c.name)}</span></div>
          <span class="row-amount">${Math.round(c.total)} kcal</span>
        `;
        listEl.appendChild(row);
      });
    }

    renderWorkoutAnalytics(days);
  }

  document.querySelectorAll("#analyticsPeriodToggle .segmented-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      analyticsPeriodDays = btn.dataset.days === "all" ? "all" : parseInt(btn.dataset.days, 10);
      document.querySelectorAll("#analyticsPeriodToggle .segmented-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderAnalytics();
    });
  });

  /* ---------- Adaptive target suggestion ---------- */

  function checkAdaptiveSuggestion() {
    const a = state.adaptive;
    const now = Date.now();
    if (a.lastCheckedAt && now - a.lastCheckedAt < ADAPTIVE_CHECK_INTERVAL_MS) return;
    a.lastCheckedAt = now;

    const profile = state.profile;
    if (!profile.goalType || profile.goalType === "maintain") { a.suggestion = null; return; }

    const sorted = [...state.weightLog].sort((x, y) => (x.date < y.date ? -1 : 1));
    if (sorted.length < 4) { a.suggestion = null; return; }

    const spanDays = (new Date(sorted[sorted.length - 1].date) - new Date(sorted[0].date)) / DAY_MS;
    if (spanDays < ADAPTIVE_MIN_SPAN_DAYS) { a.suggestion = null; return; }

    const withEma = computeEma(sorted);
    const latest = withEma[withEma.length - 1];
    const cutoff = new Date(latest.date);
    cutoff.setDate(cutoff.getDate() - ADAPTIVE_MIN_SPAN_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const refEntry = withEma.find((e) => e.date >= cutoffStr) || withEma[0];
    const daysBetween = (new Date(latest.date) - new Date(refEntry.date)) / DAY_MS;
    if (daysBetween < 7) { a.suggestion = null; return; }

    const actualRate = ((latest.ema - refEntry.ema) / daysBetween) * 7;
    const goalRateSigned = profile.goalType === "lose" ? -profile.rateKgPerWeek : profile.rateKgPerWeek;
    const diff = goalRateSigned - actualRate;

    if (Math.abs(diff) < ADAPTIVE_THRESHOLD_KG_PER_WEEK) { a.suggestion = null; return; }

    const deltaKcal = Math.round((diff * KCAL_PER_KG) / 7 / 25) * 25;
    if (deltaKcal === 0) { a.suggestion = null; return; }

    a.suggestion = {
      deltaKcal,
      actualRate: Math.round(actualRate * 100) / 100,
      createdAt: now,
      dismissed: false
    };
  }

  function renderAdaptiveBanner() {
    const s = state.adaptive.suggestion;
    const bannerEl = document.getElementById("adaptiveBanner");
    if (!s || s.dismissed) {
      bannerEl.hidden = true;
      return;
    }
    bannerEl.hidden = false;
    const pace = s.deltaKcal > 0 ? "más lento" : "más rápido";
    const action = s.deltaKcal > 0 ? "Aumentar" : "Reducir";
    const sign = s.actualRate >= 0 ? "+" : "";
    document.getElementById("adaptiveBannerText").textContent =
      `Tu ritmo real es de ${sign}${s.actualRate} kg/semana, ${pace} de lo esperado. ${action} tu rango en ~${Math.abs(s.deltaKcal)} kcal para ajustarlo.`;
  }

  document.getElementById("adaptiveAcceptBtn").addEventListener("click", () => {
    const s = state.adaptive.suggestion;
    if (!s) return;
    state.calorieTarget.mode = "manual";
    state.calorieTarget.min = Math.max(0, state.calorieTarget.min + s.deltaKcal);
    state.calorieTarget.max = state.calorieTarget.max + s.deltaKcal;
    state.adaptive.suggestion = null;
    saveData(state);
    render();
    showToast("Rango ajustado");
  });

  document.getElementById("adaptiveDismissBtn").addEventListener("click", () => {
    if (state.adaptive.suggestion) state.adaptive.suggestion.dismissed = true;
    saveData(state);
    renderAdaptiveBanner();
  });

  const views = {
    nutritionView: document.getElementById("nutritionView"),
    workoutView: document.getElementById("workoutView"),
    analyticsView: document.getElementById("analyticsView")
  };
  const tabButtons = document.querySelectorAll(".tab-btn");

  function switchView(viewId) {
    Object.entries(views).forEach(([id, el]) => { el.hidden = id !== viewId; });
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewId));
    if (viewId === "workoutView") renderWorkoutDay();
    if (viewId === "analyticsView") renderAnalytics();
  }

  tabButtons.forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));

  /* ---------- Init ---------- */

  render();

  if (!state.onboardingShown) {
    state.onboardingShown = true;
    saveData(state);
    setTimeout(() => openProfileModal(), 300);
  }
})();
