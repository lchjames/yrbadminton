(() => {
  const WAITLIST_EMAIL_VISIBLE_THRESHOLD = 2;

  updateWaitlistEmailUI = function (force = false) {
    const wrap = $("waitlistEmailWrap");
    const input = $("waitlistEmail");
    if (!wrap || !input) return;

    const session = selectedSession();
    const isYes = chosenStatus() === "YES";
    const nameIsConfirmed = confirmedNameKeys.has(localNameKey($("name").value));
    const hasCapacityData = Boolean($("summary")?.children.length);
    const nearCapacity = hasCapacityData
      && Number.isFinite(Number(currentRemaining))
      && Number(currentRemaining) <= WAITLIST_EMAIL_VISIBLE_THRESHOLD;
    const required = needsWaitlistEmail();

    // Visibility is driven by session capacity, not by the currently selected
    // attendance radio. Session tab changes intentionally reset attendance,
    // but the email field should remain visible whenever the open session has
    // two or fewer spaces remaining. It only becomes required when this RSVP
    // would actually enter the waiting list.
    const show = force || (
      session?.isOpen
      && !nameIsConfirmed
      && nearCapacity
    );

    wrap.classList.toggle("hidden", !show);
    input.required = required;

    if (!isYes) return;

    $("submitBtn").querySelector("span:first-child").textContent = required
      ? "加入候補名單 / Join Waiting List"
      : "確認登記 / Submit RSVP";
  };

  // Re-evaluate immediately after replacing the base UI helper.
  updateWaitlistEmailUI();
})();
