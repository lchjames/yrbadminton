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

  function monthLabel(key) {
    if (!/^\d{4}-\d{2}$/.test(key)) return key;
    const [year, month] = key.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, 1));
    const en = d.toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
    return `${year}年${month}月 / ${en}`;
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

  function ensureMonthSelect(sessionSelectId, monthSelectId) {
    let monthSelect = document.getElementById(monthSelectId);
    if (monthSelect) return monthSelect;

    const sessionSelect = document.getElementById(sessionSelectId);
    if (!sessionSelect) return null;

    monthSelect = document.createElement("select");
    monthSelect.id = monthSelectId;
    monthSelect.className = "admin-input admin-month-select";
    monthSelect.setAttribute("aria-label", "選擇月份 / Select month");
    sessionSelect.insertAdjacentElement("beforebegin", monthSelect);
    return monthSelect;
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

  function populateMonthSelect(monthSelect, sorted, selectedMonth) {
    const months = [...new Set(sorted.map(s => monthKey(s.date)))].sort();
    monthSelect.innerHTML = months.length
      ? months.map(m => `<option value="${esc(m)}">${esc(monthLabel(m))}</option>`).join("")
      : '<option value="">No months</option>';
    monthSelect.disabled = !months.length;
    if (selectedMonth && months.includes(selectedMonth)) monthSelect.value = selectedMonth;
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
    const monthSelect = ensureMonthSelect(sessionId, monthId);
    if (!sessionSelect || !monthSelect) return;

    if (!monthSelect.dataset.bound) {
      monthSelect.dataset.bound = "true";
      monthSelect.addEventListener("change", () => {
        const sorted = sortedSessions();
        const count = populateSessionSelect(sessionSelect, sorted, monthSelect.value);
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

  // Replace the base implementation before Admin login/load. Each selector now
  // contains only sessions from one month, so it stays short even after years.
  fillSelects = function () {
    const sorted = sortedSessions();

    const bookingMonth = ensureMonthSelect("bookingSession", "bookingMonth");
    const announceMonth = ensureMonthSelect("announceSession", "announceMonth");
    const bookingSession = $("bookingSession");
    const announceSession = $("announceSession");

    const previousBookingMonth = bookingMonth?.value || "";
    const previousAnnouncementMonth = announceMonth?.value || "";
    const previousBookingSession = bookingSession?.value || "";
    const previousAnnouncementSession = announceSession?.value || "";

    const bookingSelectedMonth = preferredMonth(sorted, previousBookingMonth);
    const announceSelectedMonth = preferredMonth(sorted, previousAnnouncementMonth);

    if (bookingMonth) {
      populateMonthSelect(bookingMonth, sorted, bookingSelectedMonth);
      bookingMonth.value = bookingSelectedMonth;
    }
    if (announceMonth) {
      populateMonthSelect(announceMonth, sorted, announceSelectedMonth);
      announceMonth.value = announceSelectedMonth;
    }

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
