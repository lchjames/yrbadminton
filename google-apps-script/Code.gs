const TO_EMAIL = "apswsttss@gmail.com";
const FROM_EMAIL = "badyrminton@gmail.com";

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");

    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonResponse({ ok: false, error: "unauthorised" });
    }

    const subject = String(payload.subject || "YR Badminton Reminder").slice(0, 200);
    const text = String(payload.text || "YR Badminton notification").slice(0, 20000);
    const html = payload.html ? String(payload.html).slice(0, 50000) : "";

    const options = {
      to: TO_EMAIL,
      subject: subject,
      body: text,
      name: "YR Badminton"
    };

    if (html) options.htmlBody = html;

    MailApp.sendEmail(options);

    return jsonResponse({
      ok: true,
      to: TO_EMAIL,
      from: FROM_EMAIL
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: "YR Badminton Gmail relay"
  });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
