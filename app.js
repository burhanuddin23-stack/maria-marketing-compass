const DATA_URL = "./data/marketing-companies.json";
const POLL_INTERVAL_MS = 60_000;
const STORAGE_KEY = "maria-marketing-compass";

const cityFilter = document.getElementById("cityFilter");
const specialtyFilter = document.getElementById("specialtyFilter");
const hiringTableBody = document.getElementById("hiringTableBody");
const directoryTableBody = document.getElementById("directoryTableBody");
const seenTableBody = document.getElementById("seenTableBody");
const alertFeed = document.getElementById("alertFeed");
const notificationsToggle = document.getElementById("notificationsToggle");
const watchParisToggle = document.getElementById("watchParisToggle");
const watchLuxembourgToggle = document.getElementById("watchLuxembourgToggle");
const watchHiringToggle = document.getElementById("watchHiringToggle");
const watchDirectoryToggle = document.getElementById("watchDirectoryToggle");
const refreshFeedButton = document.getElementById("refreshFeedButton");
const openRouteCount = document.getElementById("openRouteCount");
const directoryCount = document.getElementById("directoryCount");
const seenCount = document.getElementById("seenCount");
const featuredQuote = document.getElementById("featuredQuote");
const syncState = document.getElementById("syncState");
const feedTimestamp = document.getElementById("feedTimestamp");
const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll(".tab-panel")];

const defaultPreferences = {
  notifications: false,
  watchParis: true,
  watchLuxembourg: true,
  watchHiring: true,
  watchDirectory: true,
  notifiedAlertIds: [],
  tracking: {},
};

