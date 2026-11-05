// Cores do relatório por obra (obra 2026-0001, depois de relatorio.cjs). Gera uma prévia com a paleta "Marinho e dourado"
// e volta ao padrão Masie no final. SHOTS_DIR guarda a captura e o PDF.
const { chromium } = require("playwright");
const fs = require("fs");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");
  await p.goto(B + "/obras?q=2026-0001");
  const obra = B + (await p.locator("a", { hasText: "2026-0001" }).first().getAttribute("href"));
  await p.goto(obra + "?aba=fisico&vista=relatorio");
  await p.getByText("Cores do relatório desta obra").waitFor();
  await p.getByRole("button", { name: "Marinho e dourado" }).click();
  await p.getByRole("button", { name: "Salvar cores da obra" }).click();
  await p.getByText("Cores salvas.").waitFor();
  await p.reload(); await p.getByText("Cores do relatório desta obra").waitFor();
  if ((await p.getByLabel("Principal").inputValue()) !== "#0b2545") falha("cor principal não persistiu");
  log("paleta Marinho e dourado salva");
  await p.locator("#cores").screenshot({ path: S + "cores-editor.png" });

  // Prévia do relatório da semana 5 com as novas cores (reabre; o emitido mantinha as cores antigas)
  await p.locator("tbody tr", { hasText: "Semana 5" }).getByRole("link", { name: "Abrir" }).click();
  await p.getByText("Relatório da semana 5").waitFor();
  if (await p.getByRole("button", { name: "Reabrir para editar" }).count()) { await p.getByRole("button", { name: "Reabrir para editar" }).click(); await p.getByRole("button", { name: "Emitir relatório" }).waitFor(); }
  const href = await p.getByRole("link", { name: "Ver prévia do PDF" }).getAttribute("href");
  fs.writeFileSync(S + "previa-marinho.pdf", await (await p.request.get(B + href)).body());
  log("prévia com as novas cores salva");

  // Volta ao padrão e reemite (versão seguinte, cores Masie)
  await p.goto(obra + "?aba=fisico&vista=relatorio");
  await p.getByRole("button", { name: "Voltar ao padrão Masie" }).click();
  await p.getByText("Cores voltaram ao padrão Masie.").waitFor();
  await p.locator("tbody tr", { hasText: "Semana 5" }).getByRole("link", { name: "Abrir" }).click();
  await p.getByRole("button", { name: "Emitir relatório" }).click();
  await p.getByText("Emitido · v").first().waitFor();
  log("padrão Masie restaurado e relatório reemitido");
  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
