// Teste ponta a ponta do Quadro de atividades. Rodar depois de tests/e2e/fluxo-fase2.cjs (usa os usuários criados por ele),
// com o app em http://localhost:3100. Uso: SHOTS_DIR=/tmp node tests/e2e/quadro.cjs
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const S = (process.env.SHOTS_DIR ?? require("os").tmpdir()) + "/";
const log = (...a) => console.log("✔", ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(e.message));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("dialog", (d) => d.accept());

  await p.goto(B + "/login"); await p.screenshot({ path: S + "q-login.png" });
  await p.fill("#email", "admin@masie.com.br"); await p.fill("#senha", "MasieObra2027"); await p.click("button[type=submit]");
  await p.waitForURL(B + "/");
  await p.locator("nav").getByRole("link", { name: "Quadros", exact: true }).click(); await p.waitForURL(/\/quadros$/);
  await p.locator("main").getByRole("link", { name: /Escritório/ }).click(); await p.waitForURL(/\/quadros\/[0-9a-f-]+$/);
  const urlQuadro = p.url();
  log("quadro Escritório aberto pelo menu");

  const colAFazer = p.locator("section[aria-label='A fazer']");
  for (const t of ["Pagar contabilidade", "Renovar seguro do carro", "Organizar arquivo de projetos"]) {
    await colAFazer.getByText("Adicionar cartão").click().catch(() => {});
    await colAFazer.locator("textarea[name=titulo]").fill(t);
    await colAFazer.locator("textarea[name=titulo]").press("Enter");
    await colAFazer.getByText(t).waitFor();
  }
  log("3 cartões criados pela criação rápida (Enter)");

  // Arrastar e soltar
  const cartao = colAFazer.locator("li", { hasText: "Pagar contabilidade" });
  const destino = p.locator("section[aria-label='Em andamento'] ol");
  await cartao.dragTo(destino);
  await p.locator("section[aria-label='Em andamento']").getByText("Pagar contabilidade").waitFor();
  await p.waitForTimeout(800);
  await p.reload();
  await p.locator("section[aria-label='Em andamento']").getByText("Pagar contabilidade").waitFor();
  log("arrastar e soltar: cartão movido e persistido após recarregar");

  // Reordenar dentro da coluna: "Organizar" antes de "Renovar"
  await colAFazer.locator("li", { hasText: "Organizar arquivo" }).dragTo(colAFazer.locator("li", { hasText: "Renovar seguro" }));
  await p.waitForTimeout(800); await p.reload();
  const ordem = await p.locator("section[aria-label='A fazer'] li p").allTextContents();
  if (ordem[0] !== "Organizar arquivo de projetos") throw new Error("ordem errada: " + ordem);
  log("reordenação dentro da coluna persistida");

  // Detalhe do cartão
  await p.getByText("Pagar contabilidade").click();
  await p.waitForURL(/cartao=/);
  await p.selectOption("#responsavelId", { label: "Administrador" });
  await p.fill("#dataEntrega", "2026-11-02");
  await p.fill("#descricao", "Boleto de novembro — conferir valor com o contador.");
  await p.locator("label", { hasText: "Financeiro" }).click();
  await p.click("text=Salvar"); await p.getByText("Cartão salvo.").waitFor();
  await p.fill("input[name=texto]", "Conferir boleto"); await p.getByRole("button", { name: "Adicionar" }).last().click();
  await p.getByText("Conferir boleto").waitFor();
  await p.getByRole("button", { name: "Marcar como feito" }).click();
  await p.getByRole("button", { name: "Desmarcar" }).waitFor();
  await p.fill("textarea[name=texto]", "Contador confirmou o valor."); await p.click("text=Comentar");
  await p.getByText("Contador confirmou o valor.").waitFor();
  await p.getByText("Entrega vencida").waitFor();
  log("detalhe: responsável, entrega, etiqueta, checklist, comentário e alerta de atraso");
  await p.screenshot({ path: S + "q-cartao.png" });

  await p.goto(urlQuadro);
  await p.locator("section[aria-label='Em andamento']").getByText("atrasado").waitFor();
  await p.locator("section[aria-label='Em andamento'] li .text-sucesso").getByText("1/1").waitFor();
  await p.screenshot({ path: S + "q-quadro.png" });
  log("cartão mostra etiqueta, prazo atrasado e checklist 1/1");

  // Configuração: limite de WIP
  await p.goto(urlQuadro + "?config=1");
  const linhaEmAndamento = p.locator("li", { has: p.locator("input[name=nome][value='Em andamento']") });
  await linhaEmAndamento.locator("input[name=limite]").fill("1");
  await linhaEmAndamento.getByRole("button", { name: "Salvar" }).click();
  await p.waitForTimeout(800);
  await p.goto(urlQuadro);
  await p.locator("section[aria-label='Em andamento'] header").getByText("1/1").waitFor();
  await colAFazer.locator("li", { hasText: "Renovar seguro" }).dragTo(p.locator("section[aria-label='Em andamento'] ol"));
  await p.getByRole("alert").filter({ hasText: "limite" }).waitFor();
  await p.reload();
  if (await p.locator("section[aria-label='Em andamento']").getByText("Renovar seguro").count()) throw new Error("ultrapassou o limite");
  log("limite de WIP impede mover e desfaz a movimentação otimista");

  // Calendário
  await p.locator("nav").getByRole("link", { name: "Calendário", exact: true }).click(); await p.waitForURL(/calendario/);
  await p.getByText("⚠ Pagar contabilidade").waitFor();
  await p.locator("a[aria-label='Novo cartão em 20/11/2026']").click({ force: true });
  await p.fill("#titulo", "Reunião de planejamento mensal"); await p.click("text=Criar na primeira coluna");
  await p.waitForFunction(() => document.querySelector("#titulo")?.value === "");
  await p.goto(B + "/quadros/calendario"); await p.getByText("Reunião de planejamento mensal").waitFor();
  await p.screenshot({ path: S + "q-calendario.png", fullPage: true });
  log("calendário mostra cartões e cria cartão direto no dia");

  await p.goto(B + "/"); await p.getByText("Minhas tarefas").waitFor(); await p.getByText("atrasada ·").waitFor();
  await p.screenshot({ path: S + "q-dashboard.png", fullPage: true });
  log("dashboard: minhas tarefas com atraso");

  await p.goto(B + "/auditoria?entidade=cartao"); await p.getByText("A fazer → Em andamento").first().waitFor();
  log("auditoria registra a movimentação do cartão");

  // Celular
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const q = await m.newPage();
  await q.goto(B + "/login"); await q.fill("#email", "ana@masie.com.br"); await q.fill("#senha", "AnaObra2026"); await q.click("button[type=submit]"); await q.waitForURL(B + "/");
  await q.goto(urlQuadro); await q.getByText("Pagar contabilidade").waitFor();
  if ((await q.evaluate(() => document.documentElement.scrollWidth)) > 390) throw new Error("rolagem horizontal da página no celular");
  await q.screenshot({ path: S + "q-quadro-celular.png" });
  await q.getByText("Organizar arquivo de projetos").click();
  await q.selectOption("select[name=colunaId]", { label: "Em revisão" }); await q.getByRole("button", { name: "Mover", exact: true }).click();
  await q.getByText("Cartão movido.").waitFor();
  log("Engenharia no celular: vê o quadro e move pelo seletor");

  if (erros.length) { console.log("Erros de console:", erros); process.exitCode = 1; }
  await b.close();
  console.log("QUADRO OK");
})().catch(async (e) => { console.error("FALHOU:", e.message.split("\n").slice(0,3).join(" / ")); process.exit(1); });
