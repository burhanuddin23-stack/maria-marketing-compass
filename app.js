const DATA_URL = "./data/marketing-companies.json";
const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = "urban-design-shortlist";

const locationFilter = document.getElementById("locationFilter");
const disciplineFilter = document.getElementById("disciplineFilter");
const usOpeningsTableBody = document.getElementById("usOpeningsTableBody");
const europeOpeningsTableBody = document.getElementById("europeOpeningsTableBody");
const directoryTableBody = document.getElementById("directoryTableBody");
const seenTableBody = document.getElementById("seenTableBody");
const alertFeed = document.getElementById("alertFeed");
const notificationsToggle = document.getElementById("notificationsToggle");
const watchUsToggle = document.getElementById("watchUsToggle");
const watchEuropeToggle = document.getElementById("watchEuropeToggle");
const watchDirectoryToggle = document.getElementById("watchDirectoryToggle");
const refreshFeedButton = document.getElementById("refreshFeedButton");
const usOpeningsCount = document.getElementById("usOpeningsCount");
const europeOpeningsCount = document.getElementById("europeOpeningsCount");
const directoryCount = document.getElementById("directoryCount");
const featuredQuote = document.getElementById("featuredQuote");
const syncState = document.getElementById("syncState");
const feedTimestamp = document.getElementById("feedTimestamp");
const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

const defaultPreferences = {
  notifications: false,
  watchUs: true,
  watchEurope: true,
  watchDirectory: true,
  notifiedAlertIds: [],
  tracking: {},
};

const state = {
  usOpenings: [],
  europeUkOpenings: [],
  generalDirectory: [],
  motivationalQuotes: [],
  updatedAt: null,
  pollingHandle: null,
  isRefreshing: false,
};

let preferences = loadPreferences();

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...defaultPreferences, ...saved };
  } catch {
    return { ...defaultPreferences };
  }
}

function savePreferences() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore storage failures.
  }
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAllEntries() {
  return [...state.usOpenings, ...state.europeUkOpenings, ...state.generalDirectory];
}

function populateFilters() {
  const locations = [...new Set(getAllEntries().map((entry) => entry.locationLabel))].sort();
  const disciplines = [...new Set(getAllEntries().flatMap((entry) => entry.focus))].sort();

  const selectedLocation = locationFilter.value || "all";
  const selectedDiscipline = disciplineFilter.value || "all";

  locationFilter.innerHTML =
    '<option value="all">All locations</option>' +
    locations.map((item) => `<option value="${item}">${item}</option>`).join("");
  disciplineFilter.innerHTML =
    '<option value="all">All disciplines</option>' +
    disciplines.map((item) => `<option value="${item}">${item}</option>`).join("");

  locationFilter.value = locations.includes(selectedLocation) ? selectedLocation : "all";
  disciplineFilter.value = disciplines.includes(selectedDiscipline) ? selectedDiscipline : "all";
}

function matchesFilter(entry) {
  const locationMatches =
    locationFilter.value === "all" || entry.locationLabel === locationFilter.value;
  const disciplineMatches =
    disciplineFilter.value === "all" || entry.focus.includes(disciplineFilter.value);
  return locationMatches && disciplineMatches;
}

function renderPills(items) {
  return `<div class="pill-list">${items.map((item) => `<span class="pill">${item}</span>`).join("")}</div>`;
}

