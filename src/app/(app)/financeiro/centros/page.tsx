import Link from "next/link";
import { db } from "@/db";
import { formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { resultadoPorCentro } from "@/servicos/financeiro";
import { BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao, ColunaOrdenavel, Selo, Tabela } from "@/componentes/ui";
import { criarCentroAcao } from "../acoes";

export const metadata = { title: "Centros de custo" };
const TIPOS = { OBRA: "Obra", ADMINISTRATIVO: "Interno", PROJETO: "Projeto", CONSULTORIA: "Consultoria" } as const;

export default async function Centros({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("financeiro");
  const p = await searchParams;
  const todos = await resultadoPorCentro(db, u.empresaId, { de: p.de || undefined, ate: p.ate || undefined, tipo: p.tipo && p.tipo in TIPOS ? p.tipo : undefined });
  let lista = p.todos ? todos : todos.filter((c) => c.temMovimento || c.contrato > 0);
  const ordem = (p.ordem ?? "resultado") as "codigo" | "receitas" | "custos" | "resultado" | "margem";
  const chave = { codigo: (c: (typeof lista)[number]) => c.codigo, receitas: (c: (typeof lista)[number]) => c.receitas, custos: (c: (typeof lista)[number]) => c.custos + c.despesas, resultado: (c: (typeof lista)[number]) => c.resultadoOperacional, margem: (c: (typeof lista)[number]) => c.margem ?? -99 }[ordem] ?? ((c: (typeof lista)[number]) => c.resultadoOperacional);
  lista = [...lista].sort((a, b) => { const x = chave(a), y = chave(b); const r = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number); return p.dir === "asc" ? r : -r; });
  const tot = lista.reduce((t, c) => ({ receitas: t.receitas + c.receitas, saidas: t.saidas + c.custos + c.despesas + c.impostos, resultado: t.resultado + c.resultadoOperacional, aPagar: t.aPagar + c.aPagar }), { receitas: 0, saidas: 0, resultado: 0, aPagar: 0 });
  const sel = "rounded-lg border border-borda bg-white px-2 py-1.5";
  return (
    <>
      <CabecalhoPagina titulo="Resultado por centro de custo" subtitulo="Receitas − custos − despesas − impostos de cada obra, projeto ou área interna (regime de caixa)" voltar={{ href: "/financeiro", rotulo: "Financeiro" }} />
      <div className="grid gap-6 xl:grid-cols-4">
        <Cartao semPadding className="xl:col-span-3">
          <form className="flex flex-wrap items-end gap-2 border-b border-borda p-3 text-sm">
            <select name="tipo" defaultValue={p.tipo ?? ""} className={sel} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input type="date" name="de" defaultValue={p.de} className={sel} aria-label="De" />
            <input type="date" name="ate" defaultValue={p.ate} className={sel} aria-label="Até" />
            <label className="flex items-center gap-1.5"><input type="checkbox" name="todos" value="1" defaultChecked={Boolean(p.todos)} /> Incluir sem movimento</label>
            <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
          </form>
          <Tabela>
            <thead><tr>
              <ColunaOrdenavel campo="codigo" rotulo="Centro" params={p} base="/financeiro/centros" />
              <th className="text-right">Contrato</th>
              <ColunaOrdenavel campo="receitas" rotulo="Receitas" params={p} base="/financeiro/centros" className="text-right" />
              <ColunaOrdenavel campo="custos" rotulo="Custos + desp." params={p} base="/financeiro/centros" className="text-right" />
              <th className="text-right">Impostos</th>
              <ColunaOrdenavel campo="resultado" rotulo="Resultado" params={p} base="/financeiro/centros" className="text-right" />
              <ColunaOrdenavel campo="margem" rotulo="Margem" params={p} base="/financeiro/centros" className="text-right" />
              <th className="text-right">A pagar</th><th className="text-right">A receber</th>
            </tr></thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-64">
                    {c.obraId ? <Link href={`/obras/${c.obraId}?aba=financeiro`} className="font-medium underline-offset-4 hover:underline decoration-destaque decoration-2">{c.codigo}</Link> : <span className="font-medium">{c.codigo}</span>}
                    <span className="block truncate text-xs text-suave">{c.nome}</span> <Selo>{TIPOS[c.tipo]}</Selo>
                  </td>
                  <td className="tabular text-right text-xs">{c.contrato ? formatarMoeda(c.contrato) : "—"}</td>
                  <td className="tabular text-right">{formatarMoeda(c.receitas)}</td>
                  <td className="tabular text-right">{formatarMoeda(c.custos + c.despesas)}</td>
                  <td className="tabular text-right text-xs">{formatarMoeda(c.impostos)}</td>
                  <td className={`tabular text-right font-semibold ${c.resultadoOperacional < 0 ? "text-perigo" : ""}`}>{formatarMoeda(c.resultadoOperacional)}</td>
                  <td className={`tabular text-right ${c.margem != null && c.margem < 0 ? "text-perigo" : ""}`}>{c.margem == null ? "—" : formatarPercentual(c.margem)}</td>
                  <td className="tabular text-right text-xs">{c.aPagar ? formatarMoeda(c.aPagar) : "—"}</td>
                  <td className="tabular text-right text-xs">{c.aReceberContrato ? formatarMoeda(c.aReceberContrato) : "—"}</td>
                </tr>
              ))}
              <tr className="bg-zinc-50 font-semibold"><td>Total ({lista.length})</td><td /><td className="tabular text-right">{formatarMoeda(tot.receitas)}</td><td colSpan={2} className="tabular text-right">{formatarMoeda(tot.saidas)}</td><td className="tabular text-right">{formatarMoeda(tot.resultado)}</td><td /><td className="tabular text-right">{formatarMoeda(tot.aPagar)}</td><td /></tr>
            </tbody>
          </Tabela>
          <p className="border-t border-borda px-5 py-3 text-xs text-suave">“A receber” = contrato + aditivos − receitas já recebidas (regra da planilha). Retiradas de sócios, empréstimos e aplicações não entram no resultado.</p>
        </Cartao>
        {temPermissao(u, "financeiro", "criar") && (
          <Cartao titulo="Novo centro de custo">
            <Formulario acao={criarCentroAcao} limparAoSalvar>
              <p className="text-xs text-suave">Obras ganham o centro de custo automaticamente. Use aqui para projetos, consultorias e áreas internas.</p>
              <CampoSelecao nome="tipo" rotulo="Tipo" opcoes={[{ valor: "PROJETO", rotulo: "Projeto" }, { valor: "CONSULTORIA", rotulo: "Consultoria" }, { valor: "ADMINISTRATIVO", rotulo: "Interno / administrativo" }]} />
              <Campo nome="codigo" rotulo="Código" obrigatorio placeholder="PRJ-2026-01" />
              <Campo nome="nome" rotulo="Nome" obrigatorio />
              <Campo nome="valorContrato" rotulo="Valor do contrato (R$)" inputMode="decimal" />
              <BotaoEnviar>Criar</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}
