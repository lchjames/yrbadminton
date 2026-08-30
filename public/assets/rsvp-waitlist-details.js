(() => {
  const list = document.getElementById("list");
  if (!list) return;

  function enhanceWaitlistRows() {
    const remaining = typeof currentRemaining !== "undefined"
      ? Math.max(0, Number(currentRemaining) || 0)
      : 0;

    list.querySelectorAll(".waitlist-attendee").forEach(row => {
      const paxBadge = row.querySelector(".waitlist-pax");
      const extra = paxBadge ? Math.max(0, Number(String(paxBadge.textContent || "").replace(/[^0-9]/g, "")) || 0) : 0;
      const players = 1 + extra;

      let detail = row.querySelector(".waitlist-requirement");
      if (!detail) {
        detail = document.createElement("span");
        detail.className = "waitlist-requirement";
        const badge = row.querySelector(".waitlist-badge");
        if (badge) badge.insertAdjacentElement("beforebegin", detail);
        else row.appendChild(detail);
      }

      detail.innerHTML = `
        <strong>${players} ${players === 1 ? "player" : "players"}</strong>
        <span>需要 ${players} 個位 / Needs ${players} ${players === 1 ? "spot" : "spots"}</span>
        <span>${remaining} available</span>
      `;

      if (paxBadge) paxBadge.classList.add("waitlist-pax-legacy");
    });
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(enhanceWaitlistRows);
  });

  observer.observe(list, { childList: true, subtree: true });
  enhanceWaitlistRows();
})();
