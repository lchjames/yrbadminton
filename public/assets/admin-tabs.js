(() => {
  const app = document.getElementById("adminApp");
  if (!app || document.getElementById("adminViewTabs")) return;

  const toolbar = app.querySelector(".admin-toolbar");
  if (!toolbar) return;

  const managementView = document.createElement("div");
  managementView.id = "adminManagementView";

  const movable = Array.from(app.children).filter(node => node !== toolbar);
  movable.forEach(node => managementView.appendChild(node));

  const tabs = document.createElement("nav");
  tabs.id = "adminViewTabs";
  tabs.className = "admin-view-tabs";
  tabs.setAttribute("aria-label", "Admin sections");
  tabs.innerHTML = `
    <button class="admin-view-tab is-active" type="button" data-admin-view="management" aria-selected="true">管理 / Management</button>
    <button class="admin-view-tab" type="button" data-admin-view="testing" aria-selected="false">測試工具 / Testing</button>
  `;

  const testingView = document.createElement("section");
  testingView.id = "adminTestingView";
  testingView.hidden = true;
  testingView.innerHTML = `
    <article class="admin-panel admin-testing-panel">
      <div class="admin-panel-heading">
        <div>
          <p class="admin-section-kicker">TESTING</p>
          <h2>測試工具</h2>
        </div>
        <span class="admin-status-badge neutral">MANUAL ONLY</span>
      </div>
      <p class="admin-testing-intro">這裡只放需要手動驗證時才使用的功能。日常管理請留在「Management」分頁。 / Manual diagnostic tools only. Use the Management tab for normal administration.</p>

      <div class="admin-testing-grid">
        <article class="admin-testing-card">
          <p class="admin-section-kicker">SCHEDULE TEST</p>
          <h3>Monday Automation</h3>
          <p class="admin-panel-copy">立即執行正式 Monday automation 邏輯，檢查下一個星期日場次的建立／開放流程。</p>
          <div class="admin-testing-warning">注意：此測試會修改 production D1，可能建立新場次或改變 OPEN 狀態。 / This test can change production session data.</div>
          <div id="adminMondayTestControls"></div>
        </article>

        <article class="admin-testing-card">
          <p class="admin-section-kicker">EMAIL TEST</p>
          <h3>General Email Relay</h3>
          <p class="admin-panel-copy">測試 Worker → Google Apps Script → Gmail 的基本寄信鏈路，寄到管理員提醒信箱。</p>
          <div id="adminGeneralEmailTestControls"></div>
        </article>

        <article class="admin-testing-card">
          <p class="admin-section-kicker">WAITLIST EMAIL TEST</p>
          <h3>候補補位通知</h3>
          <p class="admin-panel-copy">輸入任意測試收件地址，模擬候補者自動補位成功後收到的 Email。不修改 RSVP 或候補資料。</p>
          <div id="adminWaitlistTestControls"></div>
        </article>
      </div>
    </article>
  `;

  toolbar.insertAdjacentElement("afterend", tabs);
  tabs.insertAdjacentElement("afterend", managementView);
  managementView.insertAdjacentElement("afterend", testingView);

  const move = (id, targetId) => {
    const node = document.getElementById(id);
    const target = document.getElementById(targetId);
    if (node && target) target.appendChild(node);
  };

  move("runAutoBtn", "adminMondayTestControls");
  move("autoMsg", "adminMondayTestControls");
  move("testEmailBtn", "adminGeneralEmailTestControls");
  move("testEmailMsg", "adminGeneralEmailTestControls");

  const waitButton = document.getElementById("testWaitlistEmailBtn");
  const waitSection = waitButton?.parentElement;
  const waitTarget = document.getElementById("adminWaitlistTestControls");
  if (waitSection && waitTarget) {
    const waitLabel = waitSection.querySelector('label[for="waitlistTestEmail"]');
    const waitInput = document.getElementById("waitlistTestEmail");
    const waitMsg = document.getElementById("testWaitlistEmailMsg");
    [waitLabel, waitInput, waitButton, waitMsg].forEach(node => {
      if (node) waitTarget.appendChild(node);
    });
    waitSection.remove();
  }

  function activate(view) {
    const testing = view === "testing";
    managementView.hidden = testing;
    testingView.hidden = !testing;

    tabs.querySelectorAll("[data-admin-view]").forEach(button => {
      const active = button.dataset.adminView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  tabs.addEventListener("click", event => {
    const button = event.target.closest("button[data-admin-view]");
    if (!button) return;
    activate(button.dataset.adminView);
  });

  // Every fresh login returns to the normal management view.
  const observer = new MutationObserver(() => {
    if (!app.hidden) activate("management");
  });
  observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });

  activate("management");
})();
