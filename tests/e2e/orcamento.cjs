// Teste ponta a ponta do módulo de Orçamentos. Rodar depois de tests/e2e/fluxo-fase2.cjs, com o app em http://localhost:3100:
//   FIXTURE=tests/fixtures/orcamento-padrao-preenchido.xlsx SHOTS_DIR=/tmp node tests/e2e/orcamento.cjs
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const FIXTURE = process.env.FIXTURE;
const log = (...a) => console.log("✔", ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => { erros.push(e.message); console.log("   >> pageerror em", p.url()); });
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");

  // Padrões da empresa
  await p.goto(B + "/configuracoes/empresa");
  if ((await p.inputValue("#bdiMaoDeObra")) !== "30" || (await p.inputValue("#bdiMaterial")) !== "10" || (await p.inputValue("#impostos")) !== "10,5") throw new Error("padrões errados");
  log("empresa: BDI MO 30%, material 10%, impostos 10,5%");

  await p.goto(B + "/obras"); await p.getByRole("link", { name: "2026-0001" }).click(); await p.waitForURL(/\/obras\/[0-9a-f-]+$/, { waitUntil: "commit" });
  const obraUrl = p.url();
  await p.goto(obraUrl + "?aba=orcamento");
  await p.setInputFiles("#arquivo", FIXTURE); await p.getByRole("button", { name: "Importar", exact: true }).click();
  await p.waitForURL(/importado=1/, { waitUntil: "commit" });
  await p.getByText("confere exatamente").waitFor();
  await p.getByText("207 itens").first().waitFor();
  log("importação do Orçamento Padrão: 207 itens, total confere com a planilha");
  const orcUrl = p.url().split("?")[0];
  const topo = async () => (await p.locator("main div", { hasText: /^Total da proposta/ }).filter({ hasNot: p.locator(".sticky") }).first().innerText()).split("\n")[1];
  const rodape0 = (await p.locator(".sticky >> text=Total da proposta").locator("xpath=..").innerText()).split("\n")[1];
  if ((await topo()) !== rodape0) throw new Error(`topo ${await topo()} ≠ rodapé ${rodape0}`);
  log(`topo e rodapé mostram o mesmo total (${rodape0})`);
  await p.screenshot({ path: S + "o-importado.png" });

  // Edição ao vivo
  const total = async () => (await p.locator(".sticky >> text=Total da proposta").locator("xpath=..").innerText()).split("\n")[1];
  const antes = await total();
  const linha = p.locator("tr[data-item]").filter({ has: p.locator("textarea", { hasText: "Emissão de ART" }) }).first();
  await linha.getByLabel("Quantidade").fill("3");
  const durante = await total();
  if (durante === antes) throw new Error("total não recalculou ao digitar");
  await linha.getByLabel("Unidade").click(); // sai do campo (mesma linha) — ainda não salva
  await p.getByLabel("Buscar item").click(); // sai da linha → salva
  await p.waitForTimeout(1200);
  await p.reload();
  const linha2 = p.locator("tr[data-item]").filter({ has: p.locator("textarea", { hasText: "Emissão de ART" }) }).first();
  if ((await linha2.getByLabel("Quantidade").inputValue()) !== "3") throw new Error("quantidade não persistiu");
  if ((await total()) !== durante) throw new Error("total após recarregar difere");
  log("edição: total recalcula ao digitar e o valor é salvo ao sair da linha");

  // Novo item na Pintura
  await p.getByRole("button", { name: "Adicionar item em Pintura" }).click();
  await p.locator("textarea:focus").waitFor();
  const idNovo = await p.locator("textarea:focus").evaluate((el) => el.closest("tr").dataset.item);
  const nova = p.locator(`tr[data-item="${idNovo}"]`).first();
  await nova.getByLabel("Descrição").fill("Pintura de rodapés (teste)");
  await nova.getByLabel("Quantidade").fill("12,5"); await nova.getByLabel("Valor unitário de mão de obra").fill("18");
  await p.getByLabel("Buscar item").click(); await p.waitForTimeout(1200);
  await p.reload(); if ((await p.locator(`tr[data-item="${idNovo}"]`).first().getByLabel("Descrição").inputValue()) !== "Pintura de rodapés (teste)") throw new Error("novo item não persistiu");
  log("novo item incluído e persistido");
  await p.screenshot({ path: S + "o-editor.png" });

  // Parâmetros editáveis
  await p.goto(orcUrl + "?aba=parametros");
  await p.fill("#bdiMaoDeObra", "35"); await p.selectOption("#formaImposto", "POR_DENTRO"); await p.selectOption("#arredondamento", "CENTAVOS");
  await p.click("text=Salvar e recalcular"); await p.getByText("Parâmetros salvos").waitFor();
  await p.getByText("BDI MO 35,0%").waitFor();
  log("parâmetros do orçamento editados (BDI MO 35%, imposto por dentro) e recalculados");
  await p.screenshot({ path: S + "o-parametros.png", fullPage: true });

  await p.goto(orcUrl + "?aba=abc"); await p.getByText("Classe A").first().waitFor();
  await p.goto(orcUrl + "?aba=resumo"); await p.getByText("% da venda").waitFor();
  log("curva ABC e resumo por etapa");

  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("text=Excel")]);
  const caminho = await dl.path(); const tam = require("fs").statSync(caminho).size;
  if (tam < 5000 || !dl.suggestedFilename().endsWith(".xlsx")) throw new Error("exportação inválida");
  log(`exportação Excel (${dl.suggestedFilename()}, ${Math.round(tam / 1024)} KB)`);

  // Fluxo
  await p.goto(orcUrl + "?aba=parametros");
  await p.getByRole("button", { name: "Marcar como enviado" }).click(); await p.getByText("● Enviado ao cliente").waitFor();
  await p.goto(orcUrl);
  if (!(await p.locator("tr[data-item] textarea").first().isDisabled())) throw new Error("edição deveria estar bloqueada");
  await p.goto(orcUrl + "?aba=parametros");
  await p.getByRole("button", { name: "Aprovar" }).click(); await p.getByText("● Aprovado").waitFor();
  await p.getByRole("button", { name: "Definir como orçamento-base" }).click(); await p.getByText("● Orçamento-base").waitFor();
  log("fluxo: enviado (congela e bloqueia) → aprovado → orçamento-base");
  await p.goto(obraUrl + "?aba=orcamento"); await p.getByText("Orçamento-base").first().waitFor();
  await p.screenshot({ path: S + "o-lista.png" });
  await p.goto(obraUrl + "?aba=historico"); await p.getByText("definido como orçamento-base").first().waitFor();
  log("histórico da obra registra a definição da base");

  // Engenharia não aprova
  const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } }); const q = await c2.newPage();
  await q.goto(B + "/login"); await q.fill("#email", "ana@masie.com.br"); await q.fill("#senha", "AnaObra2026"); await q.click("button[type=submit]"); await q.waitForURL(B + "/");
  await q.goto(orcUrl + "?aba=parametros"); await q.getByText("exige a permissão").waitFor();
  if (await q.getByRole("button", { name: "Aprovar" }).count()) throw new Error("Engenharia não deveria aprovar");
  log("Engenharia vê o orçamento mas não aprova");

  if (erros.length) { console.log("Erros de console:", erros); process.exitCode = 1; }
  await b.close(); console.log("ORÇAMENTO OK");
})().catch((e) => { console.error("FALHOU:", e.message.split("\n").slice(0, 3).join(" / ")); process.exit(1); });
