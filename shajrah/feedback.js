(function () {
  "use strict";

  const TO_EMAIL = "htahit6200@gmail.com";
  const FORMSUBMIT_URL = "https://formsubmit.co/ajax/" + TO_EMAIL;

  const typeLabels = {
    correction: "نام یا رابطے کی تصحیح",
    new: "نئی معلومات / اولاد",
    question: "سوال",
    other: "دیگر",
  };

  const form = document.getElementById("feedback-form");
  const statusEl = document.getElementById("feedback-status");
  const submitBtn = form && form.querySelector('button[type="submit"]');
  if (!form) return;

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = document.getElementById("fb-name").value.trim();
    const contact = document.getElementById("fb-contact").value.trim();
    const type = document.getElementById("fb-type").value;
    const message = document.getElementById("fb-message").value.trim();

    if (!message) {
      setStatus("براہِ کرم پیغام لکھیں۔", "err");
      document.getElementById("fb-message").focus();
      return;
    }

    const subject = "شجرہ نسب — " + (typeLabels[type] || "رائے");
    const payload = {
      _subject: subject,
      _template: "table",
      _captcha: "false",
      موضوع: typeLabels[type] || type,
      نام: name || "—",
      رابطہ: contact || "—",
      پیغام: message,
      وقت: new Date().toLocaleString("ur-PK"),
    };

    if (contact.includes("@")) {
      payload._replyto = contact;
    }

    setSubmitting(true);
    setStatus("بھیجا جا رہا ہے…", "ok");

    fetch(FORMSUBMIT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Network error");
        return res.json();
      })
      .then(() => {
        setStatus("شکریہ — آپ کا پیغام بھیج دیا گیا۔", "ok");
        form.reset();
      })
      .catch(() => {
        setStatus("براہِ کرم دوبارہ کوشش کریں یا نیچے ای میل استعمال کریں۔", "err");
        openMailtoFallback({ name, contact, type, message, subject });
      })
      .finally(() => setSubmitting(false));
  });

  function openMailtoFallback({ name, contact, type, message, subject }) {
    const bodyLines = [
      "موضوع: " + (typeLabels[type] || type),
      name ? "نام: " + name : "",
      contact ? "رابطہ: " + contact : "",
      "",
      "پیغام:",
      message,
      "",
      "---",
      "وقت: " + new Date().toLocaleString("ur-PK"),
    ].filter(Boolean);

    const mailto =
      "mailto:" +
      TO_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(bodyLines.join("\n"));

    setTimeout(() => {
      window.location.href = mailto;
    }, 600);
  }

  function setSubmitting(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    submitBtn.textContent = on ? "بھیجا جا رہا ہے…" : "بھیجیں";
  }

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "feedback-status" + (type ? " feedback-status-" + type : "");
  }
})();
