// Painel da obra (dashboard por obra). App em http://localhost:3100 com a obra 2026-0001 (Palco).
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
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/obras?q=2026-0001");
  await p.locator("a", { hasText: "2026-0001" }).first().click();
  await p.getByRole("link", { name: "Painel da obra" }).click();
  await p.getByRole("heading", { name: /Painel da obra/ }).waitFor();
  const kpi = (await p.getByRole("region", { name: "Avanço físico" }).innerText()).replace(/\s+/g, " ");
  log("indicador avanço:", kpi.slice(0, 80));
  if (!/64,5%/.test(kpi)) falha("avanço deveria ser 64,5%");

  await p.getByLabel("Semana", { exact: true }).selectOption("4");
  await p.waitForURL(/semana=4/);
  await p.getByRole("heading", { name: /Painel da obra/ }).waitFor();
  await p.getByText("Executado na semana 4").waitFor();
  const exec = await p.getByRole("region", { name: "Executado na semana 4" }).locator("li").count();
  if (exec < 2) falha("deveria listar atividades executadas na semana 4");
  log("semana 4: atividades executadas listadas:", exec);

  const novo = "Confirmar entrega do forro com o fornecedor [teste]";
  await p.getByLabel("Novo lembrete").fill(novo);
  await p.locator('input[name="importante"]').check();
  await p.getByRole("button", { name: "Incluir" }).click();
  await p.getByText(novo).waitFor();
  await p.getByLabel("Novo lembrete").fill("Pedir medição do vidro temperado [teste]");
  await p.getByRole("button", { name: "Incluir" }).click();
  await p.getByText("Pedir medição do vidro temperado [teste]").waitFor();
  await p.getByLabel(`Concluir: Pedir medição do vidro temperado [teste]`).check();
  await p.waitForTimeout(800);
  log("lembretes incluídos e marcados");
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "painel-obra-semana4.png", fullPage: true });

  const m = await entrar(await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" }));
  await m.goto(p.url()); await m.getByRole("heading", { name: /Painel da obra/ }).waitFor(); await m.waitForTimeout(600);
  await m.screenshot({ path: S + "painel-obra-celular.png", fullPage: true });

  // Limpa os lembretes de teste
  for (const t of [novo, "Pedir medição do vidro temperado [teste]"]) {
    const li = p.locator("li", { hasText: t });
    await li.hover(); await li.getByTitle("Excluir").click();
    await p.getByText(t).waitFor({ state: "detached" });
  }
  log("lembretes de teste removidos");
  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
