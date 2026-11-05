// Teste ponta a ponta do relatório semanal (obra 2026-0001, app em http://localhost:3100).
// FOTOS=/pasta/com/jpgs (opcional) envia as imagens da pasta. SHOTS_DIR guarda capturas e o PDF gerado.
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");
  await p.goto(B + "/obras?q=2026-0001");
  const obra = B + (await p.locator("a", { hasText: "2026-0001" }).first().getAttribute("href"));

  await p.goto(obra + "?aba=fisico&vista=relatorio");
  await p.getByText("Relatórios da obra").waitFor();
  const existente = p.locator("tbody tr", { hasText: "Semana 5" });
  if (await existente.count()) {
    await existente.getByRole("link", { name: "Abrir" }).click();
  } else {
    await p.selectOption("#semana", "5");
    await p.getByRole("button", { name: "Criar relatório" }).click();
  }
  await p.getByText("Relatório da semana 5").waitFor();
  if (await p.getByRole("button", { name: "Reabrir para editar" }).count()) {
    await p.getByRole("button", { name: "Reabrir para editar" }).click();
    await p.getByRole("button", { name: "Emitir relatório" }).waitFor();
  }
  // Remove fotos de execuções anteriores
  while (await p.getByTitle("Remover").count()) {
    const n = await p.getByTitle("Remover").count();
    await p.getByTitle("Remover").first().click({ force: true });
    await p.waitForFunction((k) => document.querySelectorAll('[title="Remover"]').length < k, n);
  }
  log("relatório da semana 5 aberto em edição");

  const sugestao = await p.inputValue("#tarefasRealizadas");
  const prazo = await p.inputValue("#acompanhamentoPrazo");
  log("texto sugerido (prazo):", prazo.slice(0, 90) + "…");
  if (!/Avanço físico de/.test(prazo)) falha("acompanhamento do prazo deveria vir sugerido");
  await p.fill("#anomalias", "Chuva forte na terça-feira (24 mm), sem impacto no prazo. [texto de teste]");
  await p.getByRole("button", { name: "Salvar textos" }).click();
  await p.getByText("Textos salvos.").waitFor();
  log("textos salvos", sugestao ? "(com sugestão de tarefas)" : "");

  const pasta = process.env.FOTOS;
  if (pasta) {
    const arquivos = fs.readdirSync(pasta).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().map((f) => path.join(pasta, f));
    await p.setInputFiles('input[aria-label="Escolher fotos"]', arquivos);
    await p.getByText(`${arquivos.length} foto(s) ·`).first().waitFor({ timeout: 60000 });
    log(arquivos.length, "fotos enviadas");
    const leg = p.getByPlaceholder("Legenda (opcional)").first();
    await leg.fill("Imagem de teste com legenda"); await leg.blur();
    await p.waitForTimeout(800);
    await p.getByTitle("Mover para frente").first().click({ force: true });
    await p.waitForTimeout(800);
  }
  await p.screenshot({ path: S + "r1-editor.png", fullPage: true });

  // Prévia do PDF
  const href = await p.getByRole("link", { name: "Ver prévia do PDF" }).getAttribute("href");
  const prev = await p.request.get(B + href);
  if (prev.headers()["content-type"] !== "application/pdf") falha("prévia não é PDF");
  const corpo = await prev.body();
  if (corpo.subarray(0, 4).toString() !== "%PDF") falha("PDF inválido");
  fs.writeFileSync(S + "previa.pdf", corpo);
  log("prévia do PDF:", Math.round(corpo.length / 1024), "KB");

  await p.getByRole("button", { name: "Emitir relatório" }).click();
  await p.getByText("Emitido · v").first().waitFor();
  const emitido = await p.request.get(B + href);
  fs.writeFileSync(S + "relatorio-emitido.pdf", await emitido.body());
  log("relatório emitido; PDF da versão emitida salvo");
  await p.screenshot({ path: S + "r2-emitido.png" });

  const m = await (await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" })).newPage();
  await m.goto(B + "/login"); await m.fill("#email", "admin@masie.com.br"); await m.fill("#senha", "MasieObra2027"); await m.click("button[type=submit]"); await m.waitForURL(B + "/");
  await m.goto(p.url()); await m.getByText("Relatório da semana 5").waitFor(); await m.waitForTimeout(500);
  await m.screenshot({ path: S + "r3-celular.png", fullPage: true });

  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