function buildOpenLink(entry) {
  const href = entry.applyUrl || entry.siteUrl;
  const label = entry.applyUrl ? "Careers" : "Website";
  return `<a class="link-chip" href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
}

function getTracking(id) {
  return preferences.tracking[id] || { viewed: false, applied: false };
}

function renderTrackingControls(id) {
  const tracking = getTracking(id);
  return `
    <div class="track-boxes">
      <label><input type="checkbox" data-track-id="${id}" data-track-field="viewed" ${tracking.viewed ? "checked" : ""} />Viewed</label>
      <label><input type="checkbox" data-track-id="${id}" data-track-field="applied" ${tracking.applied ? "checked" : ""} />Applied</label>
    </div>
  `;
}

function createOpeningRow(entry) {
  return `
    <tr>
      <td data-label="Firm">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.fit}</div>
      </td>
      <td data-label="Base">${entry.locationLabel}</td>
      <td data-label="Region">${entry.regionGroup}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Route">
        <div class="company-name">${entry.status}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="Added">${entry.addedOn}</td>
      <td data-label="Open">${buildOpenLink(entry)}</td>
      <td data-label="Track">${renderTrackingControls(entry.id)}</td>
    </tr>
  `;
}

function createDirectoryRow(entry) {
  return `
    <tr>
      <td data-label="Firm">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="Base">${entry.locationLabel}</td>
      <td data-label="Region">${entry.regionGroup}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Note">
        <div class="company-name">${entry.hiringState}</div>
        <div class="sub-copy">${entry.note}</div>
      </td>
      <td data-label="Added">${entry.addedOn}</td>
      <td data-label="Open">${buildOpenLink(entry)}</td>
      <td data-label="Track">${renderTrackingControls(entry.id)}</td>
    </tr>
  `;
}

function renderTable(body, entries, rowBuilder, emptyMessage, columnCount) {
  const filtered = entries.filter(matchesFilter);
  body.innerHTML = filtered.length
    ? filtered.map(rowBuilder).join("")
    : `<tr><td colspan="${columnCount}"><div class="empty-state">${emptyMessage}</div></td></tr>`;
}

function collectSeenRows() {
  const allEntries = [
    ...state.usOpenings.map((entry) => ({ ...entry, type: "US opening", note: entry.status })),
    ...state.europeUkOpenings.map((entry) => ({ ...entry, type: "Europe / UK", note: entry.status })),
    ...state.generalDirectory.map((entry) => ({ ...entry, type: "Directory", note: entry.hiringState })),
  ];

  return allEntries.filter((entry) => {
    const tracking = getTracking(entry.id);
    return tracking.viewed || tracking.applied;
  });
}

function renderSeen() {
  const rows = collectSeenRows();

  if (rows.length === 0) {
    seenTableBody.innerHTML =
      '<tr><td colspan="5"><div class="empty-state">Tracked firms will appear here after you tick Viewed or Applied.</div></td></tr>';
    return;
  }

  seenTableBody.innerHTML = rows
    .map((entry) => {
      const tracking = getTracking(entry.id);
      const status = [tracking.viewed ? "Viewed" : null, tracking.applied ? "Applied" : null]
        .filter(Boolean)
        .join(" • ");

      return `
        <tr>
          <td data-label="Firm">
            <div class="company-name">${entry.name}</div>
            <div class="sub-copy">${entry.note}</div>
          </td>
          <td data-label="Type">${entry.type}</td>
          <td data-label="Base">${entry.locationLabel}</td>
          <td data-label="Status">${status}</td>
          <td data-label="Open">${buildOpenLink(entry)}</td>
        </tr>
      `;
    })
    .join("");
}

function collectUpdates() {
  const updates = [];

  if (preferences.watchUs) {
    state.usOpenings.forEach((entry) => {
      updates.push({
        id: `us-${entry.id}`,
        title: `${entry.name} is on the US shortlist`,
        meta: `${entry.locationLabel} • ${entry.status}`,
        url: entry.applyUrl || entry.siteUrl,
        addedOn: entry.addedOn,
      });
    });
  }

  if (preferences.watchEurope) {
    state.europeUkOpenings.forEach((entry) => {
      updates.push({
        id: `eu-${entry.id}`,
        title: `${entry.name} is on the Europe + UK shortlist`,
        meta: `${entry.locationLabel} • ${entry.status}`,
        url: entry.applyUrl || entry.siteUrl,
        addedOn: entry.addedOn,
      });
    });
  }

  if (preferences.watchDirectory) {
    state.generalDirectory.forEach((entry) => {
      updates.push({
        id: `dir-${entry.id}`,
        title: `${entry.name} is in the general directory`,
        meta: `${entry.locationLabel} • ${entry.hiringState}`,
        url: entry.siteUrl,
        addedOn: entry.addedOn,
      });
    });
  }

  return updates.sort((a, b) => b.addedOn.localeCompare(a.addedOn)).slice(0, 8);
}

function maybeSendNotification(updates) {
  if (!preferences.notifications || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const fresh = updates.filter((item) => !preferences.notifiedAlertIds.includes(item.id));
  if (fresh.length === 0) {
    return;
  }

  const notification = new Notification("Urban design shortlist updates", {
    body: `${fresh.length} recent change${fresh.length > 1 ? "s" : ""} on the shortlist.`,
  });
  notification.onclick = () => window.focus();
  preferences.notifiedAlertIds = [...preferences.notifiedAlertIds, ...fresh.map((item) => item.id)];
  savePreferences();
}

function renderUpdates() {
  const updates = collectUpdates();
  if (updates.length === 0) {
    alertFeed.className = "update-feed empty-state";
    alertFeed.innerHTML = "<p>No updates right now.</p>";
    return;
  }

  alertFeed.className = "update-feed";
  alertFeed.innerHTML = updates
    .map(
      (update) => `
        <article class="update-card">
          <span>${update.meta}</span>
          <strong>${update.title}</strong>
          <p>${update.addedOn}</p>
          <a class="link-chip secondary" href="${update.url}" target="_blank" rel="noreferrer">Open</a>
        </article>
      `,
    )
    .join("");

  maybeSendNotification(updates);
}

function getQuoteForNow() {
  const quotes = state.motivationalQuotes;
  if (!quotes.length) {
    return {
      prompt: "One reminder",
      quote: "Stay consistent. Progress compounds even when the page feels quiet.",
      author: "Codex",
    };
  }

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - startOfYear) / 86_400_000);
  const timeBlock = Math.floor(now.getHours() / 6);
  const quoteIndex = (dayOfYear + timeBlock) % quotes.length;
  return quotes[quoteIndex];
}

function renderQuote() {
  const quote = getQuoteForNow();
  featuredQuote.innerHTML = `
    <p class="section-kicker">${quote.prompt}</p>
    <blockquote>“${quote.quote}”</blockquote>
    <footer>${quote.author}</footer>
  `;
}

function renderStats() {
  usOpeningsCount.textContent = String(state.usOpenings.length);
  europeOpeningsCount.textContent = String(state.europeUkOpenings.length);
  directoryCount.textContent = String(state.generalDirectory.length);
}

function renderAll() {
  populateFilters();
  renderStats();
  renderTable(
    usOpeningsTableBody,
    state.usOpenings,
    createOpeningRow,
    "No US openings match this filter yet.",
    8,
  );
  renderTable(
    europeOpeningsTableBody,
    state.europeUkOpenings,
    createOpeningRow,
    "No Europe or UK openings match this filter yet.",
    8,
  );
  renderTable(
    directoryTableBody,
    state.generalDirectory,
    createDirectoryRow,
    "No directory firms match this filter yet.",
    8,
  );
  renderSeen();
  renderUpdates();
  renderQuote();
}

function syncControls() {
  notificationsToggle.checked = preferences.notifications;
  watchUsToggle.checked = preferences.watchUs;
  watchEuropeToggle.checked = preferences.watchEurope;
  watchDirectoryToggle.checked = preferences.watchDirectory;
}

function setSyncStatus(message, stateClass = "") {
  syncState.textContent = message;
  syncState.className = stateClass;
}

function updateFeedTimestamp() {
  feedTimestamp.textContent = state.updatedAt
    ? `Feed updated ${formatDateTime(state.updatedAt)}`
    : "Feed timestamp unavailable";
}

function applyData(payload) {
  state.usOpenings = Array.isArray(payload.usOpenings) ? payload.usOpenings : [];
  state.europeUkOpenings = Array.isArray(payload.europeUkOpenings) ? payload.europeUkOpenings : [];
  state.generalDirectory = Array.isArray(payload.generalDirectory) ? payload.generalDirectory : [];
  state.motivationalQuotes = Array.isArray(payload.motivationalQuotes) ? payload.motivationalQuotes : [];
  state.updatedAt = payload.updatedAt || new Date().toISOString();
  updateFeedTimestamp();
  renderAll();
}

async function fetchLiveData(reason = "sync") {
  if (state.isRefreshing) {
    return;
  }

  state.isRefreshing = true;
  refreshFeedButton.disabled = true;
  setSyncStatus(reason === "manual" ? "Refreshing..." : "Checking...");

  try {
    const response = await fetch(`${DATA_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    const payload = await response.json();
    applyData(payload);
    setSyncStatus("Live feed connected", "sync-live");
  } catch (error) {
    setSyncStatus("Live feed unavailable", "sync-error");
    console.error(error);
  } finally {
    state.isRefreshing = false;
    refreshFeedButton.disabled = false;
  }
}

