(() => {
  const list = document.getElementById("list");
  if (!list) return;

  function totalPlayersFromBadge(badge) {
    if (!badge) return 1;

    const stored = Number(badge.dataset.totalPax || 0);
    if (stored > 0) return stored;

    const text = String(badge.textContent || "").trim();
    const value = Math.max(0, Number(text.replace(/[^0-9]/g, "")) || 0);

    if (/^\+/.test(text)) return Math.max(1, 1 + value);
    if (/^[×xX]/.test(text)) return Math.max(1, value);
    return Math.max(1, value || 1);
  }

  function normaliseConfirmedRows() {
    list.querySelectorAll(".user-attendee:not(.waitlist-attendee)").forEach(row => {
      let badge = row.querySelector(".pax-badge");
      const players = totalPlayersFromBadge(badge);

      if (!badge) {
        badge = document.createElement("span");
        badge.className = "pax-badge";
        row.appendChild(badge);
      }

      const nextText = `×${players}`;
      if (badge.dataset.totalPax !== String(players)) badge.dataset.totalPax = String(players);
      if (badge.textContent !== nextText) badge.textContent = nextText;
      if (badge.getAttribute("aria-label") !== `${players} players`) {
        badge.setAttribute("aria-label", `${players} players`);
      }
      badge.title = `${players} player${players === 1 ? "" : "s"}`;
    });
  }

  function enhanceWaitlistRows() {
    const remaining = typeof currentRemaining !== "undefined"
      ? Math.max(0, Number(currentRemaining) || 0)
      : 0;

    list.querySelectorAll(".waitlist-attendee").forEach(row => {
      const paxBadge = row.querySelector(".waitlist-pax");
      const players = totalPlayersFromBadge(paxBadge);

      if (paxBadge) {
        const nextText = `×${players}`;
        if (paxBadge.dataset.totalPax !== String(players)) paxBadge.dataset.totalPax = String(players);
        if (paxBadge.textContent !== nextText) paxBadge.textContent = nextText;
        paxBadge.classList.add("waitlist-pax-legacy");
      }

      let detail = row.querySelector(".waitlist-requirement");
      if (!detail) {
        detail = document.createElement("span");
        detail.className = "waitlist-requirement";
        const badge = row.querySelector(".waitlist-badge");
        if (badge) badge.insertAdjacentElement("beforebegin", detail);
        else row.appendChild(detail);
      }

      const signature = `${players}:${remaining}`;
      if (detail.dataset.signature !== signature) {
        detail.dataset.signature = signature;
        detail.innerHTML = `
          <strong aria-label="${players} players">×${players}</strong>
          <span>需要 ${players} 個位 / Needs ${players} ${players === 1 ? "spot" : "spots"}</span>
          <span>${remaining} available</span>
        `;
      }
    });
  }

  let scheduled = false;
  function enhanceRows() {
    scheduled = false;
    normaliseConfirmedRows();
    enhanceWaitlistRows();
  }

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhanceRows);
  });

  observer.observe(list, { childList: true, subtree: true });
  enhanceRows();
})();
