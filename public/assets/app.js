const API = "/api/";
const $ = id => document.getElementById(id);
let sessions = [];
let selectedSessionId = "";

const MAYBE_LINES = [
  {
    zh: "「可能」不會為您保留名額；請選擇「出席」或「不出席」。",
    en: "'Maybe' does not reserve a spot. Please choose YES or NO."
  },
  {
    zh: "選擇「可能」代表尚未決定；系統不會預留名額。",
    en: "'Maybe' = undecided; no spot will be reserved."
  },
  {
    zh: "名額有限；如計劃出席，請直接選擇「YES」。",
    en: "Slots are limited. If you want to play, choose YES."
  },
  {
    zh: "統計出席人數時，「可能」將視為不出席。",
    en: "When counting players, 'Maybe' is treated as NO."
  }
];
let maybeLineIndex = 0;
let currentMaybeLine = MAYBE_LINES[0];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function nextMaybeLine() {
  currentMaybeLine = MAYBE_LINES[maybeLineIndex % MAYBE_LINES.length];
  maybeLineIndex++;
  return currentMaybeLine;
}

async function get(params) {
  const u = new URL(API, location.origin);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function post(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function chosenStatus() {
  return document.querySelector('input[name="status"]:checked')?.value || "";
}

function selectedSession() {
  return sessions.find(s => s.sessionId === selectedSessionId);
}

function brisbaneTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function userVisibleSessions() {
  const today = brisbaneTodayISO();
  return sessions
    .filter(s => s.isOpen || s.date >= today)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      return dateCompare !== 0 ? dateCompare : a.start.localeCompare(b.start);
    });
}

function formatEventDate(dateString) {
  if (!dateString) return { month: "---", day: "--", weekday: "---" };
  const d = new Date(`${dateString}T00:00:00Z`);
  return {
    month: d.toLocaleString("en-AU", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(d.getUTCDate()).padStart(2, "0"),
    weekday: d.toLocaleString("en-AU", { weekday: "short", timeZone: "UTC" }).toUpperCase()
  };
}

function formatTabDate(dateString) {
  const d = new Date(`${dateString}T00:00:00Z`);
  return {
    main: d.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC"
    }).toUpperCase(),
    year: String(d.getUTCFullYear())
  };
}

function setFormEnabled(enabled) {
  $("rsvpForm").querySelectorAll("input, button").forEach(el => {
    el.disabled = !enabled;
  });
}

function resetAttendanceStatus() {
  document.querySelectorAll('input[name="status"]').forEach(r => {
    r.checked = false;
  });
  $("statusWarning").classList.add("hidden");
  $("statusWarning").innerHTML = "";
  $("cancelBtn").hidden = true;
  $("submitBtn").disabled = true;
  $("submitBtn").querySelector("span:first-child").textContent = "請選擇出席狀態 / Select attendance";
}

function setEmptyState() {
  selectedSessionId = "";
  $("sessionTabs").innerHTML = '<div class="session-tab-empty">目前沒有未來場次 / No upcoming sessions</div>';
  $("eventPanel").classList.add("event-closed");
  $("liveDot").classList.add("closed");
  $("eventStateText").textContent = "暫無場次 / NO UPCOMING SESSION";
  $("eventTitle").textContent = "目前沒有已安排的未來場次 / No upcoming session scheduled";
  $("eventMonth").textContent = "---";
  $("eventDay").textContent = "--";
  $("eventWeekday").textContent = "---";
  $("eventTime").textContent = "17:00–19:00";
  $("eventVenue").textContent = "Goodminton";
  $("capacityText").textContent = "登記尚未開放 / Registration is not available";
  $("remainingText").textContent = "";
  $("capacityBar").style.width = "0%";
  $("capacityBar").className = "capacity-fill capacity-green";
  $("summary").textContent = "";
  $("list").innerHTML = '<div class="empty-state">目前沒有可供查看的未來場次。<span>No upcoming sessions are available.</span></div>';
  $("closedNotice").classList.remove("hidden");
  resetAttendanceStatus();
  setFormEnabled(false);
}

