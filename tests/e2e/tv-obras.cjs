// Modo TV por obra: alterna as obras ativas automaticamente. App em http://localhost:3100.
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, locale: "pt-BR" })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");
  await p.goto(B + "/painel-tv/obras?intervalo=15");
  const nav = p.getByRole("navigation", { name: "Obras em exibição" });
  await nav.waitFor();
  const total = await nav.getByRole("link").count();
  const primeira = await p.locator("h1").innerText();
  log(`exibindo 1 de ${total}:`, primeira);
  if (await p.getByLabel("Novo lembrete").count()) falha("modo TV não deve permitir editar lembretes");
  if (await p.getByLabel("Semana", { exact: true }).count()) falha("modo TV não deve ter seletor de semana");
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + "tv-obra-1.png" });
  // Rolagem automática quando o conteúdo passa da altura da tela
  const sobra = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (sobra > 8) {
    await p.waitForTimeout(7000);
    const y = await p.evaluate(() => window.scrollY);
    if (y < 1) falha("deveria rolar sozinho para mostrar o restante");
    await p.screenshot({ path: S + "tv-obra-1-rolado.png" });
    log(`rolagem automática: desceu ${Math.round(y)} de ${sobra}px`);
  }
  if (total > 1) {
    await p.waitForURL(/i=1/, { timeout: 25000, waitUntil: "commit" });
    await p.locator("h1").waitFor();
    const segunda = await p.locator("h1").innerText();
    if (segunda === primeira) falha("deveria ter passado para a próxima obra");
    log("trocou sozinho para:", segunda);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: S + "tv-obra-2.png" });
  }
  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
