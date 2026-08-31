(() => {
  const WAITLIST_EMAIL_VISIBLE_THRESHOLD = 2;
  let capacityDataSessionId = "";
  let lastRequestedSessionId = "";

  function resetSessionScopedAttendanceUI(requestedSessionId) {
    capacityDataSessionId = "";
    currentRemaining = Number.NaN;
    currentWaitlistCount = 0;
    confirmedNameKeys = new Set();

    const wrap = $("waitlistEmailWrap");
    const input = $("waitlistEmail");
    if (wrap) wrap.classList.add("hidden");
    if (input) {
      input.required = false;
      if (lastRequestedSessionId && lastRequestedSessionId !== requestedSessionId) {
        input.value = "";
      }
    }

    if ($("summary")) {
      $("summary").innerHTML = '<div class="empty-state">正在載入此場次資料…<span>Loading this session…</span></div>';
    }
    if ($("list")) {
      $("list").innerHTML = "";
    }
    if ($("capacityText")) {
      $("capacityText").textContent = "正在載入出席資料… / Loading attendance…";
    }
    if ($("remainingText")) {
      $("remainingText").textContent = "";
    }
    if ($("capacityBar")) {
      $("capacityBar").style.width = "0%";
      $("capacityBar").className = "capacity-fill capacity-green";
    }
  }

  // Make attendance loading session-safe. A response for 30/8 must never be
  // rendered after the user has already switched to 06/09 (or any other date).
  loadList = async function () {
    const requestedSessionId = selectedSessionId;
    if (!requestedSessionId) return;

    resetSessionScopedAttendanceUI(requestedSessionId);
    lastRequestedSessionId = requestedSessionId;

    const data = await get({ action: "list", sessionId: requestedSessionId });
    if (selectedSessionId !== requestedSessionId) return;

    capacityDataSessionId = requestedSessionId;
    renderAttendance(data);
  };

  updateWaitlistEmailUI = function (force = false) {
    const wrap = $("waitlistEmailWrap");
    const input = $("waitlistEmail");
    if (!wrap || !input) return;

    const session = selectedSession();
    const isYes = chosenStatus() === "YES";
    const nameIsConfirmed = confirmedNameKeys.has(localNameKey($("name").value));
    const hasCurrentSessionCapacityData = Boolean(
      selectedSessionId
      && capacityDataSessionId === selectedSessionId
      && $("summary")?.children.length
      && Number.isFinite(Number(currentRemaining))
    );
    const nearCapacity = hasCurrentSessionCapacityData
      && Number(currentRemaining) <= WAITLIST_EMAIL_VISIBLE_THRESHOLD;
    const required = hasCurrentSessionCapacityData ? needsWaitlistEmail() : false;

    // Capacity and waiting-list state is scoped to the selected session.
    // While a newly selected session is loading, keep this field hidden rather
    // than reusing the previous session's remaining/waiting values.
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

  // Re-evaluate immediately after replacing the base helpers.
  updateWaitlistEmailUI();
})();
