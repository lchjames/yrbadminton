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

  // A response for one session must never be rendered after the user has
  // already switched to another date.
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

  updateWaitlistEmailUI = function () {
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
    const hasWaitingQueue = hasCurrentSessionCapacityData
      && Number(currentWaitlistCount) > 0;
    const required = hasCurrentSessionCapacityData ? needsWaitlistEmail() : false;

    // Never let a forced/error state bypass the facts for the selected session.
    // Existing confirmed attendees must not see a Join Waiting List action, and
    // an ordinary session with plenty of capacity must not inherit another
    // session's waiting-list UI. A live queue remains visible because new RSVPs
    // cannot bypass it even if some capacity is technically unused.
    const show = Boolean(
      session?.isOpen
      && hasCurrentSessionCapacityData
      && !nameIsConfirmed
      && (nearCapacity || hasWaitingQueue)
    );

    wrap.classList.toggle("hidden", !show);
    input.required = show && required;

    if (!isYes) return;

    $("submitBtn").querySelector("span:first-child").textContent = show && required
      ? "加入候補名單 / Join Waiting List"
      : "確認登記 / Submit RSVP";
  };

  updateWaitlistEmailUI();
})();
