(() => {
  function monthKey(date) {
    return String(date || "").slice(0, 7);
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

  function shortSessionLabel(s) {
    const d = new Date(`${s.date}T00:00:00Z`);
    const date = d.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC"
    });
    return `${date} · ${s.start} · ${s.venue} · ${s.isOpen ? "OPEN" : "CLOSED"}`;
  }

  function ensureMonthInput(sessionSelectId, monthInputId) {
    let monthInput = document.getElementById(monthInputId);
    if (monthInput) return monthInput;

    const sessionSelect = document.getElementById(sessionSelectId);
    if (!sessionSelect) return null;

    monthInput = document.createElement("input");
    monthInput.type = "month";
    monthInput.id = monthInputId;
    monthInput.className = "admin-input admin-month-select";
    monthInput.setAttribute("aria-label", "選擇月份 / Select month");
    monthInput.title = "選擇月份 / Select month";
    sessionSelect.insertAdjacentElement("beforebegin", monthInput);
    return monthInput;
  }

  function sortedSessions() {
    return sessions.slice().sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      return byDate || a.start.localeCompare(b.start) || a.venue.localeCompare(b.venue);
    });
  }

  function preferredMonth(sorted, previousMonth = "") {
    const available = new Set(sorted.map(s => monthKey(s.date)));
    if (previousMonth && available.has(previousMonth)) return previousMonth;

    const open = sorted.find(s => s.isOpen);
    if (open) return monthKey(open.date);

    const today = brisbaneTodayISO();
    const upcoming = sorted.find(s => s.date >= today);
    if (upcoming) return monthKey(upcoming.date);

    return sorted.length ? monthKey(sorted[sorted.length - 1].date) : "";
  }

  function configureMonthInput(monthInput, sorted, selectedMonth) {
    if (!monthInput) return;
    const months = [...new Set(sorted.map(s => monthKey(s.date)))].sort();
    monthInput.disabled = !months.length;
    monthInput.min = months[0] || "";
    monthInput.max = months[months.length - 1] || "";
    monthInput.value = selectedMonth || "";
  }

  function populateSessionSelect(sessionSelect, sorted, selectedMonth, preferredSessionId = "") {
    const rows = sorted.filter(s => monthKey(s.date) === selectedMonth);
    sessionSelect.innerHTML = rows.length
      ? rows.map(s => `<option value="${esc(s.sessionId)}">${esc(shortSessionLabel(s))}</option>`).join("")
      : '<option value="">No sessions this month</option>';
    sessionSelect.disabled = !rows.length;

    if (preferredSessionId && rows.some(s => s.sessionId === preferredSessionId)) {
      sessionSelect.value = preferredSessionId;
    } else {
      const open = rows.find(s => s.isOpen);
      if (open) sessionSelect.value = open.sessionId;
    }

    return rows.length;
  }

  function clearBookingView() {
    if ($("bookingSummary")) $("bookingSummary").innerHTML = "";
    if ($("bookings")) $("bookings").innerHTML = "";
  }

  function clearAnnouncementView() {
    if ($("announcement")) $("announcement").value = "";
    if ($("announceMsg")) $("announceMsg").textContent = "";
  }

  function setupPicker({ sessionId, monthId, actionButtonId, onMonthChanged }) {
    const sessionSelect = document.getElementById(sessionId);
    const monthInput = ensureMonthInput(sessionId, monthId);
    if (!sessionSelect || !monthInput) return;

    if (!monthInput.dataset.bound) {
      monthInput.dataset.bound = "true";
      monthInput.addEventListener("change", () => {
        const count = populateSessionSelect(sessionSelect, sortedSessions(), monthInput.value);
        const actionButton = document.getElementById(actionButtonId);
        if (actionButton) actionButton.disabled = count === 0;
        onMonthChanged?.();
      });
    }
  }

  setupPicker({
    sessionId: "bookingSession",
    monthId: "bookingMonth",
    actionButtonId: "bookingLoadBtn",
    onMonthChanged: clearBookingView
  });

  setupPicker({
    sessionId: "announceSession",
    monthId: "announceMonth",
    actionButtonId: "announceBtn",
    onMonthChanged: clearAnnouncementView
  });

  // Replace the base implementation before Admin login/load. The month itself
  // uses a native YYYY-MM picker, while the session dropdown contains only
  // sessions from that month. Neither control grows with the age of the site.
  fillSelects = function () {
    const sorted = sortedSessions();

    const bookingMonth = ensureMonthInput("bookingSession", "bookingMonth");
    const announceMonth = ensureMonthInput("announceSession", "announceMonth");
    const bookingSession = $("bookingSession");
    const announceSession = $("announceSession");

    const previousBookingMonth = bookingMonth?.value || "";
    const previousAnnouncementMonth = announceMonth?.value || "";
    const previousBookingSession = bookingSession?.value || "";
    const previousAnnouncementSession = announceSession?.value || "";

    const bookingSelectedMonth = preferredMonth(sorted, previousBookingMonth);
    const announceSelectedMonth = preferredMonth(sorted, previousAnnouncementMonth);

    configureMonthInput(bookingMonth, sorted, bookingSelectedMonth);
    configureMonthInput(announceMonth, sorted, announceSelectedMonth);

    const bookingCount = bookingSession
      ? populateSessionSelect(bookingSession, sorted, bookingSelectedMonth, previousBookingSession)
      : 0;
    const announceCount = announceSession
      ? populateSessionSelect(announceSession, sorted, announceSelectedMonth, previousAnnouncementSession)
      : 0;

    if ($("bookingLoadBtn")) $("bookingLoadBtn").disabled = bookingCount === 0;
    if ($("announceBtn")) $("announceBtn").disabled = announceCount === 0;
  };
})();
