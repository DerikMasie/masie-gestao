// Teste ponta a ponta da Gestão da obra — planilha, previsto/realizado físico, lançamento semanal e avanço.
// App em http://localhost:3100 com a obra 2026-0001. PLANILHA=/caminho/ControlePalco.xlsm importa a planilha de
// controle quando a planilha da obra estiver vazia. SHOTS_DIR=pasta para salvar as capturas.
const { chromium, devices } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");

  await p.goto(B + "/obras?q=2026-0001");
  const href = await p.locator("a", { hasText: "2026-0001" }).first().getAttribute("href");
  const obra = B + href;
  await p.goto(obra + "?aba=fisico");
  await p.getByRole("navigation", { name: "Gestão da obra" }).waitFor();
  log("aba Gestão da obra");

  if (await p.getByText("ainda está vazia").count()) {
    if (!process.env.PLANILHA) falha("Planilha da obra vazia: informe PLANILHA=ControlePalco.xlsm");
    await p.setInputFiles("#arquivo", process.env.PLANILHA);
    await p.getByRole("button", { name: "Importar", exact: true }).click();
    await p.getByText("Planilha importada").waitFor({ timeout: 60000 });
    log("importação:", (await p.getByText("Planilha importada").innerText()).replace(/\s+/g, " "));
  }

  // Planilha da obra
  await p.goto(obra + "?aba=fisico&vista=planilha");
  await p.getByText("Total da obra").waitFor();
  await p.screenshot({ path: S + "g1-planilha.png", fullPage: true });
  const linhaHidraulica = p.locator("tr", { has: p.locator('input[value="Derivação de esgoto"]') });
  const acertada = linhaHidraulica.locator("td").nth(2).locator("input");
  const original = await acertada.inputValue();
  await acertada.fill("480"); await acertada.blur();
  await p.waitForTimeout(1200);
  await p.reload(); await p.getByText("Total da obra").waitFor();
  if ((await p.locator("tr", { has: p.locator('input[value="Derivação de esgoto"]') }).locator("td").nth(2).locator("input").inputValue()) !== "480") falha("MO acertada não persistiu");
  const ac2 = p.locator("tr", { has: p.locator('input[value="Derivação de esgoto"]') }).locator("td").nth(2).locator("input");
  await ac2.fill(original); await ac2.blur(); await p.waitForTimeout(1000);
  log("planilha: edição de MO acertada salva e restaurada");

  // Avanço
  await p.goto(obra + "?aba=fisico&vista=avanco");
  await p.getByText("Avanço físico acumulado").waitFor();
  const ind = await p.locator("text=/Realizado até a semana/").locator("xpath=..").innerText();
  log("avanço:", ind.replace(/\s+/g, " "));
  if (!/64,5\s?%/.test(ind)) falha("avanço realizado deveria ser 64,5% (planilha do Palco)");
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "g2-avanco.png", fullPage: true });

  // Realizado físico (grade)
  await p.goto(obra + "?aba=fisico&vista=realizado");
  await p.getByText("Acumulado previsto").waitFor();
  await p.screenshot({ path: S + "g3-realizado.png" });
  const art = p.getByLabel("Emissão de ART, semana 5, %");
  await art.fill("50");
  await p.getByText("acima de 100%").first().waitFor();
  if (!(await p.getByRole("button", { name: /Salvar 1 alteração/ }).isDisabled())) falha("deveria bloquear salvar com serviço acima de 100%");
  await art.press("Escape");
  log("realizado: bloqueio acima de 100% e Esc desfaz");
  // Colar bloco do Excel (2 linhas × 2 semanas) a partir de Proteção de piso, semana 5
  await p.getByLabel("Proteção de piso, semana 5, %").focus();
  await p.evaluate(() => {
    const dt = new DataTransfer(); dt.setData("text/plain", "25%\t25%\n10\t");
    document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await p.getByText("célula(s) coladas").waitFor();
  const btn = await p.getByRole("button", { name: /Salvar \d+ alteração/ }).innerText();
  log("realizado: colar do Excel →", btn);
  await p.getByRole("button", { name: "Descartar" }).click();

  // Previsto: distribuir
  await p.goto(obra + "?aba=fisico&vista=previsto");
  await p.getByText("Distribuir").first().waitFor();
  await p.getByRole("button", { name: "Pintura de paredes", exact: false }).first().click().catch(() => {});
  const sel = p.locator("select").first();
  const opcao = await sel.locator("option").nth(5).getAttribute("value");
  await sel.selectOption(opcao);
  await p.getByLabel("Da semana").fill("6"); await p.getByLabel("até a semana").fill("9"); await p.getByLabel("Total (%)").fill("100");
  await p.getByRole("button", { name: "Aplicar" }).click();
  await p.getByText("distribuído entre as semanas 6 e 9").waitFor();
  await p.screenshot({ path: S + "g4-previsto.png" });
  await p.getByRole("button", { name: "Descartar" }).click();
  log("previsto: distribuição aplicada e descartada");

  // Lançar semana 5
  await p.goto(obra + "?aba=fisico&vista=semana&semana=5");
  await p.getByText("Semana 5", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Todos" }).click();
  const ger = p.getByLabel("Gerenciamento de obra por equipe de engenharia + apoio administrativo de escritório: % executado na semana 5");
  await ger.fill("10");
  await p.getByRole("button", { name: "Salvar semana 5" }).click();
  await p.getByText(/alteração\(ões\) salva/).waitFor();
  log("lançar semana: 10% em Gerenciamento salvo");
  await p.screenshot({ path: S + "g5-semana.png", fullPage: true });
  await p.goto(obra + "?aba=fisico&vista=avanco");
  const ind2 = await p.locator("text=/Realizado até a semana/").locator("xpath=..").innerText();
  log("avanço após lançamento:", ind2.replace(/\s+/g, " "));
  if (!/64,7\s?%/.test(ind2)) falha("esperado 64,5% + 10% × peso 1/50 = 64,7%");
  // Volta ao estado original
  await p.goto(obra + "?aba=fisico&vista=semana&semana=5");
  await p.getByRole("button", { name: "Todos" }).click();
  await p.getByLabel(/Gerenciamento de obra .*semana 5/).fill("");
  await p.getByRole("button", { name: "Salvar semana 5" }).click();
  await p.getByText(/alteração\(ões\) salva/).waitFor();

  // Celular
  const cel = await b.newContext({ ...devices["iPhone 13"] });
  const m = await cel.newPage();
  await m.goto(B + "/login"); await m.fill("#email", "admin@masie.com.br"); await m.fill("#senha", "MasieObra2027"); await m.click("button[type=submit]"); await m.waitForURL(B + "/");
  await m.goto(obra + "?aba=fisico&vista=semana&semana=5");
  await m.getByText("Semana 5", { exact: true }).waitFor();
  await m.screenshot({ path: S + "g6-celular-semana.png" });
  await m.goto(obra + "?aba=fisico&vista=avanco"); await m.getByText("Progresso da obra").waitFor(); await m.waitForTimeout(400);
  await m.screenshot({ path: S + "g7-celular-avanco.png", fullPage: true });
  log("celular");

  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
