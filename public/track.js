(function () {
  try {
    var script = document.currentScript || document.querySelector("script[data-site]");
    var siteKey = script && script.getAttribute("data-site");
    if (!siteKey) return;

    function randomId() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    function getOrSet(storage, key) {
      try {
        var v = storage.getItem(key);
        if (!v) {
          v = randomId();
          storage.setItem(key, v);
        }
        return v;
      } catch (e) {
        return randomId();
      }
    }

    var visitorId = getOrSet(window.localStorage, "rog_visitor_id");
    var sessionId = getOrSet(window.sessionStorage, "rog_session_id");

    var params = new URLSearchParams(window.location.search);
    var utmSource = params.get("utm_source");
    var utmMedium = params.get("utm_medium");
    var utmCampaign = params.get("utm_campaign");

    // Must be the canonical www host, not the apex domain — the apex 308s to
    // www, and a redirected response fails the browser's CORS preflight
    // (preflight requests are never followed on redirect), silently killing
    // every real cross-origin pageview beacon while leaving no visible error.
    fetch("https://www.rankongeo.com/api/track/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: siteKey,
        path: window.location.pathname,
        referrer: document.referrer || null,
        visitorId: visitorId,
        sessionId: sessionId,
        utmSource: utmSource,
        utmMedium: utmMedium,
        utmCampaign: utmCampaign,
      }),
      keepalive: true,
    }).catch(function () {});
  } catch (e) {
    // Never let analytics break the host page.
  }
})();
