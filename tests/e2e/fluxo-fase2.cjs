// Teste ponta a ponta da Fase 2 (Playwright). Requer banco recém-criado (npm run db:migrate && npm run db:seed
// com SEED_ADMIN_SENHA=Masie@2026) e o app em http://localhost:3100. Uso: node tests/e2e/fluxo-fase2.cjs
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const SHOTS = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  await p.goto(B + "/obras");
  if (!p.url().includes("/login?destino=%2Fobras")) throw new Error("não redirecionou ao login: " + p.url());
  log("anônimo redirecionado ao login");

  await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "errada123"); await p.click("button[type=submit]");
  await p.getByText("E-mail ou senha incorretos").waitFor(); log("senha errada rejeitada");

  await p.fill("#senha", "Masie@2026"); await p.click("button[type=submit]");
  await p.waitForURL(/\/conta\/senha/); log("troca de senha obrigatória no 1º acesso");
  await p.goto(B + "/obras"); await p.waitForURL(/\/conta\/senha/); log("não deixa navegar sem trocar a senha");
  await p.fill("#senhaAtual", "Masie@2026"); await p.fill("#novaSenha", "curta"); await p.fill("#confirmacao", "curta"); await p.click("button[type=submit]");
  await p.getByText("pelo menos 8 caracteres").first().waitFor(); log("política de senha aplicada");
  await p.fill("#novaSenha", "MasieObra2027"); await p.fill("#confirmacao", "MasieObra2027"); await p.click("button[type=submit]");
  await p.waitForURL(B + "/?senha=alterada"); log("senha trocada → dashboard");

  // Cliente
  await p.goto(B + "/clientes/novo");
  await p.selectOption("#tipoPessoa", "PJ"); await p.fill("#nome", "Palco Eventos Ltda"); await p.fill("#documento", "11.222.333/0001-00");
  await p.click("button[type=submit]"); await p.getByText("CNPJ inválido").first().waitFor(); log("CNPJ inválido barrado");
  await p.fill("#documento", "11.222.333/0001-81"); await p.click("button[type=submit]");
  await p.waitForURL(/\/clientes\?salvo=/); log("cliente cadastrado");

  // Usuário de engenharia
  await p.goto(B + "/configuracoes/usuarios");
  await p.fill("#nome", "Ana Engenheira"); await p.fill("#email", "ana@masie.com.br");
  await p.selectOption("#perfilId", { label: "Engenharia" }); await p.click("text=Criar e gerar senha provisória");
  const senhaAna = (await p.locator("code").first().textContent()).trim(); log("usuário Engenharia criado, senha provisória exibida uma vez");

  // Obra
  await p.goto(B + "/obras/nova");
  await p.click("text=Cadastrar obra e gerar estrutura");
  await p.getByText("Nome da obra é obrigatório").first().waitFor(); log("validação de obrigatórios");
  await p.fill("#nome", "Palco – Reforma do auditório");
  await p.selectOption("#clienteId", { label: "Palco Eventos Ltda" });
  await p.fill("#tipoObra", "Reforma comercial"); await p.fill("#cidade", "São Paulo"); await p.fill("#uf", "sp");
  await p.selectOption("#gestorId", { label: "Ana Engenheira" });
  await p.fill("#dataInicio", "2026-10-09"); await p.fill("#dataFimContratual", "2026-12-18");
  await p.selectOption("#situacao", "EM_ANDAMENTO");
  await p.fill("#valorContratoOriginal", "128.861,68"); await p.fill("#percentualEntrada", "20"); await p.fill("#orcamentoCustoAprovado", "81.857,03");
  await p.click("text=Cadastrar obra e gerar estrutura");
  await p.waitForURL(/\/obras\/[0-9a-f-]+\?criada=1/);
  const obraUrl = p.url().split("?")[0];
  await p.getByText("2026-0001").first().waitFor(); log("obra criada com código 2026-0001");
  await p.getByText("R$ 25.772,34").waitFor(); log("entrada 20% = R$ 25.772,34");
  await p.getByText("36,5%").waitFor(); log("margem calculada 36,5%");
  await p.screenshot({ path: SHOTS + "obra-resumo.png", fullPage: true });

  await p.goto(obraUrl + "?aba=estrutura");
  await p.getByText("EAP · 19 etapas").waitFor(); await p.getByText("Calendário semanal · 11 semanas").waitFor();
  await p.getByText("OBR-2026-0001").waitFor(); log("estrutura: centro de custo, 19 etapas, 11 semanas, orçamento rev. 0");
  await p.screenshot({ path: SHOTS + "obra-estrutura.png", fullPage: true });

  // Documentos
  await p.goto(obraUrl + "?aba=documentos");
  await p.setInputFiles("#arquivo", __dirname + "/falso.pdf"); await p.click("text=Enviar");
  await p.getByText("não corresponde à extensão").waitFor(); log("arquivo disfarçado de PDF rejeitado");
  await p.setInputFiles("#arquivo", __dirname + "/contrato.pdf"); await p.fill("#descricao", "Contrato assinado"); await p.click("text=Enviar");
  await p.getByRole("link", { name: "contrato.pdf" }).waitFor(); log("PDF anexado");
  const href = await p.getByRole("link", { name: "contrato.pdf" }).getAttribute("href");
  const resp = await p.request.get(B + href);
  if (resp.status() !== 200 || !(await resp.text()).startsWith("%PDF")) throw new Error("download falhou");
  log("download autenticado OK");

  // Edição → histórico
  await p.goto(obraUrl + "/editar");
  await p.fill("#dataFimContratual", "2027-01-15"); await p.click("text=Salvar alterações");
  await p.waitForURL(/\?salva=1/);
  await p.goto(obraUrl + "?aba=estrutura"); await p.getByText("Calendário semanal · 15 semanas").waitFor(); log("prorrogação acrescentou semanas");
  await p.goto(obraUrl + "?aba=historico");
  await p.getByText("Término contratual:").waitFor(); log("histórico mostra valor anterior → novo");
  await p.screenshot({ path: SHOTS + "obra-historico.png", fullPage: true });

  // Obra 2 sem vínculo da Ana, atrasada
  await p.goto(B + "/obras/nova");
  await p.fill("#nome", "Residência Jardins"); await p.selectOption("#clienteId", { label: "Palco Eventos Ltda" });
  await p.fill("#dataInicio", "2026-05-04"); await p.fill("#dataFimContratual", "2026-10-30"); await p.selectOption("#situacao", "EM_ANDAMENTO");
  await p.fill("#valorContratoOriginal", "310.000"); await p.click("text=Cadastrar obra e gerar estrutura");
  await p.waitForURL(/criada=1/); log("segunda obra criada");

  // Fornecedor com PIX
  await p.goto(B + "/fornecedores/novo");
  await p.fill("#nome", "Everton"); await p.fill("#especialidade", "Eletricista"); await p.fill("#b_pix", "everton.pix@exemplo.com");
  await p.click("button[type=submit]"); await p.waitForURL(/fornecedores\?salvo=/);
  await p.getByRole("link", { name: "Everton" }).click();
  await p.getByText("Mostrar e editar dados bancários").waitFor();
  if (await p.locator("#b_pix").count()) throw new Error("PIX exibido sem pedir");
  await p.click("text=Mostrar e editar dados bancários");
  if ((await p.inputValue("#b_pix")) !== "everton.pix@exemplo.com") throw new Error("PIX não decifrado");
  log("PIX cifrado, revelado sob demanda");

  await p.goto(B + "/");
  await p.getByText("Término contratual vencido").first().waitFor();
  await p.screenshot({ path: SHOTS + "dashboard.png", fullPage: true });
  log("dashboard renderizado");

  await p.goto(B + "/auditoria"); await p.getByText("Dados sensíveis").first().waitFor(); log("auditoria registra acesso a dados sensíveis");

  // Usuária de Engenharia
  const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const q = await c2.newPage();
  await q.goto(B + "/login"); await q.fill("#email", "ana@masie.com.br"); await q.fill("#senha", senhaAna); await q.click("button[type=submit]");
  await q.waitForURL(/conta\/senha/);
  await q.fill("#senhaAtual", senhaAna); await q.fill("#novaSenha", "AnaObra2026"); await q.fill("#confirmacao", "AnaObra2026"); await q.click("button[type=submit]");
  await q.waitForURL(/senha=alterada/);
  await q.goto(B + "/obras");
  const linhas = await q.locator("tbody tr").count();
  if (linhas !== 1) throw new Error(`Engenharia deveria ver 1 obra, viu ${linhas}`);
  log("Engenharia vê só a obra vinculada");
  await q.goto(B + "/configuracoes/usuarios"); await q.waitForURL(/sem-permissao/); log("Engenharia sem acesso a usuários");
  await q.goto(B + "/"); await q.screenshot({ path: SHOTS + "dashboard-celular.png", fullPage: true });
  await q.click("[aria-label='Abrir menu']"); await q.screenshot({ path: SHOTS + "menu-celular.png" });
  log("layout móvel OK");

  if (erros.length) { console.log("Erros de console:", erros); process.exitCode = 1; }
  await browser.close();
  console.log("FLUXO COMPLETO OK");
})().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