function startPolling() {
  if (state.pollingHandle) {
    clearInterval(state.pollingHandle);
  }

  state.pollingHandle = window.setInterval(() => {
    fetchLiveData("poll");
  }, POLL_INTERVAL_MS);
}

function switchTab(targetId) {
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === targetId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === targetId);
  });
}

function handleTrackingChange(event) {
  const input = event.target.closest("input[data-track-id]");
  if (!input) {
    return;
  }

  const { trackId, trackField } = input.dataset;
  const current = getTracking(trackId);
  preferences.tracking[trackId] = {
    ...current,
    [trackField]: input.checked,
  };
  savePreferences();
  renderSeen();
}

function attachEvents() {
  [locationFilter, disciplineFilter].forEach((element) => {
    element.addEventListener("change", renderAll);
  });

  notificationsToggle.addEventListener("change", async (event) => {
    const wantsNotifications = event.target.checked;
    if (wantsNotifications && "Notification" in window) {
      const result = await Notification.requestPermission();
      preferences.notifications = result === "granted";
    } else {
      preferences.notifications = false;
    }

    syncControls();
    savePreferences();
  });

  [
    [watchUsToggle, "watchUs"],
    [watchEuropeToggle, "watchEurope"],
    [watchDirectoryToggle, "watchDirectory"],
  ].forEach(([element, key]) => {
    element.addEventListener("change", (event) => {
      preferences[key] = event.target.checked;
      savePreferences();
      renderUpdates();
    });
  });

  refreshFeedButton.addEventListener("click", () => fetchLiveData("manual"));
  usOpeningsTableBody.addEventListener("change", handleTrackingChange);
  europeOpeningsTableBody.addEventListener("change", handleTrackingChange);
  directoryTableBody.addEventListener("change", handleTrackingChange);

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tabTarget));
  });
}

function init() {
  syncControls();
  attachEvents();
  fetchLiveData("initial");
  startPolling();
}

init();
