import Link from "next/link";
import clsx from "clsx";
import { db } from "@/db";
import { datasDaSemana, medicaoDaSemana } from "@/dominio/fisico";
import { formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { temPermissao } from "@/lib/auth/atual";
import type { UsuarioSessao } from "@/servicos/sessoes";
import { listarFornecedores } from "@/servicos/cadastros";
import { carregarFisico } from "@/servicos/fisico";
import { carregarMedicoes } from "@/servicos/medicoes";
import { VistaGerencial, VistaMedicoes } from "./vistas-medicao";
import { VistaRelatorio } from "./vista-relatorio";
import { BotaoEnviar, Caixa, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CurvaAvanco, EvolucaoEtapas, RoscaProgresso } from "@/componentes/graficos-fisico";
import { GradeFisico } from "@/componentes/grade-fisico";
import { LancarSemana } from "@/componentes/lancar-semana";
import { PlanilhaObra } from "@/componentes/planilha-obra";
import { Aviso, Cartao, Indicador } from "@/componentes/ui";
import {
  alterarEtapaRelatorioAcao, criarEtapaAcao, excluirServicoAcao, gerarDoOrcamentoAcao, importarFisicoAcao, periodoMedicaoAcao,
  salvarSemanasAcao, salvarServicoAcao,
} from "./acoes";

export const VISTAS = [
  { id: "avanco", rotulo: "Avanço" },
  { id: "semana", rotulo: "Lançar semana" },
  { id: "realizado", rotulo: "Realizado físico" },
  { id: "previsto", rotulo: "Previsto físico" },
  { id: "medicoes", rotulo: "Medições" },
  { id: "gerencial", rotulo: "Gerencial" },
  { id: "relatorio", rotulo: "Relatório semanal" },
  { id: "planilha", rotulo: "Planilha da obra" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];

const pct = (v: number) => formatarPercentual(v);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export async function AbaFisico({ obraId, u, sp }: { obraId: string; u: UsuarioSessao; sp: Record<string, string | undefined> }) {
  const f = await carregarFisico(db, u.empresaId, obraId);
  const vazio = f.servicos.length === 0;
  const vista: Vista = vazio ? "planilha" : (VISTAS.some((v) => v.id === sp.vista) ? sp.vista as Vista : "avanco");
  const podeLancar = temPermissao(u, "planejamento", "editar");
  const podeEstruturar = temPermissao(u, "planejamento", "criar");
  const verValores = temPermissao(u, "orcamentos", "ver");
  const base = `/obras/${obraId}?aba=fisico`;
  const visivel = (id: Vista) => (id === "medicoes" ? temPermissao(u, "medicoes") : id === "gerencial" ? temPermissao(u, "medicoes") && verValores : id === "relatorio" ? temPermissao(u, "relatorios") : true);
  const semanas = Array.from({ length: f.nSemanas }, (_, i) => ({ numero: i + 1, ...datasDaSemana(f.obra.dataInicio, i + 1) }));
  const semanaRef = Math.min(Math.max(f.semanaAtual, 1), f.nSemanas);
  const grade = f.servicos.map((s) => ({ id: s.id, etapaId: s.etapaId, descricao: s.descricao, duracao: s.duracaoDias, valorCliente: s.valorCliente, fornecedorNome: s.fornecedorNome, previsto: s.previsto, realizado: s.realizado }));
  const etapas = f.etapas.map((e) => ({ id: e.id, nome: e.nome }));

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 rounded-xl border border-borda bg-white p-1 text-sm" aria-label="Gestão da obra">
        {VISTAS.filter((v) => visivel(v.id)).map((v) => (
          <Link key={v.id} href={`${base}&vista=${v.id}`} aria-current={vista === v.id ? "page" : undefined}
            className={clsx("rounded-lg px-3 py-1.5 font-medium", vista === v.id ? "bg-marca text-white" : "text-suave hover:bg-zinc-100 hover:text-texto", vazio && v.id !== "planilha" && "pointer-events-none opacity-40")}>
            {v.rotulo}
          </Link>
        ))}
        <span className="ml-auto hidden self-center px-2 text-xs text-suave md:inline">
          Semana {f.semanaAtual} de {f.nSemanas} · medição {f.obra.semanasPorMedicao === 2 ? "quinzenal" : f.obra.semanasPorMedicao === 1 ? "semanal" : `a cada ${f.obra.semanasPorMedicao} semanas`}
        </span>
      </nav>

      {sp.importada && (
        <Aviso tom="sucesso">
          Planilha importada: {sp.importada} serviços e {sp.semanas} semanas{sp.previsto === "1" ? ", com o previsto físico" : " (sem previsto)"}.
          {sp.criadas && <> Categorias criadas: {sp.criadas}.</>}
          {sp.fornCriados && <> Fornecedores cadastrados automaticamente (complete os dados em Cadastros → Fornecedores): {sp.fornCriados}.</>}
        </Aviso>
      )}
      {sp.gerada && <Aviso tom="sucesso">Planilha da obra gerada do orçamento-base: {sp.gerada} serviços. Ajuste fornecedor, MO acertada e duração de cada serviço.</Aviso>}

      {vista === "medicoes" && (temPermissao(u, "medicoes") ? (
        <VistaMedicoes m={await carregarMedicoes(db, u.empresaId, obraId)} obraId={obraId} base={base} todas={sp.todas === "1"}
          pode={{ fechar: temPermissao(u, "medicoes", "criar"), situacao: temPermissao(u, "medicoes", "editar"), reabrir: temPermissao(u, "medicoes", "aprovar"), ajustes: temPermissao(u, "medicoes", "criar") }} />
      ) : <Aviso tom="alerta">Seu perfil não tem acesso a Medições.</Aviso>)}

      {vista === "gerencial" && (temPermissao(u, "medicoes") && verValores ? (
        <VistaGerencial m={await carregarMedicoes(db, u.empresaId, obraId)} obraId={obraId} podePagamentos={temPermissao(u, "medicoes", "editar")} />
      ) : <Aviso tom="alerta">Seu perfil não tem acesso ao Gerencial (valores da obra).</Aviso>)}

      {vista === "relatorio" && <VistaRelatorio obraId={obraId} u={u} sp={sp} base={base} inicioObra={f.obra.dataInicio} semanaAtual={f.semanaAtual} nSemanas={f.nSemanas} cores={f.obra.relatorioCores} />}

      {vista === "avanco" && <VistaAvanco f={f} semanas={semanas} semanaRef={semanaRef} verValores={verValores} />}

      {vista === "semana" && (() => {
        const n = Math.min(Math.max(Number(sp.semana) || semanaRef, 1), f.nSemanas);
        const s = semanas[n - 1]!;
        return <LancarSemana key={n} etapas={etapas} servicos={grade} semana={n} totalSemanas={f.nSemanas} inicio={s.inicio} fim={s.fim}
          base={`${base}&vista=semana`} editavel={podeLancar} salvar={salvarSemanasAcao.bind(null, obraId, "realizado")} />;
      })()}

      {(vista === "realizado" || vista === "previsto") && (
        <GradeFisico serie={vista} etapas={etapas} servicos={grade} semanas={semanas} semanaAtual={f.semanaAtual} semanasPorMedicao={f.obra.semanasPorMedicao}
          editavel={vista === "realizado" ? podeLancar : podeEstruturar} salvar={salvarSemanasAcao.bind(null, obraId, vista)} />
      )}

      {vista === "planilha" && (
        <div className="space-y-5">
          {vazio && (
            <Aviso>
              A planilha da obra (colunas da esquerda do <b>Realizado-Físico</b>) ainda está vazia. Escolha como começar: <b>gerar do orçamento-base</b>,
              <b> importar a planilha de controle</b> que vocês já usam (abas Realizado-Físico e Previsto físico) ou incluir os serviços manualmente pelo <b>+</b> de cada etapa.
            </Aviso>
          )}
          {podeEstruturar && (
            <div className="grid gap-5 lg:grid-cols-3">
              <Cartao titulo="Gerar do orçamento-base">
                <Formulario acao={gerarDoOrcamentoAcao.bind(null, obraId)}>
                  <p className="text-sm text-suave">Cria um serviço por item (mão de obra) e uma linha &quot;Material de …&quot; por etapa. Valor cliente inclui o imposto rateado, somando o total da proposta. Só funciona com a planilha vazia.</p>
                  <BotaoEnviar variante={vazio ? "primario" : "secundario"}>Gerar planilha</BotaoEnviar>
                </Formulario>
              </Cartao>
              <Cartao titulo="Importar planilha de controle">
                <Formulario acao={importarFisicoAcao.bind(null, obraId)}>
                  <Campo nome="arquivo" rotulo="Planilha da obra (.xlsx ou .xlsm)" type="file" accept=".xlsx,.xlsm" ajuda="Modelo AO/Palco. Lê serviços, fornecedor, valores, duração, previsto e realizado semanais. Macros não são executadas." />
                  {!vazio && <Caixa nome="substituir" rotulo="Substituir a planilha atual (apaga serviços, previsto e realizado lançados)" />}
                  <BotaoEnviar variante="secundario">Importar</BotaoEnviar>
                </Formulario>
              </Cartao>
              <div className="space-y-5">
                <Cartao titulo="Nova categoria">
                  <Formulario acao={criarEtapaAcao.bind(null, obraId)} limparAoSalvar>
                    <Campo nome="nome" rotulo="Nome" placeholder="Ex.: Marcenaria" ajuda="Para serviços que surgirem ao longo da obra. Aparece no relatório." />
                    <BotaoEnviar variante="secundario">Criar</BotaoEnviar>
                  </Formulario>
                </Cartao>
                <Cartao titulo="Período de medição">
                  <Formulario acao={periodoMedicaoAcao.bind(null, obraId)}>
                    <CampoSelecao nome="semanasPorMedicao" rotulo="Fechar a medição a cada" defaultValue={String(f.obra.semanasPorMedicao)}
                      opcoes={[{ valor: "1", rotulo: "1 semana" }, { valor: "2", rotulo: "2 semanas (quinzenal)" }, { valor: "3", rotulo: "3 semanas" }, { valor: "4", rotulo: "4 semanas (mensal)" }]} />
                    <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
                  </Formulario>
                </Cartao>
              </div>
            </div>
          )}
          <PlanilhaObra
            etapas={f.etapas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, exibirNoRelatorio: e.exibirNoRelatorio }))}
            servicos={f.servicos.map((s) => ({
              id: s.id, etapaId: s.etapaId, descricao: s.descricao, fornecedorId: s.fornecedorId, fornecedorNome: s.fornecedorNome,
              maoDeObraAcertada: s.maoDeObraAcertada, maoDeObraVerba: s.maoDeObraVerba, valorCliente: s.valorCliente, duracaoDias: s.duracaoDias,
              curvaAbc: (s.curvaAbc as "A" | "B" | "C" | null) ?? null, observacao: s.observacao,
              peso: f.avanco.servicos.get(s.id)?.peso ?? 0, concluido: f.avanco.servicos.get(s.id)?.realizado ?? 0, abcAuto: f.abc.get(s.id) ?? null,
            }))}
            fornecedores={podeEstruturar ? (await listarFornecedores(db, u.empresaId, { ativos: true })).map((x) => ({ id: x.id, nome: x.nome })) : []}
            editavel={podeEstruturar} verValores={verValores} contrato={Number(f.obra.valorContratoOriginal)}
            salvar={salvarServicoAcao.bind(null, obraId)} excluir={excluirServicoAcao.bind(null, obraId)} alternarRelatorio={alterarEtapaRelatorioAcao.bind(null, obraId)}
          />
        </div>
      )}
    </div>
  );
}

