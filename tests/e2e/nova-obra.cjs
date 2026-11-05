// Cadastro de obra com cliente digitado (novo ou existente). Cria uma obra de teste e a exclui no final
// (o cliente "Cliente Teste E2E …" criado pelo teste fica no cadastro; exclua-o em Clientes se quiser).
const { chromium } = require("playwright");
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
  await p.goto(B + "/obras/nova");
  await p.fill("#nome", "Obra de teste do cadastro [e2e]");
  const cliente = `Cliente Teste E2E ${Date.now() % 100000}`;
  await p.fill("#clienteNome", cliente);
  await p.fill("#dataInicio", "2026-11-09");
  await p.fill("#dataFimContratual", "2027-03-26");
  await p.selectOption("#situacao", "CONTRATADA");
  await p.fill("#valorContratoOriginal", "250.000,00");
  await p.fill("#percentualEntrada", "20");
  await p.screenshot({ path: S + "nova-obra-form.png", fullPage: true });
  await p.getByRole("button", { name: "Cadastrar obra e gerar estrutura" }).click();
  await p.getByText("Obra cadastrada").waitFor({ timeout: 20000 });
  const sub = await p.locator("h1").locator("xpath=../..").innerText();
  if (!sub.includes(cliente)) falha("cliente digitado deveria aparecer na obra");
  log("obra cadastrada com cliente novo:", cliente);

  // Editar mantendo o cliente (o campo vem preenchido com o nome)
  await p.getByRole("link", { name: "Editar" }).click();
  if ((await p.inputValue("#clienteNome")) !== cliente) falha("edição deveria trazer o nome do cliente");
  await p.getByRole("button", { name: "Salvar alterações" }).click();
  await p.getByText("Alterações salvas").waitFor();
  log("edição mantém o cliente");

  // Validação: sem cliente
  await p.goto(B + "/obras/nova");
  await p.fill("#nome", "Sem cliente"); await p.fill("#dataInicio", "2026-11-09"); await p.fill("#dataFimContratual", "2027-01-29");
  await p.getByRole("button", { name: "Cadastrar obra e gerar estrutura" }).click();
  await p.getByText("Informe o cliente").waitFor();
  log("aviso quando o cliente não é informado");

  // Limpa: exclui a obra de teste
  await p.goto(B + "/obras?q=e2e");
  await p.locator("a", { hasText: "Obra de teste do cadastro" }).first().click().catch(async () => { await p.locator("tr", { hasText: "Obra de teste do cadastro" }).locator("a").first().click(); });
  await p.getByRole("button", { name: "Excluir obra" }).click();
  await p.waitForURL((u) => u.pathname === "/obras", { waitUntil: "commit" });
  log("obra de teste excluída");
  if (erros.length) falha("erros no navegador: " + erros.join(" | "));
  log("sem erros no console");
  await b.close();
})().catch((e) => { console.error("✘", e.message); process.exit(1); });
