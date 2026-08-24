(() => {
  function section(titleZh, titleEn, count, rows, kind) {
    if (!rows.length) return "";

    return `
      <section class="admin-booking-group admin-booking-group-${kind}">
        <div class="admin-booking-group-heading">
          <div>
            <strong>${esc(titleZh)}</strong>
            <span>${esc(titleEn)}</span>
          </div>
          <span class="admin-booking-group-count">${Number(count)}</span>
        </div>
        <div class="admin-booking-group-list">${rows.join("")}</div>
      </section>
    `;
  }

  function confirmedRow(r) {
    return `
      <div class="admin-booking-row admin-booking-confirmed-row">
        <div class="admin-booking-main">
          <div class="admin-booking-name-line">
            <span class="admin-booking-name">${esc(r.name)}</span>
            <span class="admin-booking-state-badge confirmed">CONFIRMED</span>
          </div>
          ${r.note ? `<div class="admin-booking-note">${esc(r.note)}</div>` : ""}
        </div>
        <span class="admin-booking-pax">×${Number(r.pax || 1)}</span>
      </div>
    `;
  }

  function waitlistRow(r, index) {
    const position = Number(r.waitlistPosition || index + 1);
    const email = String(r.email || "").trim();
    return `
      <div class="admin-booking-row admin-booking-waitlist-row">
        <div class="admin-waitlist-position" aria-label="Waiting list position ${position}">#${position}</div>
        <div class="admin-booking-main">
          <div class="admin-booking-name-line">
            <span class="admin-booking-name">${esc(r.name)}</span>
            <span class="admin-booking-state-badge waiting">WAITLIST</span>
          </div>
          ${email ? `<a class="admin-booking-email" href="mailto:${esc(email)}">${esc(email)}</a>` : '<span class="admin-booking-email missing">No email</span>'}
          ${r.note ? `<div class="admin-booking-note">${esc(r.note)}</div>` : ""}
        </div>
        <span class="admin-booking-pax">×${Number(r.pax || 1)}</span>
      </div>
    `;
  }

  function noRow(r) {
    return `
      <div class="admin-booking-row admin-booking-no-row">
        <div class="admin-booking-main">
          <div class="admin-booking-name-line">
            <span class="admin-booking-name">${esc(r.name)}</span>
            <span class="admin-booking-state-badge no">NO</span>
          </div>
          ${r.note ? `<div class="admin-booking-note">${esc(r.note)}</div>` : ""}
        </div>
        <span class="admin-booking-pax">×${Number(r.pax || 1)}</span>
      </div>
    `;
  }

  function reviewRow(r) {
    return `
      <div class="admin-booking-row admin-booking-review-row">
        <div class="admin-booking-main">
          <div class="admin-booking-name-line">
            <span class="admin-booking-name">${esc(r.name)}</span>
            <span class="admin-booking-state-badge review">${esc(r.placement || r.status || "REVIEW")}</span>
          </div>
        </div>
        <span class="admin-booking-pax">×${Number(r.pax || 1)}</span>
      </div>
    `;
  }

  loadBookings = async function () {
    if (!$("bookingSession").value) return;

    const d = await adminPost({
      action: "admin_list_bookings",
      sessionId: $("bookingSession").value
    });

    const current = Array.isArray(d.current) ? d.current : [];
    const confirmed = current.filter(r => r.status === "YES" && r.placement === "CONFIRMED");
    const waiting = current.filter(r => r.placement === "WAITLIST");
    const notAttending = current.filter(r => r.status === "NO");
    const review = current.filter(r =>
      !confirmed.includes(r) && !waiting.includes(r) && !notAttending.includes(r)
    );

    const confirmedPax = Number(d.summary?.confirmedPax || 0);
    const cap = Number(d.summary?.cap || 0);
    const remaining = Number(d.summary?.remaining || 0);
    const waitingCount = Number(d.summary?.waitlistCount || waiting.length || 0);
    const waitingPax = Number(d.summary?.waitlistPax || waiting.reduce((sum, r) => sum + Number(r.pax || 1), 0));

    $("bookingSummary").innerHTML = `
      <div class="admin-booking-summary-grid">
        <div><strong>${confirmedPax}/${cap}</strong><span>Confirmed</span></div>
        <div><strong>${remaining}</strong><span>Remaining</span></div>
        <div class="${waitingCount ? "has-waiting" : ""}"><strong>${waitingCount}</strong><span>Waiting${waitingPax ? ` · ${waitingPax} pax` : ""}</span></div>
      </div>
    `;

    if (!current.length) {
      $("bookings").innerHTML = '<div class="empty">No bookings</div>';
      return;
    }

    $("bookings").innerHTML = [
      section("已確認出席", "Confirmed Attendees", confirmedPax, confirmed.map(confirmedRow), "confirmed"),
      section("候補名單", "Waiting List", waitingCount, waiting.map(waitlistRow), "waiting"),
      section("不出席", "Not Attending", notAttending.length, notAttending.map(noRow), "no"),
      section("需要檢查", "Needs Review", review.length, review.map(reviewRow), "review")
    ].join("");
  };
})();
