const API = "/api/";
const $ = id => document.getElementById(id);
let sessions = [];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
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
  return sessions.find(s => s.sessionId === $("sessionSelect").value);
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

function formatSessionOptionDate(dateString) {
  if (!dateString) return "";
  const d = new Date(`${dateString}T00:00:00Z`);
  return d.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  });
}

function setFormEnabled(enabled) {
  $("rsvpForm").querySelectorAll("input, button").forEach(el => {
    el.disabled = !enabled;
  });
}

function setEmptyState() {
  $("sessionSelect").disabled = true;
  $("sessionSelect").innerHTML = '<option>目前沒有未來場次 / No upcoming sessions</option>';
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
  $("summary").textContent = "";
  $("list").innerHTML = '<div class="empty-state">目前沒有可供查看的未來場次。<span>No upcoming sessions are available.</span></div>';
  $("closedNotice").classList.remove("hidden");
  setFormEnabled(false);
}

function renderSessions() {
  const sel = $("sessionSelect");
  const visible = userVisibleSessions();
  const previous = sel.value;
  sel.innerHTML = "";

  if (!visible.length) {
    setEmptyState();
    return;
  }

  visible.forEach(s => {
    const option = document.createElement("option");
    option.value = s.sessionId;
    option.textContent = `${formatSessionOptionDate(s.date)} · ${s.isOpen ? "OPEN" : "CLOSED"}`;
    sel.appendChild(option);
  });

  const previousStillExists = visible.some(s => s.sessionId === previous);
  const firstOpen = visible.find(s => s.isOpen);
  sel.value = previousStillExists ? previous : (firstOpen?.sessionId || visible[0].sessionId);
  sel.disabled = false;

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
  $("capacityBar").classList.toggle("capacity-full", remaining === 0);

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
  const id = $("sessionSelect").value;
  if (!id) return;
  const d = await get({ action: "list", sessionId: id });
  renderAttendance(d);
}

function showMessage(text, type = "") {
  const el = $("msg");
  el.textContent = text;
  el.className = `rsvp-message${type ? ` ${type}` : ""}`;
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

  submit.disabled = false;
  cancel.hidden = status === "NO";

  if (status === "YES") {
    submit.querySelector("span:first-child").textContent = "確認登記 / Submit RSVP";
  } else if (status === "NO") {
    submit.querySelector("span:first-child").textContent = "更新為不出席 / Update to NO";
  } else if (status === "MAYBE") {
    warning.classList.remove("hidden");
    warning.textContent = "MAYBE 僅供提示，不會提交或保留名額。請在確定後選擇 YES 或 NO。 / MAYBE is not submitted and does not reserve a place. Please choose YES or NO once confirmed.";
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
  if ($("sessionSelect").value) await loadList();
}

$("sessionSelect").addEventListener("change", async () => {
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
  r.addEventListener("change", updateStatusUI);
});

$("rsvpForm").addEventListener("submit", async e => {
  e.preventDefault();
  const session = selectedSession();
  if (!session?.isOpen) {
    showMessage("此場次尚未開放登記。 / This session is not open for registration.", "error");
    return;
  }

  const status = chosenStatus();
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
