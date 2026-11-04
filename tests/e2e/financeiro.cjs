// Teste ponta a ponta do financeiro e das notas fiscais (app em http://localhost:3100, depois de fluxo-fase2 e orcamento).
// Opcional: FINANCEIRO=/caminho/Financeiro.xlsm para testar também a importação do histórico.
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const fs = require("fs");
const NUM = String(Date.now() % 90000 + 10000);
const CHAVE = ("4126119876543200011055001" + NUM.padStart(9, "0") + "1" + NUM.padStart(8, "0")).slice(0, 44).padEnd(44, "7");
fs.writeFileSync(require("os").tmpdir() + "/nfe-run.xml", fs.readFileSync(__dirname + "/../fixtures/nfe-exemplo.xml", "utf8").replace(/NFe\d{44}/, "NFe" + CHAVE).replace(/>4567</g, ">" + NUM + "<"));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erros = [];
  p.on("pageerror", (e) => { erros.push(e.message); console.log("   >> pageerror em", p.url()); });
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");

  if (process.env.FINANCEIRO) {
    await p.goto(B + "/financeiro/importar");
    await p.setInputFiles("#arquivo", process.env.FINANCEIRO); await p.getByRole("button", { name: "Importar", exact: true }).click();
    await p.getByText("Importação concluída").waitFor({ timeout: 120000 });
    const txt = await p.getByText("Importação concluída").locator("xpath=..").innerText();
    log("importação do histórico:", txt.match(/\d[\d.]* lançamentos/)?.[0]);
    await p.getByText("Pendências para revisar").waitFor();
  }
  await p.goto(B + "/financeiro"); await p.getByText("Saldo em contas").waitFor(); await p.getByText("Fluxo de caixa mensal").waitFor();
  log("painel financeiro");
  await p.goto(B + "/financeiro/centros"); await p.getByText("Resultado por centro de custo").waitFor();
  log("resultado por centro de custo");

  // NF com XML
  await p.goto(B + "/compras/notas/nova");
  await p.setInputFiles("#xmlNfe", require("os").tmpdir() + "/nfe-run.xml");
  await p.waitForFunction(() => document.querySelector("#valorTotal")?.value === "1200,00", null, { timeout: 15000 }).catch(() => {});
  const alerta = (await p.locator("[role=alert]").allInnerTexts()).filter((t) => t.trim()); if (alerta.length) throw new Error("XML: " + alerta.join(" | "));
  const novo = await p.getByText("será criado ao salvar").count();
  if ((await p.inputValue("#valorTotal")) !== "1200,00") throw new Error("valor do XML não preenchido");
  const opcaoObra = await p.locator("#centroCustoId option", { hasText: "OBR-2026-0001" }).getAttribute("value");
  await p.selectOption("#centroCustoId", opcaoObra);
  await p.selectOption("#obraEtapaId", { label: "9. Instalações elétricas/lógicas" });
  await p.getByText(/Verba da etapa|ultrapassa a verba/).waitFor();
  log(`XML lido: fornecedor ${novo ? "novo (será cadastrado)" : "reconhecido pelo CNPJ"}, valor, parcelas; aviso de verba da etapa exibido`);
  await p.selectOption("#planoContaId", { label: "Elétrico" });
  if ((await p.inputValue("#parcelas")) !== "2") throw new Error("parcelas do XML");
  await p.screenshot({ path: S + "f-nota.png", fullPage: true });
  await p.getByRole("button", { name: "Lançar nota fiscal" }).click();
  await p.waitForURL(/lancada=1/, { waitUntil: "commit" }); await p.getByText(NUM).first().waitFor();
  log("nota lançada com conta a pagar gerada");

  await p.goto(B + "/compras/notas/nova");
  await p.setInputFiles("#xmlNfe", require("os").tmpdir() + "/nfe-run.xml");
  await p.getByText("ELETRO MATERIAIS LTDA", { exact: false }).first().waitFor();
  await p.selectOption("#centroCustoId", opcaoObra); await p.selectOption("#planoContaId", { label: "Elétrico" });
  await p.getByRole("button", { name: "Lançar nota fiscal" }).click();
  await p.getByText("já foi lançada").first().waitFor();
  log("mesma nota de novo: bloqueada como duplicada (fornecedor já reconhecido pelo CNPJ)");

  // Pagar parcela
  await p.goto(B + "/financeiro/contas?q=" + NUM);
  await p.getByText("parcela 1/2").waitFor();
  const linha = p.locator("tr", { hasText: "parcela 1/2" });
  await linha.locator("summary", { hasText: "Pagar" }).click();
  await linha.getByRole("button", { name: "Confirmar baixa" }).click();
  await p.getByText("Baixa registrada:").waitFor();
  log("parcela paga → lançamento no caixa");

  await p.goto(B + "/financeiro/provisao?semana=2027-01-02"); await p.getByText("Fornecedor × obra").waitFor();
  log("provisão semanal mostra a parcela seguinte");

  await p.goto(B + "/obras"); await p.getByRole("link", { name: "2026-0001" }).click(); await p.waitForURL(/\/obras\/[0-9a-f-]+$/, { waitUntil: "commit" });
  await p.goto(p.url().split("?")[0] + "?aba=financeiro");
  await p.getByText("Verba por etapa").waitFor();
  const el = await p.locator("tr", { hasText: "Instalações elétricas/lógicas" }).first().innerText();
  log("aba Financeiro da obra:", el.replace(/\s+/g, " "));
  await p.screenshot({ path: S + "f-obra.png", fullPage: true });

  await p.goto(B + "/financeiro/lancamentos?q=" + NUM); await p.getByText("parcela 1").first().waitFor();
  log("lançamentos: pagamento aparece no razão");
  await p.goto(B + "/"); await p.getByText("Faturamento do mês").waitFor();
  await p.screenshot({ path: S + "f-dashboard.png", fullPage: true });
  log("dashboard com indicadores financeiros");
  await p.goto(B + "/configuracoes/plano-de-contas"); await p.getByText("fora do resultado").first().waitFor();
  await p.goto(B + "/configuracoes/contas"); await p.getByText("Nova conta").waitFor();
  log("plano de contas e contas bancárias");
  await p.goto(B + "/financeiro"); await p.screenshot({ path: S + "f-painel.png", fullPage: true });

  if (erros.length) { console.log("Erros de console:", erros); process.exitCode = 1; }
  await b.close(); console.log("FINANCEIRO OK");
})().catch((e) => { console.error("FALHOU:", e.message.split("\n").slice(0, 3).join(" / ")); process.exit(1); });
