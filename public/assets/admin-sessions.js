(() => {
  const PAGE_SIZE = 6;
  let visibleSessionCount = PAGE_SIZE;
  let expandedSessionId = "";

  function brisbaneTodayAdmin() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Brisbane",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  function filteredSessions() {
    const today = brisbaneTodayAdmin();
    const includeHistory = $("showClosed")?.checked === true;

    const rows = sessions.filter(s => includeHistory || s.date >= today || s.isOpen);
    return rows.sort((a, b) => {
      const aPast = a.date < today && !a.isOpen;
      const bPast = b.date < today && !b.isOpen;
      if (aPast !== bPast) return aPast ? 1 : -1;

      const dateCompare = a.date.localeCompare(b.date);
      if (aPast && bPast) return -dateCompare;
      return dateCompare || a.start.localeCompare(b.start);
    });
  }

  function ensureSessionListControls() {
    const list = $("sessions");
    if (!list) return;

    let footer = $("sessionListFooter");
    if (!footer) {
      footer = document.createElement("div");
      footer.id = "sessionListFooter";
      footer.className = "admin-session-list-footer";
      footer.innerHTML = `
        <span id="sessionListCount" class="admin-session-list-count"></span>
        <button id="loadMoreSessions" class="admin-secondary-btn admin-load-more" type="button">
          顯示更多 / Load more
        </button>
      `;
      list.insertAdjacentElement("afterend", footer);

      $("loadMoreSessions").addEventListener("click", () => {
        visibleSessionCount += PAGE_SIZE;
        renderSessions();
      });
    }
  }

  function sessionCardHtml(s) {
    const expanded = s.sessionId === expandedSessionId;
    const today = brisbaneTodayAdmin();
    const isPast = s.date < today && !s.isOpen;

    return `
      <article class="admin-session-card admin-session-compact${expanded ? " is-expanded" : ""}${isPast ? " is-past" : ""}" data-id="${esc(s.sessionId)}">
        <div class="admin-session-summary-row">
          <div class="admin-session-summary-main">
            <div class="admin-session-title">${esc(s.date)} · ${esc(s.venue)}</div>
            <div class="admin-session-meta">${esc(s.start)}-${esc(s.end)} · Capacity ${Number(s.capacity)}${isPast ? " · HISTORY" : ""}</div>
          </div>
          <div class="admin-session-summary-actions">
            <span class="admin-session-pill ${s.isOpen ? "open" : ""}">${s.isOpen ? "OPEN" : "CLOSED"}</span>
            <button data-act="toggle" class="admin-session-edit-btn" type="button" aria-expanded="${expanded ? "true" : "false"}">
              ${expanded ? "收起 / Close" : "編輯 / Edit"}
            </button>
          </div>
        </div>

        ${expanded ? `
          <div class="admin-session-editor">
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
          </div>
        ` : ""}
      </article>
    `;
  }

  async function handleSessionAction(row, btn) {
    const id = row.dataset.id;

    if (btn.dataset.act === "toggle") {
      expandedSessionId = expandedSessionId === id ? "" : id;
      renderSessions();
      return;
    }

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
        expandedSessionId = "";
        $("adminMsg").textContent = "Session deleted.";
      }

      await loadSessions();
    } catch (err) {
      $("adminMsg").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  renderSessions = function () {
    ensureSessionListControls();
    const allRows = filteredSessions();
    const rows = allRows.slice(0, visibleSessionCount);

    $("sessions").innerHTML = rows.length
      ? rows.map(sessionCardHtml).join("")
      : '<div class="empty admin-session-empty">沒有符合條件的場次 / No sessions to show.</div>';

    const count = $("sessionListCount");
    const loadMore = $("loadMoreSessions");
    if (count) {
      count.textContent = allRows.length
        ? `顯示 ${rows.length} / ${allRows.length} · Showing ${rows.length} of ${allRows.length}`
        : "0 sessions";
    }
    if (loadMore) loadMore.hidden = rows.length >= allRows.length;

    document.querySelectorAll(".admin-session-card").forEach(row => {
      row.addEventListener("click", e => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        handleSessionAction(row, btn);
      });
    });
  };

  const historyToggle = $("showClosed");
  if (historyToggle) {
    historyToggle.checked = false;
    historyToggle.addEventListener("change", () => {
      visibleSessionCount = PAGE_SIZE;
      expandedSessionId = "";
      renderSessions();
    });
  }
})();
