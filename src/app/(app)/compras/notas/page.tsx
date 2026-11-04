import Link from "next/link";
import { db } from "@/db";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarNotas } from "@/servicos/financeiro";
import { AcaoConfirmada } from "@/componentes/formulario";
import { Aviso, CabecalhoPagina, Cartao, LinkBotao, Selo, Tabela, Vazio } from "@/componentes/ui";
import { cancelarNotaAcao } from "../../financeiro/acoes";

export const metadata = { title: "Notas fiscais" };
const TIPO = { A_VISTA: "À vista", A_PRAZO: "A prazo", ACUMULADA: "Acumulada", DEVOLUCAO: "Devolução" } as const;

export default async function Notas({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("compras");
  const p = await searchParams;
  const notas = await listarNotas(db, u.empresaId, { q: p.q?.slice(0, 100), de: p.de || undefined, ate: p.ate || undefined, incluirCanceladas: Boolean(p.canceladas) });
  const total = notas.filter((n) => n.status === "LANCADA").reduce((t, n) => t + (n.tipo === "DEVOLUCAO" ? -1 : 1) * Number(n.valorTotal), 0);
  const sel = "rounded-lg border border-borda bg-white px-2 py-1.5";
  return (
    <>
      <CabecalhoPagina titulo="Notas fiscais de compra" subtitulo={`${notas.length} nota(s) · ${formatarMoeda(total)} líquido de devoluções`}
        acoes={temPermissao(u, "compras", "criar") && <LinkBotao href="/compras/notas/nova">+ Lançar nota</LinkBotao>} />
      {p.lancada && <div className="mb-4"><Aviso tom="sucesso">Nota fiscal lançada. A conta a pagar foi gerada e a verba da etapa atualizada.</Aviso></div>}
      <Cartao semPadding>
        <form className="flex flex-wrap items-end gap-2 border-b border-borda p-3 text-sm">
          <input name="q" defaultValue={p.q} placeholder="Número, fornecedor ou descrição…" className={`${sel} min-w-48 flex-1`} />
          <input type="date" name="de" defaultValue={p.de} className={sel} aria-label="Emissão de" />
          <input type="date" name="ate" defaultValue={p.ate} className={sel} aria-label="Emissão até" />
          <label className="flex items-center gap-1.5"><input type="checkbox" name="canceladas" value="1" defaultChecked={Boolean(p.canceladas)} /> Canceladas</label>
          <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        </form>
        {notas.length === 0 ? <Vazio titulo="Nenhuma nota fiscal" /> : (
          <Tabela>
            <thead><tr><th>Emissão</th><th>NF</th><th>Fornecedor</th><th>Obra / etapa</th><th>Classificação</th><th className="text-right">Valor</th><th className="text-right">Pago</th><th>Tipo</th>{temPermissao(u, "compras", "excluir") && <th />}</tr></thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className={n.status === "CANCELADA" ? "text-suave line-through" : ""}>
                  <td className="tabular whitespace-nowrap">{formatarData(n.emissao)}</td>
                  <td className="whitespace-nowrap">{n.numero}{n.serie !== "1" ? `/${n.serie}` : ""}{Boolean(n.temXml) && <span className="ml-1 text-[10px] text-suave">XML</span>}</td>
                  <td>{n.fornecedor}</td>
                  <td className="text-xs">{n.obraId ? <Link href={`/obras/${n.obraId}?aba=financeiro`} className="underline decoration-destaque decoration-2 underline-offset-2">{n.centro}</Link> : n.centro}<span className="block text-suave">{n.etapa ?? ""}</span></td>
                  <td className="text-xs">{n.subitem}</td>
                  <td className={`tabular whitespace-nowrap text-right font-medium ${n.tipo === "DEVOLUCAO" ? "text-sucesso" : ""}`}>{n.tipo === "DEVOLUCAO" ? "− " : ""}{formatarMoeda(n.valorTotal)}</td>
                  <td className="tabular whitespace-nowrap text-right text-xs">{n.faturadoAoCliente || n.tipo === "DEVOLUCAO" ? "—" : formatarMoeda(n.pago)}</td>
                  <td><Selo tom={n.tipo === "DEVOLUCAO" ? "verde" : "cinza"}>{TIPO[n.tipo]}</Selo>{n.faturadoAoCliente && <Selo tom="destaque">fat. cliente</Selo>}{n.status === "CANCELADA" && <Selo tom="vermelho">cancelada</Selo>}</td>
                  {temPermissao(u, "compras", "excluir") && <td>{n.status === "LANCADA" && <AcaoConfirmada acao={cancelarNotaAcao.bind(null, n.id)} confirmacao={`Cancelar a NF ${n.numero}? A conta a pagar em aberto também será cancelada.`} variante="secundario">Cancelar</AcaoConfirmada>}</td>}
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
