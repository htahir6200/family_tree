(function () {
  "use strict";

  const TO_EMAIL = "htahit6200@gmail.com";

  const typeLabels = {
    correction: "نام یا رابطے کی تصحیح",
    new: "نئی معلومات / اولاد",
    question: "سوال",
    other: "دیگر",
  };

  const form = document.getElementById("feedback-form");
  const statusEl = document.getElementById("feedback-status");
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
    const bodyLines = [
      "موضوع: " + (typeLabels[type] || type),
      name ? "نام: " + name : "",
      contact ? "رابطہ: " + contact : "",
      "",
      "پیغام:",
      message,
      "",
      "---",
      "بھیجا گیا: شجرہ نسب ویب سائٹ سے",
      "وقت: " + new Date().toLocaleString("ur-PK"),
    ].filter(Boolean);

    const mailto =
      "mailto:" +
      TO_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(bodyLines.join("\n"));

    setStatus("ای میل پروگرام کھل رہا ہے… Send دبائیں۔", "ok");

    // Short delay so status is visible on mobile
    setTimeout(() => {
      window.location.href = mailto;
    }, 300);
  });

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "feedback-status" + (type ? " feedback-status-" + type : "");
  }
})();
