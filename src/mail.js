export const DEFAULT_ALERT_EMAIL_TO = "apswsttss@gmail.com";
export const DEFAULT_ALERT_EMAIL_FROM = "badyrminton@gmail.com";

function normaliseWaitlistPromotionCopy(text, html) {
  const oldPlain = [
    "You do not need to confirm again.",
    "如果未能出席，請到網站將狀態更新為 NO。"
  ].join("\n");

  const newPlain = [
    "你已自動補位，不需要再次確認。",
    "如果你不能出席，請返回網站並將 RSVP 更新為 NO。",
    "You have been automatically confirmed and do not need to confirm again.",
    "If you can no longer attend, please return to the website and change your RSVP to NO."
  ].join("\n");

  const oldHtml = "<p>You do not need to confirm again. 如果未能出席，請到網站將狀態更新為 NO。</p>";
  const newHtml = `
    <p><strong>你已自動補位，不需要再次確認。</strong><br>
    如果你不能出席，請返回網站並將 RSVP 更新為 <strong>NO</strong>。</p>
    <p><strong>You have been automatically confirmed and do not need to confirm again.</strong><br>
    If you can no longer attend, please return to the website and change your RSVP to <strong>NO</strong>.</p>
  `;

  return {
    text: String(text ?? "").replace(oldPlain, newPlain),
    html: String(html ?? "").replace(oldHtml, newHtml)
  };
}

export async function sendEmail(env, { to = DEFAULT_ALERT_EMAIL_TO, subject, text, html }) {
  const webhookUrl = String(env.MAIL_WEBHOOK_URL || "").trim();
  const webhookSecret = String(env.MAIL_WEBHOOK_SECRET || "").trim();
  const recipient = String(to || DEFAULT_ALERT_EMAIL_TO).trim();

  if (!webhookUrl) throw new Error("MAIL_WEBHOOK_URL is not configured");
  if (!webhookSecret) throw new Error("MAIL_WEBHOOK_SECRET is not configured");
  if (!recipient) throw new Error("Email recipient is not configured");

  const copy = normaliseWaitlistPromotionCopy(text, html);

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: webhookSecret,
        to: recipient,
        subject,
        text: copy.text,
        html: copy.html
      }),
      redirect: "follow"
    });
  } catch (error) {
    throw new Error(`Google mail relay request failed: ${error?.message || error}`);
  }

  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    const preview = raw.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`Google mail relay returned non-JSON response (HTTP ${response.status}): ${preview || "empty response"}`);
  }

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Google mail relay failed (HTTP ${response.status})`);
  }

  const deliveredTo = String(result.to || recipient).trim();
  if (deliveredTo.toLowerCase() !== recipient.toLowerCase()) {
    throw new Error(`Google mail relay recipient mismatch: requested ${recipient}, delivered ${deliveredTo}`);
  }

  return {
    to: deliveredTo,
    from: result.from || DEFAULT_ALERT_EMAIL_FROM
  };
}
