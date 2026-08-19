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

function formatEventDate(dateString) {
  if (!dateString) return { month: "---", day: "--" };
  const d = new Date(`${dateString}T00:00:00Z`);
  return {
    month: d.toLocaleString("en-AU", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(d.getUTCDate()).padStart(2, "0")
  };
}

function setFormEnabled(enabled) {
  $("rsvpForm").querySelectorAll("input, button").forEach(el => {
    el.disabled = !enabled;
  });
}

function renderSessions() {
  const sel = $("sessionSelect");
  const open = sessions.filter(s => s.isOpen);
  sel.innerHTML = "";

  if (!open.length) {
    sel.disabled = true;
    sel.innerHTML = '<option>暫時無開放場次 / No open sessions</option>';
    $("eventPanel").classList.add("event-closed");
    $("eventTitle").textContent = "暫時未有開放場次";
    $("eventMonth").textContent = "---";
    $("eventDay").textContent = "--";
    $("eventTime").textContent = "請稍後再查看";
    $("eventVenue").textContent = "Goodminton";
    $("capacityText").textContent = "RSVP 尚未開放";
    $("remainingText").textContent = "";
    $("capacityBar").style.width = "0%";
    $("summary").textContent = "";
    $("list").innerHTML = '<div class="empty-state">暫時未有開放嘅場次。</div>';
    setFormEnabled(false);
    return;
  }

  sel.disabled = open.length === 1;
  open.forEach(s => {
    const o = document.createElement("option");
    o.value = s.sessionId;
    o.textContent = `${s.date} · ${s.start} · ${s.venue}`;
    sel.appendChild(o);
  });

  $("eventPanel").classList.remove("event-closed");
  setFormEnabled(true);
  showSession();
  updateStatusUI();
}

function showSession() {
  const s = selectedSession();
  if (!s) return;

  const date = formatEventDate(s.date);
  $("eventMonth").textContent = date.month;
  $("eventDay").textContent = date.day;
  $("eventTitle").textContent = s.title || "YR Badminton";
  $("eventTime").textContent = `${s.start}–${s.end}`;
  $("eventVenue").textContent = s.venue;
  $("sessionInfo").textContent = `${s.date} (Sun) ${s.start}-${s.end} · ${s.venue} · ${s.capacity} spots`;
}

function renderAttendance(data) {
  const confirmed = data.current.filter(x => x.status === "YES" && x.placement === "CONFIRMED");
  const used = Number(data.summary.confirmedPax || 0);
  const cap = Number(data.summary.cap || 0);
  const remaining = Number(data.summary.remaining || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;

  $("capacityText").innerHTML = `<strong>${used}</strong> / ${cap} 位已登記`;
  $("remainingText").textContent = remaining > 0 ? `尚餘 ${remaining} 位` : "FULL";
  $("capacityBar").style.width = `${pct}%`;
  $("capacityBar").classList.toggle("capacity-full", remaining === 0);

  $("summary").innerHTML = `
    <div class="summary-stat"><strong>${used}</strong><span>Players</span></div>
    <div class="summary-divider"></div>
    <div class="summary-stat"><strong>${remaining}</strong><span>Remaining</span></div>
  `;

  if (!confirmed.length) {
    $("list").innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🏸</span>
        <strong>仲未有人登記</strong>
        <span>Be the first one in.</span>
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
  const status = chosenStatus();
  const warning = $("statusWarning");
  const submit = $("submitBtn");
  const cancel = $("cancelBtn");

  warning.classList.add("hidden");
  submit.disabled = false;
  cancel.hidden = status === "NO";

  if (status === "YES") {
    submit.querySelector("span:first-child").textContent = "確認登記";
  } else if (status === "NO") {
    submit.querySelector("span:first-child").textContent = "更新為不出席";
  } else if (status === "MAYBE") {
    warning.classList.remove("hidden");
    warning.textContent = "MAYBE 只作提示，不會提交亦唔會保留名額。請確定後再選 YES 或 NO。";
    submit.querySelector("span:first-child").textContent = "MAYBE 不會提交";
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
  const status = chosenStatus();
  if (status === "MAYBE") return;

  const name = $("name").value.trim();
  if (!name) {
    showMessage("請輸入姓名 / Please enter your name.", "error");
    $("name").focus();
    return;
  }

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.classList.add("is-loading");
  showMessage("提交中… / Updating…");

  try {
    await post({
      action: "rsvp",
      sessionId: $("sessionSelect").value,
      name,
      status,
      pax: Number($("pax").value || 1),
      note: $("note").value
    });

    showMessage(
      status === "YES" ? "✓ 已成功登記，星期日見！" : "✓ 已更新為不出席。",
      "success"
    );
    await loadList();
  } catch (err) {
    showMessage(err.message === "full" ? "名額已滿 / Session is full." : err.message, "error");
  } finally {
    btn.classList.remove("is-loading");
    setTimeout(() => {
      btn.disabled = chosenStatus() === "MAYBE";
    }, 800);
  }
});

$("cancelBtn").addEventListener("click", () => {
  document.querySelector('input[name="status"][value="NO"]').checked = true;
  updateStatusUI();
  $("rsvpForm").requestSubmit();
});

updateStatusUI();
init().catch(e => {
  showMessage(`載入失敗 / Failed to load: ${e.message}`, "error");
});
