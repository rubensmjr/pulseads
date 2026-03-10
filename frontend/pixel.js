(function() {
  var PIXEL_URL = 'https://hotfy.digital/api/pixel/track';

  // Gera session ID único por sessão
  function getSessionId() {
    var key = 'hf_sid';
    var sid = sessionStorage.getItem(key);
    if (!sid) { sid = 'hf_' + Math.random().toString(36).substr(2,9) + '_' + Date.now(); sessionStorage.setItem(key, sid); }
    return sid;
  }

  // Pega UTMs da URL e salva no cookie por 7 dias
  function getUTMs() {
    var p = new URLSearchParams(window.location.search);
    var utms = {
      utm_source: p.get('utm_source'),
      utm_campaign: p.get('utm_campaign'),
      utm_adset: p.get('utm_adset') || p.get('utm_medium'),
      utm_ad: p.get('utm_ad') || p.get('utm_term'),
      utm_content: p.get('utm_content')
    };
    // Salva no cookie se tiver UTMs
    if (utms.utm_source || utms.utm_campaign) {
      document.cookie = 'hf_utm=' + encodeURIComponent(JSON.stringify(utms)) + ';max-age=604800;path=/';
    }
    // Tenta recuperar do cookie se não tiver na URL
    var match = document.cookie.match(/hf_utm=([^;]+)/);
    if (match && !utms.utm_source) {
      try { utms = JSON.parse(decodeURIComponent(match[1])); } catch(e) {}
    }
    return utms;
  }

  // Detecta device
  function getDevice() {
    var ua = navigator.userAgent;
    if (/iPad|tablet/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  // Envia evento
  function track(event, extra) {
    var utms = getUTMs();
    var payload = {
      session_id: getSessionId(),
      event: event,
      page: window.location.href,
      ref: document.referrer,
      device: getDevice(),
      utm_source: utms.utm_source,
      utm_campaign: utms.utm_campaign,
      utm_adset: utms.utm_adset,
      utm_ad: utms.utm_ad,
      utm_content: utms.utm_content,
      extra: extra || null
    };
    // Usa sendBeacon se disponível (mais confiável)
    var data = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      var blob = new Blob([data], {type: 'application/json'});
      navigator.sendBeacon(PIXEL_URL, blob);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', PIXEL_URL, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(data);
    }
  }

  // Rastreia cliques em botões CTA automaticamente
  function trackCTAClicks() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('a,button');
      if (!el) return;
      var text = (el.textContent || el.innerText || '').trim().substring(0, 100);
      var href = el.href || '';
      // Detecta se é um CTA (botão de compra)
      var isCTA = /comprar|quero|acessar|garantir|pedir|checkout|hotmart|kiwify|pay/i.test(text + href);
      if (isCTA) track('click_cta', { text: text, href: href });
    });
  }

  // Expõe função global para eventos manuais
  window.HotfyPixel = { track: track };

  // Dispara pageview automático
  track('pageview');
  trackCTAClicks();
})();