function renderSessions() {
  const visible = userVisibleSessions();

  if (!visible.length) {
    setEmptyState();
    return;
  }

  const selectedStillExists = visible.some(s => s.sessionId === selectedSessionId);
  const firstOpen = visible.find(s => s.isOpen);
  if (!selectedStillExists) {
    selectedSessionId = firstOpen?.sessionId || visible[0].sessionId;
  }

  $("sessionTabs").innerHTML = visible.map(s => {
    const date = formatTabDate(s.date);
    const selected = s.sessionId === selectedSessionId;
    return `
      <button
        type="button"
        class="session-tab${selected ? " is-selected" : ""}${s.isOpen ? "" : " is-closed"}"
        data-session-id="${esc(s.sessionId)}"
        role="tab"
        aria-selected="${selected ? "true" : "false"}"
        aria-label="${esc(`${s.date}, ${s.start} to ${s.end}, ${s.venue}${s.isOpen ? ", open for RSVP" : ", registration closed"}`)}">
        <strong>${esc(date.main)}</strong>
        <span>${esc(date.year)}</span>
      </button>`;
  }).join("");

  showSession();
}

function showSession() {
  const s = selectedSession();
  if (!s) return;

  const date = formatEventDate(s.date);
  $("eventMonth").textContent = date.month;
  $("eventDay").textContent = date.day;
  $("eventWeekday").textContent = date.weekday;
  $("eventTitle").textContent = s.title || "YR Badminton";
  $("eventTime").textContent = `${s.start}–${s.end}`;
  $("eventVenue").textContent = s.venue;
  $("sessionInfo").textContent = `${s.date} (Sun) ${s.start}-${s.end} · ${s.venue} · capacity ${s.capacity}`;

  $("sessionTabs").querySelectorAll(".session-tab[data-session-id]").forEach(btn => {
    const selected = btn.dataset.sessionId === selectedSessionId;
    btn.classList.toggle("is-selected", selected);
    btn.setAttribute("aria-selected", selected ? "true" : "false");
  });

  if (s.isOpen) {
    $("eventPanel").classList.remove("event-closed");
    $("liveDot").classList.remove("closed");
    $("eventStateText").textContent = "開放登記 / OPEN FOR RSVP";
    $("closedNotice").classList.add("hidden");
    setFormEnabled(true);
  } else {
    $("eventPanel").classList.add("event-closed");
    $("liveDot").classList.add("closed");
    $("eventStateText").textContent = "尚未開放登記 / REGISTRATION CLOSED";
    $("closedNotice").classList.remove("hidden");
    setFormEnabled(false);
  }

  updateStatusUI();
}

function applyCapacityZone(used) {
  const bar = $("capacityBar");
  bar.classList.remove("capacity-green", "capacity-yellow", "capacity-red", "capacity-full");

  if (used >= 25) {
    bar.classList.add("capacity-red");
  } else if (used >= 20) {
    bar.classList.add("capacity-yellow");
  } else {
    bar.classList.add("capacity-green");
  }
}

