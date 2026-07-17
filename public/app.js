(function () {
  "use strict";

  // ---------- storage (browser localStorage — persists per browser/device) ----------
  const storage = {
    get(key) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const dayLabel = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
  };

  let state = {
    settings: storage.get("thali-settings") || { mode: "manual", dailyCalories: 2000, dailyProtein: 120 },
    log: storage.get("thali-log") || {} // { "2026-07-12": [ {id,time,name,calories,protein,thumb} ] }
  };

  function saveSettings() {
    storage.set("thali-settings", state.settings);
  }
  function saveLog() {
    storage.set("thali-log", state.log);
  }

  // ---------- rendering ----------
  function todaysEntries() {
    return state.log[todayKey()] || [];
  }

  function render() {
    renderPlate();
    renderEntries();
    renderChart();
  }

  function renderPlate() {
    const entries = todaysEntries();
    const cal = entries.reduce((s, e) => s + e.calories, 0);
    const pro = entries.reduce((s, e) => s + e.protein, 0);
    const calLimit = state.settings.dailyCalories;
    const proLimit = state.settings.dailyProtein;

    const calCirc = 2 * Math.PI * 86;
    const proCirc = 2 * Math.PI * 64;
    const calFrac = Math.min(cal / calLimit, 1);
    const proFrac = Math.min(pro / proLimit, 1);

    document.getElementById("calRing").setAttribute("stroke-dasharray", calFrac * calCirc + " " + calCirc);
    document.getElementById("proRing").setAttribute("stroke-dasharray", proFrac * proCirc + " " + proCirc);
    document.getElementById("calText").textContent = Math.round(cal);
    document.getElementById("calSubText").textContent = "of " + calLimit + " cal";

    const statusEl = document.getElementById("statusLine");
    if (entries.length === 0) {
      statusEl.className = "status-line status-empty";
      statusEl.textContent = "Your plate's empty today. Log a meal to get started.";
    } else if (cal > calLimit) {
      statusEl.className = "status-line status-over";
      statusEl.textContent = "You've gone " + Math.round(cal - calLimit) + " cal over today's limit.";
    } else {
      statusEl.className = "status-line status-ok";
      const remaining = Math.round(calLimit - cal);
      statusEl.textContent = remaining + " cal and " + Math.max(0, Math.round(proLimit - pro)) + "g protein left today.";
    }
  }

  function renderEntries() {
    const entries = todaysEntries();
    const listEl = document.getElementById("entriesList");
    const totalEl = document.getElementById("dayTotalText");
    if (entries.length === 0) {
      listEl.innerHTML = '<div class="empty-state">Nothing logged yet today.</div>';
      totalEl.textContent = "";
      return;
    }
    const cal = entries.reduce((s, e) => s + e.calories, 0);
    const pro = entries.reduce((s, e) => s + e.protein, 0);
    totalEl.textContent = Math.round(cal) + " cal · " + Math.round(pro) + "g protein";

    listEl.innerHTML = entries
      .slice()
      .reverse()
      .map(
        (e) => `
      <div class="entry">
        <div class="entry-left">
          ${e.thumb ? `<img class="entry-thumb" src="${e.thumb}">` : `<div class="entry-thumb"></div>`}
          <div>
            <div class="entry-name">${escapeHtml(e.name)}</div>
            <div class="entry-time">${e.time}</div>
          </div>
        </div>
        <div class="entry-stats">
          <span class="c">${Math.round(e.calories)} cal</span>
          <span class="p">${Math.round(e.protein)}g</span>
          <button class="entry-del" data-id="${e.id}" title="Remove">✕</button>
        </div>
      </div>
    `
      )
      .join("");

    listEl.querySelectorAll(".entry-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        state.log[todayKey()] = todaysEntries().filter((e) => e.id !== id);
        saveLog();
        render();
      });
    });
  }

  function renderChart() {
    const calLimit = state.settings.dailyCalories;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const entries = state.log[key] || [];
      const cal = entries.reduce((s, e) => s + e.calories, 0);
      days.push({ key, cal });
    }
    const maxVal = Math.max(calLimit, ...days.map((d) => d.cal), 1) * 1.1;
    const chartEl = document.getElementById("chartArea");
    chartEl.innerHTML = days
      .map((d) => {
        const h = Math.max((d.cal / maxVal) * 140, d.cal > 0 ? 4 : 0);
        const over = d.cal > calLimit;
        return `
        <div class="chart-col">
          <div class="bar-val">${d.cal > 0 ? Math.round(d.cal) : ""}</div>
          <div class="bar-stack" style="height:140px;">
            <div class="bar-cal" style="height:${h}px; background:${over ? "var(--chili)" : "var(--saffron)"};"></div>
          </div>
          <div class="bar-day">${dayLabel(d.key)}</div>
        </div>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- talking to our own backend (which holds the OpenRouter key) ----------
  async function estimateFromText(text) {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text })
    });
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(data.error || "Request failed");
      e.code = data.code || null;
      throw e;
    }
    return data;
  }

  async function estimateFromImage(base64Data, mediaType) {
    const res = await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "image", imageBase64: base64Data, mediaType })
    });
    const data = await res.json();
    if (!res.ok) {
      const e = new Error(data.error || "Request failed");
      e.code = data.code || null;
      throw e;
    }
    return data;
  }

  // Resize/compress a photo client-side before sending it — keeps requests fast
  // and small (useful for serverless request-size limits too).
  function resizeImageFile(file, maxDim = 1024, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve({ dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setBusy(isBusy, msg) {
    const el = document.getElementById("analyzingArea");
    el.innerHTML = isBusy ? `<div class="analyzing"><span class="spinner"></span>${msg || "Reading your meal…"}</div>` : "";
    document.getElementById("logTextBtn").disabled = isBusy;
  }
  function setError(msg) {
    const el = document.getElementById("errorArea");
    el.innerHTML = msg ? `<div class="error-msg">${escapeHtml(msg)}</div>` : "";
  }

  function addEntry(result, thumb) {
    const entries = todaysEntries();
    entries.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      time: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
      name: result.name || "Meal",
      calories: Number(result.calories) || 0,
      protein: Number(result.protein_g) || 0,
      thumb: thumb || null
    });
    state.log[todayKey()] = entries;
    saveLog();
    render();
  }

  // ---------- event wiring ----------
  let pendingPhoto = null; // {base64, mediaType, previewUrl}

  document.getElementById("photoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    try {
      const { dataUrl, base64, mediaType } = await resizeImageFile(file);
      pendingPhoto = { base64, mediaType, previewUrl: dataUrl };
      renderPreview();
      await runPhotoAnalysis();
    } catch (err) {
      setError("Couldn't read that photo — try a different one.");
    }
  });

  function renderPreview() {
    const el = document.getElementById("previewArea");
    if (!pendingPhoto) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <div class="preview-thumb">
        <img src="${pendingPhoto.previewUrl}">
        <span>Photo ready</span>
        <button id="clearPhoto">remove</button>
      </div>`;
    document.getElementById("clearPhoto").addEventListener("click", () => {
      pendingPhoto = null;
      document.getElementById("photoInput").value = "";
      renderPreview();
    });
  }

  async function runPhotoAnalysis() {
    if (!pendingPhoto) return;
    setError("");
    setBusy(true, "Looking at your photo…");
    try {
      const result = await estimateFromImage(pendingPhoto.base64, pendingPhoto.mediaType);
      addEntry(result, pendingPhoto.previewUrl);
      pendingPhoto = null;
      document.getElementById("photoInput").value = "";
      renderPreview();
    } catch (err) {
      if (err.code === "not_food") {
        setError(err.message);
      } else {
        setError("Couldn't read that meal — try describing it in words instead. (" + err.message + ")");
      }
    } finally {
      setBusy(false);
    }
  }

  document.getElementById("logTextBtn").addEventListener("click", async () => {
    const text = document.getElementById("mealText").value.trim();
    if (!text) {
      setError("Type what you ate first.");
      return;
    }
    setError("");
    setBusy(true, "Estimating…");
    try {
      const result = await estimateFromText(text);
      addEntry(result, null);
      document.getElementById("mealText").value = "";
    } catch (err) {
      if (err.code === "not_food") {
        setError(err.message);
      } else {
        setError("Couldn't estimate that meal — try rephrasing it. (" + err.message + ")");
      }
    } finally {
      setBusy(false);
    }
  });

  document.getElementById("mealText").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("logTextBtn").click();
    }
  });

  // ---------- settings modal ----------
  const modal = document.getElementById("settingsModal");
  document.getElementById("openSettings").addEventListener("click", () => {
    document.getElementById("manualCal").value = state.settings.dailyCalories;
    document.getElementById("manualPro").value = state.settings.dailyProtein;
    modal.classList.add("show");
  });
  document.getElementById("closeSettings").addEventListener("click", () => modal.classList.remove("show"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("show");
  });

  const tabManual = document.getElementById("tabManual");
  const tabCompute = document.getElementById("tabCompute");
  tabManual.addEventListener("click", () => {
    tabManual.classList.add("active");
    tabCompute.classList.remove("active");
    document.getElementById("manualPane").style.display = "block";
    document.getElementById("computePane").style.display = "none";
  });
  tabCompute.addEventListener("click", () => {
    tabCompute.classList.add("active");
    tabManual.classList.remove("active");
    document.getElementById("computePane").style.display = "block";
    document.getElementById("manualPane").style.display = "none";
    updateComputedPreview();
  });

  function computePlan() {
    const sex = document.querySelector('input[name="sex"]:checked').value;
    const cur = parseFloat(document.getElementById("curWeight").value);
    const tgt = parseFloat(document.getElementById("tgtWeight").value);
    const height = parseFloat(document.getElementById("height").value);
    const age = parseFloat(document.getElementById("age").value);
    let weeksVal = parseFloat(document.getElementById("weeks").value);
    const weeksUnit = document.getElementById("weeksUnit").value;
    if (weeksUnit === "months") weeksVal = weeksVal * 4.345;

    if (![cur, tgt, height, age, weeksVal].every((v) => !isNaN(v) && v > 0)) return null;

    const bmr = sex === "male" ? 10 * cur + 6.25 * height - 5 * age + 5 : 10 * cur + 6.25 * height - 5 * age - 161;
    const activity = parseFloat(document.getElementById("activity").value);
    const tdee = bmr * activity;

    const weightChangeKg = tgt - cur;
    const days = weeksVal * 7;
    const dailyAdjustment = (weightChangeKg * 7700) / days;
    let dailyCalories = Math.round(tdee + dailyAdjustment);

    const floor = sex === "male" ? 1500 : 1200;
    let warning = null;
    if (dailyCalories < floor) {
      dailyCalories = floor;
      warning = "That pace would put you below a safe daily minimum, so the limit's been capped at " + floor + " cal. Consider a longer timeframe.";
    }
    const dailyProtein = Math.round(Math.max(cur, tgt) * 1.8);

    return { dailyCalories, dailyProtein, tdee: Math.round(tdee), weightChangeKg, warning };
  }

  function updateComputedPreview() {
    const box = document.getElementById("computedPreview");
    const plan = computePlan();
    if (!plan) {
      box.innerHTML = "Fill in the fields above to see your daily limit.";
      return;
    }
    const dir = plan.weightChangeKg < 0 ? "lose" : plan.weightChangeKg > 0 ? "gain" : "maintain";
    box.innerHTML =
      `Maintenance is about <strong>${plan.tdee} cal/day</strong>. To ${dir} ${Math.abs(plan.weightChangeKg).toFixed(1)}kg in your timeframe, your daily limit works out to <strong>${plan.dailyCalories} cal</strong> and <strong>${plan.dailyProtein}g protein</strong>.` +
      (plan.warning ? `<br><br>⚠ ${plan.warning}` : "");
  }

  ["curWeight", "tgtWeight", "height", "age", "weeks", "weeksUnit", "activity"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateComputedPreview);
    document.getElementById(id).addEventListener("change", updateComputedPreview);
  });
  document.querySelectorAll('input[name="sex"]').forEach((r) => r.addEventListener("change", updateComputedPreview));

  document.getElementById("saveSettings").addEventListener("click", () => {
    if (tabCompute.classList.contains("active")) {
      const plan = computePlan();
      if (!plan) {
        alert("Fill in all fields to work out a limit.");
        return;
      }
      state.settings = { mode: "computed", dailyCalories: plan.dailyCalories, dailyProtein: plan.dailyProtein };
    } else {
      const cal = parseFloat(document.getElementById("manualCal").value);
      const pro = parseFloat(document.getElementById("manualPro").value);
      if (!cal || !pro) {
        alert("Enter both a calorie and protein limit.");
        return;
      }
      state.settings = { mode: "manual", dailyCalories: cal, dailyProtein: pro };
    }
    saveSettings();
    modal.classList.remove("show");
    render();
  });

  render();
})();
