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

function updateOverview() {
  const open = sessions.filter(s => s.isOpen);
  $("openCount").textContent = String(open.length);
  $("totalCount").textContent = String(sessions.length);

  const next = open.slice().sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate || a.start.localeCompare(b.start);
  })[0];

  if (!next) {
    $("nextSession").textContent = "No open session";
    $("nextSessionMeta").textContent = "暫時沒有開放場次";
    return;
  }

  $("nextSession").textContent = next.date;
  $("nextSessionMeta").textContent = `${next.start}-${next.end} · ${next.venue} · ${next.capacity} spots`;
}

function fillSelects() {
  const sorted = sessions.slice().sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate || a.start.localeCompare(b.start);
  });

  const html = sorted.length
    ? sorted.map(s => `<option value="${esc(s.sessionId)}">${esc(s.date)} ${esc(s.start)} · ${esc(s.venue)}${s.isOpen ? " · OPEN" : " · CLOSED"}</option>`).join("")
    : '<option value="">No sessions</option>';

  $("bookingSession").innerHTML = html;
  $("announceSession").innerHTML = html;
  $("bookingSession").disabled = !sorted.length;
  $("announceSession").disabled = !sorted.length;
  $("bookingLoadBtn").disabled = !sorted.length;
  $("announceBtn").disabled = !sorted.length;
}

function renderSessions() {
  const rows = sessions.filter(s => $("showClosed").checked || s.isOpen);

  $("sessions").innerHTML = rows.length ? rows.map(s => `
    <article class="admin-session-card" data-id="${esc(s.sessionId)}">
      <div class="admin-session-header">
        <div>
          <div class="admin-session-title">${esc(s.date)} · ${esc(s.venue)}</div>
          <div class="admin-session-meta">${esc(s.start)}-${esc(s.end)} · Capacity ${Number(s.capacity)}</div>
        </div>
        <span class="admin-session-pill ${s.isOpen ? "open" : ""}">${s.isOpen ? "OPEN" : "CLOSED"}</span>
      </div>

      <div class="admin-session-grid">
        <div><label class="admin-field-label">Date</label><input class="admin-input" data-f="date" type="date" value="${esc(s.date)}"></div>
        <div><label class="admin-field-label">Start</label><input class="admin-input" data-f="start" value="${esc(s.start)}"></div>
        <div><label class="admin-field-label">End</label><input class="admin-input" data-f="end" value="${esc(s.end)}"></div>
        <div><label class="admin-field-label">Venue</label><input class="admin-input" data-f="venue" value="${esc(s.venue)}"></div>
        <div><label class="admin-field-label">Capacity</label><input class="admin-input" data-f="capacity" type="number" min="1" value="${Number(s.capacity)}"></div>
        <div><label class="admin-field-label">Note</label><input class="admin-input" data-f="note" value="${esc(s.note || "")}"></div>
      </div>

      <div class="admin-check-row">
        <label class="admin-check"><input data-f="isOpen" type="checkbox" ${s.isOpen ? "checked" : ""}> <span>Open</span></label>
      </div>

      <div class="admin-session-actions">
        <button data-act="save" class="admin-primary-btn" type="button">Save</button>
        <button data-act="only" class="admin-secondary-btn" type="button">Only Open</button>
        <button data-act="delete" class="admin-danger-btn" type="button">Delete</button>
      </div>
    </article>
  `).join("") : '<div class="empty">No sessions to show.</div>';

  document.querySelectorAll(".admin-session-card").forEach(row => {
    row.addEventListener("click", async e => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const id = row.dataset.id;
      const f = name => row.querySelector(`[data-f="${name}"]`);
      btn.disabled = true;
      $("adminMsg").textContent = "";

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
          $("adminMsg").textContent = "Session updated.";
        }

        if (btn.dataset.act === "only") {
          await adminPost({ action: "admin_set_only_open", sessionId: id });
          $("adminMsg").textContent = "This is now the only open session.";
        }

        if (btn.dataset.act === "delete") {
          if (!confirm("Delete this session and all its bookings?")) return;
          await adminPost({ action: "admin_delete_session", sessionId: id });
          $("adminMsg").textContent = "Session deleted.";
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
  updateOverview();
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
$("logoutBtn").addEventListener("click", () => lockAdmin("Admin 已鎖定 / Locked"));
$("showClosed").addEventListener("change", renderSessions);

$("runAutoBtn").addEventListener("click", async () => {
  const btn = $("runAutoBtn");
  btn.disabled = true;
  $("autoMsg").textContent = "Running...";

  try {
    const d = await adminPost({ action: "admin_run_monday_automation" });
    $("autoMsg").textContent = d.action === "opened_existing"
      ? `Existing session opened: ${d.date}`
      : `New session created and opened: ${d.date}`;
    await loadSessions();
  } catch (e) {
    $("autoMsg").textContent = e.message;
  } finally {
    btn.disabled = false;
  }
});

$("createBtn").addEventListener("click", async () => {
  const btn = $("createBtn");
  btn.disabled = true;
  $("createMsg").textContent = "";

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
  } finally {
    btn.disabled = false;
  }
});

async function loadBookings() {
  if (!$("bookingSession").value) return;

  const d = await adminPost({
    action: "admin_list_bookings",
    sessionId: $("bookingSession").value
  });

  $("bookingSummary").textContent = `Confirmed ${d.summary.confirmedPax}/${d.summary.cap} · Remaining ${d.summary.remaining}`;
  $("bookings").innerHTML = d.current.length
    ? d.current.map(r => `
        <div class="admin-booking-row">
          <div><span class="admin-booking-name">${esc(r.name)}</span><span class="admin-booking-status">${esc(r.status)}</span></div>
          <span class="admin-booking-pax">${r.pax}</span>
        </div>
      `).join("")
    : '<div class="empty">No bookings</div>';
}

$("bookingLoadBtn").addEventListener("click", async () => {
  try {
    await loadBookings();
  } catch (e) {
    $("adminMsg").textContent = e.message;
  }
});

$("bookingSession").addEventListener("change", () => {
  $("bookingSummary").textContent = "";
  $("bookings").innerHTML = "";
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
