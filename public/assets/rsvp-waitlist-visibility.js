(() => {
  const WAITLIST_EMAIL_VISIBLE_THRESHOLD = 2;
  let capacityDataSessionId = "";
  let lastRequestedSessionId = "";

  function refreshWaitlistUI() {
    updateWaitlistEmailUI();
  }

  function scheduleWaitlistRefresh() {
    queueMicrotask(refreshWaitlistUI);
    requestAnimationFrame(refreshWaitlistUI);
    setTimeout(refreshWaitlistUI, 80);
    setTimeout(refreshWaitlistUI, 300);
  }

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

    const submitLabel = $("submitBtn")?.querySelector("span:first-child");
    if (submitLabel && chosenStatus() === "YES") {
      submitLabel.textContent = "確認登記 / Submit RSVP";
    }

    if ($("summary")) {
      $("summary").innerHTML = '<div class="empty-state">正在載入此場次資料…<span>Loading this session…</span></div>';
    }
    if ($("list")) $("list").innerHTML = "";
    if ($("capacityText")) $("capacityText").textContent = "正在載入出席資料… / Loading attendance…";
    if ($("remainingText")) $("remainingText").textContent = "";
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

    // renderAttendance updates the capacity globals synchronously. Re-run the
    // visibility calculation after the render so no stale pre-render state can
    // survive on screen.
    scheduleWaitlistRefresh();
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
      && Number.isFinite(Number(currentRemaining))
    );
    const nearCapacity = hasCurrentSessionCapacityData
      && Number(currentRemaining) <= WAITLIST_EMAIL_VISIBLE_THRESHOLD;
    const hasWaitingQueue = hasCurrentSessionCapacityData
      && Number(currentWaitlistCount) > 0;
    const required = hasCurrentSessionCapacityData ? needsWaitlistEmail() : false;

    const show = Boolean(
      session?.isOpen
      && hasCurrentSessionCapacityData
      && !nameIsConfirmed
      && (nearCapacity || hasWaitingQueue)
    );

    wrap.classList.toggle("hidden", !show);
    input.required = show && required;

    const submitLabel = $("submitBtn")?.querySelector("span:first-child");
    if (submitLabel && isYes) {
      submitLabel.textContent = show && required
        ? "加入候補名單 / Join Waiting List"
        : "確認登記 / Submit RSVP";
    }
  };

  // app.js originally registered the old updateWaitlistEmailUI function object
  // directly on the Name input. Reassigning the global function later does not
  // replace that already-registered listener. These listeners run afterwards
  // and always apply the latest session-aware calculation as the final state.
  const nameInput = $("name");
  if (nameInput && !nameInput.dataset.waitlistRefreshBound) {
    nameInput.dataset.waitlistRefreshBound = "true";
    ["input", "change", "blur"].forEach(type => {
      nameInput.addEventListener(type, () => queueMicrotask(refreshWaitlistUI));
    });
  }

  const paxInput = $("pax");
  if (paxInput && !paxInput.dataset.waitlistRefreshBound) {
    paxInput.dataset.waitlistRefreshBound = "true";
    ["input", "change"].forEach(type => {
      paxInput.addEventListener(type, () => queueMicrotask(refreshWaitlistUI));
    });
  }

  document.querySelectorAll('input[name="status"]').forEach(radio => {
    if (radio.dataset.waitlistRefreshBound) return;
    radio.dataset.waitlistRefreshBound = "true";
    radio.addEventListener("change", () => queueMicrotask(refreshWaitlistUI));
  });

  // Browser autofill can populate Name after script execution without firing an
  // input event. A few lightweight delayed checks keep the initial UI correct.
  window.addEventListener("pageshow", scheduleWaitlistRefresh);
  window.addEventListener("focus", scheduleWaitlistRefresh);
  scheduleWaitlistRefresh();
})();