const state = {
  hiringOpportunities: [],
  agencyDirectory: [],
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
    // Ignore storage failures and keep the page usable.
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

function matchesFilter(entry) {
  const cityMatches = cityFilter.value === "all" || entry.city === cityFilter.value;
  const specialtyMatches =
    specialtyFilter.value === "all" || entry.focus.includes(specialtyFilter.value);
  return cityMatches && specialtyMatches;
}

function getWatchedCities() {
  return [
    preferences.watchParis ? "Paris" : null,
    preferences.watchLuxembourg ? "Luxembourg" : null,
  ].filter(Boolean);
}

function renderPills(items) {
  return `<div class="pill-list">${items.map((item) => `<span class="pill">${item}</span>`).join("")}</div>`;
}

function buildLinkChips(entry, mode) {
  const chips = [
    `<a class="link-chip secondary" href="${entry.siteUrl}" target="_blank" rel="noreferrer">Website</a>`,
    `<a class="link-chip secondary" href="${entry.sourceUrl}" target="_blank" rel="noreferrer">Source</a>`,
  ];

  if (mode === "hiring" && entry.hiringUrl) {
    chips.unshift(
      `<a class="link-chip" href="${entry.hiringUrl}" target="_blank" rel="noreferrer">Hiring</a>`,
    );
  }

  return `<div class="table-links">${chips.join("")}</div>`;
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

function createHiringRow(entry) {
  return `
    <tr>
      <td data-label="Company">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.internshipFit}</div>
      </td>
      <td data-label="City">${entry.city}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Status">
        <div class="company-name">${entry.status}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="Links">${buildLinkChips(entry, "hiring")}</td>
      <td data-label="Track">${renderTrackingControls(entry.id)}</td>
    </tr>
  `;
}

function createDirectoryRow(entry) {
  return `
    <tr>
      <td data-label="Company">
        <div class="company-name">${entry.name}</div>
        <div class="sub-copy">${entry.summary}</div>
      </td>
      <td data-label="City">${entry.city}</td>
      <td data-label="Focus">${renderPills(entry.focus)}</td>
      <td data-label="Hiring note">${entry.hiringState}</td>
      <td data-label="Links">${buildLinkChips(entry, "directory")}</td>
      <td data-label="Track">${renderTrackingControls(entry.id)}</td>
    </tr>
  `;
}

function renderHiring() {
  const filtered = state.hiringOpportunities.filter(matchesFilter);
  hiringTableBody.innerHTML = filtered.length
    ? filtered.map(createHiringRow).join("")
    : `
      <tr><td colspan="6"><div class="empty-state">No results match this filter yet.</div></td></tr>
    `;
}

function renderDirectory() {
  const filtered = state.agencyDirectory.filter(matchesFilter);
  directoryTableBody.innerHTML = filtered.length
    ? filtered.map(createDirectoryRow).join("")
    : `
      <tr><td colspan="6"><div class="empty-state">No agencies match this filter yet.</div></td></tr>
    `;
}

function collectSeenRows() {
  const allEntries = [
    ...state.hiringOpportunities.map((entry) => ({ ...entry, type: "Opportunity", note: entry.status })),
    ...state.agencyDirectory.map((entry) => ({ ...entry, type: "Directory", note: entry.hiringState })),
  ];

  return allEntries.filter((entry) => {
    const tracking = getTracking(entry.id);
    return tracking.viewed || tracking.applied;
  });
}

function renderSeen() {
  const rows = collectSeenRows();
  seenCount.textContent = String(rows.length);

  if (rows.length === 0) {
    seenTableBody.innerHTML = `
      <tr><td colspan="5"><div class="empty-state">Tracked firms will appear here after you tick Viewed or Applied.</div></td></tr>
    `;
    return;
  }

  seenTableBody.innerHTML = rows
    .map((entry) => {
      const tracking = getTracking(entry.id);
      const status = [
        tracking.viewed ? "Viewed" : null,
        tracking.applied ? "Applied" : null,
      ]
        .filter(Boolean)
        .join(" • ");

      return `
        <tr>
          <td data-label="Company">
            <div class="company-name">${entry.name}</div>
            <div class="sub-copy">${entry.note}</div>
          </td>
          <td data-label="Type">${entry.type}</td>
          <td data-label="City">${entry.city}</td>
          <td data-label="Status">${status}</td>
          <td data-label="Links">${buildLinkChips(entry, entry.type === "Opportunity" ? "hiring" : "directory")}</td>
        </tr>
      `;
    })
    .join("");
}

function collectUpdates() {
  const watchedCities = getWatchedCities();
  const updates = [];

  if (preferences.watchHiring) {
    state.hiringOpportunities
      .filter((entry) => watchedCities.includes(entry.city))
      .forEach((entry) => {
        updates.push({
          id: `hiring-${entry.id}`,
          title: `${entry.name} is on the open list`,
          meta: `${entry.city} • ${entry.status}`,
          url: entry.hiringUrl || entry.sourceUrl,
          addedOn: entry.addedOn,
        });
      });
  }

  if (preferences.watchDirectory) {
    state.agencyDirectory
      .filter((entry) => watchedCities.includes(entry.city))
      .forEach((entry) => {
        updates.push({
          id: `directory-${entry.id}`,
          title: `${entry.name} is in the target directory`,
          meta: `${entry.city} • ${entry.hiringState}`,
          url: entry.siteUrl,
          addedOn: entry.addedOn,
        });
      });
  }

  return updates.sort((a, b) => b.addedOn.localeCompare(a.addedOn)).slice(0, 6);
}

function maybeSendNotification(updates) {
  if (!preferences.notifications || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const fresh = updates.filter((item) => !preferences.notifiedAlertIds.includes(item.id));
  if (fresh.length === 0) {
    return;
  }

  const notification = new Notification("Daily internship updates", {
    body: `${fresh.length} recent update${fresh.length > 1 ? "s" : ""} on the shortlist.`,
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

function renderQuote() {
  const quote = state.motivationalQuotes[0] || {
    quote: "Success is the sum of small efforts, repeated day in and day out.",
    author: "Robert Collier",
  };

  featuredQuote.innerHTML = `
    <p class="section-kicker">One reminder</p>
    <blockquote>“${quote.quote}”</blockquote>
    <footer>${quote.author}</footer>
  `;
}

function renderStats() {
  openRouteCount.textContent = String(state.hiringOpportunities.length);
  directoryCount.textContent = String(state.agencyDirectory.length);
  seenCount.textContent = String(collectSeenRows().length);
}

function renderAll() {
  renderStats();
  renderHiring();
  renderDirectory();
  renderSeen();
  renderUpdates();
  renderQuote();
}

function syncControls() {
  notificationsToggle.checked = preferences.notifications;
  watchParisToggle.checked = preferences.watchParis;
  watchLuxembourgToggle.checked = preferences.watchLuxembourg;
  watchHiringToggle.checked = preferences.watchHiring;
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
  state.hiringOpportunities = Array.isArray(payload.hiringOpportunities) ? payload.hiringOpportunities : [];
  state.agencyDirectory = Array.isArray(payload.agencyDirectory) ? payload.agencyDirectory : [];
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
  renderStats();
}

function attachEvents() {
  cityFilter.addEventListener("change", () => {
    renderHiring();
    renderDirectory();
  });

  specialtyFilter.addEventListener("change", () => {
    renderHiring();
    renderDirectory();
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
    [watchParisToggle, "watchParis"],
    [watchLuxembourgToggle, "watchLuxembourg"],
    [watchHiringToggle, "watchHiring"],
    [watchDirectoryToggle, "watchDirectory"],
  ].forEach(([element, key]) => {
    element.addEventListener("change", (event) => {
      preferences[key] = event.target.checked;
      savePreferences();
      renderUpdates();
    });
  });

  refreshFeedButton.addEventListener("click", () => fetchLiveData("manual"));
  hiringTableBody.addEventListener("change", handleTrackingChange);
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
