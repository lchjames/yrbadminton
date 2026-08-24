(() => {
  const anchor = document.getElementById("testEmailMsg");
  if (!anchor) return;

  const section = document.createElement("div");
  section.innerHTML = `
    <div class="admin-automation-divider"></div>
    <div class="admin-panel-heading compact">
      <div>
        <p class="admin-section-kicker">WAITLIST EMAIL TEST</p>
        <h3>候補補位通知測試</h3>
      </div>
      <span class="admin-status-badge neutral">MANUAL</span>
    </div>
    <p class="admin-panel-copy">直接測試候補者收到的自動補位 Email。不會修改任何 RSVP 或候補資料。</p>
    <label class="admin-field-label" for="waitlistTestEmail">Recipient Email</label>
    <input id="waitlistTestEmail" class="admin-input" type="email" autocomplete="email" placeholder="your@email.com">
    <button id="testWaitlistEmailBtn" class="admin-secondary-btn full" type="button">寄送候補測試電郵 / Send Waitlist Test Email</button>
    <div id="testWaitlistEmailMsg" class="admin-message"></div>
  `;

  anchor.insertAdjacentElement("afterend", section);

  const input = document.getElementById("waitlistTestEmail");
  const button = document.getElementById("testWaitlistEmailBtn");
  const message = document.getElementById("testWaitlistEmailMsg");

  async function sendWaitlistTest() {
    const to = input.value.trim();
    if (!to || !input.checkValidity()) {
      message.textContent = "請輸入有效 Email / Please enter a valid email address.";
      input.focus();
      return;
    }

    button.disabled = true;
    message.textContent = "正在寄送候補測試電郵… / Sending waitlist test email…";

    try {
      const response = await fetch("/api/test-waitlist-email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": key()
        },
        body: JSON.stringify({ to })
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status === 401) lockAdmin("Admin Key 不正確 / Invalid Admin Key");
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      message.textContent = `候補測試電郵已寄出 / Waitlist test sent → ${result.to}`;
    } catch (error) {
      message.textContent = `寄送失敗 / Failed: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  }

  button.addEventListener("click", sendWaitlistTest);
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") sendWaitlistTest();
  });
})();
