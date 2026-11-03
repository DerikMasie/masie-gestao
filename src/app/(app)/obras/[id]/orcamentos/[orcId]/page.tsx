import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { db } from "@/db";
import { curvaABC } from "@/dominio/orcamento";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { exigirPermissaoPagina, podeAcessarObra, temPermissao } from "@/lib/auth/atual";
import { carregarOrcamento, orcamentosParaCopiar, STATUS_ORCAMENTO } from "@/servicos/orcamentos";
import { CamposParametros } from "@/componentes/campos-parametros";
import { EditorOrcamento } from "@/componentes/editor-orcamento";
import { AcaoConfirmada, BotaoEnviar, Campo, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import { Abas, Aviso, CabecalhoPagina, Cartao, Indicador, Selo, Tabela } from "@/componentes/ui";
import {
  copiarDeAcao, excluirItemAcao, excluirRascunhoAcao, fluxoAcao, moverItemAcao, novaRevisaoAcao, salvarItemAcao, salvarParametrosAcao,
} from "../acoes";

export const metadata = { title: "Orçamento" };
const uuid = /^[0-9a-f-]{36}$/;
const ABAS = [
  { id: "itens", rotulo: "Itens" },
  { id: "resumo", rotulo: "Resumo por etapa" },
  { id: "abc", rotulo: "Curva ABC" },
  { id: "parametros", rotulo: "Parâmetros e aprovação" },
];

export default async function PaginaOrcamento({ params, searchParams }: {
  params: Promise<{ id: string; orcId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: obraId, orcId } = await params;
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("orcamentos");
  if (!uuid.test(obraId) || !uuid.test(orcId) || !(await podeAcessarObra(u, obraId))) notFound();
  const c = await carregarOrcamento(db, u.empresaId, orcId).catch(() => null);
  if (!c || c.orcamento.obraId !== obraId) notFound();
  const o = c.orcamento;
  const rascunho = o.status === "RASCUNHO";
  const podeEditar = temPermissao(u, "orcamentos", "editar") && rascunho;
  const podeAprovar = temPermissao(u, "orcamentos", "aprovar");
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : "itens";
  const base = `/obras/${obraId}/orcamentos/${orcId}`;
  const t = c.totais;

  return (
    <>
      <CabecalhoPagina
        voltar={{ href: `/obras/${obraId}?aba=orcamento`, rotulo: `${c.obra.codigo} · ${c.obra.nome}` }}
        titulo={<span className="flex flex-wrap items-center gap-3">{o.titulo} <span className="text-base font-normal text-suave">nº {o.numero} · rev. {o.revisao}</span>
          <Selo tom={o.status === "BASE" ? "destaque" : o.status === "APROVADO" ? "verde" : o.status === "REJEITADO" ? "vermelho" : o.status === "ENVIADO" ? "azul" : "cinza"}>{STATUS_ORCAMENTO[o.status]}</Selo></span>}
        subtitulo={o.origem ?? undefined}
        acoes={<>
          <a href={`/api/orcamentos/${orcId}/xlsx`} className="inline-flex items-center gap-2 rounded-lg border border-borda bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"><Download className="size-4" /> Excel</a>
          {!rascunho && temPermissao(u, "orcamentos", "criar") && <AcaoConfirmada acao={novaRevisaoAcao.bind(null, obraId, orcId)} confirmacao="Criar nova revisão em rascunho a partir desta?" variante="secundario">Nova revisão</AcaoConfirmada>}
        </>}
      />

      {sp.importado && (
        <div className="mb-4">
          <Aviso tom={sp.confere === "0" ? "alerta" : "sucesso"}>
            <b>Planilha importada:</b> {sp.itens} itens.{" "}
            {sp.confere === "1" && "O total calculado pelo sistema confere exatamente com o da planilha. "}
            {sp.criadas && `Etapas criadas na obra: ${sp.criadas}. `}
            {sp.avisos && <span className="block pt-1">{sp.avisos.split(" | ").map((a) => <span key={a} className="block">• {a}</span>)}</span>}
            <span className="block pt-1 text-xs">Para conferência, a importação mantém o cálculo da planilha (imposto por fora e arredondamento por linha). Ajuste em “Parâmetros e aprovação” para o padrão do sistema, se preferir.</span>
          </Aviso>
        </div>
      )}
      {!rascunho && <div className="mb-4"><Aviso>Este orçamento está <b>{STATUS_ORCAMENTO[o.status].toLowerCase()}</b> e não pode mais ser alterado. Para mudanças, crie uma nova revisão.</Aviso></div>}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Indicador rotulo="Custo total" valor={formatarMoeda(t.custo)} detalhe={`MO ${formatarMoeda(t.custoMaoDeObra)} · material ${formatarMoeda(t.custoMaterial)}`} />
        <Indicador rotulo="Venda sem imposto" valor={formatarMoeda(t.venda)} detalhe={`BDI MO ${formatarPercentual(c.parametros.bdiMaoDeObra)} · mat. ${formatarPercentual(c.parametros.bdiMaterial)}`} />
        <Indicador rotulo={`Impostos (${formatarPercentual(c.parametros.impostos)})`} valor={formatarMoeda(t.imposto)} detalhe={c.parametros.formaImposto === "POR_DENTRO" ? "Por dentro (sobre o total)" : "Por fora (como a planilha)"} />
        <Indicador rotulo="Total da proposta" valor={formatarMoeda(t.total)} detalhe={`${c.itens.length} itens · markup ${t.markup.toFixed(2).replace(".", ",")}×`} />
        <Indicador rotulo="Lucro bruto" valor={formatarMoeda(t.lucro)} detalhe={`Margem ${formatarPercentual(t.margem)} sobre o total`} tom={t.lucro < 0 ? "perigo" : undefined} />
      </div>

      <Abas abas={ABAS} ativa={aba} base={base} />

      {aba === "itens" && (
        <EditorOrcamento
          etapas={c.etapas.map((e) => ({ id: e.id, ordem: e.ordem, nome: e.nome }))}
          itens={c.itens.map(({ calculo: _c, codigo: _k, etapaOrdem: _o, criadoEm: _cr, atualizadoEm: _a, orcamentoId: _oi, ordem: _or, ...i }) => i)}
          parametros={c.parametros} editavel={podeEditar}
          salvar={salvarItemAcao.bind(null, obraId, orcId)} excluir={excluirItemAcao.bind(null, obraId, orcId)} mover={moverItemAcao.bind(null, obraId, orcId)} />
      )}

      {aba === "resumo" && (
        <Cartao semPadding>
          <Tabela>
            <thead><tr><th>Etapa</th><th className="text-right">Itens</th><th className="text-right">Custo MO</th><th className="text-right">Custo material</th><th className="text-right">Custo</th><th className="text-right">Venda s/ imposto</th><th className="text-right">% da venda</th></tr></thead>
            <tbody>
              {c.porEtapa.filter((p) => p.itens.length).map((p) => (
                <tr key={p.etapa.id}>
                  <td>{p.etapa.ordem}. {p.etapa.nome}</td>
                  <td className="tabular text-right">{p.itens.length}</td>
                  <td className="tabular text-right">{formatarMoeda(p.totais.custoMaoDeObra)}</td>
                  <td className="tabular text-right">{formatarMoeda(p.totais.custoMaterial)}</td>
                  <td className="tabular text-right">{formatarMoeda(p.totais.custo)}</td>
                  <td className="tabular text-right font-medium">{formatarMoeda(p.totais.venda)}</td>
                  <td className="tabular text-right">{formatarPercentual(t.venda ? p.totais.venda / t.venda : 0)}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-semibold">
                <td>Total</td><td className="tabular text-right">{c.itens.length}</td>
                <td className="tabular text-right">{formatarMoeda(t.custoMaoDeObra)}</td><td className="tabular text-right">{formatarMoeda(t.custoMaterial)}</td>
                <td className="tabular text-right">{formatarMoeda(t.custo)}</td><td className="tabular text-right">{formatarMoeda(t.venda)}</td><td className="tabular text-right">100%</td>
              </tr>
            </tbody>
          </Tabela>
          <p className="border-t border-borda px-5 py-3 text-xs text-suave">Ao definir como orçamento-base, o custo por etapa passa a ser a verba de controle da obra (comparativo orçado × comprometido × realizado nas próximas entregas).</p>
        </Cartao>
      )}

      {aba === "abc" && <AbaABC c={c} tipo={sp.tipo === "material" ? "material" : sp.tipo === "mo" ? "mo" : "total"} base={base} />}

      {aba === "parametros" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Cartao titulo="Parâmetros deste orçamento" className="lg:col-span-2">
            <Formulario acao={salvarParametrosAcao.bind(null, obraId, orcId)}>
              <fieldset disabled={!podeEditar} className="space-y-4">
                <Campo nome="titulo" rotulo="Título" obrigatorio defaultValue={o.titulo} />
                <CamposParametros p={c.parametros} />
                <CampoArea nome="observacoes" rotulo="Observações (premissas, exclusões, validade da proposta)" defaultValue={o.observacoes ?? ""} rows={4} />
              </fieldset>
              {podeEditar && <BotaoEnviar>Salvar e recalcular</BotaoEnviar>}
            </Formulario>
          </Cartao>
          <div className="space-y-6">
            <Cartao titulo="Aprovação">
              <ol className="mb-4 space-y-1 text-sm">
                {(["RASCUNHO", "ENVIADO", "APROVADO", "BASE"] as const).map((s) => (
                  <li key={s} className={s === o.status ? "font-semibold" : "text-suave"}>{s === o.status ? "● " : "○ "}{STATUS_ORCAMENTO[s]}</li>
                ))}
              </ol>
              {o.enviadoEm && <p className="mb-2 text-xs text-suave">Valores congelados em {formatarData(o.enviadoEm)}{o.decididoEm ? ` · decisão em ${formatarData(o.decididoEm)}` : ""}.</p>}
              <div className="flex flex-wrap gap-2">
                {rascunho && temPermissao(u, "orcamentos", "editar") && <AcaoConfirmada acao={fluxoAcao.bind(null, obraId, orcId, "ENVIAR")} confirmacao="Marcar como enviado ao cliente? Os valores serão congelados." variante="secundario">Marcar como enviado</AcaoConfirmada>}
                {(o.status === "ENVIADO" || o.status === "REJEITADO") && temPermissao(u, "orcamentos", "editar") && <AcaoConfirmada acao={fluxoAcao.bind(null, obraId, orcId, "VOLTAR_RASCUNHO")} confirmacao="Voltar para rascunho para ajustar?" variante="secundario">Voltar para rascunho</AcaoConfirmada>}
                {podeAprovar && (o.status === "ENVIADO" || rascunho) && <AcaoConfirmada acao={fluxoAcao.bind(null, obraId, orcId, "APROVAR")} confirmacao="Registrar a aprovação do cliente?" variante="secundario">Aprovar</AcaoConfirmada>}
                {podeAprovar && o.status === "ENVIADO" && <AcaoConfirmada acao={fluxoAcao.bind(null, obraId, orcId, "REJEITAR")} confirmacao="Registrar que o cliente rejeitou esta proposta?" variante="secundario">Rejeitado</AcaoConfirmada>}
                {podeAprovar && o.status === "APROVADO" && <AcaoConfirmada acao={fluxoAcao.bind(null, obraId, orcId, "DEFINIR_BASE")} confirmacao="Definir como orçamento-base da obra? O custo orçado da obra será atualizado (e o valor do contrato, se ainda estiver zerado).">Definir como orçamento-base</AcaoConfirmada>}
              </div>
              {!podeAprovar && <p className="mt-3 text-xs text-suave">Aprovar e definir o orçamento-base exige a permissão “Orçamentos: aprovar” (Diretoria/Administrador).</p>}
            </Cartao>
            {podeEditar && <CopiarDe obraId={obraId} orcId={orcId} empresaId={u.empresaId} />}
            {podeEditar && temPermissao(u, "orcamentos", "excluir") && (
              <AcaoConfirmada acao={excluirRascunhoAcao.bind(null, obraId, orcId)} confirmacao="Excluir este rascunho e todos os seus itens?" variante="secundario">Excluir rascunho</AcaoConfirmada>
            )}
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-suave">Proposta comercial em PDF: na próxima entrega (relatórios e PDFs). Por enquanto, use a exportação para Excel.</p>
    </>
  );
}

async function CopiarDe({ obraId, orcId, empresaId }: { obraId: string; orcId: string; empresaId: string }) {
  const lista = (await orcamentosParaCopiar(db, empresaId)).filter((x) => x.id !== orcId);
  if (!lista.length) return null;
  return (
    <Cartao titulo="Copiar itens de outro orçamento">
      <Formulario acao={copiarDeAcao.bind(null, obraId, orcId)}>
        <CampoSelecao nome="origemId" rotulo="Orçamento de origem" vazio="Selecione…" opcoes={lista.map((x) => ({ valor: x.id, rotulo: `${x.obraCodigo} · nº ${x.numero} rev. ${x.revisao} (${STATUS_ORCAMENTO[x.status]})` }))} />
        <p className="text-xs text-suave">Os itens são acrescentados a este rascunho, nas etapas de mesmo nome (criadas na obra se não existirem).</p>
        <BotaoEnviar variante="secundario">Copiar itens</BotaoEnviar>
      </Formulario>
    </Cartao>
  );
}

function AbaABC({ c, tipo, base }: { c: Awaited<ReturnType<typeof carregarOrcamento>>; tipo: "total" | "material" | "mo"; base: string }) {
  const valor = (i: (typeof c.itens)[number]) => (tipo === "material" ? i.calculo.custoMaterial : tipo === "mo" ? i.calculo.custoMaoDeObra : i.calculo.custo);
  const abc = curvaABC(c.itens, valor);
  const resumo = (["A", "B", "C"] as const).map((k) => ({ k, n: abc.filter((x) => x.classe === k).length, v: abc.filter((x) => x.classe === k).reduce((s, x) => s + x.valor, 0) }));
  const tom = { A: "destaque", B: "cinza", C: "cinza" } as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {([["total", "Custo total"], ["material", "Material"], ["mo", "Mão de obra"]] as const).map(([k, r]) => (
          <Link key={k} href={`${base}?aba=abc&tipo=${k}`} className={k === tipo ? "rounded-lg bg-marca px-3 py-1.5 font-medium text-white" : "rounded-lg border border-borda bg-white px-3 py-1.5 hover:bg-zinc-50"}>{r}</Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {resumo.map((r) => <Indicador key={r.k} rotulo={`Classe ${r.k}`} valor={`${r.n} itens`} detalhe={`${formatarMoeda(r.v)} · ${r.k === "A" ? "até 80% do custo: priorize a negociação" : r.k === "B" ? "de 80% a 95%" : "últimos 5%"}`} />)}
      </div>
      <Cartao semPadding>
        {abc.length === 0 ? <p className="p-5 text-sm text-suave">Nenhum item com valor.</p> : (
          <Tabela>
            <thead><tr><th>Classe</th><th>Item</th><th>Descrição</th><th className="text-right">Custo</th><th className="text-right">% do total</th><th className="text-right">% acumulado</th></tr></thead>
            <tbody>
              {abc.map((x) => (
                <tr key={x.item.id}>
                  <td><Selo tom={tom[x.classe]}>{x.classe}</Selo></td>
                  <td className="tabular text-suave">{x.item.codigo}</td>
                  <td>{x.item.descricao}</td>
                  <td className="tabular text-right">{formatarMoeda(x.valor)}</td>
                  <td className="tabular text-right">{formatarPercentual(x.percentual)}</td>
                  <td className="tabular text-right">{formatarPercentual(x.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </div>
  );
}
