// Teste ponta a ponta de Medições e Gerencial (obra 2026-0001 com a planilha do Palco, app em http://localhost:3100).
// PLANILHA=/caminho/ControlePalco.xlsm reimporta a planilha (substituindo) quando os fornecedores ainda não estão ligados.
// O teste desfaz o que altera (fecha/paga/reabre a medição 1, desconto e pagamento), podendo ser repetido.
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
const falha = (m) => { throw new Error(m); };

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());
  await p.goto(B + "/login"); await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]"); await p.waitForURL(B + "/");
  await p.goto(B + "/obras?q=2026-0001");
  const obra = B + (await p.locator("a", { hasText: "2026-0001" }).first().getAttribute("href"));

  await p.goto(obra + "?aba=fisico&vista=planilha");
  await p.getByText("Total da obra").waitFor();
  if (await p.getByText("Fornecedor na planilha:").count()) {
    if (!process.env.PLANILHA) falha("Fornecedores não ligados: informe PLANILHA=ControlePalco.xlsm para reimportar");
    await p.setInputFiles("#arquivo", process.env.PLANILHA);
    await p.getByLabel(/Substituir a planilha atual/).check();
    await p.getByRole("button", { name: "Importar", exact: true }).click();
    await p.getByText("Planilha importada").waitFor({ timeout: 60000 });
    log("reimportação:", (await p.getByText("Planilha importada").innerText()).replace(/\s+/g, " "));
  }

  // Medições
  await p.goto(obra + "?aba=fisico&vista=medicoes");
  await p.getByText("Resumo do contrato").waitFor();
  const linha1 = p.locator("tbody tr").filter({ has: p.locator("td:first-child", { hasText: /^1$/ }) }).first();
  const t1 = (await linha1.innerText()).replace(/\s+/g, " ");
  log("medição 1:", t1);
  if (!t1.includes("46.987,77")) falha("cobrança da medição 1 deveria ser R$ 46.987,77 (Gerencial do Palco)");
  const saldo = await p.locator("dl").innerText();
  if (!saldo.replace(/\s+/g, " ").includes("103.089,34")) falha("saldo deveria ser R$ 103.089,34");
  log("saldo do contrato R$ 103.089,34");
  await p.screenshot({ path: S + "m1-medicoes.png", fullPage: true });

  await linha1.getByRole("button", { name: "Fechar" }).click();
  await linha1.getByText("Fechada").waitFor();
  await linha1.getByLabel("Situação").selectOption("PAGA");
  await linha1.getByLabel("Data do pagamento").fill("2026-10-20");
  await linha1.getByRole("button", { name: "Salvar" }).click();
  await p.waitForFunction(() => document.querySelector("dl")?.innerText.includes("56.101,57"), null, { timeout: 15000 }).catch(() => falha("saldo após pagar a medição 1 deveria ser R$ 56.101,57"));
  log("medição 1 fechada e paga → saldo R$ 56.101,57");

  // Desconto na medição aberta (recarrega para garantir a tela já atualizada após o pagamento)
  await p.reload(); await p.getByText("Resumo do contrato").waitFor();
  await p.selectOption("#tipo", "DESCONTO");
  await p.fill("#descricao", "Desconto teste e2e");
  await p.fill("#valor", "300");
  await p.getByRole("button", { name: "Incluir" }).click();
  await p.getByText("Desconto teste e2e").waitFor();
  log("desconto incluído");
  await p.screenshot({ path: S + "m2-medicoes-fechada.png", fullPage: true });

  // Gerencial
  await p.goto(obra + "?aba=fisico&vista=gerencial");
  await p.getByText("Pagamentos a fornecedores (semana a semana)").waitFor();
  const cel = p.getByLabel("Pagamento a Everton na semana 2");
  const antes = await cel.inputValue();
  await cel.fill(antes === "12500" ? "12600" : "12500");
  await p.getByRole("button", { name: /Salvar 1 pagamento/ }).click();
  await p.getByText(/pagamento\(s\) salvo/).waitFor();
  const linhaEv = (await p.locator("tr", { hasText: "Everton" }).first().innerText()).replace(/\s+/g, " ");
  log("Everton:", linhaEv);
  if (!linhaEv.includes("11.486,86")) falha("executado do Everton deveria ser R$ 11.486,86 (Gerencial!D36)");
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "m3-gerencial.png", fullPage: true });

  // Desfaz
  await p.getByLabel("Pagamento a Everton na semana 2").fill(antes);
  if (await p.getByRole("button", { name: /Salvar 1 pagamento/ }).count()) { await p.getByRole("button", { name: /Salvar 1 pagamento/ }).click(); await p.getByText(/pagamento\(s\) salvo/).waitFor(); }
  await p.goto(obra + "?aba=fisico&vista=medicoes");
  await p.locator("tr", { hasText: "Desconto teste e2e" }).getByRole("button", { name: "Remover" }).click();
  await p.getByText("Desconto teste e2e").waitFor({ state: "detached" });
  const l1 = p.locator("tbody tr").filter({ has: p.locator("td:first-child", { hasText: /^1$/ }) }).first();
  await l1.getByLabel("Situação").selectOption("NAO_PAGA");
  await l1.getByRole("button", { name: "Salvar" }).click();
  await l1.getByRole("button", { name: "Reabrir" }).waitFor();
  await l1.getByRole("button", { name: "Reabrir" }).click();
  await l1.getByText("A fechar").waitFor();
  log("alterações desfeitas");

  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
