import Link from "next/link";
import clsx from "clsx";
import { hojeIso } from "@/dominio/calendario";
import { datasDaSemana } from "@/dominio/fisico";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import type { MedicoesCarregadas } from "@/servicos/medicoes";
import { AcaoConfirmada, BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { GradePagamentos, GraficoCobranca, SituacaoMedicao } from "@/componentes/medicoes-ui";
import { Aviso, Cartao, Indicador, Selo, Tabela } from "@/componentes/ui";
import {
  excluirAjusteAcao, fecharMedicaoAcao, reabrirMedicaoAcao, salvarAjusteAcao, salvarPagamentosAcao, situacaoMedicaoAcao,
} from "../medicoes/acoes";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ESTADO = {
  FECHADA: ["Fechada", "azul"], A_FECHAR: ["A fechar", "destaque"], EM_ANDAMENTO: ["Em andamento", "amarelo"], FUTURA: ["Prevista", "cinza"],
} as const;
const TIPO_AJUSTE = { ADITIVO: "Aditivo", DESCONTO: "Desconto", REEMBOLSO: "Reembolso" } as const;

function LinhaResumo({ rotulo, valor, forte, sinal }: { rotulo: string; valor: number; forte?: boolean; sinal?: "−" | "+" }) {
  return (
    <div className={clsx("flex items-baseline justify-between gap-4 py-1.5", forte && "border-t-2 border-dashed border-zinc-800 pt-2 font-semibold")}>
      <dt className={forte ? "" : "text-suave"}>{rotulo}</dt>
      <dd className={clsx("tabular whitespace-nowrap", valor < 0 && forte && "text-perigo")}>{formatarMoeda(sinal === "−" && valor ? -valor : valor)}</dd>
    </div>
  );
}

export function ResumoDoContrato({ m }: { m: MedicoesCarregadas }) {
  const r = m.resumo;
  return (
    <dl className="text-sm">
      <LinhaResumo rotulo="Valor total do contrato" valor={r.contrato} />
      <LinhaResumo rotulo={`Entrada (${formatarPercentual(m.obra.percentualEntrada)})`} valor={r.entrada} sinal="−" />
      <LinhaResumo rotulo="Aditivos / descontos / reembolsos" valor={r.ajustes} />
      <LinhaResumo rotulo="Medições quitadas" valor={r.quitadas} sinal="−" />
      <LinhaResumo rotulo="Material já faturado em nome do cliente" valor={r.faturamentoDireto} sinal="−" />
      <LinhaResumo rotulo="Saldo a pagar" valor={r.saldo} forte />
    </dl>
  );
}

export function VistaMedicoes({ m, obraId, pode, todas, base }: {
  m: MedicoesCarregadas; obraId: string; pode: { fechar: boolean; situacao: boolean; reabrir: boolean; ajustes: boolean }; todas: boolean; base: string;
}) {
  const hoje = hojeIso();
  const ultimaFechada = [...m.linhas].reverse().find((l) => l.estado === "FECHADA");
  const proxima = m.linhas.find((l) => l.estado !== "FECHADA");
  const limite = Math.max((proxima?.numero ?? 0) + 2, 4);
  const visiveis = todas ? m.linhas : m.linhas.filter((l) => l.numero <= limite);
  const abertas = m.linhas.filter((l) => l.estado !== "FECHADA");
  const k = m.obra.semanasPorMedicao;
  const col = { aditivo: m.linhas.some((l) => l.aditivo), ajustes: m.linhas.some((l) => l.ajustes), anteriores: m.linhas.some((l) => l.ajusteAnteriores || l.divergencia) };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador rotulo={proxima ? `Medição ${proxima.numero} (${ESTADO[proxima.estado][0].toLowerCase()})` : "Medições"} valor={proxima ? formatarMoeda(proxima.cobranca) : "—"}
          detalhe={proxima ? `Semanas ${proxima.semanaInicio}–${proxima.semanaFim} · data ${formatarData(proxima.data)}` : "Todas fechadas"} />
        <Indicador rotulo="Executado (cobrança)" valor={formatarMoeda(m.resumo.executado)} detalhe={`Quitado: ${formatarMoeda(m.resumo.quitadas)}`} />
        <Indicador rotulo="A cobrar" valor={formatarMoeda(m.resumo.aCobrar)} tom={m.resumo.aCobrar > 0.005 ? "alerta" : undefined} detalhe="Executado − quitado" />
        <Indicador rotulo="Saldo do contrato" valor={formatarMoeda(m.resumo.saldo)} detalhe={`Período: ${k === 1 ? "semanal" : k === 2 ? "quinzenal" : `${k} semanas`}`} />
      </div>

      {m.linhas.some((l) => l.divergencia) && (
        <Aviso tom="alerta">O realizado de semanas já medidas foi alterado depois do fechamento. A diferença aparece em &quot;Ajuste ant.&quot; na primeira medição aberta, para não cobrar a mais nem a menos.</Aviso>
      )}
      {Math.abs(m.aditivosLancados - m.aditivosPlanilha) >= 1 && (
        <Aviso tom="alerta">
          Aditivos lançados no contrato ({formatarMoeda(m.aditivosLancados)}) diferem do valor cliente dos serviços da etapa Aditivos ({formatarMoeda(m.aditivosPlanilha)}).
          A medição dos aditivos vem dos serviços da etapa Aditivos — inclua-os na <Link className="underline" href={`${base}&vista=planilha`}>Planilha da obra</Link>.
        </Aviso>
      )}

      <Cartao titulo="Medições" semPadding acoes={<Link href={`${base}&vista=medicoes${todas ? "" : "&todas=1"}`} className="text-xs underline decoration-destaque decoration-2 underline-offset-4">{todas ? "Mostrar só as próximas" : `Mostrar todas (${m.linhas.length})`}</Link>}>
        <Tabela>
          <thead>
            <tr>
              <th>Nº</th><th>Período</th><th className="text-right">Contrato</th><th className="text-right">(−) Entrada</th>{col.aditivo && <th className="text-right">Aditivos</th>}
              {col.ajustes && <th className="text-right" title="Descontos (−) e reembolsos (+)">Desc./reemb.</th>}{col.anteriores && <th className="text-right" title="Correções de medições já fechadas">Ajuste ant.</th>}
              <th className="text-right">Cobrança</th><th className="text-right">Previsto</th><th>Estado</th><th>Situação</th><th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const ini = datasDaSemana(m.obra.dataInicio, l.semanaInicio).inicio;
              const fim = datasDaSemana(m.obra.dataInicio, l.semanaFim).fim;
              const atual = l.estado === "EM_ANDAMENTO";
              return (
                <tr key={l.numero} className={clsx(atual && "bg-destaque-suave/50", l.estado === "FUTURA" && "text-suave")}>
                  <td className="font-semibold">{l.numero}</td>
                  <td className="whitespace-nowrap">{ddmm(ini)} a {ddmm(fim)}<div className="text-xs text-suave">sem. {l.semanaInicio}{l.semanaFim !== l.semanaInicio && `–${l.semanaFim}`} · {formatarData(l.data)}</div></td>
                  <td className="tabular whitespace-nowrap text-right">{formatarMoeda(l.contrato)}</td>
                  <td className="tabular whitespace-nowrap text-right text-suave">{l.entrada ? formatarMoeda(-l.entrada) : "—"}</td>
                  {col.aditivo && <td className="tabular whitespace-nowrap text-right">{l.aditivo ? formatarMoeda(l.aditivo) : "—"}</td>}
                  {col.ajustes && <td className={clsx("tabular whitespace-nowrap text-right", l.ajustes < 0 && "text-perigo")}>{l.ajustes ? formatarMoeda(l.ajustes) : "—"}</td>}
                  {col.anteriores && <td className="tabular whitespace-nowrap text-right">{l.ajusteAnteriores ? formatarMoeda(l.ajusteAnteriores) : l.divergencia ? <span className="text-alerta" title="Diferença do realizado atual em relação ao valor fechado">Δ {formatarMoeda(l.divergencia)}</span> : "—"}</td>}
                  <td className="tabular whitespace-nowrap text-right font-semibold">{formatarMoeda(l.cobranca)}</td>
                  <td className="tabular whitespace-nowrap text-right text-suave">{formatarMoeda(l.previstoCobranca)}</td>
                  <td><Selo tom={ESTADO[l.estado][1]}>{ESTADO[l.estado][0]}</Selo></td>
                  <td>{l.estado === "FECHADA" ? <SituacaoMedicao acao={situacaoMedicaoAcao.bind(null, obraId, l.numero)} situacao={l.situacao} pagaEm={l.pagaEm} editavel={pode.situacao} hoje={hoje} /> : <span className="text-xs text-suave">—</span>}</td>
                  <td className="whitespace-nowrap">
                    {pode.fechar && l.numero === proxima?.numero && l.semanaFim <= m.fisico.semanaAtual && (
                      <AcaoConfirmada acao={fecharMedicaoAcao.bind(null, obraId, l.numero)} variante="secundario"
                        confirmacao={`Fechar a medição ${l.numero} com cobrança de ${formatarMoeda(l.cobranca)}? Os valores ficam congelados.`}>Fechar</AcaoConfirmada>
                    )}
                    {pode.reabrir && l.numero === ultimaFechada?.numero && l.situacao !== "PAGA" && (
                      <AcaoConfirmada acao={reabrirMedicaoAcao.bind(null, obraId, l.numero)} variante="secundario" confirmacao={`Reabrir a medição ${l.numero}? Ela volta a ser calculada pelo realizado.`}>Reabrir</AcaoConfirmada>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-zinc-50 font-semibold">
            <tr>
              <td colSpan={2} className="px-4 py-2">Total</td>
              <td className="tabular whitespace-nowrap px-4 text-right">{formatarMoeda(m.linhas.reduce((t, l) => t + l.contrato, 0))}</td>
              <td className="tabular whitespace-nowrap px-4 text-right text-suave">{formatarMoeda(-m.linhas.reduce((t, l) => t + l.entrada, 0))}</td>
              {col.aditivo && <td className="tabular whitespace-nowrap px-4 text-right">{formatarMoeda(m.linhas.reduce((t, l) => t + l.aditivo, 0))}</td>}
              {col.ajustes && <td className="tabular whitespace-nowrap px-4 text-right">{formatarMoeda(m.linhas.reduce((t, l) => t + l.ajustes, 0))}</td>}
              {col.anteriores && <td />}
              <td className="tabular whitespace-nowrap px-4 text-right">{formatarMoeda(m.resumo.executado)}</td>
              <td className="tabular whitespace-nowrap px-4 text-right text-suave">{formatarMoeda(m.linhas.reduce((t, l) => t + l.previstoCobranca, 0))}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </Tabela>
        <p className="border-t border-borda px-5 py-3 text-xs text-suave">
          Cobrança = medido do contrato × (1 − entrada) + aditivos + descontos/reembolsos. A medição pode ser fechada a partir da última semana do período
          (emissão na sexta) e fica congelada; depois de fechada, registre se foi paga. Medição = valor cliente × % executado de cada serviço.
        </p>
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-5">
        <Cartao titulo="Resumo do contrato" className="lg:col-span-2"><ResumoDoContrato m={m} /></Cartao>
        <Cartao titulo="Aditivos, descontos e reembolsos" className="lg:col-span-3" semPadding>
          {m.ajustes.length === 0 ? <p className="px-5 py-4 text-sm text-suave">Nenhum lançamento.</p> : (
            <Tabela>
              <thead><tr><th>Tipo</th><th>Data</th><th>Descrição</th><th className="text-right">Valor</th><th>Medição</th><th /></tr></thead>
              <tbody>
                {m.ajustes.map((a) => (
                  <tr key={a.id}>
                    <td><Selo tom={a.tipo === "ADITIVO" ? "azul" : a.tipo === "DESCONTO" ? "vermelho" : "verde"}>{TIPO_AJUSTE[a.tipo]}</Selo></td>
                    <td className="tabular whitespace-nowrap">{formatarData(a.data)}</td>
                    <td>{a.descricao}</td>
                    <td className={clsx("tabular whitespace-nowrap text-right", a.tipo === "DESCONTO" && "text-perigo")}>{formatarMoeda(a.tipo === "DESCONTO" ? -a.valor : a.valor)}</td>
                    <td>{a.medicaoNumero ?? "—"}</td>
                    <td>{pode.ajustes && <AcaoConfirmada acao={excluirAjusteAcao.bind(null, obraId, a.id)} variante="secundario" confirmacao={`Remover "${a.descricao}"?`}>Remover</AcaoConfirmada>}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
          {pode.ajustes && (
            <div className="border-t border-borda p-5">
              <Formulario acao={salvarAjusteAcao.bind(null, obraId)} limparAoSalvar>
                <div className="grid gap-3 sm:grid-cols-3">
                <CampoSelecao nome="tipo" rotulo="Tipo" opcoes={[{ valor: "ADITIVO", rotulo: "Aditivo" }, { valor: "DESCONTO", rotulo: "Desconto" }, { valor: "REEMBOLSO", rotulo: "Reembolso" }]} />
                <Campo nome="data" rotulo="Data" type="date" defaultValue={hoje} />
                <CampoSelecao nome="medicaoNumero" rotulo="Medição (desc./reemb.)" vazio="—" defaultValue={String(abertas[0]?.numero ?? "")}
                  opcoes={abertas.slice(0, 12).map((l) => ({ valor: String(l.numero), rotulo: `Nº ${l.numero}` }))} />
                <div className="sm:col-span-2"><Campo nome="descricao" rotulo="Descrição" placeholder="Ex.: Troca de piso do palco" /></div>
                <Campo nome="valor" rotulo="Valor (R$)" inputMode="decimal" />
                <div className="flex items-end gap-3 sm:col-span-3">
                  <BotaoEnviar variante="secundario">Incluir</BotaoEnviar>
                  <p className="text-xs text-suave">Aditivo aumenta o contrato (sua execução é medida pelos serviços da etapa Aditivos). Desconto e reembolso entram na cobrança da medição escolhida.</p>
                </div>
                </div>
              </Formulario>
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}

export function VistaGerencial({ m, obraId, podePagamentos }: { m: MedicoesCarregadas; obraId: string; podePagamentos: boolean }) {
  const f = m.fisico;
  let ap = 0, ar = 0;
  const dados = m.linhas.map((l) => {
    ap += l.previstoCobranca;
    const passado = l.estado === "FECHADA" || l.estado === "A_FECHAR" || l.estado === "EM_ANDAMENTO";
    if (passado) ar += l.cobranca;
    return {
      rotulo: `M${l.numero} · ${ddmm(l.data)}`, previsto: l.previstoCobranca, realizado: passado ? l.cobranca : null,
      reprojetado: l.estado === "FECHADA" || l.estado === "A_FECHAR" ? null : l.reprojetado, acumPrevisto: ap, acumReal: passado ? ar : null,
    };
  });
  const comFornecedor = m.fornecedores.filter((x) => x.fornecedorId);
  const semFornecedor = m.fornecedores.find((x) => !x.fornecedorId);
  const semanas = Array.from({ length: m.nSemanas }, (_, i) => ({ numero: i + 1, inicio: datasDaSemana(m.obra.dataInicio, i + 1).inicio }));
  const apropriadoSemana = semanas.map((_, i) => m.fornecedores.reduce((t, x) => t + (x.apropriadoSemana[i] ?? 0), 0));
  const tot = (sel: (x: (typeof m.fornecedores)[number]) => number) => m.fornecedores.reduce((t, x) => t + sel(x), 0);
  const proxima = m.linhas.find((l) => l.estado !== "FECHADA");
  const proxDesembolso = m.desembolso.find((d) => d.semanaFim >= f.semanaAtual);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Indicador rotulo="Valor a cobrar" valor={formatarMoeda(proxima?.cobranca ?? 0)} detalhe={proxima ? `Medição ${proxima.numero} · ${formatarData(proxima.data)}` : "—"} />
        <Indicador rotulo="Total executado de cobrança" valor={formatarMoeda(m.resumo.executado)} detalhe={`Pago: ${formatarMoeda(m.resumo.quitadas)}`} />
        <Indicador rotulo="Saldo total a pagar" valor={formatarMoeda(m.resumo.saldo)} detalhe="Cliente, conforme o contrato" />
        <Indicador rotulo="Fornecedores: a pagar" valor={formatarMoeda(tot((x) => x.aPagar))} detalhe={`Acertado ${formatarMoeda(tot((x) => x.acertado))} · pago ${formatarMoeda(tot((x) => x.pago))}`} />
        <Indicador rotulo="Previsão de pagamento" valor={formatarMoeda(proxDesembolso?.reprojetado ?? 0)} detalhe={proxDesembolso ? `Período ${proxDesembolso.numero} (reprojetado)` : "—"} />
      </div>

      <Cartao titulo="Cobrança por medição — previsto × realizado × reprojetado">
        <GraficoCobranca dados={dados} />
        <p className="mt-2 text-xs text-suave">
          Reprojeção: o que falta cobrar é distribuído pelo previsto dos períodos restantes{m.coeficiente != null && <> (coeficiente atual <b>{m.coeficiente.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</b>: {m.coeficiente > 1 ? "a obra está atrás do previsto e as próximas cobranças tendem a ser maiores" : m.coeficiente < 1 ? "a obra está à frente do previsto" : "no ritmo previsto"})</>}.
        </p>
      </Cartao>

      <Cartao titulo="Fornecedores" semPadding>
        <Tabela>
          <thead><tr><th>Fornecedor</th><th className="text-right">Acertado</th><th className="text-right" title="MO acertada × % executado">Executado (medição)</th><th className="text-right">Pago</th><th className="text-right" title="Acertado − pago">A pagar</th><th className="text-right" title="Executado − pago">Executado não pago</th></tr></thead>
          <tbody>
            {[...comFornecedor, ...(semFornecedor ? [semFornecedor] : [])].map((x) => (
              <tr key={x.fornecedorId ?? "sem"} className={clsx(!x.fornecedorId && "text-suave")}>
                <td className="font-medium">{x.nome}</td>
                <td className="tabular text-right">{formatarMoeda(x.acertado)}</td>
                <td className="tabular text-right">{formatarMoeda(x.apropriado)}</td>
                <td className="tabular text-right">{formatarMoeda(x.pago)}</td>
                <td className="tabular text-right font-semibold">{formatarMoeda(x.aPagar)}</td>
                <td className={clsx("tabular text-right", x.executadoNaoPago > 0.005 && "text-alerta", x.executadoNaoPago < -0.005 && "text-perigo")}>{formatarMoeda(x.executadoNaoPago)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-zinc-50 font-semibold">
            <tr><td className="px-4 py-2">Total</td><td className="tabular px-4 text-right">{formatarMoeda(tot((x) => x.acertado))}</td><td className="tabular px-4 text-right">{formatarMoeda(tot((x) => x.apropriado))}</td><td className="tabular px-4 text-right">{formatarMoeda(tot((x) => x.pago))}</td><td className="tabular px-4 text-right">{formatarMoeda(tot((x) => x.aPagar))}</td><td className="tabular px-4 text-right">{formatarMoeda(tot((x) => x.executadoNaoPago))}</td></tr>
          </tfoot>
        </Tabela>
        <p className="border-t border-borda px-5 py-3 text-xs text-suave">Executado não pago em laranja = serviço feito e ainda não pago; em vermelho = pago adiantado. Serviços sem MO acertada não entram.</p>
      </Cartao>

      <Cartao titulo="Pagamentos a fornecedores (semana a semana)" semPadding>
        <GradePagamentos fornecedores={m.fornecedoresDaObra} semanas={semanas} semanaAtual={f.semanaAtual} valores={m.pagamentos} apropriado={apropriadoSemana}
          editavel={podePagamentos} salvar={salvarPagamentosAcao.bind(null, obraId)} />
      </Cartao>

      <Cartao titulo="Previsão de pagamentos por período" semPadding>
        <Tabela>
          <thead><tr><th>Período</th><th className="text-right">Previsto</th><th className="text-right">Executado</th><th className="text-right">Reprojetado</th><th className="text-right">Pago</th></tr></thead>
          <tbody>
            {m.desembolso.filter((d) => d.previsto || d.realizado || d.reprojetado || d.pago).map((d) => (
              <tr key={d.numero} className={clsx(d.semanaInicio <= f.semanaAtual && f.semanaAtual <= d.semanaFim && "bg-destaque-suave/50")}>
                <td className="whitespace-nowrap">Nº {d.numero} · sem. {d.semanaInicio}{d.semanaFim !== d.semanaInicio && `–${d.semanaFim}`}</td>
                <td className="tabular text-right text-suave">{formatarMoeda(d.previsto)}</td>
                <td className="tabular text-right">{formatarMoeda(d.realizado)}</td>
                <td className="tabular text-right font-semibold">{formatarMoeda(d.reprojetado)}</td>
                <td className="tabular text-right">{formatarMoeda(d.pago)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
        <p className="border-t border-borda px-5 py-3 text-xs text-suave">Previsto = MO acertada × % previsto. Reprojetado = o que falta do acertado distribuído pelo previsto dos períodos restantes (corrige o erro da planilha, que usava uma linha vazia e sempre dava 0% realizado).</p>
      </Cartao>
    </div>
  );
}