function VistaAvanco({ f, semanas, semanaRef, verValores }: {
  f: Awaited<ReturnType<typeof carregarFisico>>; semanas: { numero: number; inicio: string }[]; semanaRef: number; verValores: boolean;
}) {
  const a = f.avanco;
  const real = a.acumulado[semanaRef - 1]?.realizado ?? 0;
  const prev = a.acumulado[semanaRef - 1]?.previsto ?? 0;
  const dif = real - prev;
  const fimPrevisto = a.acumulado.find((p) => p.previsto >= 1 - 1e-6)?.semana ?? null;
  // Previsto acumulado de cada etapa até a semana de referência (relativo à etapa).
  const etapasRel = f.etapas.filter((e) => e.exibirNoRelatorio && f.servicos.some((s) => s.etapaId === e.id)).map((e) => {
    const ss = f.servicos.filter((s) => s.etapaId === e.id);
    const dur = ss.reduce((t, s) => t + Math.max(s.duracaoDias, 0), 0);
    const prevAte = dur > 0 ? ss.reduce((t, s) => t + Math.max(s.duracaoDias, 0) * Object.entries(s.previsto).filter(([k]) => Number(k) <= semanaRef).reduce((x, [, v]) => x + v, 0), 0) / dur : 0;
    return { nome: e.nome, realizado: a.etapas.find((x) => x.etapaId === e.id)?.realizado ?? 0, previsto: prevAte };
  });
  const medido = f.servicos.reduce((t, s) => t + s.valorCliente * Object.values(s.realizado).reduce((x, y) => x + y, 0), 0);
  const medicao = medicaoDaSemana(semanaRef, f.obra.semanasPorMedicao);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo={`Realizado até a semana ${semanaRef}`} valor={pct(real)} detalhe={`Previsto: ${pct(prev)}`} />
        <Indicador rotulo="Diferença" valor={`${dif > 0 ? "+" : ""}${(dif * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`}
          tom={dif < -0.005 ? "perigo" : dif > 0.005 ? "sucesso" : undefined} detalhe={dif < -0.005 ? "Abaixo do previsto" : dif > 0.005 ? "Acima do previsto" : "No ritmo previsto"} />
        <Indicador rotulo="Semana atual" valor={`${f.semanaAtual} de ${f.nSemanas}`} detalhe={`Medição ${medicao} · ${fimPrevisto ? `previsto 100% na semana ${fimPrevisto}` : "previsto não chega a 100%"}`} tom={fimPrevisto == null ? "alerta" : undefined} />
        {verValores
          ? <Indicador rotulo="Valor executado (cliente)" valor={formatarMoeda(medido)} detalhe={`de ${formatarMoeda(f.totais.cliente)} na planilha`} />
          : <Indicador rotulo="Serviços" valor={f.servicos.length} detalhe={`${f.servicos.filter((s) => (f.avanco.servicos.get(s.id)?.realizado ?? 0) >= 1 - 1e-6).length} concluído(s)`} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao titulo="Progresso da obra">
          <RoscaProgresso valor={real} />
        </Cartao>
        <Cartao titulo="Evolução por tipo de serviço" className="lg:col-span-2" acoes={<span className="text-xs text-suave">barra: realizado · traço: previsto até a semana {semanaRef}</span>}>
          <EvolucaoEtapas etapas={etapasRel} />
        </Cartao>
      </div>
      <Cartao titulo="Avanço físico acumulado — previsto × realizado">
        <CurvaAvanco semanaAtual={f.semanaAtual}
          pontos={semanas.map((s, i) => ({ semana: s.numero, inicio: s.inicio, previsto: a.acumulado[i]?.previsto ?? 0, realizado: s.numero <= semanaRef ? (a.acumulado[i]?.realizado ?? 0) : null }))} />
        <p className="mt-2 text-xs text-suave">Semanas de {ddmm(semanas[0]!.inicio)} (segunda) em diante. O realizado aparece até a semana atual, como na planilha. Avanço ponderado pela duração dos serviços.</p>
      </Cartao>
    </div>
  );
}
