import app from "./index.js";

const MONDAY_AUTO_OPEN_CRON = "5 14 * * SUN";
const TEST_CRON = "20 12 * * WED";
const THURSDAY_REMINDER_CRON = "0 12 * * THU";
const LOW_REG_THRESHOLD = 20;

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function makePublicId(date, start, venue) {
  return `${date}-${start.replace(":", "")}-${slug(venue) || "court"}-${crypto.randomUUID().slice(0, 8)}`;
}

function brisbaneToday() {
  const now = new Date(Date.now() + 10 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function nextSundayFromBrisbaneNow() {
  const brisbaneNow = new Date(Date.now() + 10 * 60 * 60 * 1000);
  const day = brisbaneNow.getUTCDay();
  const daysUntilSunday = (7 - day) % 7 || 7;
  const target = new Date(brisbaneNow);
  target.setUTCDate(target.getUTCDate() + daysUntilSunday);
  return target.toISOString().slice(0, 10);
}

async function getSetting(db, key, fallback) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row?.value ?? fallback;
}

async function closePastSessions(env) {
  const today = brisbaneToday();
  await env.DB.prepare(`
    UPDATE sessions
    SET is_open = 0, updated_at = CURRENT_TIMESTAMP
    WHERE event_date < ? AND is_open = 1
  `).bind(today).run();
}

async function createOrOpenNextSunday(env) {
  const db = env.DB;
  const date = nextSundayFromBrisbaneNow();
  const venue = await getSetting(db, "default_venue", "Goodminton");
  const capacity = Math.max(1, Number(await getSetting(db, "default_capacity", "26")) || 26);
  const start = await getSetting(db, "default_start", "17:00");
  const end = await getSetting(db, "default_end", "19:00");

  const existing = await db.prepare(`
    SELECT id, public_id
    FROM sessions
    WHERE event_date = ? AND start_time = ? AND venue = ?
  `).bind(date, start, venue).first();

  await db.prepare("UPDATE sessions SET is_open = 0, updated_at = CURRENT_TIMESTAMP WHERE is_open = 1").run();

  if (existing) {
    await db.prepare(`
      UPDATE sessions SET is_open = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(existing.id).run();
    return { action: "opened_existing", date, sessionId: existing.public_id };
  }

  const publicId = makePublicId(date, start, venue);
  await db.prepare(`
    INSERT INTO sessions(public_id, title, event_date, start_time, end_time, venue, capacity, note, is_open)
    VALUES (?, 'YR Badminton', ?, ?, ?, ?, ?, '', 1)
  `).bind(publicId, date, start, end, venue, capacity).run();

  return { action: "created_and_opened", date, sessionId: publicId };
}

async function getSessionByPublicId(db, publicId) {
  return db.prepare(`
    SELECT id, public_id, title, event_date, start_time, end_time, venue, capacity, is_open
    FROM sessions
    WHERE public_id = ?
  `).bind(publicId).first();
}

async function getOpenUpcomingSession(db) {
  const today = brisbaneToday();
  return db.prepare(`
    SELECT id, public_id, title, event_date, start_time, end_time, venue, capacity, is_open
    FROM sessions
    WHERE is_open = 1 AND event_date >= ?
    ORDER BY event_date ASC, start_time ASC, id ASC
    LIMIT 1
  `).bind(today).first();
}

async function getRegistrationSummary(db, session) {
  const { results = [] } = await db.prepare(`
    SELECT status, pax
    FROM bookings
    WHERE session_id = ?
    ORDER BY updated_at ASC, id ASC
  `).bind(session.id).run();

  let registered = 0;
  for (const row of results) {
    if (row.status === "YES") registered += Math.max(1, Number(row.pax) || 1);
  }

  const capacity = Number(session.capacity) || 26;
  return {
    registered,
    capacity,
    remaining: Math.max(0, capacity - registered)
  };
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

async function sendEmail(env, { subject, text, html }) {
  if (!env.EMAIL) throw new Error("EMAIL binding is not configured");

  const to = env.ALERT_EMAIL_TO || "apswsttss@gmail.com";
  const from = env.ALERT_EMAIL_FROM || "badyrminton@lchjames.com";

  return env.EMAIL.send({
    to,
    from: { email: from, name: "YR Badminton" },
    subject,
    text,
    html
  });
}

async function sendAutomationTestEmail(env, automationResult) {
  const session = await getSessionByPublicId(env.DB, automationResult.sessionId);
  if (!session) throw new Error("automation session not found");

  const summary = await getRegistrationSummary(env.DB, session);
  const actionText = automationResult.action === "opened_existing"
    ? "Existing Sunday session was changed to OPEN."
    : "A new Sunday session was created and opened.";

  const subject = `YR Badminton Automation Test — ${session.event_date}`;
  const text = [
    "YR Badminton automation test completed.",
    "",
    actionText,
    `Date: ${session.event_date}`,
    `Time: ${session.start_time}–${session.end_time}`,
    `Venue: ${session.venue}`,
    `Registered: ${summary.registered} / ${summary.capacity}`,
    `Remaining: ${summary.remaining}`,
    "",
    "https://yrbadminton.lchjames.com/"
  ].join("\n");

  const html = `
    <h2>YR Badminton automation test completed</h2>
    <p>${htmlEscape(actionText)}</p>
    <p><strong>Date:</strong> ${htmlEscape(session.event_date)}<br>
    <strong>Time:</strong> ${htmlEscape(session.start_time)}–${htmlEscape(session.end_time)}<br>
    <strong>Venue:</strong> ${htmlEscape(session.venue)}<br>
    <strong>Registered:</strong> ${summary.registered} / ${summary.capacity}<br>
    <strong>Remaining:</strong> ${summary.remaining}</p>
    <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
  `;

  return sendEmail(env, { subject, text, html });
}

async function sendLowRegistrationReminder(env) {
  const session = await getOpenUpcomingSession(env.DB);
  if (!session) return { action: "no_open_session" };

  const summary = await getRegistrationSummary(env.DB, session);
  if (summary.registered >= LOW_REG_THRESHOLD) {
    return { action: "no_email_needed", registered: summary.registered };
  }

  const subject = `YR Badminton Reminder — Only ${summary.registered} registered`;
  const text = [
    `本星期日目前只有 ${summary.registered} 人登記。`,
    `Only ${summary.registered} players are currently registered for this Sunday.`,
    "",
    `Date: ${session.event_date}`,
    `Time: ${session.start_time}–${session.end_time}`,
    `Venue: ${session.venue}`,
    `Registered: ${summary.registered} / ${summary.capacity}`,
    `Remaining: ${summary.remaining}`,
    "",
    "https://yrbadminton.lchjames.com/"
  ].join("\n");

  const html = `
    <h2>YR Badminton Registration Reminder</h2>
    <p>本星期日目前只有 <strong>${summary.registered}</strong> 人登記。<br>
    Only <strong>${summary.registered}</strong> players are currently registered for this Sunday.</p>
    <p><strong>Date:</strong> ${htmlEscape(session.event_date)}<br>
    <strong>Time:</strong> ${htmlEscape(session.start_time)}–${htmlEscape(session.end_time)}<br>
    <strong>Venue:</strong> ${htmlEscape(session.venue)}<br>
    <strong>Registered:</strong> ${summary.registered} / ${summary.capacity}<br>
    <strong>Remaining:</strong> ${summary.remaining}</p>
    <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
  `;

  await sendEmail(env, { subject, text, html });
  return { action: "email_sent", registered: summary.registered };
}

async function runScheduled(controller, env) {
  switch (controller.cron) {
    case MONDAY_AUTO_OPEN_CRON:
      await closePastSessions(env);
      return createOrOpenNextSunday(env);

    case TEST_CRON: {
      await closePastSessions(env);
      const result = await createOrOpenNextSunday(env);
      try {
        await sendAutomationTestEmail(env, result);
      } catch (error) {
        console.error("Test email failed:", error?.code || "", error?.message || error);
      }
      return result;
    }

    case THURSDAY_REMINDER_CRON:
      await closePastSessions(env);
      return sendLowRegistrationReminder(env);

    default:
      console.log("Unknown cron trigger:", controller.cron);
      return { action: "ignored" };
  }
}

export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  }
};
