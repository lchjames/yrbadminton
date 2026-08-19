const API = "/api/";
const $ = id => document.getElementById(id);
let sessions = [];
let adminKeyValue = "";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function key() {
  return adminKeyValue;
}

function lockAdmin(message = "") {
  adminKeyValue = "";
  $("adminApp").hidden = true;
  $("authGate").hidden = false;
  $("adminKey").value = "";
  $("topMsg").textContent = message;
  $("adminKey").focus();
}

function unlockAdmin() {
  $("topMsg").textContent = "";
  $("adminKey").value = "";
  $("authGate").hidden = true;
  $("adminApp").hidden = false;
}

async function adminPost(body) {
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-key": key()
    },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok || !j.ok) {
    if (r.status === 401) lockAdmin("Admin Key 不正確 / Invalid Admin Key");
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return j;
}

function sunday(date) {
  return !!date && new Date(date + "T00:00:00Z").getUTCDay() === 0;
}

function fillSelects() {
  const html = sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => `<option value="${esc(s.sessionId)}">${esc(s.date)} ${esc(s.start)} · ${esc(s.venue)}${s.isOpen ? " · OPEN" : ""}</option>`)
    .join("");

  $("bookingSession").innerHTML = html;
  $("announceSession").innerHTML = html;
}

function renderSessions() {
  const rows = sessions.filter(s => $("showClosed").checked || s.isOpen);
  $("sessions").innerHTML = rows.length ? rows.map(s => `
    <article class="session-row" data-id="${esc(s.sessionId)}">
      <div class="session-head">
        <strong>${esc(s.date)} · ${esc(s.venue)}</strong>
        <span class="pill ${s.isOpen ? "open" : ""}">${s.isOpen ? "OPEN" : "CLOSED"}</span>
      </div>
      <div class="grid">
        <div><label>Date</label><input data-f="date" type="date" value="${esc(s.date)}"></div>
        <div><label>Start</label><input data-f="start" value="${esc(s.start)}"></div>
        <div><label>End</label><input data-f="end" value="${esc(s.end)}"></div>
        <div><label>Venue</label><input data-f="venue" value="${esc(s.venue)}"></div>
        <div><label>Capacity</label><input data-f="capacity" type="number" value="${Number(s.capacity)}"></div>
        <div><label>Note</label><input data-f="note" value="${esc(s.note || "")}"></div>
      </div>
      <label class="check"><input data-f="isOpen" type="checkbox" ${s.isOpen ? "checked" : ""}> Open</label>
      <div class="button-row">
        <button data-act="save">Save</button>
        <button data-act="only" class="secondary">Only Open</button>
        <button data-act="delete" class="danger">Delete</button>
      </div>
    </article>
  `).join("") : '<div class="empty">No sessions</div>';

  document.querySelectorAll(".session-row").forEach(row => {
    row.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const id = row.dataset.id;
      const f = name => row.querySelector(`[data-f="${name}"]`);
      btn.disabled = true;

      try {
        if (btn.dataset.act === "save") {
          await adminPost({
            action: "admin_update_session",
            session: {
              sessionId: id,
              date: f("date").value,
              start: f("start").value,
              end: f("end").value,
              venue: f("venue").value,
              capacity: Number(f("capacity").value),
              note: f("note").value,
              isOpen: f("isOpen").checked
            }
          });
        }

        if (btn.dataset.act === "only") {
          await adminPost({ action: "admin_set_only_open", sessionId: id });
        }

        if (btn.dataset.act === "delete") {
          if (!confirm("Delete this session and all its bookings?")) return;
          await adminPost({ action: "admin_delete_session", sessionId: id });
        }

        await loadSessions();
      } catch (err) {
        $("adminMsg").textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadSessions() {
  if (!key()) throw new Error("請輸入 Admin Key");
  const d = await adminPost({ action: "admin_sessions" });
  sessions = d.sessions || [];
  fillSelects();
  renderSessions();
}

async function authenticate() {
  const candidate = $("adminKey").value.trim();
  if (!candidate) {
    $("topMsg").textContent = "請輸入 Admin Key";
    return;
  }

  adminKeyValue = candidate;
  $("loadBtn").disabled = true;
  $("topMsg").textContent = "驗證中... / Checking...";

  try {
    await loadSessions();
    unlockAdmin();
  } catch (e) {
    if (!adminKeyValue) return;
    adminKeyValue = "";
    $("topMsg").textContent = e.message;
  } finally {
    $("loadBtn").disabled = false;
  }
}

$("loadBtn").addEventListener("click", authenticate);
$("adminKey").addEventListener("keydown", e => {
  if (e.key === "Enter") authenticate();
});

$("showClosed").addEventListener("change", renderSessions);

$("runAutoBtn").addEventListener("click", async () => {
  try {
    const d = await adminPost({ action: "admin_run_monday_automation" });
    $("autoMsg").textContent = d.action === "opened_existing"
      ? `Existing session opened: ${d.date}`
      : `New session created and opened: ${d.date}`;
    await loadSessions();
  } catch (e) {
    $("autoMsg").textContent = e.message;
  }
});

$("createBtn").addEventListener("click", async () => {
  try {
    if (!sunday($("newDate").value)) throw new Error("只可選星期日 / Sunday only");

    const r = await adminPost({
      action: "admin_create_session",
      openOnly: $("newOnlyOpen").checked,
      session: {
        date: $("newDate").value,
        start: $("newStart").value,
        end: $("newEnd").value,
        venue: $("newVenue").value,
        capacity: Number($("newCap").value),
        note: $("newNote").value,
        isOpen: $("newOpen").checked
      }
    });

    $("createMsg").textContent = `Created: ${r.sessionId}`;
    await loadSessions();
  } catch (e) {
    $("createMsg").textContent = e.message;
  }
});

$("bookingLoadBtn").addEventListener("click", async () => {
  try {
    const d = await adminPost({
      action: "admin_list_bookings",
      sessionId: $("bookingSession").value
    });

    $("bookingSummary").textContent = `Confirmed ${d.summary.confirmedPax}/${d.summary.cap} · Remaining ${d.summary.remaining}`;
    $("bookings").innerHTML = d.current.length
      ? d.current.map(r => `<div class="attendee"><span>${esc(r.name)} · ${esc(r.status)}</span><strong>${r.pax}</strong></div>`).join("")
      : '<div class="empty">No bookings</div>';
  } catch (e) {
    $("adminMsg").textContent = e.message;
  }
});

function announcement() {
  const s = sessions.find(x => x.sessionId === $("announceSession").value);
  if (!s) return "";

  return `📢 YR Badminton 打波登記 / RSVP\n🗓️ ${s.date} (Sun) ${s.start}-${s.end}\n📍 ${s.venue}\n\nPlease update your status via:\n${location.origin}/\n\nStatus: YES / NO`;
}

$("announceBtn").addEventListener("click", () => {
  $("announcement").value = announcement();
  $("announceMsg").textContent = "Generated.";
});

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("announcement").value);
    $("announceMsg").textContent = "Copied.";
  } catch {
    $("announcement").select();
    document.execCommand("copy");
    $("announceMsg").textContent = "Copied.";
  }
});
