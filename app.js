(() => {
  "use strict";

  const STORAGE_KEY = "tique-data-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SCHEMA_VERSION = 9;
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
  const BACKUP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

  const ICON_X = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  const ICON_CHEVRON_DOWN = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

  /* ---------- Data layer ---------- */

  // Local-calendar-day helpers. Deliberately never use toISOString() for date
  // keys — it renders in UTC, which shifts the "day" by however many hours
  // the local timezone is offset, right around local midnight.
  function formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return formatDateKey(d);
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
    return { weeklySessions: 4, restSeconds: 90 };
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
      favorites: [],
      recipes: [],
      routines: [],
      timers: [],
      onboardingShown: false,
      lastExportedAt: null
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
    if (typeof data.workoutGoal.restSeconds !== "number") data.workoutGoal.restSeconds = 90;
    if (!data.favorites) data.favorites = [];
    if (!data.recipes) data.recipes = [];
    data.recipes.forEach((recipe) => {
      recipe.items.forEach((item) => {
        // Older recipes stored only the already-scaled totals with no grams
        // basis at all. Treat whatever was originally logged as the "100g"
        // reference point so proportional re-scaling has something sound to
        // scale from — it's the only anchor available for pre-existing data.
        if (typeof item.grams !== "number") {
          item.grams = 100;
          item.kcalPer100 = item.calories;
          item.proteinPer100 = item.protein || 0;
          item.fatPer100 = item.fat || 0;
          item.carbsPer100 = item.carbs || 0;
        }
      });
    });
    if (!data.routines) data.routines = [];
    if (!data.timers) data.timers = [];
    if (typeof data.onboardingShown !== "boolean") data.onboardingShown = false;
    if (typeof data.lastExportedAt !== "number") data.lastExportedAt = null;
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

  // In-memory clipboard for copying a full day's food log or workout session
  // to a different day. Deliberately not persisted — a session-scoped
  // clipboard is the expected mental model, same as OS copy/paste.
  let dayClipboard = null;

  // Rebases a timestamp's time-of-day onto a different calendar day, so a
  // pasted entry lands at the same hour it was originally logged at instead
  // of bunching everything at the moment of pasting.
  function rebaseTimeToDay(sourceTs, targetDayKey) {
    const src = new Date(sourceTs);
    const [y, m, d] = targetDayKey.split("-").map(Number);
    return new Date(y, m - 1, d, src.getHours(), src.getMinutes(), src.getSeconds()).getTime();
  }

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

  // Current estimated maintenance expenditure (TDEE), with no goal
  // surplus/deficit applied — the "calories out" side of the energy-balance
  // comparison against logged intake. We only ever have one live estimate
  // (recalculated as the profile/weight change), not a day-by-day history,
  // so this is plotted as a flat reference line rather than a fluctuating one.
  function estimateCurrentTdee() {
    const profile = state.profile;
    const latest = latestWeightEntry(state.weightLog);
    if (!profile || !latest) return null;
    const { sex, age, heightCm, activityLevel } = profile;
    if (!sex || !age || !heightCm || !activityLevel) return null;
    const latestWeightKg = latest.weightKg;
    const bmr = sex === "female"
      ? 10 * latestWeightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * latestWeightKg + 6.25 * heightCm - 5 * age + 5;
    return bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || ACTIVITY_MULTIPLIERS.sedentary);
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
  const copyDayBtnEl = document.getElementById("copyDayBtn");
  const pasteDayBtnEl = document.getElementById("pasteDayBtn");
  const pasteDayEmptyBtnEl = document.getElementById("pasteDayEmptyBtn");
  const foodBrowseSectionEl = document.getElementById("foodBrowseSection");
  const browseFavoritesRowEl = document.getElementById("browseFavoritesRow");
  const modalFavoritesRowEl = document.getElementById("modalFavoritesRow");
  const favoritesEditToggleEl = document.getElementById("favoritesEditToggle");
  const browseRecipesRowEl = document.getElementById("browseRecipesRow");
  const modalRecipesRowEl = document.getElementById("modalRecipesRow");
  const recipesEditToggleEl = document.getElementById("recipesEditToggle");
  const browseGoToRowEl = document.getElementById("browseGoToRow");
  const modalGoToRowEl = document.getElementById("modalGoToRow");
  const goToLabelEl = document.getElementById("goToLabel");
  const browseRecentRowEl = document.getElementById("browseRecentRow");
  const modalRecentRowEl = document.getElementById("modalRecentRow");
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
  const WEEKDAY_LETTERS_MON = ["L","M","X","J","V","S","D"]; // Monday-first, matches the week strip

  const weekStripEl = document.getElementById("weekStrip");

  // The Mon–Sun week containing `offset` (days from today), each day tagged
  // with its own offset-from-today so a tap can jump straight to it.
  function getWeekStripDays(offset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(today);
    selected.setDate(selected.getDate() + offset);
    const dow = selected.getDay(); // 0=Sun..6=Sat
    const mondayDelta = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(selected);
    monday.setDate(monday.getDate() + mondayDelta);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const dOffset = Math.round((d - today) / DAY_MS);
      days.push({ date: d, offset: dOffset, isFuture: dOffset > 0, isSelected: dOffset === offset });
    }
    return days;
  }

  function renderWeekStripInto(containerEl, offset, onSelect) {
    const days = getWeekStripDays(offset);
    containerEl.innerHTML = "";
    days.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "week-strip-day" + (d.isSelected ? " is-selected" : "") + (d.isFuture ? " is-future" : "");
      btn.disabled = d.isFuture;
      btn.innerHTML = `
        <span class="week-strip-letter">${WEEKDAY_LETTERS_MON[(d.date.getDay() + 6) % 7]}</span>
        <span class="week-strip-num">${d.date.getDate()}</span>
      `;
      btn.addEventListener("click", () => onSelect(d.offset));
      containerEl.appendChild(btn);
    });
  }

  function renderWeekStrip() {
    renderWeekStripInto(weekStripEl, dayOffset, (offset) => { dayOffset = offset; render(); });
  }

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

  // Which "dayKey-hour" groups the user has explicitly expanded, in-memory
  // only (not persisted) — groups default to collapsed on every fresh load
  // so the day view opens tidy, and only the ones tapped open stay open for
  // the rest of this session.
  const expandedHourGroups = new Set();
  // Which grouped (meal) entries are currently expanded to show ingredients.
  const expandedGroups = new Set();

  // "Seleccionar" mode: pick several already-logged entries to merge into one
  // meal. In-memory only, mirrors the Editar/Listo toggle pattern used
  // elsewhere (favorites, recipes, routines) rather than a gesture.
  let selectionMode = false;
  let selectedEntryIds = new Set();

  function buildSelectMark(entryId) {
    if (!selectionMode) return "";
    const checked = selectedEntryIds.has(entryId);
    return `<span class="row-select-check${checked ? " is-checked" : ""}" data-select-id="${entryId}"></span>`;
  }

  function buildEntryRow(entry) {
    if (entry.items) return buildGroupEntryRow(entry);

    const row = document.createElement("div");
    row.className = "row";
    row.dataset.id = entry.id;
    row.innerHTML = `
      ${buildSelectMark(entry.id)}
      <button type="button" class="row-main ${selectionMode ? "row-select" : "row-edit"}" data-id="${entry.id}">
        <span class="row-name">${escapeHtml(entry.name)}</span>
        <span class="row-qty">${entry.qtyLabel ? entry.qtyLabel + " · " : ""}${formatTime(entry.addedAt)}</span>
        ${(entry.protein || entry.fat || entry.carbs)
          ? `<span class="row-macros">${Math.round(entry.protein || 0)}P · ${Math.round(entry.fat || 0)}F · ${Math.round(entry.carbs || 0)}C</span>`
          : ""}
      </button>
      <span class="row-amount">${Math.round(entry.calories)} kcal</span>
      ${selectionMode ? "" : `<button class="row-del" data-id="${entry.id}" aria-label="Quitar">${ICON_X}</button>`}
    `;
    return row;
  }

  function buildGroupEntryRow(entry) {
    const row = document.createElement("div");
    row.className = "row row-group";
    row.dataset.id = entry.id;
    const isExpanded = !selectionMode && expandedGroups.has(entry.id);

    const mainLine = document.createElement("div");
    mainLine.className = "row-main-line";
    mainLine.innerHTML = `
      ${buildSelectMark(entry.id)}
      <button type="button" class="row-main ${selectionMode ? "row-select" : "row-group-toggle"}" data-id="${entry.id}">
        <span class="row-name">${escapeHtml(entry.name)} <span class="row-chevron-inline${isExpanded ? " is-expanded" : ""}">${ICON_CHEVRON_DOWN}</span></span>
        <span class="row-qty">${entry.qtyLabel ? entry.qtyLabel + " · " : ""}${formatTime(entry.addedAt)}</span>
        ${(entry.protein || entry.fat || entry.carbs)
          ? `<span class="row-macros">${Math.round(entry.protein || 0)}P · ${Math.round(entry.fat || 0)}F · ${Math.round(entry.carbs || 0)}C</span>`
          : ""}
      </button>
      <span class="row-amount">${Math.round(entry.calories)} kcal</span>
      ${selectionMode ? "" : `<button class="row-del" data-id="${entry.id}" aria-label="Quitar">${ICON_X}</button>`}
    `;
    row.appendChild(mainLine);

    if (isExpanded) {
      const sub = document.createElement("div");
      sub.className = "group-items";
      entry.items.forEach((item, i) => {
        const scaled = scaleFoodItem(item);
        const subRow = document.createElement("div");
        subRow.className = "sub-row";
        subRow.innerHTML = `
          <button type="button" class="sub-row-main" data-entry-id="${entry.id}" data-item-index="${i}">
            <span class="sub-row-name">${escapeHtml(item.name)}</span>
            <span class="sub-row-qty">${Math.round(item.grams)} g</span>
          </button>
          <span class="sub-row-amount">${Math.round(scaled.calories)} kcal</span>
          <button class="sub-row-del" data-entry-id="${entry.id}" data-item-index="${i}" aria-label="Quitar">${ICON_X}</button>
        `;
        sub.appendChild(subRow);
      });
      row.appendChild(sub);

      const actions = document.createElement("div");
      actions.className = "group-actions";
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "link-btn link-btn--muted group-rename-btn";
      renameBtn.dataset.id = entry.id;
      renameBtn.textContent = "Editar";
      actions.appendChild(renameBtn);

      const recipe = entry.sourceRecipeId ? state.recipes.find((r) => r.id === entry.sourceRecipeId) : null;
      if (recipe && recipeItemsDiffer(recipe.items, entry.items)) {
        const banner = document.createElement("button");
        banner.type = "button";
        banner.className = "link-btn group-update-banner";
        banner.dataset.id = entry.id;
        banner.textContent = "Actualizar receta con estos cambios →";
        actions.appendChild(banner);
      }
      row.appendChild(actions);
    }

    return row;
  }

  function groupEntriesByHour(entries) {
    const groups = new Map();
    entries.forEach((entry) => {
      const hour = new Date(entry.addedAt).getHours();
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(entry);
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, groupEntries]) => ({
        hour,
        entries: groupEntries,
        total: groupEntries.reduce((sum, e) => sum + e.calories, 0)
      }));
  }

  function renderEntryTimeline(entries) {
    entryListEl.innerHTML = "";
    const dayKey = currentDayKey();
    const groups = groupEntriesByHour(entries);
    groups.forEach(({ hour, entries: groupEntries, total }) => {
      const groupKey = `${dayKey}-${hour}`;
      const collapsed = !expandedHourGroups.has(groupKey);

      const wrap = document.createElement("div");
      wrap.className = "hour-group";

      const header = document.createElement("button");
      header.type = "button";
      header.className = "hour-header";
      header.innerHTML = `
        <span class="hour-time">${String(hour).padStart(2, "0")}:00</span>
        <span class="hour-summary">${groupEntries.length} · ${Math.round(total)} kcal</span>
        <span class="hour-chevron${collapsed ? " is-collapsed" : ""}">${ICON_CHEVRON_DOWN}</span>
      `;
      header.addEventListener("click", () => {
        if (expandedHourGroups.has(groupKey)) expandedHourGroups.delete(groupKey);
        else expandedHourGroups.add(groupKey);
        render();
      });
      wrap.appendChild(header);

      if (!collapsed) {
        const list = document.createElement("div");
        list.className = "hour-entries";
        groupEntries.forEach((entry) => list.appendChild(buildEntryRow(entry)));
        wrap.appendChild(list);
      }

      entryListEl.appendChild(wrap);
    });
  }

  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Animates the big daily total counting up/down when it changes for the
  // *same* day (a log/delete happened), but snaps instantly when the value
  // changes because the user navigated to a different day — a count-up
  // during day navigation would read as sluggish rather than satisfying.
  let lastTotalsDayKey = null;
  let lastTotalsValue = null;
  function setTotalKcalText(dayKey, total) {
    const target = Math.round(total);
    const sameDay = dayKey === lastTotalsDayKey;
    const start = sameDay && lastTotalsValue !== null ? lastTotalsValue : target;
    lastTotalsDayKey = dayKey;
    lastTotalsValue = target;

    if (start === target || prefersReducedMotion) {
      totalKcalEl.textContent = `${target} kcal`;
      return;
    }
    const duration = 450;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      totalKcalEl.textContent = `${Math.round(start + (target - start) * eased)} kcal`;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function render() {
    const entries = currentDayEntries();
    const label = formatDateLabel(dayOffset);

    dateLabelEl.textContent = label.short;
    fullDateLabelEl.textContent = `${label.weekday}, ${label.day} de ${label.month}`.replace(/^./, c => c.toUpperCase());
    renderWeekStrip();
    renderBackupBanner();

    const hasNutritionClipboard = !!(dayClipboard && dayClipboard.type === "nutrition");
    if (entries.length === 0) {
      entryListEl.innerHTML = "";
      emptyStateEl.style.display = "block";
      pasteDayEmptyBtnEl.hidden = !hasNutritionClipboard;
      copyYesterdayBtnEl.hidden = hasNutritionClipboard || previousDayEntries().length === 0;
      copyDayBtnEl.hidden = true;
      pasteDayBtnEl.hidden = true;
      selectEntriesToggleBtnEl.hidden = true;
    } else {
      emptyStateEl.style.display = "none";
      renderEntryTimeline(entries);
      copyDayBtnEl.hidden = false;
      pasteDayBtnEl.hidden = !hasNutritionClipboard;
      pasteDayEmptyBtnEl.hidden = true;
      copyYesterdayBtnEl.hidden = true;
      selectEntriesToggleBtnEl.hidden = false;
    }

    const total = entries.reduce((sum, e) => sum + e.calories, 0);
    setTotalKcalText(currentDayKey(), total);

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

  // A "food item" (recipe ingredient, or an ingredient inside a merged meal)
  // stores its macros per 100g plus a grams amount, so it can be rescaled
  // later without losing the original per-100g basis.
  function scaleFoodItem(item) {
    const factor = item.grams / 100;
    return {
      calories: item.kcalPer100 * factor,
      protein: (item.proteinPer100 || 0) * factor,
      fat: (item.fatPer100 || 0) * factor,
      carbs: (item.carbsPer100 || 0) * factor
    };
  }

  function sumFoodItems(items) {
    return items.reduce((acc, it) => {
      const s = scaleFoodItem(it);
      acc.calories += s.calories;
      acc.protein += s.protein;
      acc.fat += s.fat;
      acc.carbs += s.carbs;
      return acc;
    }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
  }

  // Recomputes a grouped entry's displayed totals from its current items —
  // called after any per-ingredient grams edit or deletion.
  function recomputeGroupEntry(entry) {
    const totals = sumFoodItems(entry.items);
    entry.calories = totals.calories;
    entry.protein = totals.protein;
    entry.fat = totals.fat;
    entry.carbs = totals.carbs;
    entry.qtyLabel = `${entry.items.length} ingr.`;
  }

  // Positional comparison — good enough to decide whether a logged group's
  // items have drifted from the recipe it was started from.
  function recipeItemsDiffer(a, b) {
    if (a.length !== b.length) return true;
    return a.some((item, i) => {
      const other = b[i];
      return !other || item.name !== other.name || item.grams !== other.grams ||
        item.kcalPer100 !== other.kcalPer100 || item.proteinPer100 !== other.proteinPer100 ||
        item.fatPer100 !== other.fatPer100 || item.carbsPer100 !== other.carbsPer100;
    });
  }

  entryListEl.addEventListener("click", (e) => {
    const bannerBtn = e.target.closest(".group-update-banner");
    if (bannerBtn) {
      commitGroupToRecipe(bannerBtn.dataset.id);
      return;
    }

    const renameBtn = e.target.closest(".group-rename-btn");
    if (renameBtn) {
      openRenameGroup(renameBtn.dataset.id);
      return;
    }

    const subDelBtn = e.target.closest(".sub-row-del");
    if (subDelBtn) {
      const entry = currentDayEntries().find((en) => en.id === subDelBtn.dataset.entryId);
      if (entry) {
        entry.items.splice(parseInt(subDelBtn.dataset.itemIndex, 10), 1);
        if (entry.items.length === 0) {
          const entries = currentDayEntries();
          entries.splice(entries.indexOf(entry), 1);
        } else {
          recomputeGroupEntry(entry);
        }
        saveData(state);
        render();
      }
      return;
    }

    const subMainBtn = e.target.closest(".sub-row-main");
    if (subMainBtn) {
      openIngredientGramsEditor({ type: "logged", entryId: subMainBtn.dataset.entryId, index: parseInt(subMainBtn.dataset.itemIndex, 10) });
      return;
    }

    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      const id = delBtn.dataset.id;
      const entries = currentDayEntries();
      const idx = entries.findIndex((en) => en.id === id);
      if (idx >= 0) {
        entries.splice(idx, 1);
        saveData(state);
        render();
      }
      return;
    }

    if (selectionMode) {
      const rowEl = e.target.closest(".row");
      if (rowEl && rowEl.dataset.id) toggleEntrySelection(rowEl.dataset.id);
      return;
    }

    const groupToggle = e.target.closest(".row-group-toggle");
    if (groupToggle) {
      const id = groupToggle.dataset.id;
      if (expandedGroups.has(id)) expandedGroups.delete(id);
      else expandedGroups.add(id);
      render();
      return;
    }

    const editBtn = e.target.closest(".row-edit");
    if (editBtn) openEntryForEdit(editBtn.dataset.id);
  });

  /* ---------- Selection mode: merge logged entries into a meal ---------- */

  const selectEntriesToggleBtnEl = document.getElementById("selectEntriesToggleBtn");
  const groupSelectedBtnEl = document.getElementById("groupSelectedBtn");
  const groupMealModal = document.getElementById("groupMealModal");
  const groupMealNameInputEl = document.getElementById("groupMealNameInput");
  const groupMealSaveRecipeInputEl = document.getElementById("groupMealSaveRecipeInput");

  function updateGroupSelectedBtn() {
    const n = selectedEntryIds.size;
    groupSelectedBtnEl.textContent = `Agrupar (${n})`;
    groupSelectedBtnEl.disabled = n < 2;
  }

  function toggleEntrySelection(id) {
    if (selectedEntryIds.has(id)) selectedEntryIds.delete(id);
    else selectedEntryIds.add(id);
    updateGroupSelectedBtn();
    render();
  }

  function setSelectionMode(on) {
    selectionMode = on;
    selectedEntryIds = new Set();
    selectEntriesToggleBtnEl.textContent = on ? "Cancelar" : "Seleccionar";
    document.getElementById("scanBtn").hidden = on;
    document.getElementById("manualBtn").hidden = on;
    groupSelectedBtnEl.hidden = !on;
    updateGroupSelectedBtn();
    render();
  }

  selectEntriesToggleBtnEl.addEventListener("click", () => setSelectionMode(!selectionMode));

  groupSelectedBtnEl.addEventListener("click", () => {
    if (selectedEntryIds.size < 2) return;
    groupMealNameInputEl.value = "";
    groupMealSaveRecipeInputEl.checked = true;
    openModal(groupMealModal);
    setTimeout(() => groupMealNameInputEl.focus(), 50);
  });

  document.getElementById("closeGroupMealModal").addEventListener("click", () => closeModal(groupMealModal));

  // Converts an already-logged (flat) entry into a re-scalable food item,
  // using the same "treat the logged amount as the 100g reference" fallback
  // convention applied everywhere else an item lacks an explicit basis.
  function entryToFoodItem(entry) {
    return {
      name: entry.name,
      grams: 100,
      kcalPer100: entry.calories,
      proteinPer100: entry.protein || 0,
      fatPer100: entry.fat || 0,
      carbsPer100: entry.carbs || 0
    };
  }

  document.getElementById("confirmGroupMealBtn").addEventListener("click", () => {
    const name = groupMealNameInputEl.value.trim();
    if (!name) {
      showToast("Indica el nombre de la comida");
      return;
    }
    const entries = currentDayEntries();
    const selected = entries.filter((e) => selectedEntryIds.has(e.id));
    if (selected.length < 2) return;

    // Existing grouped entries contribute their own items rather than being
    // re-wrapped as a single opaque ingredient, so grouping never nests.
    const items = selected.flatMap((e) => (e.items ? e.items.map((it) => ({ ...it })) : [entryToFoodItem(e)]));
    const earliestAddedAt = Math.min(...selected.map((e) => e.addedAt));

    selectedEntryIds.forEach((id) => {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx >= 0) entries.splice(idx, 1);
    });

    const totals = sumFoodItems(items);
    const grouped = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      calories: totals.calories,
      qtyLabel: `${items.length} ingr.`,
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      items,
      addedAt: earliestAddedAt
    };

    if (groupMealSaveRecipeInputEl.checked) {
      const recipe = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        items: items.map((it) => ({ ...it })),
        createdAt: Date.now()
      };
      state.recipes.push(recipe);
      grouped.sourceRecipeId = recipe.id;
    }

    entries.push(grouped);
    saveData(state);
    closeModal(groupMealModal);
    setSelectionMode(false);
    showToast(groupMealSaveRecipeInputEl.checked ? "Comida agrupada y guardada como receta" : "Comida agrupada");
  });

  // Pushes a logged group's current (possibly grams-edited) items back onto
  // the saved recipe it came from — an explicit, opt-in action so a one-off
  // "just today" tweak never silently changes the template.
  function commitGroupToRecipe(entryId) {
    const entry = currentDayEntries().find((e) => e.id === entryId);
    if (!entry || !entry.sourceRecipeId) return;
    const recipe = state.recipes.find((r) => r.id === entry.sourceRecipeId);
    if (!recipe) return;
    recipe.items = entry.items.map((it) => ({ ...it }));
    saveData(state);
    render();
    showToast(`Receta "${recipe.name}" actualizada`);
  }

  // Renaming only ever touches the logged entry, never the recipe it came
  // from — the recipe's own name is a separate, deliberate decision (via
  // "Actualizar receta"), same split as grams edits.
  const renameGroupModal = document.getElementById("renameGroupModal");
  const renameGroupInputEl = document.getElementById("renameGroupInput");
  const renameGroupTimeInputEl = document.getElementById("renameGroupTimeInput");
  let renameGroupEntryId = null;

  function openRenameGroup(entryId) {
    const entry = currentDayEntries().find((e) => e.id === entryId);
    if (!entry) return;
    renameGroupEntryId = entryId;
    renameGroupInputEl.value = entry.name;
    const entryDate = new Date(entry.addedAt);
    renameGroupTimeInputEl.value = `${String(entryDate.getHours()).padStart(2, "0")}:${String(entryDate.getMinutes()).padStart(2, "0")}`;
    openModal(renameGroupModal);
    setTimeout(() => renameGroupInputEl.focus(), 50);
  }

  document.getElementById("closeRenameGroupModal").addEventListener("click", () => closeModal(renameGroupModal));

  document.getElementById("saveRenameGroupBtn").addEventListener("click", () => {
    const name = renameGroupInputEl.value.trim();
    if (!name) {
      showToast("Indica un nombre");
      return;
    }
    const entry = currentDayEntries().find((e) => e.id === renameGroupEntryId);
    if (entry) {
      entry.name = name;
      if (renameGroupTimeInputEl.value) {
        const [h, m] = renameGroupTimeInputEl.value.split(":").map(Number);
        const d = new Date(entry.addedAt);
        d.setHours(h, m, 0, 0);
        entry.addedAt = d.getTime();
      }
      saveData(state);
      render();
    }
    closeModal(renameGroupModal);
  });

  /* ---------- Quick add & copy from yesterday ---------- */

  // Tallies logged entries by name (case-insensitive), keeping the most
  // recently-logged values (calories/macros/qtyLabel) for each — shared by
  // computeFrequentItems (all entries) and computeHourlyGoTos (time-filtered).
  function tallyEntriesMatching(matches) {
    const tally = new Map();
    Object.values(state.days).forEach((day) => {
      day.entries.forEach((e) => {
        if (!matches(e)) return;
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
    return tally;
  }

  function rankTally(tally, limit) {
    return Array.from(tally.values())
      .sort((a, b) => b.count - a.count || b.lastAddedAt - a.lastAddedAt)
      .slice(0, limit);
  }

  function computeFrequentItems(limit = 8) {
    return rankTally(tallyEntriesMatching(() => true), limit);
  }

  // Foods you specifically tend to log around the current time of day (e.g.
  // your usual 8am breakfast), distinct from computeFrequentItems' overall
  // "most logged" ranking which ignores time of day entirely. Matches within
  // a tolerance window rather than the exact clock hour, so a breakfast
  // logged at 7:58 one day and 8:02 the next still count as the same habit.
  function computeHourlyGoTos(limit = 6, windowMinutes = 45) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const tally = tallyEntriesMatching((e) => {
      if (!e.addedAt) return false;
      const d = new Date(e.addedAt);
      const entryMinutes = d.getHours() * 60 + d.getMinutes();
      const diff = Math.abs(entryMinutes - nowMinutes);
      return Math.min(diff, 1440 - diff) <= windowMinutes;
    });
    return rankTally(tally, limit);
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

  function copyEntryToDay(entry, targetDayKey) {
    if (!state.days[targetDayKey]) state.days[targetDayKey] = { entries: [] };
    const copy = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: entry.name,
      calories: entry.calories,
      qtyLabel: entry.qtyLabel || "",
      protein: entry.protein || 0,
      fat: entry.fat || 0,
      carbs: entry.carbs || 0,
      addedAt: rebaseTimeToDay(entry.addedAt, targetDayKey)
    };
    if (entry.recipeIngredients) copy.recipeIngredients = entry.recipeIngredients.slice();
    if (entry.items) copy.items = entry.items.map((it) => ({ ...it }));
    if (entry.sourceRecipeId) copy.sourceRecipeId = entry.sourceRecipeId;
    state.days[targetDayKey].entries.push(copy);
  }

  // Where a food selected/logged from the add-food modal should go: either
  // straight into today's log ("log"), or into the recipe currently being
  // built ("recipe-ingredient") — see the recipe builder section below.
  let foodBrowseContext = "log";

  function commitFoodItem(item) {
    if (foodBrowseContext === "recipe-ingredient") {
      const hasBasis = typeof item.grams === "number" && typeof item.kcalPer100 === "number";
      draftRecipeItems.push({
        name: item.name,
        // Fall back to treating the item's already-scaled totals as the
        // "100g" reference when no explicit basis is available (favorites
        // committed before this existed, etc.) — same convention used for
        // migrating old saved recipes.
        grams: hasBasis ? item.grams : 100,
        kcalPer100: hasBasis ? item.kcalPer100 : item.calories,
        proteinPer100: hasBasis ? item.proteinPer100 : (item.protein || 0),
        fatPer100: hasBasis ? item.fatPer100 : (item.fat || 0),
        carbsPer100: hasBasis ? item.carbsPer100 : (item.carbs || 0)
      });
      closeModal(entryModal);
      renderRecipeIngredients();
      openModal(recipeModal);
      showToast("Ingrediente añadido");
      return;
    }
    addEntryToCurrentDay(item);
    saveData(state);
    render();
    closeModal(entryModal);
    showToast("Añadido");
  }

  // Renders the "browse" rows shown in the add-food modal before you type
  // anything: favorites, saved recipes, and recently/frequently logged foods.
  function renderFoodBrowseSection() {
    renderModalFavorites();
    renderModalRecipes();
    renderModalGoTos();
    renderModalRecent();
  }

  let favoritesEditMode = false;
  let recipesEditMode = false;

  favoritesEditToggleEl.addEventListener("click", () => {
    favoritesEditMode = !favoritesEditMode;
    favoritesEditToggleEl.textContent = favoritesEditMode ? "Listo" : "Editar";
    renderModalFavorites();
  });

  recipesEditToggleEl.addEventListener("click", () => {
    recipesEditMode = !recipesEditMode;
    recipesEditToggleEl.textContent = recipesEditMode ? "Listo" : "Editar";
    renderModalRecipes();
  });

  function renderModalFavorites() {
    modalFavoritesRowEl.innerHTML = "";
    if (state.favorites.length === 0) {
      browseFavoritesRowEl.hidden = true;
      favoritesEditMode = false;
      favoritesEditToggleEl.textContent = "Editar";
      return;
    }
    browseFavoritesRowEl.hidden = false;
    state.favorites.forEach((fav) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(fav.name)}</span>
        <span class="quick-chip-kcal">${Math.round(fav.calories)} kcal</span>
        ${favoritesEditMode ? `<span class="quick-chip-del" aria-label="Quitar">${ICON_X}</span>` : ""}
      `;
      chip.addEventListener("click", () => {
        if (favoritesEditMode) {
          state.favorites = state.favorites.filter((f) => f.id !== fav.id);
          saveData(state);
          renderModalFavorites();
          return;
        }
        if (foodBrowseContext === "recipe-ingredient") {
          openFoodItemForRecipeAdjust(fav);
          return;
        }
        commitFoodItem(fav);
      });
      modalFavoritesRowEl.appendChild(chip);
    });
  }

  function logRecipe(recipe) {
    const entries = currentDayEntries();
    // Deep-clone the recipe's items into the logged entry — this is a
    // snapshot, not a live reference, so adjusting grams "just for today"
    // (or the recipe changing later) never silently affects the other side.
    const items = recipe.items.map((it) => ({ ...it }));
    const totals = sumFoodItems(items);
    entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: recipe.name,
      calories: totals.calories,
      qtyLabel: `${items.length} ingr.`,
      protein: totals.protein,
      fat: totals.fat,
      carbs: totals.carbs,
      items,
      sourceRecipeId: recipe.id,
      addedAt: Date.now()
    });
  }

  function renderModalRecipes() {
    modalRecipesRowEl.innerHTML = "";
    // Recipes can't contain other recipes as ingredients, so this whole row
    // is hidden while adding an ingredient to a recipe being built.
    if (foodBrowseContext === "recipe-ingredient") {
      browseRecipesRowEl.hidden = true;
      return;
    }
    browseRecipesRowEl.hidden = false;
    recipesEditToggleEl.hidden = state.recipes.length === 0;
    if (state.recipes.length === 0) {
      recipesEditMode = false;
      recipesEditToggleEl.textContent = "Editar";
      return;
    }
    state.recipes.forEach((recipe) => {
      const totalKcal = sumFoodItems(recipe.items).calories;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(recipe.name)}</span>
        <span class="quick-chip-kcal">${Math.round(totalKcal)} kcal</span>
        ${recipesEditMode ? `<span class="quick-chip-del" aria-label="Quitar">${ICON_X}</span>` : ""}
      `;
      chip.addEventListener("click", () => {
        if (recipesEditMode) {
          state.recipes = state.recipes.filter((r) => r.id !== recipe.id);
          saveData(state);
          renderModalRecipes();
          return;
        }
        logRecipe(recipe);
        saveData(state);
        render();
        closeModal(entryModal);
        showToast("Receta añadida");
      });
      modalRecipesRowEl.appendChild(chip);
    });
  }

  function renderModalGoTos() {
    const items = computeHourlyGoTos();
    modalGoToRowEl.innerHTML = "";
    if (items.length === 0) {
      browseGoToRowEl.hidden = true;
      return;
    }
    browseGoToRowEl.hidden = false;
    const hour = new Date().getHours();
    goToLabelEl.textContent = `Habituales a las ${String(hour).padStart(2, "0")}:00`;
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(item.name)}</span>
        <span class="quick-chip-kcal">${Math.round(item.calories)} kcal</span>
      `;
      chip.addEventListener("click", () => {
        if (foodBrowseContext === "recipe-ingredient") {
          openFoodItemForRecipeAdjust(item);
          return;
        }
        commitFoodItem(item);
      });
      modalGoToRowEl.appendChild(chip);
    });
  }

  function renderModalRecent() {
    const items = computeFrequentItems();
    modalRecentRowEl.innerHTML = "";
    if (items.length === 0) {
      browseRecentRowEl.hidden = true;
      return;
    }
    browseRecentRowEl.hidden = false;
    items.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(item.name)}</span>
        <span class="quick-chip-kcal">${Math.round(item.calories)} kcal</span>
      `;
      chip.addEventListener("click", () => {
        if (foodBrowseContext === "recipe-ingredient") {
          openFoodItemForRecipeAdjust(item);
          return;
        }
        commitFoodItem(item);
      });
      modalRecentRowEl.appendChild(chip);
    });
  }

  copyYesterdayBtnEl.addEventListener("click", () => {
    const source = previousDayEntries();
    if (source.length === 0) return;
    const targetKey = currentDayKey();
    source.forEach((e) => copyEntryToDay(e, targetKey));
    saveData(state);
    render();
    showToast("Copiado de ayer");
  });

  copyDayBtnEl.addEventListener("click", () => {
    const entries = currentDayEntries();
    if (entries.length === 0) return;
    dayClipboard = {
      type: "nutrition",
      entries: entries.map((e) => ({
        ...e,
        ...(e.items ? { items: e.items.map((it) => ({ ...it })) } : {})
      }))
    };
    showToast("Día copiado. Ve a otro día y pulsa Pegar.");
    render();
  });

  function pasteNutritionDay() {
    if (!dayClipboard || dayClipboard.type !== "nutrition") return;
    const targetKey = currentDayKey();
    dayClipboard.entries.forEach((e) => copyEntryToDay(e, targetKey));
    saveData(state);
    render();
    showToast("Pegado");
  }
  pasteDayBtnEl.addEventListener("click", pasteNutritionDay);
  pasteDayEmptyBtnEl.addEventListener("click", pasteNutritionDay);

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

  /* ---------- Recipe builder ---------- */

  const recipeModal = document.getElementById("recipeModal");
  const recipeNameInputEl = document.getElementById("recipeNameInput");
  const recipeIngredientsListEl = document.getElementById("recipeIngredientsList");
  const recipeIngredientsEmptyEl = document.getElementById("recipeIngredientsEmpty");

  let draftRecipeItems = [];

  function renderRecipeIngredients() {
    recipeIngredientsListEl.innerHTML = "";
    recipeIngredientsEmptyEl.hidden = draftRecipeItems.length > 0;
    draftRecipeItems.forEach((item, i) => {
      const scaled = scaleFoodItem(item);
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <button type="button" class="row-main row-edit" data-index="${i}">
          <span class="row-name">${escapeHtml(item.name)}</span>
          <span class="row-qty">${Math.round(item.grams)} g</span>
          <span class="row-macros">${Math.round(scaled.protein)}P · ${Math.round(scaled.fat)}F · ${Math.round(scaled.carbs)}C</span>
        </button>
        <span class="row-amount">${Math.round(scaled.calories)} kcal</span>
        <button class="row-del" type="button" data-index="${i}" aria-label="Quitar">${ICON_X}</button>
      `;
      recipeIngredientsListEl.appendChild(row);
    });
  }

  recipeIngredientsListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      draftRecipeItems.splice(parseInt(delBtn.dataset.index, 10), 1);
      renderRecipeIngredients();
      return;
    }
    const editBtn = e.target.closest(".row-edit");
    if (editBtn) openIngredientGramsEditor({ type: "draft", index: parseInt(editBtn.dataset.index, 10) });
  });

  /* ---------- Ingredient grams editor (shared: recipe draft + logged meal groups) ---------- */

  const ingredientGramsModal = document.getElementById("ingredientGramsModal");
  const ingredientGramsTitleEl = document.getElementById("ingredientGramsTitle");
  const ingredientGramsInputEl = document.getElementById("ingredientGramsInput");
  const ingredientGramsPreviewEl = document.getElementById("ingredientGramsPreview");

  let ingredientEditContext = null; // { type: "draft", index } | { type: "logged", entryId, index }

  function updateIngredientGramsPreview() {
    const grams = parseFloat(ingredientGramsInputEl.value);
    if (!ingredientEditContext || isNaN(grams) || grams <= 0) {
      ingredientGramsPreviewEl.hidden = true;
      return;
    }
    const scaled = scaleFoodItem({ ...ingredientEditContext.item, grams });
    ingredientGramsPreviewEl.hidden = false;
    ingredientGramsPreviewEl.textContent = `${Math.round(scaled.calories)} kcal · ${Math.round(scaled.protein)}P · ${Math.round(scaled.fat)}F · ${Math.round(scaled.carbs)}C`;
  }
  ingredientGramsInputEl.addEventListener("input", updateIngredientGramsPreview);

  function openIngredientGramsEditor(context) {
    let item;
    if (context.type === "draft") {
      item = draftRecipeItems[context.index];
    } else {
      const entry = currentDayEntries().find((e) => e.id === context.entryId);
      item = entry && entry.items[context.index];
    }
    if (!item) return;
    ingredientEditContext = { ...context, item };
    ingredientGramsTitleEl.textContent = item.name;
    ingredientGramsInputEl.value = Math.round(item.grams);
    updateIngredientGramsPreview();
    openModal(ingredientGramsModal);
    setTimeout(() => ingredientGramsInputEl.focus(), 50);
  }

  document.getElementById("closeIngredientGramsModal").addEventListener("click", () => closeModal(ingredientGramsModal));

  document.getElementById("saveIngredientGramsBtn").addEventListener("click", () => {
    const grams = parseFloat(ingredientGramsInputEl.value);
    if (!(grams > 0)) {
      showToast("Indica una cantidad válida");
      return;
    }
    if (ingredientEditContext.type === "draft") {
      draftRecipeItems[ingredientEditContext.index].grams = grams;
      renderRecipeIngredients();
    } else {
      const entry = currentDayEntries().find((e) => e.id === ingredientEditContext.entryId);
      if (entry) {
        entry.items[ingredientEditContext.index].grams = grams;
        recomputeGroupEntry(entry);
        saveData(state);
        render();
      }
    }
    closeModal(ingredientGramsModal);
  });

  document.getElementById("addRecipeBtn").addEventListener("click", () => {
    draftRecipeItems = [];
    recipeNameInputEl.value = "";
    renderRecipeIngredients();
    closeModal(entryModal);
    openModal(recipeModal);
    setTimeout(() => recipeNameInputEl.focus(), 50);
  });
  document.getElementById("closeRecipeModal").addEventListener("click", () => {
    foodBrowseContext = "log";
    closeModal(recipeModal);
  });

  document.getElementById("addRecipeIngredientBtn").addEventListener("click", () => {
    closeModal(recipeModal);
    openAddFoodModal("recipe-ingredient");
  });

  document.getElementById("saveRecipeBtn").addEventListener("click", () => {
    const name = recipeNameInputEl.value.trim();
    if (!name) {
      showToast("Indica el nombre de la receta");
      return;
    }
    if (draftRecipeItems.length === 0) {
      showToast("Añade al menos un ingrediente");
      return;
    }
    state.recipes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      items: draftRecipeItems,
      createdAt: Date.now()
    });
    saveData(state);
    renderModalRecipes();
    foodBrowseContext = "log";
    closeModal(recipeModal);
    showToast("Receta guardada");
  });

  /* ---------- Data export / import ---------- */

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plate-backup-${todayKey(0)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.lastExportedAt = Date.now();
    saveData(state);
    renderBackupBanner();
    showToast("Datos exportados");
  }

  document.getElementById("exportDataBtn").addEventListener("click", exportData);

  const importDataInputEl = document.getElementById("importDataInput");
  document.getElementById("importDataBtn").addEventListener("click", () => importDataInputEl.click());

  importDataInputEl.addEventListener("change", () => {
    const file = importDataInputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        showToast("Archivo no válido");
        importDataInputEl.value = "";
        return;
      }
      if (!confirm("Esto reemplazará todos tus datos actuales con los del archivo. ¿Continuar?")) {
        importDataInputEl.value = "";
        return;
      }
      state = migrateData(parsed);
      saveData(state);
      importDataInputEl.value = "";
      closeModal(profileModal);
      render();
      showToast("Datos importados");
    };
    reader.readAsText(file);
  });

  // iOS treats deleting a home-screen web app's icon as uninstalling it —
  // its whole storage container (this data included) gets wiped, with no
  // warning. The export file is the only thing that survives that, so nag
  // periodically until the user actually has one.
  function hasBackupWorthyData() {
    return state.weightLog.length > 0 ||
      Object.values(state.days).some((d) => d.entries.length > 0) ||
      Object.keys(state.workouts).length > 0;
  }

  let backupBannerDismissedThisSession = false;

  function renderBackupBanner() {
    const bannerEl = document.getElementById("backupBanner");
    const overdue = Date.now() - (state.lastExportedAt || 0) > BACKUP_REMINDER_INTERVAL_MS;
    if (backupBannerDismissedThisSession || !overdue || !hasBackupWorthyData()) {
      bannerEl.hidden = true;
      return;
    }
    bannerEl.hidden = false;
  }

  document.getElementById("backupExportBtn").addEventListener("click", exportData);
  document.getElementById("backupDismissBtn").addEventListener("click", () => {
    backupBannerDismissedThisSession = true;
    renderBackupBanner();
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

  // A GitHub-style contribution calendar of which days have a weigh-in,
  // giving an at-a-glance read on consistency that a plain list can't.
  function buildWeighInHeatmap(weightLog, weeks = 20) {
    const dateSet = new Set(weightLog.map((w) => w.date));
    const today = parseDateKey(todayKey(0));
    const dow = today.getDay();
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (6 - daysSinceMonday));
    const start = new Date(endOfWeek);
    start.setDate(start.getDate() - weeks * 7 + 1);

    const cell = 11, gap = 3;
    const colW = cell + gap, rowH = cell + gap;
    const w = weeks * colW + gap;
    const h = 7 * rowH + gap;

    let rects = "";
    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < 7; row++) {
        const d = new Date(start);
        d.setDate(d.getDate() + col * 7 + row);
        if (d > today) continue;
        const key = formatDateKey(d);
        const tracked = dateSet.has(key);
        const x = col * colW + gap;
        const y = row * rowH + gap;
        const fill = tracked ? "var(--accent)" : "var(--surface-alt)";
        rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${fill}"><title>${key}${tracked ? " · registrado" : ""}</title></rect>`;
      }
    }
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block">${rects}</svg>`;
  }

  function renderWeighInHeatmap() {
    const heatmapEl = document.getElementById("weighInHeatmap");
    const labelEl = document.getElementById("weighInHeatmapLabel");
    if (state.weightLog.length === 0) {
      heatmapEl.innerHTML = "";
      labelEl.hidden = true;
      return;
    }
    labelEl.hidden = false;
    heatmapEl.innerHTML = buildWeighInHeatmap(state.weightLog);
  }

  function renderWeightList() {
    renderWeighInHeatmap();
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
          <button class="row-del" data-id="${w.id}" aria-label="Quitar">${ICON_X}</button>
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
  const entryTimeRowEl = document.getElementById("entryTimeRow");
  const entryTimeEl = document.getElementById("entryTime");
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
  const foodSearchSectionEl = document.getElementById("foodSearchSection");
  const searchSelectBarEl = document.getElementById("searchSelectBar");
  const searchSelectToggleBtnEl = document.getElementById("searchSelectToggleBtn");
  const searchLogSelectedBtnEl = document.getElementById("searchLogSelectedBtn");
  const entryPer100RowEl = document.getElementById("entryPer100Row");
  const entryKcalTotalLabelEl = document.getElementById("entryKcalTotalLabel");
  const entryMacrosLabelEl = document.getElementById("entryMacrosLabel");
  const entrySubmitBtnEl = document.getElementById("entrySubmitBtn");
  const entryLivePreviewEl = document.getElementById("entryLivePreview");
  const entryFavoriteBtnEl = document.getElementById("entryFavoriteBtn");

  let editingEntryId = null;

  function updateLivePreview() {
    if (entryKcalTotalEl.value.trim() !== "") {
      entryLivePreviewEl.hidden = true;
      return;
    }
    const kcalPer100 = parseFloat(entryKcalPer100El.value);
    const grams = parseFloat(entryGramsEl.value);
    if (isNaN(kcalPer100) || kcalPer100 < 0 || isNaN(grams) || grams < 0) {
      entryLivePreviewEl.hidden = true;
      return;
    }
    entryLivePreviewEl.hidden = false;
    entryLivePreviewEl.textContent = `≈ ${Math.round((kcalPer100 * grams) / 100)} kcal`;
  }

  [entryKcalPer100El, entryGramsEl, entryKcalTotalEl].forEach((el) => {
    el.addEventListener("input", updateLivePreview);
  });

  let lastSearchResults = [];
  let searchSelectMode = false;
  let searchSelectedIndices = new Set();

  function resetFoodSearch() {
    foodSearchInputEl.value = "";
    foodSearchResultsEl.innerHTML = "";
    foodSearchHintEl.hidden = true;
    lastSearchResults = [];
    searchSelectMode = false;
    searchSelectedIndices = new Set();
    searchSelectBarEl.hidden = true;
    searchSelectToggleBtnEl.textContent = "Seleccionar varios";
    searchLogSelectedBtnEl.hidden = true;
  }

  let foodSearchDebounce = null;

  function setSearchHintLoading() {
    foodSearchHintEl.hidden = false;
    foodSearchHintEl.classList.add("modal-hint--loading");
    foodSearchHintEl.textContent = "Buscando…";
  }

  foodSearchInputEl.addEventListener("input", () => {
    clearTimeout(foodSearchDebounce);
    const query = foodSearchInputEl.value.trim();
    foodSearchResultsEl.innerHTML = "";
    searchSelectBarEl.hidden = true;
    searchLogSelectedBtnEl.hidden = true;
    foodBrowseSectionEl.hidden = query.length > 0;
    if (query.length < 2) {
      foodSearchHintEl.hidden = true;
      foodSearchHintEl.classList.remove("modal-hint--loading");
      return;
    }
    setSearchHintLoading();
    foodSearchDebounce = setTimeout(() => searchFoods(query), 450);
  });

  async function searchFoods(query, attempt = 0) {
    if (foodSearchInputEl.value.trim() !== query) return; // user moved on; abandon

    try {
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,product_name_es,nutriments`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderFoodSearchResults(data.products || [], query);
    } catch (err) {
      // Open Food Facts' search endpoint intermittently fails at the CORS
      // layer even though the request itself reaches their server (verified
      // via no-cors probing — the connection always succeeds, only the
      // CORS-visible fetch sometimes doesn't). A single blip shouldn't show
      // a scary "check your connection" error, so retry a couple of times
      // first — this is exactly what re-typing the query used to paper over.
      if (attempt < 2) {
        setTimeout(() => searchFoods(query, attempt + 1), 350);
        return;
      }
      console.error(err);
      if (foodSearchInputEl.value.trim() !== query) return;
      foodSearchHintEl.hidden = false;
      foodSearchHintEl.classList.remove("modal-hint--loading");
      foodSearchHintEl.innerHTML = `Error al buscar. Revisa tu conexión. <button type="button" class="link-btn" id="foodSearchRetryBtn">Reintentar</button>`;
      document.getElementById("foodSearchRetryBtn").addEventListener("click", () => {
        setSearchHintLoading();
        searchFoods(query, 0);
      });
    }
  }

  function renderFoodSearchResults(products, query) {
    if (foodSearchInputEl.value.trim() !== query) return; // stale response, a newer search superseded it
    const valid = products.filter((p) => (p.product_name_es || p.product_name) && p.nutriments && typeof p.nutriments["energy-kcal_100g"] === "number");
    foodSearchHintEl.classList.remove("modal-hint--loading");
    lastSearchResults = valid;
    searchSelectMode = false;
    searchSelectedIndices = new Set();
    searchSelectToggleBtnEl.textContent = "Seleccionar varios";
    if (valid.length === 0) {
      foodSearchResultsEl.innerHTML = "";
      foodSearchHintEl.hidden = false;
      foodSearchHintEl.textContent = "Sin resultados. Añádelo a mano abajo.";
      searchSelectBarEl.hidden = true;
      searchLogSelectedBtnEl.hidden = true;
      return;
    }
    foodSearchHintEl.hidden = true;
    // Batch-selecting only makes sense when logging straight to today — a
    // recipe ingredient needs its own grams adjustment, one at a time.
    searchSelectBarEl.hidden = foodBrowseContext !== "log" || valid.length < 2;
    renderSearchResultRows();
  }

  function updateSearchLogSelectedBtn() {
    const n = searchSelectedIndices.size;
    searchLogSelectedBtnEl.hidden = n === 0;
    searchLogSelectedBtnEl.textContent = `Registrar (${n})`;
  }

  function renderSearchResultRows() {
    foodSearchResultsEl.innerHTML = "";
    lastSearchResults.forEach((p, idx) => {
      const name = p.product_name_es || p.product_name;
      const kcal = Math.round(p.nutriments["energy-kcal_100g"]);
      const row = document.createElement("div");
      row.className = "row";
      const checked = searchSelectedIndices.has(idx);
      row.innerHTML = `
        <button type="button" class="row-main">
          ${searchSelectMode ? `<span class="row-select-check${checked ? " is-checked" : ""}"></span>` : ""}
          <span class="row-name">${escapeHtml(name)}</span>
          <span class="row-qty">${kcal} kcal /100g</span>
        </button>
      `;
      row.querySelector(".row-main").addEventListener("click", () => {
        if (searchSelectMode) {
          if (searchSelectedIndices.has(idx)) searchSelectedIndices.delete(idx);
          else searchSelectedIndices.add(idx);
          updateSearchLogSelectedBtn();
          renderSearchResultRows();
          return;
        }
        applyFoodSearchResult(p, name, kcal);
      });
      foodSearchResultsEl.appendChild(row);
    });
  }

  searchSelectToggleBtnEl.addEventListener("click", () => {
    searchSelectMode = !searchSelectMode;
    searchSelectedIndices = new Set();
    searchSelectToggleBtnEl.textContent = searchSelectMode ? "Cancelar" : "Seleccionar varios";
    updateSearchLogSelectedBtn();
    renderSearchResultRows();
  });

  searchLogSelectedBtnEl.addEventListener("click", () => {
    const items = Array.from(searchSelectedIndices).map((idx) => lastSearchResults[idx]).filter(Boolean);
    if (items.length === 0) return;
    items.forEach((p) => {
      const name = p.product_name_es || p.product_name;
      const n = p.nutriments;
      addEntryToCurrentDay({
        name,
        calories: Math.round(n["energy-kcal_100g"]),
        qtyLabel: "100 g",
        protein: typeof n.proteins_100g === "number" ? Math.round(n.proteins_100g) : 0,
        fat: typeof n.fat_100g === "number" ? Math.round(n.fat_100g) : 0,
        carbs: typeof n.carbohydrates_100g === "number" ? Math.round(n.carbohydrates_100g) : 0
      });
    });
    saveData(state);
    render();
    closeModal(entryModal);
    showToast(`${items.length} alimentos añadidos`);
  });

  // Reopens the entry form pre-filled from an already-baked item (a favorite
  // or a recently-logged food) so its grams can be adjusted before it's
  // committed — used only when building a recipe, where the exact amount
  // matters. Regular quick-add stays a single instant tap.
  function openFoodItemForRecipeAdjust(item) {
    editingEntryId = null;
    entryModalTitleEl.textContent = "Ajustar cantidad";
    entryForm.reset();
    setEntryFormMode(false);
    foodBrowseSectionEl.hidden = true;
    entryNameEl.value = item.name;
    const hasBasis = typeof item.grams === "number" && typeof item.kcalPer100 === "number";
    entryGramsEl.value = hasBasis ? item.grams : 100;
    entryKcalPer100El.value = Math.round(hasBasis ? item.kcalPer100 : item.calories);
    const proteinPer100 = hasBasis ? item.proteinPer100 : (item.protein || 0);
    const fatPer100 = hasBasis ? item.fatPer100 : (item.fat || 0);
    const carbsPer100 = hasBasis ? item.carbsPer100 : (item.carbs || 0);
    if (proteinPer100) entryProteinPer100El.value = Math.round(proteinPer100);
    if (fatPer100) entryFatPer100El.value = Math.round(fatPer100);
    if (carbsPer100) entryCarbsPer100El.value = Math.round(carbsPer100);
    resetFoodSearch();
    updateLivePreview();
  }

  function applyFoodSearchResult(product, name, kcal) {
    editingEntryId = null;
    entryModalTitleEl.textContent = "Confirmar producto";
    entryForm.reset();
    setEntryFormMode(false);
    foodBrowseSectionEl.hidden = true;
    entryNameEl.value = name;
    entryGramsEl.value = 100;
    entryKcalPer100El.value = kcal;
    const n = product.nutriments;
    if (typeof n.proteins_100g === "number") entryProteinPer100El.value = Math.round(n.proteins_100g);
    if (typeof n.fat_100g === "number") entryFatPer100El.value = Math.round(n.fat_100g);
    if (typeof n.carbohydrates_100g === "number") entryCarbsPer100El.value = Math.round(n.carbohydrates_100g);
    resetFoodSearch();
    updateLivePreview();
  }

  function setEntryFormMode(isEditing) {
    foodSearchSectionEl.hidden = isEditing;
    foodBrowseSectionEl.hidden = isEditing;
    entryPer100RowEl.hidden = isEditing;
    entryTimeRowEl.hidden = !isEditing;
    entryKcalTotalLabelEl.textContent = isEditing ? "kcal totales" : "o directamente, kcal totales";
    entryMacrosLabelEl.textContent = isEditing ? "Macros (totales, opcional)" : "Macros por 100 g (opcional)";
    entrySubmitBtnEl.textContent = isEditing ? "Guardar cambios" : "Añadir";
  }

  function openEntryForEdit(entryId) {
    const entry = currentDayEntries().find((en) => en.id === entryId);
    if (!entry) return;
    foodBrowseContext = "log"; // editing never routes into a recipe draft
    editingEntryId = entryId;
    entryModalTitleEl.textContent = "Editar alimento";
    entryForm.reset();
    resetFoodSearch();
    setEntryFormMode(true);
    entryNameEl.value = entry.name;
    const entryDate = new Date(entry.addedAt);
    entryTimeEl.value = `${String(entryDate.getHours()).padStart(2, "0")}:${String(entryDate.getMinutes()).padStart(2, "0")}`;
    entryGramsEl.value = 100;
    entryKcalTotalEl.value = Math.round(entry.calories);
    if (entry.protein) entryProteinPer100El.value = Math.round(entry.protein);
    if (entry.fat) entryFatPer100El.value = Math.round(entry.fat);
    if (entry.carbs) entryCarbsPer100El.value = Math.round(entry.carbs);
    updateLivePreview();
    openModal(entryModal);
  }

  // The single entry point for the add-food modal, used both for logging to
  // today and (via foodBrowseContext) for picking a recipe ingredient.
  function openAddFoodModal(context) {
    foodBrowseContext = context;
    editingEntryId = null;
    entryModalTitleEl.textContent = "Añadir alimento";
    entryForm.reset();
    entryGramsEl.value = 100;
    resetFoodSearch();
    setEntryFormMode(false);
    foodBrowseSectionEl.hidden = false;
    renderFoodBrowseSection();
    updateLivePreview();
    openModal(entryModal);
    setTimeout(() => foodSearchInputEl.focus(), 50);
  }

  document.getElementById("manualBtn").addEventListener("click", () => openAddFoodModal("log"));

  function closeEntryModalAndReturn() {
    closeModal(entryModal);
    if (foodBrowseContext === "recipe-ingredient") {
      foodBrowseContext = "log";
      openModal(recipeModal);
    }
  }
  document.getElementById("closeEntryModal").addEventListener("click", closeEntryModalAndReturn);

  function readEntryFormValues() {
    const name = entryNameEl.value.trim();
    if (!name) return null;

    const kcalTotal = parseFloat(entryKcalTotalEl.value);
    const kcalPer100Raw = parseFloat(entryKcalPer100El.value);
    const grams = parseFloat(entryGramsEl.value) || 100;

    let calories, qtyLabel, kcalPer100Basis;
    if (!isNaN(kcalTotal) && kcalTotal >= 0) {
      calories = kcalTotal;
      qtyLabel = "";
      // Direct-total entry ignores the grams field for the calorie figure
      // itself, but a per-100g basis is still derived from it so the item
      // can be proportionally re-scaled later (recipe ingredient, merged meal).
      kcalPer100Basis = grams > 0 ? (kcalTotal * 100) / grams : kcalTotal;
    } else if (!isNaN(kcalPer100Raw) && kcalPer100Raw >= 0) {
      calories = (kcalPer100Raw * grams) / 100;
      qtyLabel = `${grams} g`;
      kcalPer100Basis = kcalPer100Raw;
    } else {
      return null;
    }

    const proteinPer100Raw = parseFloat(entryProteinPer100El.value);
    const fatPer100Raw = parseFloat(entryFatPer100El.value);
    const carbsPer100Raw = parseFloat(entryCarbsPer100El.value);
    const basis = (v) => (!isNaN(v) && v >= 0 ? v : 0);
    const scale = (v) => (basis(v) * grams) / 100;

    return {
      name,
      calories,
      qtyLabel,
      protein: scale(proteinPer100Raw),
      fat: scale(fatPer100Raw),
      carbs: scale(carbsPer100Raw),
      // Per-100g basis, kept alongside the computed totals above so callers
      // that need a re-scalable item (recipe ingredients, merged meals) can
      // use it without re-deriving it from the already-scaled totals.
      grams,
      kcalPer100: kcalPer100Basis,
      proteinPer100: basis(proteinPer100Raw),
      fatPer100: basis(fatPer100Raw),
      carbsPer100: basis(carbsPer100Raw)
    };
  }

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!entryNameEl.value.trim()) return;
    const values = readEntryFormValues();
    if (!values) {
      showToast("Indica las kcal");
      return;
    }

    if (editingEntryId) {
      const entry = currentDayEntries().find((en) => en.id === editingEntryId);
      if (!entry) return;
      Object.assign(entry, values);
      if (entryTimeEl.value) {
        const [h, m] = entryTimeEl.value.split(":").map(Number);
        const d = new Date(entry.addedAt);
        d.setHours(h, m, 0, 0);
        entry.addedAt = d.getTime();
      }
      saveData(state);
      render();
      closeModal(entryModal);
      showToast("Guardado");
      return;
    }

    commitFoodItem(values);
  });

  entryFavoriteBtnEl.addEventListener("click", () => {
    const values = readEntryFormValues();
    if (!values) {
      showToast("Indica nombre y kcal para guardarlo");
      return;
    }
    state.favorites.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...values,
      addedAt: Date.now()
    });
    saveData(state);
    renderModalFavorites();
    showToast("Guardado en favoritos");
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
      if (e.target !== modal) return;
      if (modal.id === "entryModal") closeEntryModalAndReturn();
      else if (modal.id === "exerciseEditModal") closeExerciseEditModalAndReturn();
      else closeModal(modal);
      if (modal.id === "exerciseDetailModal") stopRestTimer();
      if (modal.id === "timerRunModal") stopTimerRunEngine();
    });
  });

  /* ---------- Barcode scanning ---------- */
  // Prefers the native BarcodeDetector API (fast, hardware-backed, works well for
  // 1D EAN/UPC codes). Falls back to the @zxing/browser library — loaded lazily,
  // only on browsers without native support — since it's far more reliable than
  // html5-qrcode was for non-QR barcodes.

  const scanModal = document.getElementById("scanModal");
  const scannerHintEl = document.getElementById("scannerHint");
  const scannerVideoEl = document.getElementById("scannerVideo");
  const scannerTorchBtnEl = document.getElementById("scannerTorchBtn");
  const scannerManualToggleEl = document.getElementById("scannerManualToggle");
  const scannerManualFormEl = document.getElementById("scannerManualForm");
  const scannerManualInputEl = document.getElementById("scannerManualInput");

  const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

  let mediaStream = null;
  let scanning = false;
  let detectRAF = null;
  let zxingControls = null;
  let zxingReaderPromise = null;
  let scanSession = 0; // bumped on every start/stop so a slow getUserMedia/zxing
                        // load that resolves after the modal's been closed (or
                        // reopened) knows to clean up instead of taking over

  function loadZxing() {
    if (!zxingReaderPromise) {
      zxingReaderPromise = import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
    }
    return zxingReaderPromise;
  }

  async function openScanner() {
    scannerManualFormEl.hidden = true;
    scannerManualToggleEl.textContent = "Introducir código a mano";
    openModal(scanModal);
    scannerHintEl.textContent = "Apunta al código de barras del producto.";
    await startScanner();
  }

  document.getElementById("scanBtn").addEventListener("click", openScanner);
  document.getElementById("modalScanBtn").addEventListener("click", () => {
    closeModal(entryModal);
    openScanner();
  });

  async function startScanner() {
    const session = ++scanSession;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
    } catch (err) {
      console.error(err);
      if (session === scanSession) scannerHintEl.textContent = "No se pudo acceder a la cámara. Revisa los permisos.";
      return;
    }
    if (session !== scanSession) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    mediaStream = stream;
    scannerVideoEl.srcObject = mediaStream;
    await scannerVideoEl.play();
    scanning = true;

    const track = mediaStream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      scannerTorchBtnEl.hidden = false;
      scannerTorchBtnEl.classList.remove("active");
    } else {
      scannerTorchBtnEl.hidden = true;
    }

    if ("BarcodeDetector" in window) {
      let detector;
      try {
        detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
      } catch (e) {
        detector = new BarcodeDetector();
      }
      const detectLoop = async () => {
        if (!scanning) return;
        try {
          const results = await detector.detect(scannerVideoEl);
          if (results.length > 0) {
            onScanSuccess(results[0].rawValue);
            return;
          }
        } catch (e) { /* transient per-frame detection error, keep scanning */ }
        detectRAF = requestAnimationFrame(detectLoop);
      };
      detectRAF = requestAnimationFrame(detectLoop);
    } else {
      try {
        const { BrowserMultiFormatReader } = await loadZxing();
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(scannerVideoEl, (result, err) => {
          if (result && session === scanSession) onScanSuccess(result.getText());
        });
        if (session === scanSession) {
          zxingControls = controls;
        } else {
          controls.stop();
        }
      } catch (e) {
        console.error(e);
        if (session === scanSession) scannerHintEl.textContent = "No se pudo cargar el lector de códigos. Comprueba tu conexión.";
      }
    }
  }

  scannerTorchBtnEl.addEventListener("click", async () => {
    if (!mediaStream) return;
    const track = mediaStream.getVideoTracks()[0];
    const isActive = scannerTorchBtnEl.classList.toggle("active");
    try {
      await track.applyConstraints({ advanced: [{ torch: isActive }] });
    } catch (e) {
      scannerTorchBtnEl.classList.toggle("active", !isActive);
    }
  });

  scannerManualToggleEl.addEventListener("click", () => {
    const showing = scannerManualFormEl.hidden;
    scannerManualFormEl.hidden = !showing;
    scannerManualToggleEl.textContent = showing ? "Ocultar" : "Introducir código a mano";
    if (showing) setTimeout(() => scannerManualInputEl.focus(), 50);
  });

  scannerManualFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = scannerManualInputEl.value.trim();
    if (!code) return;
    await stopScanner();
    closeModal(scanModal);
    lookupBarcode(code);
  });

  function stopScanner() {
    scanSession++; // invalidate any in-flight startScanner() call
    scanning = false;
    if (detectRAF) {
      cancelAnimationFrame(detectRAF);
      detectRAF = null;
    }
    if (zxingControls) {
      zxingControls.stop();
      zxingControls = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    scannerVideoEl.srcObject = null;
    scannerTorchBtnEl.hidden = true;
    scannerTorchBtnEl.classList.remove("active");
  }

  document.getElementById("closeScanModal").addEventListener("click", () => {
    stopScanner();
    closeModal(scanModal);
  });

  function onScanSuccess(decodedText) {
    if (!scanning) return;
    stopScanner();
    closeModal(scanModal);
    lookupBarcode(decodedText.trim());
  }

  async function lookupBarcode(barcode) {
    showToast(`Buscando ${barcode}…`);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
      const data = await res.json();

      editingEntryId = null;
      setEntryFormMode(false);
      foodBrowseSectionEl.hidden = true;

      if (data.status !== 1 || !data.product) {
        showToast("Producto no encontrado. Añádelo a mano.");
        entryModalTitleEl.textContent = "Añadir alimento";
        entryForm.reset();
        entryGramsEl.value = 100;
        resetFoodSearch();
        updateLivePreview();
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
      updateLivePreview();
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
      navigator.serviceWorker.register("service-worker.js").then((reg) => {
        // iOS's home-screen shell doesn't reliably poll for a new SW on its
        // own — force a check every time the app is opened, on top of the
        // network-first document fetch that already keeps index.html fresh.
        reg.update().catch(() => {});
      }).catch((e) => console.error("SW failed", e));

      // If a new SW takes control while this page is still open (left
      // running in the background across an update), reload once so the
      // page matches the new cached assets instead of running stale code.
      let reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });
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
  const workoutWeekStripEl = document.getElementById("workoutWeekStrip");
  const exerciseQuickSectionEl = document.getElementById("exerciseQuickSection");
  const exerciseQuickRowEl = document.getElementById("exerciseQuickRow");
  const routineQuickSectionEl = document.getElementById("routineQuickSection");
  const routineQuickRowEl = document.getElementById("routineQuickRow");
  const routinesEditToggleEl = document.getElementById("routinesEditToggle");
  const sessionCountChipEl = document.getElementById("sessionCountChip");
  const copyWorkoutDayBtnEl = document.getElementById("copyWorkoutDayBtn");
  const pasteWorkoutDayBtnEl = document.getElementById("pasteWorkoutDayBtn");
  const pasteWorkoutDayEmptyBtnEl = document.getElementById("pasteWorkoutDayEmptyBtn");
  const workoutTotalsEl = document.getElementById("workoutTotals");
  const workoutTotalSetsEl = document.getElementById("workoutTotalSets");
  const workoutTotalNoteEl = document.getElementById("workoutTotalNote");

  function copyExerciseToDay(exercise, targetDayKey) {
    if (!state.workouts[targetDayKey]) state.workouts[targetDayKey] = { exercises: [] };
    const newExerciseId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.workouts[targetDayKey].exercises.push({
      id: newExerciseId,
      name: exercise.name,
      addedAt: rebaseTimeToDay(exercise.addedAt, targetDayKey),
      sets: exercise.sets.map((s) => ({
        id: `${newExerciseId}-${Math.random().toString(36).slice(2, 7)}`,
        weightKg: s.weightKg,
        reps: s.reps,
        type: s.type || "normal",
        addedAt: rebaseTimeToDay(s.addedAt, targetDayKey)
      }))
    });
  }

  function currentWorkoutDayKey() {
    return todayKey(workoutDayOffset);
  }

  function currentWorkoutExercises() {
    const key = currentWorkoutDayKey();
    if (!state.workouts[key]) state.workouts[key] = { exercises: [] };
    return state.workouts[key].exercises;
  }

  function ensureTimerLogs(dayKey) {
    if (!state.workouts[dayKey]) state.workouts[dayKey] = { exercises: [] };
    if (!state.workouts[dayKey].timerLogs) state.workouts[dayKey].timerLogs = [];
    return state.workouts[dayKey].timerLogs;
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

  // Collapsible "setup" sections (Calentamiento / Estiramientos / Rutinas /
  // Ejercicios recientes): once you've already used one today it collapses
  // out of the way automatically, keeping the card focused on what you've
  // actually logged rather than the pickers. A tap always overrides the
  // heuristic for the rest of the session on that day; navigating to a
  // different day resets back to the automatic behavior.
  let sectionOverrides = {};
  let sectionOverrideDayKey = null;

  function resetSectionOverridesIfDayChanged() {
    const dayKey = currentWorkoutDayKey();
    if (sectionOverrideDayKey !== dayKey) {
      sectionOverrides = {};
      sectionOverrideDayKey = dayKey;
    }
  }

  function sectionUsedToday(section) {
    if (section === "warmup") return ensureTimerLogs(currentWorkoutDayKey()).some((l) => l.category === "warmup");
    if (section === "stretch") return ensureTimerLogs(currentWorkoutDayKey()).some((l) => l.category === "stretch");
    return currentWorkoutExercises().length > 0; // "routines" and "exercises"
  }

  function isSectionExpanded(section) {
    resetSectionOverridesIfDayChanged();
    if (section in sectionOverrides) return sectionOverrides[section];
    return !sectionUsedToday(section);
  }

  function toggleWorkoutSection(section) {
    resetSectionOverridesIfDayChanged();
    sectionOverrides[section] = !isSectionExpanded(section);
    renderWorkoutDay();
  }

  function applyWorkoutSectionCollapse() {
    [
      { key: "warmup", row: warmupTimerQuickRowEl, actions: document.getElementById("warmupQuickActions"), chevron: document.getElementById("warmupSectionChevron") },
      { key: "stretch", row: stretchTimerQuickRowEl, actions: document.getElementById("stretchQuickActions"), chevron: document.getElementById("stretchSectionChevron") },
      { key: "routines", row: routineQuickRowEl, actions: document.getElementById("routineQuickActions"), chevron: document.getElementById("routineSectionChevron") },
      { key: "exercises", row: exerciseQuickRowEl, actions: null, chevron: document.getElementById("exerciseSectionChevron") }
    ].forEach(({ key, row, actions, chevron }) => {
      const expanded = isSectionExpanded(key);
      row.hidden = !expanded;
      if (actions) actions.hidden = !expanded;
      if (chevron) chevron.classList.toggle("is-collapsed", !expanded);
    });
  }

  document.getElementById("warmupSectionToggle").addEventListener("click", () => toggleWorkoutSection("warmup"));
  document.getElementById("stretchSectionToggle").addEventListener("click", () => toggleWorkoutSection("stretch"));
  document.getElementById("routineSectionToggle").addEventListener("click", () => toggleWorkoutSection("routines"));
  document.getElementById("exerciseSectionToggle").addEventListener("click", () => toggleWorkoutSection("exercises"));

  // The four setup pickers (Calentamiento/Rutinas/Estiramientos/Ejercicios
  // recientes) sit behind one master toggle, collapsed by default — without
  // it, their header rows were always visible even with nothing left to add,
  // cluttering the view once you're mid-workout.
  const workoutSetupSectionsEl = document.getElementById("workoutSetupSections");
  const workoutSetupChevronEl = document.getElementById("workoutSetupChevron");
  let workoutSetupExpanded = false;

  document.getElementById("workoutSetupToggleBtn").addEventListener("click", () => {
    workoutSetupExpanded = !workoutSetupExpanded;
    workoutSetupSectionsEl.hidden = !workoutSetupExpanded;
    workoutSetupChevronEl.classList.toggle("is-collapsed", !workoutSetupExpanded);
  });

  let routinesEditMode = false;

  routinesEditToggleEl.addEventListener("click", () => {
    routinesEditMode = !routinesEditMode;
    routinesEditToggleEl.textContent = routinesEditMode ? "Listo" : "Editar";
    renderRoutineQuickRow();
  });

  function startRoutine(routine) {
    routine.exerciseNames.forEach((name) => createExercise(name));
    showToast(`${routine.name} añadida`);
  }

  function renderRoutineQuickRow() {
    routineQuickRowEl.innerHTML = "";
    routineQuickSectionEl.hidden = false;
    routinesEditToggleEl.hidden = state.routines.length === 0;
    if (state.routines.length === 0) {
      routinesEditMode = false;
      routinesEditToggleEl.textContent = "Editar";
      return;
    }
    state.routines.forEach((routine) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(routine.name)}</span>
        <span class="quick-chip-kcal">${routine.exerciseNames.length} ej.</span>
        ${routinesEditMode ? `<span class="quick-chip-del" aria-label="Quitar">${ICON_X}</span>` : ""}
      `;
      chip.addEventListener("click", () => {
        if (routinesEditMode) {
          state.routines = state.routines.filter((r) => r.id !== routine.id);
          saveData(state);
          renderRoutineQuickRow();
          return;
        }
        startRoutine(routine);
      });
      routineQuickRowEl.appendChild(chip);
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

  function renderWorkoutWeekStrip() {
    renderWeekStripInto(workoutWeekStripEl, workoutDayOffset, (offset) => { workoutDayOffset = offset; renderWorkoutDay(); });
  }

  function renderWorkoutDay() {
    const exercises = currentWorkoutExercises();
    const label = formatDateLabel(workoutDayOffset);
    workoutDateLabelEl.textContent = label.short;
    workoutFullDateLabelEl.textContent = `${label.weekday}, ${label.day} de ${label.month}`.replace(/^./, (c) => c.toUpperCase());
    renderWorkoutWeekStrip();

    const sessions = countWorkoutSessions();
    sessionCountChipEl.textContent = `${sessions} ${sessions === 1 ? "sesión" : "sesiones"}`;

    renderTimerLogList();
    renderTimerQuickRows();
    renderRoutineQuickRow();
    renderExerciseQuickAdd();
    applyWorkoutSectionCollapse();

    const hasWorkoutClipboard = !!(dayClipboard && dayClipboard.type === "workout");
    exerciseListEl.innerHTML = "";
    if (exercises.length === 0) {
      workoutEmptyStateEl.style.display = "block";
      pasteWorkoutDayEmptyBtnEl.hidden = !hasWorkoutClipboard;
      copyWorkoutDayBtnEl.hidden = true;
      pasteWorkoutDayBtnEl.hidden = true;
    } else {
      workoutEmptyStateEl.style.display = "none";
      copyWorkoutDayBtnEl.hidden = false;
      pasteWorkoutDayBtnEl.hidden = !hasWorkoutClipboard;
      pasteWorkoutDayEmptyBtnEl.hidden = true;
      exercises.forEach((ex) => {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <button type="button" class="row-main row-edit" data-id="${ex.id}">
            <span class="row-name">${escapeHtml(ex.name)}</span>
            <span class="row-qty">${summarizeExercise(ex)}</span>
          </button>
          <button class="row-del" data-id="${ex.id}" aria-label="Quitar">${ICON_X}</button>
        `;
        exerciseListEl.appendChild(row);
      });
    }

    const totals = computeWorkoutDayTotals(exercises);
    workoutTotalsEl.hidden = totals.sets === 0;
    if (totals.sets > 0) {
      workoutTotalSetsEl.textContent = `${totals.sets} ${totals.sets === 1 ? "serie" : "series"}`;
      workoutTotalNoteEl.textContent = totals.volume > 0
        ? `${Math.round(totals.volume)} kg de volumen total`
        : `${totals.reps} reps totales`;
    }
  }

  function computeWorkoutDayTotals(exercises) {
    let sets = 0, volume = 0, reps = 0;
    exercises.forEach((ex) => {
      ex.sets.forEach((s) => {
        sets += 1;
        reps += s.reps;
        if (s.weightKg !== null && s.weightKg !== undefined) volume += s.weightKg * s.reps;
      });
    });
    return { sets, volume, reps };
  }

  document.getElementById("prevWorkoutDay").addEventListener("click", () => {
    workoutDayOffset -= 1;
    renderWorkoutDay();
  });
  document.getElementById("nextWorkoutDay").addEventListener("click", () => {
    if (workoutDayOffset < 0) workoutDayOffset += 1;
    renderWorkoutDay();
  });

  copyWorkoutDayBtnEl.addEventListener("click", () => {
    const exercises = currentWorkoutExercises();
    if (exercises.length === 0) return;
    dayClipboard = { type: "workout", exercises: exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s })) })) };
    showToast("Entreno copiado. Ve a otro día y pulsa Pegar.");
    renderWorkoutDay();
  });

  function pasteWorkoutDay() {
    if (!dayClipboard || dayClipboard.type !== "workout") return;
    const targetKey = currentWorkoutDayKey();
    dayClipboard.exercises.forEach((ex) => copyExerciseToDay(ex, targetKey));
    saveData(state);
    renderWorkoutDay();
    showToast("Pegado");
  }
  pasteWorkoutDayBtnEl.addEventListener("click", pasteWorkoutDay);
  pasteWorkoutDayEmptyBtnEl.addEventListener("click", pasteWorkoutDay);

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
    refreshExerciseNameList();
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

  /* ---------- Routine builder modal ---------- */

  const routineModal = document.getElementById("routineModal");
  const routineNameInputEl = document.getElementById("routineNameInput");
  const routineExercisesListEl = document.getElementById("routineExercisesList");
  const routineExercisesEmptyEl = document.getElementById("routineExercisesEmpty");
  const routineExerciseNameInputEl = document.getElementById("routineExerciseNameInput");

  let draftRoutineExercises = [];

  function renderRoutineExercises() {
    routineExercisesListEl.innerHTML = "";
    routineExercisesEmptyEl.hidden = draftRoutineExercises.length > 0;
    draftRoutineExercises.forEach((name, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-main">
          <span class="row-name">${escapeHtml(name)}</span>
        </div>
        <button class="row-del" type="button" data-index="${i}" aria-label="Quitar">${ICON_X}</button>
      `;
      routineExercisesListEl.appendChild(row);
    });
  }

  routineExercisesListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (!delBtn) return;
    draftRoutineExercises.splice(parseInt(delBtn.dataset.index, 10), 1);
    renderRoutineExercises();
  });

  document.getElementById("addRoutineBtn").addEventListener("click", () => {
    draftRoutineExercises = [];
    routineNameInputEl.value = "";
    routineExerciseNameInputEl.value = "";
    renderRoutineExercises();
    refreshExerciseNameList();
    openModal(routineModal);
    setTimeout(() => routineNameInputEl.focus(), 50);
  });
  document.getElementById("closeRoutineModal").addEventListener("click", () => closeModal(routineModal));

  function addDraftRoutineExercise() {
    const name = routineExerciseNameInputEl.value.trim();
    if (!name) return;
    draftRoutineExercises.push(name);
    routineExerciseNameInputEl.value = "";
    renderRoutineExercises();
    routineExerciseNameInputEl.focus();
  }
  document.getElementById("addRoutineExerciseBtn").addEventListener("click", addDraftRoutineExercise);
  routineExerciseNameInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraftRoutineExercise();
    }
  });

  document.getElementById("saveRoutineBtn").addEventListener("click", () => {
    const name = routineNameInputEl.value.trim();
    if (!name) {
      showToast("Indica el nombre de la rutina");
      return;
    }
    if (draftRoutineExercises.length === 0) {
      showToast("Añade al menos un ejercicio");
      return;
    }
    state.routines.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      exerciseNames: draftRoutineExercises,
      createdAt: Date.now()
    });
    saveData(state);
    renderRoutineQuickRow();
    closeModal(routineModal);
    showToast("Rutina guardada");
  });

  /* ---------- Timer builder modal (warmup / stretch) ---------- */

  const timerBuilderModal = document.getElementById("timerBuilderModal");
  const timerBuilderTitleEl = document.getElementById("timerBuilderTitle");
  const timerNameInputEl = document.getElementById("timerNameInput");
  const timerIntervalsListEl = document.getElementById("timerIntervalsList");
  const timerIntervalsEmptyEl = document.getElementById("timerIntervalsEmpty");
  const timerIntervalNameInputEl = document.getElementById("timerIntervalNameInput");
  const timerIntervalSecondsInputEl = document.getElementById("timerIntervalSecondsInput");

  const warmupQuickSectionEl = document.getElementById("warmupQuickSection");
  const warmupTimerQuickRowEl = document.getElementById("warmupTimerQuickRow");
  const warmupTimersEditToggleEl = document.getElementById("warmupTimersEditToggle");
  const stretchQuickSectionEl = document.getElementById("stretchQuickSection");
  const stretchTimerQuickRowEl = document.getElementById("stretchTimerQuickRow");
  const stretchTimersEditToggleEl = document.getElementById("stretchTimersEditToggle");

  let draftTimerIntervals = [];
  let draftTimerCategory = "warmup";
  let warmupTimersEditMode = false;
  let stretchTimersEditMode = false;

  function timerTotalSeconds(timer) {
    return timer.intervals.reduce((sum, iv) => sum + iv.seconds, 0);
  }

  function renderTimerIntervals() {
    timerIntervalsListEl.innerHTML = "";
    timerIntervalsEmptyEl.hidden = draftTimerIntervals.length > 0;
    draftTimerIntervals.forEach((iv, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-main">
          <span class="row-name">${escapeHtml(iv.name)}</span>
          <span class="row-qty">${formatDuration(iv.seconds)}</span>
        </div>
        <div class="timer-interval-actions">
          <button type="button" class="row-move" data-index="${i}" data-dir="up" aria-label="Subir" ${i === 0 ? "disabled" : ""}>${ICON_CHEVRON_DOWN}</button>
          <button type="button" class="row-move" data-index="${i}" data-dir="down" aria-label="Bajar" ${i === draftTimerIntervals.length - 1 ? "disabled" : ""}>${ICON_CHEVRON_DOWN}</button>
          <button class="row-del" type="button" data-index="${i}" aria-label="Quitar">${ICON_X}</button>
        </div>
      `;
      timerIntervalsListEl.appendChild(row);
    });
    timerIntervalsListEl.querySelectorAll('.row-move[data-dir="up"]').forEach((b) => {
      b.style.transform = "rotate(180deg)";
    });
  }

  timerIntervalsListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      draftTimerIntervals.splice(parseInt(delBtn.dataset.index, 10), 1);
      renderTimerIntervals();
      return;
    }
    const moveBtn = e.target.closest(".row-move");
    if (moveBtn && !moveBtn.disabled) {
      const idx = parseInt(moveBtn.dataset.index, 10);
      const swapWith = moveBtn.dataset.dir === "up" ? idx - 1 : idx + 1;
      [draftTimerIntervals[idx], draftTimerIntervals[swapWith]] = [draftTimerIntervals[swapWith], draftTimerIntervals[idx]];
      renderTimerIntervals();
    }
  });

  function addDraftTimerInterval() {
    const name = timerIntervalNameInputEl.value.trim();
    const seconds = parseInt(timerIntervalSecondsInputEl.value, 10);
    if (!name || !(seconds > 0)) {
      showToast("Indica nombre y duración");
      return;
    }
    draftTimerIntervals.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, seconds });
    timerIntervalNameInputEl.value = "";
    timerIntervalSecondsInputEl.value = "";
    renderTimerIntervals();
    timerIntervalNameInputEl.focus();
  }
  document.getElementById("addTimerIntervalBtn").addEventListener("click", addDraftTimerInterval);
  timerIntervalSecondsInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraftTimerInterval();
    }
  });

  function openTimerBuilder(category) {
    draftTimerCategory = category;
    draftTimerIntervals = [];
    timerNameInputEl.value = "";
    timerIntervalNameInputEl.value = "";
    timerIntervalSecondsInputEl.value = "";
    timerBuilderTitleEl.textContent = category === "warmup" ? "Nuevo calentamiento" : "Nuevo estiramiento";
    renderTimerIntervals();
    openModal(timerBuilderModal);
    setTimeout(() => timerNameInputEl.focus(), 50);
  }
  document.getElementById("addWarmupTimerBtn").addEventListener("click", () => openTimerBuilder("warmup"));
  document.getElementById("addStretchTimerBtn").addEventListener("click", () => openTimerBuilder("stretch"));
  document.getElementById("closeTimerBuilderModal").addEventListener("click", () => closeModal(timerBuilderModal));

  document.getElementById("saveTimerBtn").addEventListener("click", () => {
    const name = timerNameInputEl.value.trim();
    if (!name) {
      showToast("Indica el nombre del temporizador");
      return;
    }
    if (draftTimerIntervals.length === 0) {
      showToast("Añade al menos un intervalo");
      return;
    }
    state.timers.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      category: draftTimerCategory,
      intervals: draftTimerIntervals,
      createdAt: Date.now()
    });
    saveData(state);
    renderTimerQuickRows();
    closeModal(timerBuilderModal);
    showToast("Temporizador guardado");
  });

  function renderTimerCategoryRow(category, sectionEl, rowEl, editToggleEl, isEditMode, setEditMode) {
    const items = state.timers.filter((t) => t.category === category);
    rowEl.innerHTML = "";
    sectionEl.hidden = false;
    editToggleEl.hidden = items.length === 0;
    if (items.length === 0) {
      setEditMode(false);
      editToggleEl.textContent = "Editar";
      return;
    }
    items.forEach((timer) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "quick-chip";
      chip.innerHTML = `
        <span class="quick-chip-name">${escapeHtml(timer.name)}</span>
        <span class="quick-chip-kcal">${formatDuration(timerTotalSeconds(timer))}</span>
        ${isEditMode() ? `<span class="quick-chip-del" aria-label="Quitar">${ICON_X}</span>` : ""}
      `;
      chip.addEventListener("click", () => {
        if (isEditMode()) {
          state.timers = state.timers.filter((t) => t.id !== timer.id);
          saveData(state);
          renderTimerQuickRows();
          return;
        }
        openTimerRun(timer);
      });
      rowEl.appendChild(chip);
    });
  }

  function renderTimerQuickRows() {
    renderTimerCategoryRow(
      "warmup", warmupQuickSectionEl, warmupTimerQuickRowEl, warmupTimersEditToggleEl,
      () => warmupTimersEditMode, (v) => { warmupTimersEditMode = v; }
    );
    renderTimerCategoryRow(
      "stretch", stretchQuickSectionEl, stretchTimerQuickRowEl, stretchTimersEditToggleEl,
      () => stretchTimersEditMode, (v) => { stretchTimersEditMode = v; }
    );
  }

  warmupTimersEditToggleEl.addEventListener("click", () => {
    warmupTimersEditMode = !warmupTimersEditMode;
    warmupTimersEditToggleEl.textContent = warmupTimersEditMode ? "Listo" : "Editar";
    renderTimerQuickRows();
  });
  stretchTimersEditToggleEl.addEventListener("click", () => {
    stretchTimersEditMode = !stretchTimersEditMode;
    stretchTimersEditToggleEl.textContent = stretchTimersEditMode ? "Listo" : "Editar";
    renderTimerQuickRows();
  });

  /* ---------- Timer log list (completed warmups/stretches for the day) ---------- */

  const timerLogListEl = document.getElementById("timerLogList");

  function renderTimerLogList() {
    const logs = ensureTimerLogs(currentWorkoutDayKey());
    timerLogListEl.innerHTML = "";
    logs.forEach((log) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-main">
          <span class="row-name">${escapeHtml(log.name)}</span>
          <span class="row-qty">${log.category === "warmup" ? "Calentamiento" : "Estiramiento"} · ${formatDuration(log.totalSeconds)}</span>
        </div>
        <button class="row-del" type="button" data-id="${log.id}" aria-label="Quitar">${ICON_X}</button>
      `;
      timerLogListEl.appendChild(row);
    });
  }

  timerLogListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (!delBtn) return;
    const logs = ensureTimerLogs(currentWorkoutDayKey());
    const idx = logs.findIndex((l) => l.id === delBtn.dataset.id);
    if (idx >= 0) {
      logs.splice(idx, 1);
      saveData(state);
      renderTimerLogList();
    }
  });

  /* ---------- Timer run (warmup / stretch playback) ---------- */

  /* ---------- Timer beep (synthesized via Web Audio, no asset needed) ---------- */

  // Must only ever be created/resumed from inside a real user-gesture call
  // stack (a click/submit handler) — browsers refuse to play audio otherwise.
  // Once unlocked it stays usable for the rest of the page's life, so later
  // beeps fired from a setInterval tick (not a gesture) still work fine.
  let audioCtx = null;
  function ensureAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playBeep(freq = 880, duration = 0.15) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  const timerRunModal = document.getElementById("timerRunModal");
  const timerRunTitleEl = document.getElementById("timerRunTitle");
  const timerRunStepLabelEl = document.getElementById("timerRunStepLabel");
  const timerRunRingWrapEl = document.getElementById("timerRunRingWrap");
  const timerRunRingProgressEl = document.getElementById("timerRunRingProgress");
  const timerRunTimeEl = document.getElementById("timerRunTime");
  const timerRunIntervalNameEl = document.getElementById("timerRunIntervalName");
  const timerRunNextEl = document.getElementById("timerRunNext");
  const timerRunControlsEl = document.getElementById("timerRunControls");
  const timerRunPauseBtnEl = document.getElementById("timerRunPauseBtn");
  const timerRunSkipBtnEl = document.getElementById("timerRunSkipBtn");
  const timerRunStopBtnEl = document.getElementById("timerRunStopBtn");

  const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * 90;
  timerRunRingProgressEl.style.strokeDasharray = `${TIMER_RING_CIRCUMFERENCE}`;
  const TIMER_COUNTDOWN_SECONDS = 5;

  let runningTimer = null;
  let runningPhase = "active"; // "countdown" (5s lead-in) | "active" | (is-complete handled via CSS class)
  let runningIntervalIndex = 0;
  let runningRemaining = 0;
  let runningTickHandle = null;
  let runningWakeLock = null;

  function acquireWakeLock() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then((lock) => { runningWakeLock = lock; }).catch(() => {});
  }
  function releaseWakeLock() {
    if (runningWakeLock) {
      runningWakeLock.release().catch(() => {});
      runningWakeLock = null;
    }
  }

  function updateTimerRunUI() {
    if (runningPhase === "countdown") {
      timerRunStepLabelEl.textContent = "Preparando";
      timerRunTimeEl.textContent = formatDuration(runningRemaining);
      timerRunIntervalNameEl.textContent = runningTimer.intervals[0].name;
      timerRunNextEl.textContent = "Prepárate…";
      const fraction = (TIMER_COUNTDOWN_SECONDS - runningRemaining) / TIMER_COUNTDOWN_SECONDS;
      timerRunRingProgressEl.style.strokeDashoffset = `${TIMER_RING_CIRCUMFERENCE * (1 - fraction)}`;
      return;
    }
    const iv = runningTimer.intervals[runningIntervalIndex];
    timerRunStepLabelEl.textContent = `Paso ${runningIntervalIndex + 1} de ${runningTimer.intervals.length}`;
    timerRunTimeEl.textContent = formatDuration(runningRemaining);
    timerRunIntervalNameEl.textContent = iv.name;
    const next = runningTimer.intervals[runningIntervalIndex + 1];
    timerRunNextEl.textContent = next ? `Después: ${next.name} · ${formatDuration(next.seconds)}` : "Último paso";
    const fraction = (iv.seconds - runningRemaining) / iv.seconds;
    timerRunRingProgressEl.style.strokeDashoffset = `${TIMER_RING_CIRCUMFERENCE * (1 - fraction)}`;
  }

  function flashTimerRing() {
    timerRunRingWrapEl.classList.remove("timer-run-flash");
    void timerRunRingWrapEl.offsetWidth;
    timerRunRingWrapEl.classList.add("timer-run-flash");
  }

  function stopTimerTicking() {
    if (runningTickHandle) {
      clearInterval(runningTickHandle);
      runningTickHandle = null;
    }
  }

  function startFirstInterval() {
    runningPhase = "active";
    runningIntervalIndex = 0;
    runningRemaining = runningTimer.intervals[0].seconds;
    updateTimerRunUI();
    flashTimerRing();
    playBeep();
  }

  function advanceTimerRun() {
    runningIntervalIndex += 1;
    if (runningIntervalIndex >= runningTimer.intervals.length) {
      finishTimerRun();
      return;
    }
    runningRemaining = runningTimer.intervals[runningIntervalIndex].seconds;
    updateTimerRunUI();
    flashTimerRing();
    playBeep();
  }

  function tickTimerRun() {
    runningRemaining -= 1;
    if (runningRemaining <= 0) {
      if (runningPhase === "countdown") startFirstInterval();
      else advanceTimerRun();
      return;
    }
    updateTimerRunUI();
  }

  function finishTimerRun() {
    stopTimerTicking();
    releaseWakeLock();
    const totalSeconds = timerTotalSeconds(runningTimer);
    const logs = ensureTimerLogs(currentWorkoutDayKey());
    logs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: runningTimer.name,
      category: runningTimer.category,
      totalSeconds,
      completedAt: Date.now()
    });
    saveData(state);
    renderWorkoutDay(); // also collapses the warmup/stretch quick-section now that it's been used today
    timerRunStepLabelEl.textContent = `${runningTimer.intervals.length} de ${runningTimer.intervals.length}`;
    timerRunTimeEl.textContent = "0:00";
    timerRunIntervalNameEl.textContent = "¡Hecho!";
    timerRunNextEl.textContent = `Total: ${formatDuration(totalSeconds)}`;
    timerRunRingProgressEl.style.strokeDashoffset = "0";
    timerRunControlsEl.classList.add("is-complete");
    showToast(`${runningTimer.name} completado`);
  }

  function openTimerRun(timer) {
    playBeep(); // called first, still synchronously inside the triggering click — required to unlock audio
    runningTimer = timer;
    runningPhase = "countdown";
    runningIntervalIndex = -1;
    runningRemaining = TIMER_COUNTDOWN_SECONDS;
    timerRunPauseBtnEl.textContent = "Pausar";
    timerRunControlsEl.classList.remove("is-complete");
    timerRunRingProgressEl.classList.toggle("timer-run-ring-progress--stretch", timer.category === "stretch");
    timerRunTitleEl.textContent = timer.name;
    updateTimerRunUI();
    openModal(timerRunModal);
    stopTimerTicking();
    runningTickHandle = setInterval(tickTimerRun, 1000);
    acquireWakeLock();
  }

  function stopTimerRunEngine() {
    stopTimerTicking();
    releaseWakeLock();
  }

  timerRunPauseBtnEl.addEventListener("click", () => {
    if (timerRunControlsEl.classList.contains("is-complete")) return;
    if (runningTickHandle) {
      stopTimerTicking();
      timerRunPauseBtnEl.textContent = "Reanudar";
    } else {
      runningTickHandle = setInterval(tickTimerRun, 1000);
      timerRunPauseBtnEl.textContent = "Pausar";
    }
  });
  timerRunSkipBtnEl.addEventListener("click", () => {
    if (timerRunControlsEl.classList.contains("is-complete")) return;
    if (runningPhase === "countdown") startFirstInterval();
    else advanceTimerRun();
  });
  timerRunStopBtnEl.addEventListener("click", () => {
    stopTimerRunEngine();
    closeModal(timerRunModal);
  });
  document.getElementById("closeTimerRunModal").addEventListener("click", () => {
    stopTimerRunEngine();
    closeModal(timerRunModal);
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
  const setSubmitBtnEl = document.getElementById("setSubmitBtn");
  const setTypeToggleEl = document.getElementById("setTypeToggle");
  const suggestedSetHintEl = document.getElementById("suggestedSetHint");
  const suggestedSetValueEl = document.getElementById("suggestedSetValue");
  const useSuggestedSetBtnEl = document.getElementById("useSuggestedSetBtn");
  const restTimerBannerEl = document.getElementById("restTimerBanner");
  const restTimerTimeEl = document.getElementById("restTimerTime");
  const restTimerSkipBtnEl = document.getElementById("restTimerSkipBtn");

  const SET_TYPE_LABELS = { warmup: "Calent.", failure: "Fallo", dropset: "Drop" };

  let editingSetId = null;
  let currentSetType = "normal";
  let currentLastPerformance = null;

  function formatSet(s) {
    return s.weightKg !== null && s.weightKg !== undefined ? `${s.weightKg}×${s.reps}` : `${s.reps} reps`;
  }

  function setActiveSetTypeButton(type) {
    setTypeToggleEl.querySelectorAll(".segmented-btn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  }

  setTypeToggleEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    currentSetType = btn.dataset.type;
    setActiveSetTypeButton(currentSetType);
  });

  function nextSuggestedSet(ex, last) {
    if (!last) return null;
    return last.ex.sets[ex.sets.length] || null;
  }

  function renderSuggestedSetHint(ex) {
    const suggestion = ex ? nextSuggestedSet(ex, currentLastPerformance) : null;
    if (!suggestion) {
      suggestedSetHintEl.hidden = true;
      return;
    }
    suggestedSetHintEl.hidden = false;
    suggestedSetValueEl.textContent = formatSet(suggestion);
  }

  useSuggestedSetBtnEl.addEventListener("click", () => {
    const ex = currentWorkoutExercises().find((e) => e.id === currentExerciseId);
    const suggestion = ex ? nextSuggestedSet(ex, currentLastPerformance) : null;
    if (!suggestion) return;
    setWeightEl.value = suggestion.weightKg !== null && suggestion.weightKg !== undefined ? suggestion.weightKg : "";
    setRepsEl.value = suggestion.reps;
    setRepsEl.focus();
  });

  /* ---------- Rest timer ---------- */

  let restTimerInterval = null;
  let restTimerRemaining = 0;

  function formatDuration(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function stopRestTimer() {
    if (restTimerInterval) {
      clearInterval(restTimerInterval);
      restTimerInterval = null;
    }
    restTimerBannerEl.hidden = true;
  }

  function tickRestTimer() {
    restTimerRemaining -= 1;
    if (restTimerRemaining <= 0) {
      stopRestTimer();
      playBeep();
      showToast("Descanso terminado");
      return;
    }
    restTimerTimeEl.textContent = formatDuration(restTimerRemaining);
  }

  function startRestTimer(seconds) {
    // Rest starts immediately (no lead-in, no start beep) — this just
    // primes the audio context from the current user gesture so the
    // end-of-rest beep, fired later from a setInterval tick, is allowed to play.
    ensureAudioContext();
    const duration = seconds || state.workoutGoal.restSeconds || 90;
    if (restTimerInterval) clearInterval(restTimerInterval);
    restTimerRemaining = duration;
    restTimerTimeEl.textContent = formatDuration(restTimerRemaining);
    restTimerBannerEl.hidden = false;
    restTimerBannerEl.querySelectorAll(".rest-timer-preset").forEach((b) => {
      b.classList.toggle("active", parseInt(b.dataset.secs, 10) === duration);
    });
    restTimerInterval = setInterval(tickRestTimer, 1000);
  }

  restTimerBannerEl.addEventListener("click", (e) => {
    const presetBtn = e.target.closest(".rest-timer-preset");
    if (!presetBtn) return;
    const secs = parseInt(presetBtn.dataset.secs, 10);
    state.workoutGoal.restSeconds = secs;
    saveData(state);
    startRestTimer(secs);
  });
  restTimerSkipBtnEl.addEventListener("click", stopRestTimer);

  function openExerciseDetail(exerciseId) {
    currentExerciseId = exerciseId;
    const ex = currentWorkoutExercises().find((e) => e.id === exerciseId);
    if (!ex) return;
    exerciseDetailTitleEl.textContent = ex.name;

    currentLastPerformance = findLastExerciseSets(ex.name, currentWorkoutDayKey());
    if (currentLastPerformance) {
      lastPerformanceHintEl.hidden = false;
      lastPerformanceHintEl.textContent = `Última vez (${formatShortDate(currentLastPerformance.dayKey)}): ${currentLastPerformance.ex.sets.map(formatSet).join(", ")}`;
    } else {
      lastPerformanceHintEl.hidden = true;
    }

    stopRestTimer();
    renderSetList();
    editingSetId = null;
    setForm.reset();
    currentSetType = "normal";
    setActiveSetTypeButton("normal");
    setSubmitBtnEl.textContent = "Añadir serie";
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
        const prevSet = currentLastPerformance ? currentLastPerformance.ex.sets[i] : null;
        const tag = s.type && s.type !== "normal"
          ? `<span class="set-type-tag set-type-tag--${s.type}">${SET_TYPE_LABELS[s.type]}</span>`
          : "";
        row.innerHTML = `
          <button type="button" class="row-main row-edit" data-id="${s.id}">
            <span class="row-name-line">
              <span class="row-name">Serie ${i + 1}</span>
              ${tag}
            </span>
            <span class="row-qty">${formatSet(s)}${prevSet ? ` · <span class="row-prev">antes ${formatSet(prevSet)}</span>` : ""}</span>
          </button>
          <button class="row-del" data-id="${s.id}" aria-label="Quitar">${ICON_X}</button>
        `;
        setListEl.appendChild(row);
      });
    }
    renderSuggestedSetHint(ex);
  }

  document.getElementById("closeExerciseDetailModal").addEventListener("click", () => {
    closeModal(exerciseDetailModal);
    stopRestTimer();
  });

  /* ---------- Exercise edit (rename + progression group) ---------- */

  const exerciseEditModal = document.getElementById("exerciseEditModal");
  const exerciseEditNameInputEl = document.getElementById("exerciseEditNameInput");
  const exerciseEditProgressionInputEl = document.getElementById("exerciseEditProgressionInput");
  const progressionGroupListEl = document.getElementById("progressionGroupList");
  const exerciseNameListEl = document.getElementById("exerciseNameList");

  function collectAllExerciseNames() {
    const names = new Set();
    Object.values(state.workouts).forEach((day) => {
      day.exercises.forEach((ex) => names.add(ex.name));
    });
    return Array.from(names).sort();
  }

  function collectProgressionGroups() {
    const groups = new Set();
    Object.values(state.workouts).forEach((day) => {
      day.exercises.forEach((ex) => { if (ex.progressionGroup) groups.add(ex.progressionGroup); });
    });
    return Array.from(groups).sort();
  }

  function refreshExerciseNameList() {
    exerciseNameListEl.innerHTML = collectAllExerciseNames().map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  }

  function openExerciseEdit() {
    const ex = currentWorkoutExercises().find((e) => e.id === currentExerciseId);
    if (!ex) return;
    exerciseEditNameInputEl.value = ex.name;
    exerciseEditProgressionInputEl.value = ex.progressionGroup || "";
    refreshExerciseNameList();
    progressionGroupListEl.innerHTML = collectProgressionGroups().map((g) => `<option value="${escapeHtml(g)}"></option>`).join("");
    openModal(exerciseEditModal);
    setTimeout(() => exerciseEditNameInputEl.focus(), 50);
  }

  document.getElementById("editExerciseBtn").addEventListener("click", () => {
    closeModal(exerciseDetailModal);
    openExerciseEdit();
  });

  function closeExerciseEditModalAndReturn() {
    closeModal(exerciseEditModal);
    openExerciseDetail(currentExerciseId);
  }
  document.getElementById("closeExerciseEditModal").addEventListener("click", closeExerciseEditModalAndReturn);

  document.getElementById("saveExerciseEditBtn").addEventListener("click", () => {
    const name = exerciseEditNameInputEl.value.trim();
    if (!name) {
      showToast("Indica un nombre");
      return;
    }
    const ex = currentWorkoutExercises().find((e) => e.id === currentExerciseId);
    if (!ex) return;
    ex.name = name;
    ex.progressionGroup = exerciseEditProgressionInputEl.value.trim() || null;
    saveData(state);
    closeModal(exerciseEditModal);
    renderWorkoutDay();
    openExerciseDetail(ex.id);
  });

  setListEl.addEventListener("click", (e) => {
    const delBtn = e.target.closest(".row-del");
    if (delBtn) {
      const ex = currentWorkoutExercises().find((e2) => e2.id === currentExerciseId);
      if (!ex) return;
      const idx = ex.sets.findIndex((s) => s.id === delBtn.dataset.id);
      if (idx >= 0) {
        ex.sets.splice(idx, 1);
        saveData(state);
        renderSetList();
        renderWorkoutDay();
        if (editingSetId === delBtn.dataset.id) {
          editingSetId = null;
          setForm.reset();
          currentSetType = "normal";
          setActiveSetTypeButton("normal");
          setSubmitBtnEl.textContent = "Añadir serie";
        }
      }
      return;
    }
    const editBtn = e.target.closest(".row-edit");
    if (editBtn) {
      const ex = currentWorkoutExercises().find((e2) => e2.id === currentExerciseId);
      const s = ex && ex.sets.find((s2) => s2.id === editBtn.dataset.id);
      if (!s) return;
      editingSetId = s.id;
      setWeightEl.value = s.weightKg !== null && s.weightKg !== undefined ? s.weightKg : "";
      setRepsEl.value = s.reps;
      currentSetType = s.type || "normal";
      setActiveSetTypeButton(currentSetType);
      setSubmitBtnEl.textContent = "Guardar cambios";
      setRepsEl.focus();
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

    if (editingSetId) {
      const s = ex.sets.find((s2) => s2.id === editingSetId);
      if (!s) return;
      s.weightKg = weight;
      s.reps = reps;
      s.type = currentSetType;
      saveData(state);
      renderSetList();
      renderWorkoutDay();
      editingSetId = null;
      setForm.reset();
      currentSetType = "normal";
      setActiveSetTypeButton("normal");
      setSubmitBtnEl.textContent = "Añadir serie";
      setRepsEl.focus();
      return;
    }

    ex.sets.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, weightKg: weight, reps, type: currentSetType, addedAt: Date.now() });
    saveData(state);
    renderSetList();
    renderWorkoutDay();
    startRestTimer();
    // deliberately don't reset the form — same weight/reps stay filled in so
    // repeating an identical set (e.g. "3 sets of the same") is a single tap
    setRepsEl.focus();
    setRepsEl.select();
  });

  /* ---------- Analytics ---------- */

  let analyticsPeriodDays = 7;

  function dayMacroTotals(entries) {
    return entries.reduce((acc, e) => {
      acc.protein += e.protein || 0;
      acc.fat += e.fat || 0;
      acc.carbs += e.carbs || 0;
      return acc;
    }, { protein: 0, fat: 0, carbs: 0 });
  }

  function getRecentDays(n) {
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
      const key = todayKey(-i);
      const entries = (state.days[key] && state.days[key].entries) || [];
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      result.push({ date: key, total, ...dayMacroTotals(entries) });
    }
    return result;
  }

  function getAllDays() {
    const dayKeysWithFood = Object.keys(state.days).filter((k) => state.days[k].entries.length > 0);
    const weightDateKeys = state.weightLog.map((w) => w.date);
    const allKeys = [...dayKeysWithFood, ...weightDateKeys];
    if (allKeys.length === 0) return getRecentDays(7);
    const earliest = allKeys.reduce((min, k) => (k < min ? k : min));

    const cursor = parseDateKey(earliest);
    const end = parseDateKey(todayKey(0));

    // Guard against a corrupted or malformed date key (e.g. from a bad import
    // file) sending this into a years-long day-by-day loop that freezes the tab.
    const MAX_DAYS_BACK = 20 * 366;
    const daysSpan = Math.round((end - cursor) / DAY_MS);
    if (!(daysSpan >= 0) || daysSpan > MAX_DAYS_BACK) {
      console.error("getAllDays: implausible date range from", earliest, "— falling back to last 90 days");
      return getRecentDays(90);
    }

    const result = [];
    while (cursor <= end) {
      const key = formatDateKey(cursor);
      const entries = (state.days[key] && state.days[key].entries) || [];
      const total = entries.reduce((sum, e) => sum + e.calories, 0);
      result.push({ date: key, total, ...dayMacroTotals(entries) });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  const CHART_LEFT_MARGIN = 32;

  // Catmull-Rom-to-bezier smoothing (tension 6, the standard conversion) so
  // trend lines read as curves instead of sharp polyline angles.
  function smoothPath(points) {
    if (points.length < 2) return "";
    if (points.length === 2) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
    let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function buildYAxis(maxVal, minVal, yFor, w, tickCount = 3, formatTick = Math.round) {
    let gridlines = "";
    for (let t = 0; t <= tickCount; t++) {
      const v = minVal + ((maxVal - minVal) / tickCount) * t;
      const y = yFor(v);
      gridlines += `<line x1="${CHART_LEFT_MARGIN}" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1"></line>`;
      gridlines += `<text x="${(CHART_LEFT_MARGIN - 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--ink-faint)">${formatTick(v)}</text>`;
    }
    return gridlines;
  }

  function buildXAxisDates(days, x, h) {
    const showEvery = days.length > 10 ? Math.ceil(days.length / 7) : 1;
    let labels = "";
    days.forEach((d, i) => {
      if (i % showEvery !== 0 && i !== days.length - 1) return;
      const day = Number(d.date.slice(8, 10));
      labels += `<text x="${x(i).toFixed(1)}" y="${h - 4}" font-size="9" text-anchor="middle" fill="var(--ink-faint)">${day}</text>`;
    });
    return labels;
  }

  function buildCalorieChart(days, min, max, expenditure) {
    const h = 150, padTop = 6, padBottom = 20;
    const chartH = h - padTop - padBottom;
    const scrollable = days.length > 30;
    const plotW = scrollable ? days.length * 16 : 300 - CHART_LEFT_MARGIN;
    const w = plotW + CHART_LEFT_MARGIN;
    const barW = plotW / days.length;
    const maxVal = Math.max(max || 0, expenditure || 0, ...days.map((d) => d.total), 1) * 1.08;
    const yFor = (v) => padTop + chartH - (v / maxVal) * chartH;
    const xFor = (i) => CHART_LEFT_MARGIN + i * barW + barW / 2;

    const gridlines = buildYAxis(maxVal, 0, yFor, w);

    let band = "";
    if (max > min) {
      const bandY1 = yFor(min);
      const bandY2 = yFor(max);
      band = `<rect x="${CHART_LEFT_MARGIN}" y="${bandY2.toFixed(1)}" width="${plotW}" height="${(bandY1 - bandY2).toFixed(1)}" fill="var(--accent-soft)"></rect>`;
    }

    let bars = "";
    days.forEach((d, i) => {
      const barH = (d.total / maxVal) * chartH;
      const x = CHART_LEFT_MARGIN + i * barW + barW * 0.18;
      const bw = barW * 0.64;
      const y = padTop + chartH - barH;
      const inRange = d.total >= min && d.total <= max;
      const fill = d.total === 0 ? "var(--line)" : inRange ? "url(#calorieBarGradient)" : "var(--ink-faint)";
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, barH).toFixed(1)}" rx="3" fill="${fill}"></rect>`;
    });

    // Flat expenditure (estimated TDEE) reference line — "energy balance":
    // bars above it mean a surplus that day, below means a deficit.
    let expenditureLine = "";
    if (expenditure > 0) {
      const ey = yFor(expenditure).toFixed(1);
      expenditureLine = `<line x1="${CHART_LEFT_MARGIN}" y1="${ey}" x2="${w}" y2="${ey}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"></line>`;
    }

    const labels = buildXAxisDates(days, xFor, h);
    const defs = `<defs><linearGradient id="calorieBarGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"></stop><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.7"></stop></linearGradient></defs>`;

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${defs}${gridlines}${band}${bars}${expenditureLine}${labels}</svg>`;
  }

  function computeEma(sortedEntries, alpha = 0.25) {
    let ema = null;
    return sortedEntries.map((e) => {
      ema = ema === null ? e.weightKg : alpha * e.weightKg + (1 - alpha) * ema;
      return { date: e.date, raw: e.weightKg, ema };
    });
  }

  function buildWeightChart(withEma) {
    const h = 150, padTop = 10, padBottom = 20;
    const chartH = h - padTop - padBottom;
    const scrollable = withEma.length > 20;
    const plotW = scrollable ? Math.max(300, withEma.length * 20) : 300 - CHART_LEFT_MARGIN;
    const w = plotW + CHART_LEFT_MARGIN;
    const values = withEma.flatMap((p) => [p.raw, p.ema]);
    const minV = Math.min(...values), maxV = Math.max(...values);
    const range = Math.max(maxV - minV, 0.5);
    const x = (i) => (withEma.length <= 1 ? CHART_LEFT_MARGIN + plotW / 2 : (i / (withEma.length - 1)) * plotW + CHART_LEFT_MARGIN);
    const y = (v) => padTop + chartH - ((v - minV) / range) * chartH;

    const gridlines = buildYAxis(maxV, minV, y, w, 3, (v) => v.toFixed(1));

    const dots = withEma.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.raw).toFixed(1)}" r="2.5" fill="var(--ink-faint)"></circle>`).join("");
    const emaPts = withEma.map((p, i) => ({ x: x(i), y: y(p.ema) }));
    const curvePath = smoothPath(emaPts);
    const baseline = (h - padBottom).toFixed(1);
    const area = withEma.length > 1
      ? `<path d="${curvePath} L${x(withEma.length - 1).toFixed(1)},${baseline} L${x(0).toFixed(1)},${baseline} Z" fill="url(#weightAreaGradient)" stroke="none"></path>`
      : "";
    const line = withEma.length > 1
      ? `<path d="${curvePath}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>`
      : "";
    const labels = buildXAxisDates(withEma, x, h);
    const defs = `<defs><linearGradient id="weightAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.22"></stop><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"></stop></linearGradient></defs>`;

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${defs}${gridlines}${area}${line}${dots}${labels}</svg>`;
  }

  const MACRO_COLORS = { protein: "var(--accent)", fat: "var(--macro-fat)", carbs: "var(--macro-carbs)" };

  function buildMacroChart(days) {
    const h = 150, padTop = 10, padBottom = 20;
    const chartH = h - padTop - padBottom;
    const scrollable = days.length > 30;
    const plotW = scrollable ? days.length * 16 : 300 - CHART_LEFT_MARGIN;
    const w = plotW + CHART_LEFT_MARGIN;
    const maxVal = Math.max(...days.map((d) => Math.max(d.protein, d.fat, d.carbs)), 1) * 1.1;
    const x = (i) => (days.length <= 1 ? CHART_LEFT_MARGIN + plotW / 2 : (i / (days.length - 1)) * plotW + CHART_LEFT_MARGIN);
    const y = (v) => padTop + chartH - (v / maxVal) * chartH;

    const gridlines = buildYAxis(maxVal, 0, y, w);

    const lineFor = (key, color) => {
      if (days.length < 2) return "";
      const pts = days.map((d, i) => ({ x: x(i), y: y(d[key]) }));
      return `<path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>`;
    };

    const lines = lineFor("protein", MACRO_COLORS.protein) + lineFor("fat", MACRO_COLORS.fat) + lineFor("carbs", MACRO_COLORS.carbs);
    const labels = buildXAxisDates(days, x, h);
    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${gridlines}${lines}${labels}</svg>`;
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
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, barH).toFixed(1)}" rx="3" fill="${wk.count > 0 ? "url(#sessionsBarGradient)" : "var(--line)"}"></rect>`;
    });

    let labels = "";
    weeks.forEach((wk, i) => {
      const x = i * barW + barW / 2;
      labels += `<text x="${x.toFixed(1)}" y="${h - 4}" font-size="9" text-anchor="middle" fill="var(--ink-faint)">${formatShortDate(wk.label)}</text>`;
    });
    const defs = `<defs><linearGradient id="sessionsBarGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)"></stop><stop offset="100%" stop-color="var(--accent)" stop-opacity="0.7"></stop></linearGradient></defs>`;

    const widthAttr = scrollable ? `width="${w}"` : `width="100%"`;
    return `<svg viewBox="0 0 ${w} ${h}" ${widthAttr} style="display:block">${defs}${bars}${labels}</svg>`;
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
    renderProgressionsCard();
  }

  // A "progression group" is a free-text tag shared by two or more exercise
  // variants (e.g. "Flexiones de rodillas" and "Flexiones" both tagged
  // "Flexiones") — grouping by chronological first-use gives a natural
  // difficulty timeline without needing to predefine stages up front.
  function collectExercisesByProgressionGroup() {
    const groups = new Map();
    Object.entries(state.workouts).forEach(([dayKey, day]) => {
      day.exercises.forEach((ex) => {
        if (!ex.progressionGroup) return;
        if (!groups.has(ex.progressionGroup)) groups.set(ex.progressionGroup, new Map());
        const variants = groups.get(ex.progressionGroup);
        const key = ex.name.trim().toLowerCase();
        if (!variants.has(key)) {
          variants.set(key, { name: ex.name, firstDate: dayKey, lastDate: dayKey, sessionCount: 0, bestSet: null });
        }
        const v = variants.get(key);
        if (dayKey < v.firstDate) v.firstDate = dayKey;
        if (dayKey > v.lastDate) { v.lastDate = dayKey; v.name = ex.name; }
        if (ex.sets.length > 0) v.sessionCount += 1;
        ex.sets.forEach((s) => {
          if (!v.bestSet || isBetterSet(s, v.bestSet)) v.bestSet = s;
        });
      });
    });
    return groups;
  }

  function isBetterSet(a, b) {
    const aw = a.weightKg || 0, bw = b.weightKg || 0;
    if (aw !== bw) return aw > bw;
    return a.reps > b.reps;
  }

  function sortedVariantList(variants) {
    return Array.from(variants.values()).sort((a, b) => (a.firstDate < b.firstDate ? -1 : 1));
  }

  function renderProgressionsCard() {
    const groups = collectExercisesByProgressionGroup();
    const cardEl = document.getElementById("progressionsCard");
    const listEl = document.getElementById("progressionsList");
    listEl.innerHTML = "";
    if (groups.size === 0) {
      cardEl.hidden = true;
      return;
    }
    cardEl.hidden = false;
    Array.from(groups.keys()).sort((a, b) => a.localeCompare(b)).forEach((groupName) => {
      const variantList = sortedVariantList(groups.get(groupName));
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <button type="button" class="row-main" data-group="${escapeHtml(groupName)}">
          <span class="row-name">${escapeHtml(groupName)}</span>
          <span class="row-qty">${variantList.length} variante${variantList.length === 1 ? "" : "s"} · actual: ${escapeHtml(variantList[variantList.length - 1].name)}</span>
        </button>
      `;
      listEl.appendChild(row);
    });
  }

  function openProgressionDetail(groupName) {
    const groups = collectExercisesByProgressionGroup();
    const variants = groups.get(groupName);
    if (!variants) return;
    document.getElementById("progressionDetailTitle").textContent = groupName;
    const listEl = document.getElementById("progressionDetailList");
    listEl.innerHTML = "";
    sortedVariantList(variants).forEach((v) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="row-main">
          <span class="row-name">${escapeHtml(v.name)}</span>
          <span class="row-qty">${formatShortDate(v.firstDate)} – ${formatShortDate(v.lastDate)} · ${v.sessionCount} sesión${v.sessionCount === 1 ? "" : "es"}</span>
        </div>
        <span class="row-amount">${v.bestSet ? formatSet(v.bestSet) : "—"}</span>
      `;
      listEl.appendChild(row);
    });
    openModal(document.getElementById("progressionDetailModal"));
  }

  document.getElementById("progressionsList").addEventListener("click", (e) => {
    const btn = e.target.closest(".row-main");
    if (btn) openProgressionDetail(btn.dataset.group);
  });

  document.getElementById("closeProgressionDetailModal").addEventListener("click", () => {
    closeModal(document.getElementById("progressionDetailModal"));
  });

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
      const key = formatDateKey(cursor);
      if (hasWorkoutSession(key)) count += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }

  function computeCurrentWeekProgress() {
    const today = parseDateKey(todayKey(0));
    const start = mondayOf(today);
    const goal = state.workoutGoal.weeklySessions;
    return { done: countSessionsBetween(start, today), goal };
  }

  function computeCurrentMonthProgress() {
    const today = parseDateKey(todayKey(0));
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

  // A tiny at-a-glance line, no axes/labels — just shape. Used by the
  // insights carousel cards, distinct from the full annotated charts below.
  function buildMiniLineSparkline(values, color) {
    const w = 100, h = 32;
    if (values.length < 2) return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"></svg>`;
    const minV = Math.min(...values), maxV = Math.max(...values);
    const range = Math.max(maxV - minV, 0.0001);
    const x = (i) => (i / (values.length - 1)) * w;
    const y = (v) => 4 + (h - 8) - ((v - minV) / range) * (h - 8);
    const pts = values.map((v, i) => ({ x: x(i), y: y(v) }));
    const path = smoothPath(pts);
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  }

  function buildMiniBarSparkline(values, color) {
    const w = 100, h = 32;
    if (values.length === 0) return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}"></svg>`;
    const maxV = Math.max(...values, 1);
    const gap = 2;
    const barW = w / values.length - gap;
    const bars = values.map((v, i) => {
      const barH = Math.max(2, (v / maxV) * (h - 4));
      const x = i * (barW + gap);
      const y = h - barH;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="1.5" fill="${color}"></rect>`;
    }).join("");
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">${bars}</svg>`;
  }

  // Quick-glance summary cards shown above the full charts — mirrors the
  // "insights" carousel pattern (small card + sparkline) rather than
  // duplicating the detailed charts' axes/labels.
  function renderInsightsCarousel(days, weightWithEma) {
    const carouselEl = document.getElementById("insightsCarousel");
    const cards = [];

    if (weightWithEma.length >= 2) {
      const last = weightWithEma[weightWithEma.length - 1].raw;
      // Uses the same EMA-smoothed delta as the Weight chart's stat line
      // below, rather than raw first/last — otherwise the two "weight
      // change" figures on this screen can disagree.
      const diff = weightWithEma[weightWithEma.length - 1].ema - weightWithEma[0].ema;
      const sign = diff > 0 ? "+" : "";
      cards.push(`
        <div class="insight-card">
          <span class="insight-card-label">Peso</span>
          <span class="insight-card-value">${last.toFixed(1)} kg</span>
          <span class="insight-card-sub">${sign}${diff.toFixed(1)} kg (tendencia)</span>
          <span class="insight-card-spark">${buildMiniLineSparkline(weightWithEma.map((p) => p.raw), "var(--accent)")}</span>
        </div>
      `);
    }

    const totalKcalDays = days.filter((d) => d.total > 0);
    if (totalKcalDays.length >= 2) {
      const avgKcal = totalKcalDays.reduce((sum, d) => sum + d.total, 0) / totalKcalDays.length;
      const { min, max } = state.calorieTarget;
      const targetMid = min && max ? (min + max) / 2 : null;
      // Averages only days that were actually logged (skips 0-kcal gaps),
      // so it's spelled out here — otherwise it silently disagrees with the
      // bar chart below, which shows every day including unlogged ones.
      const sub = targetMid
        ? `${totalKcalDays.length}/${days.length} días · objetivo ${Math.round(targetMid)}`
        : `media de ${totalKcalDays.length} días registrados`;
      cards.push(`
        <div class="insight-card">
          <span class="insight-card-label">Calorías</span>
          <span class="insight-card-value">${Math.round(avgKcal)} kcal</span>
          <span class="insight-card-sub">${sub}</span>
          <span class="insight-card-spark">${buildMiniLineSparkline(days.map((d) => d.total), "var(--accent)")}</span>
        </div>
      `);
    }

    if (days.length >= 2) {
      const totalSessions = days.filter((d) => hasWorkoutSession(d.date)).length;
      cards.push(`
        <div class="insight-card">
          <span class="insight-card-label">Entrenos</span>
          <span class="insight-card-value">${totalSessions}</span>
          <span class="insight-card-sub">sesiones en el periodo</span>
          <span class="insight-card-spark">${buildMiniBarSparkline(days.map((d) => (hasWorkoutSession(d.date) ? 1 : 0)), "var(--accent)")}</span>
        </div>
      `);
    }

    carouselEl.innerHTML = cards.join("");
    carouselEl.hidden = cards.length === 0;
  }

  function renderAnalytics() {
    sessionGoalSliderEl.value = state.workoutGoal.weeklySessions;
    sessionGoalValueLabelEl.textContent = state.workoutGoal.weeklySessions;

    const days = analyticsPeriodDays === "all" ? getAllDays() : getRecentDays(analyticsPeriodDays);

    // Computed once and shared by the insights card, the stat line, and the
    // chart itself, so all three agree on the same sorted/smoothed data
    // instead of each re-deriving it slightly differently.
    const periodDates = new Set(days.map((d) => d.date));
    const weightEntriesSorted = state.weightLog
      .filter((w) => periodDates.has(w.date))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const weightWithEma = computeEma(weightEntriesSorted);

    renderInsightsCarousel(days, weightWithEma);

    const { min, max } = state.calorieTarget;
    const expenditure = estimateCurrentTdee();
    document.getElementById("calorieChart").innerHTML = buildCalorieChart(days, min, max, expenditure);
    document.getElementById("calorieChartLegend").hidden = !expenditure;

    const hasMacroData = days.some((d) => d.protein || d.fat || d.carbs);
    const macroChartEl = document.getElementById("macroChart");
    const macroChartEmptyEl = document.getElementById("macroChartEmpty");
    if (!hasMacroData) {
      macroChartEl.innerHTML = "";
      macroChartEmptyEl.hidden = false;
    } else {
      macroChartEmptyEl.hidden = true;
      macroChartEl.innerHTML = buildMacroChart(days);
    }

    const weightChartEl = document.getElementById("weightChart");
    const weightChartEmptyEl = document.getElementById("weightChartEmpty");
    const weightStatLineEl = document.getElementById("weightStatLine");
    const weightChartLegendEl = document.getElementById("weightChartLegend");
    if (weightWithEma.length === 0) {
      weightChartEl.innerHTML = "";
      weightChartEmptyEl.hidden = false;
      weightStatLineEl.hidden = true;
      weightChartLegendEl.hidden = true;
    } else {
      weightChartEmptyEl.hidden = true;
      weightChartEl.innerHTML = buildWeightChart(weightWithEma);
      weightChartLegendEl.hidden = weightWithEma.length < 2;
      if (weightWithEma.length < 2) {
        weightStatLineEl.hidden = true;
      } else {
        const avg = weightEntriesSorted.reduce((sum, w) => sum + w.weightKg, 0) / weightEntriesSorted.length;
        const diff = weightWithEma[weightWithEma.length - 1].ema - weightWithEma[0].ema;
        const sign = diff > 0 ? "+" : "";
        weightStatLineEl.hidden = false;
        weightStatLineEl.textContent = `Media: ${avg.toFixed(1)} kg · Diferencia: ${sign}${diff.toFixed(1)} kg`;
      }
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

    const spanDays = (parseDateKey(sorted[sorted.length - 1].date) - parseDateKey(sorted[0].date)) / DAY_MS;
    if (spanDays < ADAPTIVE_MIN_SPAN_DAYS) { a.suggestion = null; return; }

    const withEma = computeEma(sorted);
    const latest = withEma[withEma.length - 1];
    const cutoff = parseDateKey(latest.date);
    cutoff.setDate(cutoff.getDate() - ADAPTIVE_MIN_SPAN_DAYS);
    const cutoffStr = formatDateKey(cutoff);
    const refEntry = withEma.find((e) => e.date >= cutoffStr) || withEma[0];
    const daysBetween = (parseDateKey(latest.date) - parseDateKey(refEntry.date)) / DAY_MS;
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
