(function () {
  "use strict";

  const CONSENT_KEY = "shajrah_cookie_consent";
  const config = window.SITE_CONFIG || {};
  const gaId = (config.gaMeasurementId || "").trim();

  const banner = document.getElementById("cookie-banner");
  const btnAccept = document.getElementById("cookie-accept");
  const btnReject = document.getElementById("cookie-reject");
  const settingsLink = document.getElementById("cookie-settings");
  const settingsFooter = document.getElementById("cookie-settings-footer");

  if (!gaId || !/^G-[A-Z0-9]+$/i.test(gaId)) {
    if (banner) banner.classList.add("hidden");
    return;
  }

  init();

  function init() {
    const saved = localStorage.getItem(CONSENT_KEY);
    if (saved === "accepted") {
      loadGA4();
      hideBanner();
    } else if (saved === "rejected") {
      hideBanner();
    } else {
      showBanner();
    }

    if (btnAccept) {
      btnAccept.addEventListener("click", () => {
        localStorage.setItem(CONSENT_KEY, "accepted");
        loadGA4();
        hideBanner();
      });
    }

    if (btnReject) {
      btnReject.addEventListener("click", () => {
        localStorage.setItem(CONSENT_KEY, "rejected");
        hideBanner();
      });
    }

    if (settingsLink) {
      settingsLink.addEventListener("click", (ev) => {
        ev.preventDefault();
        showBanner();
      });
    }

    if (settingsFooter) {
      settingsFooter.addEventListener("click", (ev) => {
        ev.preventDefault();
        showBanner();
      });
    }
  }

  function showBanner() {
    if (banner) banner.classList.remove("hidden");
  }

  function hideBanner() {
    if (banner) banner.classList.add("hidden");
  }

  function loadGA4() {
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };

    gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });

    gtag("consent", "update", {
      analytics_storage: "granted",
    });

    gtag("js", new Date());
    gtag("config", gaId, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaId);
    document.head.appendChild(script);
  }
})();
