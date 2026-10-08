/**
 * Audit du design de PharmaBoost : pour chaque écran et chaque thème, les textes sous le contraste recommandé
 * (4,5:1, 3:1 au-delà de 24 px), les débordements horizontaux et les polices parasites (autres que Plus Jakarta Sans).
 *
 * À lancer dans le navigateur piloté (outil « exécuter du code Playwright », en passant ce fichier), avec le serveur
 * LIVE démarré et une session de titulaire ouverte. Lecture seule : rien n'est écrit en base.
 * Les textes posés sur un dégradé ne sont pas mesurés (voir docs/design-systeme.md pour leur contraste).
 */
// Une fonction anonyme seule : c'est la forme que l'outil de code Playwright attend.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const pages = ['/vente/nouvelle', '/stock', '/stock/mise-a-jour', '/connexion', '/ordonnances', '/resultats', '/pilotage', '/parametres', '/patients', '/formation', '/partenaires', '/assortiment', '/equipe', '/notifications', '/reglementation', '/suivis'];
  const audit = async () => {
    await document.fonts.ready;
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const effBg = (el) => {
      const layers = []; let e = el;
      while (e) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== 'none' && /gradient|url/.test(s.backgroundImage)) return null;
        const c = rgba(s.backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; e = e.parentElement;
      }
      let base = rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3);
      if (layers.length && layers[layers.length - 1][3] >= 1) base = layers.pop().slice(0, 3);
      for (const l of layers.reverse()) base = [0, 1, 2].map((i) => l[i] * l[3] + base[i] * (1 - l[3]));
      return base;
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const fails = new Map(); const families = {}; let nb = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement; const txt = walker.currentNode.textContent.trim();
      if (!txt || !el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
      if (el.closest('nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]') || document.querySelector('nextjs-portal')?.contains(el)) continue;
      if (el.closest('button[disabled], [aria-disabled="true"]')) continue;
      seen.add(el); nb++;
      const fam = s.fontFamily.split(',')[0].replace(/"/g, '').trim(); families[fam] = (families[fam] || 0) + 1;
      const bg = effBg(el); if (!bg) continue;
      const f = rgba(s.color); const fg = [0, 1, 2].map((i) => f[i] * f[3] + bg[i] * (1 - f[3]));
      const size = parseFloat(s.fontSize); const bold = +s.fontWeight >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5; const rr = ratio(fg, bg);
      if (rr < need - 0.05) { const key = txt.slice(0, 30); if (!fails.has(key) || fails.get(key).ratio > rr) fails.set(key, { texte: key, ratio: Math.round(rr * 10) / 10, taille: s.fontSize }); }
    }
    const parasites = Object.keys(families).filter((f) => !/Jakarta|ui-monospace|SF Mono|Menlo|Consolas/.test(f));
    return { n: nb, faibles: [...fails.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 4), parasites, debordement: document.documentElement.scrollWidth > innerWidth + 1, titre: document.querySelector('h1')?.innerText?.slice(0, 40) ?? null };
  };
  const out = [];
  for (const url of pages) {
    for (const theme of ['clair', 'sombre']) {
      try {
        const res = await page.goto('http://localhost:3000' + url, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => null);
        if (theme === 'sombre') await page.evaluate(() => document.documentElement.classList.add('dark'));
        else await page.evaluate(() => document.documentElement.classList.remove('dark'));
        await page.waitForTimeout(250);
        const r = await page.evaluate(audit);
        out.push({ url, theme, http: res ? res.status() : 'ko', ...r });
      } catch (e) { out.push({ url, theme, erreur: String(e).slice(0, 80) }); }
    }
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  return out.map((o) => `${o.url} [${o.theme}] ${o.erreur ? 'ERREUR ' + o.erreur : `http=${o.http} textes=${o.n} faibles=${o.faibles.length ? JSON.stringify(o.faibles) : 'aucun'} parasites=${o.parasites.join('/') || 'aucune'} debord=${o.debordement}`}`).join('\n');
}
