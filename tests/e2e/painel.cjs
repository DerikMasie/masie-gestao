// Painel de obras (tela inicial). App em http://localhost:3100 com a obra 2026-0001 (Palco) carregada.
const { chromium, devices } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };
async function entrar(ctx) {
  const p = await ctx.newPage();
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");
  return p;
}
(async () => {
  const b = await chromium.launch();
  const p = await entrar(await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", deviceScaleFactor: 2 }));
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  await p.getByRole("heading", { name: "Painel de obras" }).waitFor();
  // Visão padrão: por engenheiro (estilo sala de controle)
  await p.getByText("OBRAS DA EMPRESA").waitFor();
  const eng = await p.locator("section[aria-label^='Engenheiro']").count();
  if (!eng) falha("nenhuma linha de engenheiro");
  const kpis = (await p.getByText("Obras em execução").locator("xpath=..").innerText()).replace(/\s+/g, " ");
  log("visão por engenheiro:", eng, "linha(s) ·", kpis);
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "painel-0-engenheiros.png", fullPage: true });
  const tv = await (await p.context().newPage());
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(B + "/painel-tv"); await tv.getByText("OBRAS DA EMPRESA").waitFor(); await tv.waitForTimeout(400);
  await tv.screenshot({ path: S + "painel-tv.png" });
  await tv.close();
  log("modo TV");
  await p.getByRole("tab", { name: "Cartões e pendências" }).click();
  await p.getByRole("button", { name: /Detalhes da obra/ }).first().waitFor();
  const cartoes = await p.getByRole("button", { name: /Detalhes da obra/ }).count();
  if (!cartoes) falha("nenhum cartão de obra");
  log("cartões de obras ativas:", cartoes);
  const palco = p.getByRole("button", { name: "Detalhes da obra 2026-0001" });
  const txt = (await palco.innerText()).replace(/\s+/g, " ");
  log("cartão Palco:", txt.slice(0, 160));
  if (!/64,5%/.test(txt) || !/Atenção/.test(txt)) falha("Palco deveria aparecer com 64,5% e em Atenção (−2,5 p.p.)");
  await p.waitForTimeout(600);
  await p.screenshot({ path: S + "painel-1.png", fullPage: true });

  await p.getByRole("button", { name: /^Atenção/ }).click();
  if (!(await palco.isVisible())) falha("filtro Atenção deveria mostrar o Palco");
  log("filtro por ritmo");
  await palco.click();
  await p.getByRole("dialog", { name: "Obra 2026-0001" }).waitFor();
  const pend = await p.getByRole("dialog").getByText("Pendências").count();
  if (!pend) falha("detalhe sem pendências");
  await p.waitForTimeout(400);
  await p.screenshot({ path: S + "painel-2-detalhe.png" });
  log("detalhe lateral aberto");
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "detached" });
  await p.getByRole("button", { name: /^Todas/ }).click();
  const primeiraPend = p.locator("section", { hasText: "Pendências da semana" }).getByRole("link").first();
  const destino = await primeiraPend.getAttribute("href");
  await primeiraPend.click();
  await p.waitForURL((u) => u.pathname.startsWith("/obras/"), { waitUntil: "commit" });
  log("pendência leva à tela certa:", destino);

  const m = await entrar(await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" }));
  await m.getByRole("heading", { name: "Painel de obras" }).waitFor(); await m.getByText("OBRAS DA EMPRESA").waitFor(); await m.waitForTimeout(500);
  await m.screenshot({ path: S + "painel-3-celular.png", fullPage: true });
  log("celular");
  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