function renderAttendance(data) {
  const confirmed = data.current.filter(x => x.status === "YES" && x.placement === "CONFIRMED");
  const used = Number(data.summary.confirmedPax || 0);
  const cap = Number(data.summary.cap || 0);
  const remaining = Number(data.summary.remaining || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  $("capacityText").innerHTML = `<strong>${used}</strong> / ${cap} 人已登記 · registered`;
  $("remainingText").textContent = remaining > 0
    ? `尚餘 ${remaining} 個名額 / ${remaining} remaining`
    : "名額已滿 / FULL";
  $("capacityBar").style.width = `${pct}%`;
  applyCapacityZone(used);

  $("summary").innerHTML = `
    <div class="summary-stat"><strong>${used}</strong><span>已登記 / Registered</span></div>
    <div class="summary-divider"></div>
    <div class="summary-stat"><strong>${remaining}</strong><span>尚餘 / Remaining</span></div>
  `;

  if (!confirmed.length) {
    $("list").innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏸</span>
        <strong>目前尚未有人登記</strong>
        <span>No attendees have registered yet.</span>
      </div>`;
    return;
  }

  $("list").innerHTML = confirmed.map((x, index) => `
    <div class="user-attendee">
      <span class="attendee-number">${index + 1}</span>
      <span class="attendee-name">${esc(x.name)}</span>
      ${Number(x.pax) > 1 ? `<span class="pax-badge">+${Number(x.pax) - 1}</span>` : ""}
    </div>
  `).join("");
}

async function loadList() {
  if (!selectedSessionId) return;
  const d = await get({ action: "list", sessionId: selectedSessionId });
  renderAttendance(d);
}

function showMessage(text, type = "") {
  const el = $("msg");
  el.textContent = text;
  el.className = `rsvp-message${type ? ` ${type}` : ""}`;
}

function renderMaybeWarning() {
  const warning = $("statusWarning");
  warning.innerHTML = `
    <span class="warning-line warning-zh">${esc(currentMaybeLine.zh)}</span>
    <span class="warning-line warning-en">${esc(currentMaybeLine.en)}</span>
  `;
}

function updateStatusUI() {
  const session = selectedSession();
  const status = chosenStatus();
  const warning = $("statusWarning");
  const submit = $("submitBtn");
  const cancel = $("cancelBtn");

  warning.classList.add("hidden");

  if (!session?.isOpen) {
    submit.disabled = true;
    cancel.hidden = true;
    return;
  }

  if (!status) {
    submit.disabled = true;
    cancel.hidden = true;
    submit.querySelector("span:first-child").textContent = "請選擇出席狀態 / Select attendance";
    return;
  }

  submit.disabled = false;
  cancel.hidden = status === "NO";

  if (status === "YES") {
    submit.querySelector("span:first-child").textContent = "確認登記 / Submit RSVP";
  } else if (status === "NO") {
    submit.querySelector("span:first-child").textContent = "更新為不出席 / Update to NO";
  } else if (status === "MAYBE") {
    warning.classList.remove("hidden");
    renderMaybeWarning();
    submit.querySelector("span:first-child").textContent = "MAYBE 不會提交 / MAYBE is not submitted";
    submit.disabled = true;
  }
}

function changePax(delta) {
  const input = $("pax");
  const min = Number(input.min || 1);
  const max = Number(input.max || 20);
  const next = Math.max(min, Math.min(max, Number(input.value || 1) + delta));
  input.value = String(next);
}

async function init() {
  const d = await get({ action: "sessions" });
  sessions = d.sessions || [];
  renderSessions();
  if (selectedSessionId) await loadList();
}

$("sessionTabs").addEventListener("click", async e => {
  const btn = e.target.closest("button[data-session-id]");
  if (!btn || btn.dataset.sessionId === selectedSessionId) return;

  selectedSessionId = btn.dataset.sessionId;
  resetAttendanceStatus();
  showMessage("");
  showSession();
  await loadList();
});

$("refreshBtn").addEventListener("click", async () => {
  const btn = $("refreshBtn");
  btn.classList.add("is-spinning");
  try {
    await loadList();
  } finally {
    setTimeout(() => btn.classList.remove("is-spinning"), 350);
  }
});

$("paxMinus").addEventListener("click", () => changePax(-1));
$("paxPlus").addEventListener("click", () => changePax(1));

document.querySelectorAll('input[name="status"]').forEach(r => {
  r.addEventListener("change", () => {
    if (r.checked && r.value === "MAYBE") nextMaybeLine();
    updateStatusUI();
  });
});

$("rsvpForm").addEventListener("submit", async e => {
  e.preventDefault();
  const session = selectedSession();
  if (!session?.isOpen) {
    showMessage("此場次尚未開放登記。 / This session is not open for registration.", "error");
    return;
  }

  const status = chosenStatus();
  if (!status) {
    showMessage("請選擇出席狀態。 / Please select an attendance status.", "error");
    return;
  }
  if (status === "MAYBE") return;

  const name = $("name").value.trim();
  if (!name) {
    showMessage("請輸入姓名。 / Please enter your name.", "error");
    $("name").focus();
    return;
  }

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.classList.add("is-loading");
  showMessage("正在提交… / Updating…");

  try {
    await post({
      action: "rsvp",
      sessionId: session.sessionId,
      name,
      status,
      pax: Number($("pax").value || 1),
      note: $("note").value
    });

    showMessage(
      status === "YES"
        ? "✓ 登記成功。 / RSVP submitted successfully."
        : "✓ 已更新為不出席。 / Attendance updated to NO.",
      "success"
    );
    await loadList();
  } catch (err) {
    showMessage(err.message === "full" ? "名額已滿。 / Session is full." : err.message, "error");
  } finally {
    btn.classList.remove("is-loading");
    setTimeout(updateStatusUI, 800);
  }
});

$("cancelBtn").addEventListener("click", () => {
  document.querySelector('input[name="status"][value="NO"]').checked = true;
  updateStatusUI();
  $("rsvpForm").requestSubmit();
});

updateStatusUI();
init().catch(e => {
  showMessage(`載入失敗：${e.message} / Failed to load: ${e.message}`, "error");
});
