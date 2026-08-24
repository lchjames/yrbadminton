import app, { retryPendingWaitlistEmails } from "./index.js";
import { sendEmail } from "./mail.js";

const MONDAY_AUTO_OPEN_CRON = "5 14 * * SUN";
const THURSDAY_REMINDER_CRON = "0 12 * * THU";
const LOW_REG_THRESHOLD = 20;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function adminAuthorised(request, env) {
  const expected = String(env.ADMIN_KEY || "");
  if (!expected) return false;
  return (request.headers.get("x-admin-key") || "") === expected;
}

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase().slice(0, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

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
  const row = await db.prepare(`
    SELECT COALESCE(SUM(pax), 0) AS registered
    FROM bookings
    WHERE session_id = ? AND status = 'YES'
  `).bind(session.id).first();

  const registered = Math.max(0, Number(row?.registered) || 0);
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

async function sendManualTestEmail(env) {
  const session = await getOpenUpcomingSession(env.DB);

  if (!session) {
    const delivery = await sendEmail(env, {
      subject: "YR Badminton — Test Email",
      text: [
        "YR Badminton email test completed successfully.",
        "",
        "No open upcoming session is currently available.",
        "",
        "https://yrbadminton.lchjames.com/"
      ].join("\n"),
      html: `
        <h2>YR Badminton email test completed successfully</h2>
        <p>No open upcoming session is currently available.</p>
        <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
      `
    });
    return { action: "test_email_sent", ...delivery, session: null };
  }

  const summary = await getRegistrationSummary(env.DB, session);
  const subject = `YR Badminton — Test Email (${session.event_date})`;
  const text = [
    "YR Badminton email test completed successfully.",
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
    <h2>YR Badminton email test completed successfully</h2>
    <p><strong>Date:</strong> ${htmlEscape(session.event_date)}<br>
    <strong>Time:</strong> ${htmlEscape(session.start_time)}–${htmlEscape(session.end_time)}<br>
    <strong>Venue:</strong> ${htmlEscape(session.venue)}<br>
    <strong>Registered:</strong> ${summary.registered} / ${summary.capacity}<br>
    <strong>Remaining:</strong> ${summary.remaining}</p>
    <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
  `;

  const delivery = await sendEmail(env, { subject, text, html });
  return {
    action: "test_email_sent",
    ...delivery,
    session: session.event_date,
    registered: summary.registered
  };
}

async function sendManualWaitlistTestEmail(env, recipient) {
  const to = validEmail(recipient);
  if (!to) throw new Error("Please enter a valid email address");

  const session = await getOpenUpcomingSession(env.DB);
  const date = session?.event_date || "TEST SESSION";
  const start = session?.start_time || "17:00";
  const end = session?.end_time || "19:00";
  const venue = session?.venue || "Goodminton";

  const subject = `YR Badminton — Waitlist Promotion Test (${date})`;
  const text = [
    "YR Badminton 候補補位通知測試。",
    "YR Badminton waitlist promotion email test.",
    "",
    "候補名單已有空位，你已自動升級為正式出席。",
    "A space became available and you have been automatically moved from the waiting list to the confirmed attendance list.",
    "",
    `Date: ${date}`,
    `Time: ${start}–${end}`,
    `Venue: ${venue}`,
    "Players: 1",
    "",
    "You do not need to confirm again.",
    "如果未能出席，請到網站將狀態更新為 NO。",
    "",
    "https://yrbadminton.lchjames.com/",
    "",
    "[TEST EMAIL — no booking was changed]"
  ].join("\n");

  const html = `
    <h2>YR Badminton — 候補補位測試 / Waitlist Promotion Test</h2>
    <p>候補名單已有空位，你已<strong>自動升級為正式出席</strong>。<br>
    A space became available and you have been <strong>automatically moved to the confirmed attendance list</strong>.</p>
    <p><strong>Date:</strong> ${htmlEscape(date)}<br>
    <strong>Time:</strong> ${htmlEscape(start)}–${htmlEscape(end)}<br>
    <strong>Venue:</strong> ${htmlEscape(venue)}<br>
    <strong>Players:</strong> 1</p>
    <p>You do not need to confirm again. 如果未能出席，請到網站將狀態更新為 NO。</p>
    <p><a href="https://yrbadminton.lchjames.com/">Open YR Badminton RSVP</a></p>
    <hr>
    <p><small><strong>TEST EMAIL</strong> — no booking or waiting-list record was changed.</small></p>
  `;

  const delivery = await sendEmail(env, { to, subject, text, html });
  return {
    action: "waitlist_test_email_sent",
    ...delivery,
    session: session?.event_date || null
  };
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

  const delivery = await sendEmail(env, { subject, text, html });
  return { action: "email_sent", registered: summary.registered, ...delivery };
}

async function runScheduled(controller, env) {
  let result;
  switch (controller.cron) {
    case MONDAY_AUTO_OPEN_CRON:
      await closePastSessions(env);
      result = await createOrOpenNextSunday(env);
      break;

    case THURSDAY_REMINDER_CRON:
      await closePastSessions(env);
      result = await sendLowRegistrationReminder(env);
      break;

    default:
      console.log("Unknown cron trigger:", controller.cron);
      result = { action: "ignored" };
  }

  const waitlistEmailRetry = await retryPendingWaitlistEmails(env);
  return { ...result, waitlistEmailRetry };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/test-email" && request.method === "POST") {
      if (!adminAuthorised(request, env)) {
        return json({ ok: false, error: "unauthorised" }, 401);
      }

      try {
        const result = await sendManualTestEmail(env);
        return json({ ok: true, ...result });
      } catch (error) {
        const message = String(error?.message || error || "Email sending failed").trim();
        console.error("Manual test email failed:", message);
        return json({ ok: false, error: message || "Email sending failed" }, 500);
      }
    }

    if (url.pathname === "/api/test-waitlist-email" && request.method === "POST") {
      if (!adminAuthorised(request, env)) {
        return json({ ok: false, error: "unauthorised" }, 401);
      }

      try {
        const payload = await request.json();
        const result = await sendManualWaitlistTestEmail(env, payload?.to);
        return json({ ok: true, ...result });
      } catch (error) {
        const message = String(error?.message || error || "Waitlist email test failed").trim();
        console.error("Manual waitlist email test failed:", message);
        return json({ ok: false, error: message || "Waitlist email test failed" }, 500);
      }
    }

    return app.fetch(request, env, ctx);
  },

  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env));
  }
};
