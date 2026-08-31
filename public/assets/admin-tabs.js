(() => {
  const app = document.getElementById("adminApp");
  if (!app || document.getElementById("adminViewTabs")) return;

  const toolbar = app.querySelector(".admin-toolbar");
  const globalMsg = document.getElementById("adminMsg");
  const overview = app.querySelector(".admin-overview");
  const primaryGrid = Array.from(app.querySelectorAll(":scope > .admin-two-column"))
    .find(node => !node.classList.contains("admin-operations"));
  const automationPanel = primaryGrid?.querySelector(".automation-panel") || null;
  const newSessionPanel = primaryGrid
    ? Array.from(primaryGrid.children).find(node => node !== automationPanel) || null
    : null;
  const sessionsPanel = app.querySelector(":scope > .sessions-panel");
  const operations = app.querySelector(":scope > .admin-operations");
  const operationPanels = operations ? Array.from(operations.children) : [];
  const bookingsPanel = operationPanels.find(panel => panel.querySelector("#bookingSession")) || null;
  const announcementPanel = operationPanels.find(panel => panel.querySelector("#announceSession")) || null;

  if (!toolbar) return;

  const topTabs = document.createElement("nav");
  topTabs.id = "adminViewTabs";
  topTabs.className = "admin-view-tabs";
  topTabs.setAttribute("aria-label", "Admin main sections");
  topTabs.innerHTML = `
    <button class="admin-view-tab is-active" type="button" data-admin-view="management" aria-selected="true">管理 / Management</button>
    <button class="admin-view-tab" type="button" data-admin-view="testing" aria-selected="false">測試工具 / Testing</button>
  `;

  function makeView(id, label, tools) {
    const view = document.createElement("section");
    view.id = id;
    view.className = "admin-tab-view";

    const nav = document.createElement("nav");
    nav.className = "admin-tool-tabs";
    nav.setAttribute("aria-label", label);
    nav.innerHTML = tools.map((tool, index) => `
      <button class="admin-tool-tab${index === 0 ? " is-active" : ""}" type="button"
              data-admin-tool="${tool.id}" aria-selected="${index === 0 ? "true" : "false"}">${tool.label}</button>
    `).join("");

    const panes = document.createElement("div");
    panes.className = "admin-tool-panes";
    tools.forEach((tool, index) => {
      const pane = document.createElement("section");
      pane.className = "admin-tool-pane";
      pane.dataset.adminToolPane = tool.id;
      pane.hidden = index !== 0;
      panes.appendChild(pane);
    });

    view.append(nav, panes);
    return view;
  }

  const managementTools = [
    { id: "overview", label: "總覽 / Overview" },
    { id: "automation", label: "自動化 / Automation" },
    { id: "new-session", label: "新增場次 / New Session" },
    { id: "sessions", label: "場次 / Sessions" },
    { id: "bookings", label: "出席名單 / Bookings" },
    { id: "announcement", label: "公告 / Announcement" }
  ];

  const testingTools = [
    { id: "monday-test", label: "Monday Test" },
    { id: "email-test", label: "Email Test" },
    { id: "waitlist-test", label: "Waitlist Email Test" }
  ];

  const managementView = makeView("adminManagementView", "Management tools", managementTools);
  const testingView = makeView("adminTestingView", "Testing tools", testingTools);
  testingView.hidden = true;

  toolbar.insertAdjacentElement("afterend", topTabs);
  if (globalMsg) topTabs.insertAdjacentElement("afterend", globalMsg);
  (globalMsg || topTabs).insertAdjacentElement("afterend", managementView);
  managementView.insertAdjacentElement("afterend", testingView);

  const pane = (view, id) => view.querySelector(`[data-admin-tool-pane="${id}"]`);

  if (overview) pane(managementView, "overview")?.appendChild(overview);
  if (automationPanel) pane(managementView, "automation")?.appendChild(automationPanel);
  if (newSessionPanel) pane(managementView, "new-session")?.appendChild(newSessionPanel);
  if (sessionsPanel) pane(managementView, "sessions")?.appendChild(sessionsPanel);
  if (bookingsPanel) pane(managementView, "bookings")?.appendChild(bookingsPanel);
  if (announcementPanel) pane(managementView, "announcement")?.appendChild(announcementPanel);

  primaryGrid?.remove();
  operations?.remove();

  function makeTestingPanel(kicker, title, copy, warning = "") {
    const panel = document.createElement("article");
    panel.className = "admin-panel admin-testing-tool-panel";
    panel.innerHTML = `
      <div class="admin-panel-heading">
        <div>
          <p class="admin-section-kicker">${kicker}</p>
          <h2>${title}</h2>
        </div>
        <span class="admin-status-badge neutral">MANUAL ONLY</span>
      </div>
      <p class="admin-panel-copy">${copy}</p>
      ${warning ? `<div class="admin-testing-warning">${warning}</div>` : ""}
      <div class="admin-testing-controls"></div>
    `;
    return panel;
  }

  const mondayPanel = makeTestingPanel(
    "SCHEDULE TEST",
    "Monday Automation",
    "立即執行正式 Monday automation 邏輯，檢查下一個星期日場次的建立／開放流程。 / Runs the production Monday automation logic immediately.",
    "注意：此測試會修改 production D1，可能建立新場次或改變 OPEN 狀態。 / This test can change production session data."
  );
  const emailPanel = makeTestingPanel(
    "EMAIL TEST",
    "General Email Relay",
    "測試 Worker → Google Apps Script → Gmail 的基本寄信鏈路。 / Tests the basic mail relay to the administrator address."
  );
  const waitlistPanel = makeTestingPanel(
    "WAITLIST EMAIL TEST",
    "候補補位通知 / Waitlist Promotion Email",
    "輸入測試收件地址，模擬候補者自動補位成功後收到的 Email；不修改 RSVP 或候補資料。 / Sends a promotion-style test email without changing booking data."
  );

  pane(testingView, "monday-test")?.appendChild(mondayPanel);
  pane(testingView, "email-test")?.appendChild(emailPanel);
  pane(testingView, "waitlist-test")?.appendChild(waitlistPanel);

  const move = (id, target) => {
    const node = document.getElementById(id);
    const controls = target?.querySelector(".admin-testing-controls");
    if (node && controls) controls.appendChild(node);
  };

  move("runAutoBtn", mondayPanel);
  move("autoMsg", mondayPanel);
  move("testEmailBtn", emailPanel);
  move("testEmailMsg", emailPanel);

  const waitButton = document.getElementById("testWaitlistEmailBtn");
  const waitSection = waitButton?.parentElement;
  const waitControls = waitlistPanel.querySelector(".admin-testing-controls");
  if (waitSection && waitControls) {
    const waitLabel = waitSection.querySelector('label[for="waitlistTestEmail"]');
    const waitInput = document.getElementById("waitlistTestEmail");
    const waitMsg = document.getElementById("testWaitlistEmailMsg");
    [waitLabel, waitInput, waitButton, waitMsg].forEach(node => {
      if (node) waitControls.appendChild(node);
    });
    waitSection.remove();
  }

  function activateTool(view, toolId) {
    view.querySelectorAll("[data-admin-tool]").forEach(button => {
      const active = button.dataset.adminTool === toolId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    view.querySelectorAll("[data-admin-tool-pane]").forEach(toolPane => {
      toolPane.hidden = toolPane.dataset.adminToolPane !== toolId;
    });
  }

  [managementView, testingView].forEach(view => {
    view.querySelector(".admin-tool-tabs")?.addEventListener("click", event => {
      const button = event.target.closest("button[data-admin-tool]");
      if (!button) return;
      activateTool(view, button.dataset.adminTool);
    });
  });

  function activateView(viewName) {
    const testing = viewName === "testing";
    managementView.hidden = testing;
    testingView.hidden = !testing;

    topTabs.querySelectorAll("[data-admin-view]").forEach(button => {
      const active = button.dataset.adminView === viewName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  topTabs.addEventListener("click", event => {
    const button = event.target.closest("button[data-admin-view]");
    if (!button) return;
    activateView(button.dataset.adminView);
  });

  const observer = new MutationObserver(() => {
    if (!app.hidden) {
      activateView("management");
      activateTool(managementView, "overview");
      activateTool(testingView, "monday-test");
    }
  });
  observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });

  activateView("management");
  activateTool(managementView, "overview");
  activateTool(testingView, "monday-test");
})();
