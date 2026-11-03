import Link from "next/link";
import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { formatarData, formatarMoeda } from "@/dominio/formato";
import { calcularPrazo, SITUACOES_OBRA, type SituacaoObra } from "@/dominio/obra";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarObras, type FiltroObras } from "@/servicos/obras";
import { SeloPrazo, SeloSituacao } from "@/componentes/rotulos";
import { Aviso, CabecalhoPagina, Cartao, ColunaOrdenavel, LinkBotao, Tabela, Vazio } from "@/componentes/ui";

export const metadata = { title: "Obras" };

export default async function PaginaObras({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirPermissaoPagina("obras");
  const p = await searchParams;
  const situacao = p.situacao && (p.situacao === "ATIVAS" || p.situacao in SITUACOES_OBRA) ? (p.situacao as FiltroObras["situacao"]) : undefined;
  const obras = await listarObras(db, { id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras }, {
    q: p.q?.slice(0, 100), situacao, ordem: (p.ordem as FiltroObras["ordem"]) ?? "codigo", direcao: p.dir === "asc" ? "asc" : "desc",
  });
  const hoje = hojeIso();
  const total = obras.reduce((t, o) => t + Number(o.valorContratoOriginal), 0);

  return (
    <>
      <CabecalhoPagina titulo="Obras" subtitulo={`${obras.length} obra(s) · ${formatarMoeda(total)} em contratos`}
        acoes={temPermissao(u, "obras", "criar") && <LinkBotao href="/obras/nova">+ Nova obra</LinkBotao>} />
      {p.excluida && <div className="mb-4"><Aviso tom="sucesso">Obra excluída. O registro permanece no histórico de auditoria.</Aviso></div>}
      <Cartao semPadding>
        <form className="flex flex-wrap gap-2 border-b border-borda p-3">
          <input name="q" defaultValue={p.q} placeholder="Buscar por código, nome, cliente ou cidade…" className="min-w-60 flex-1 rounded-lg border border-borda px-3 py-1.5 text-sm" />
          <select name="situacao" defaultValue={p.situacao ?? ""} className="rounded-lg border border-borda px-2 py-1.5 text-sm">
            <option value="">Todas as situações</option>
            <option value="ATIVAS">Somente ativas</option>
            {Object.entries(SITUACOES_OBRA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {p.ordem && <input type="hidden" name="ordem" value={p.ordem} />}
          {p.dir && <input type="hidden" name="dir" value={p.dir} />}
          <button className="rounded-lg bg-marca px-3 py-1.5 text-sm font-medium text-white">Filtrar</button>
          {(p.q || p.situacao) && <Link href="/obras" className="px-2 py-1.5 text-sm text-suave">Limpar</Link>}
        </form>
        {obras.length === 0 ? (
          <Vazio titulo={p.q || p.situacao ? "Nenhuma obra encontrada com esses filtros" : "Nenhuma obra cadastrada ainda"}>
            {temPermissao(u, "obras", "criar") && !p.q && <Link href="/obras/nova" className="text-marca">Cadastrar a primeira obra</Link>}
          </Vazio>
        ) : (
          <Tabela>
            <thead><tr>
              <ColunaOrdenavel campo="codigo" rotulo="Código" params={p} base="/obras" />
              <ColunaOrdenavel campo="nome" rotulo="Obra" params={p} base="/obras" />
              <ColunaOrdenavel campo="cliente" rotulo="Cliente" params={p} base="/obras" />
              <ColunaOrdenavel campo="situacao" rotulo="Situação" params={p} base="/obras" />
              <ColunaOrdenavel campo="inicio" rotulo="Início" params={p} base="/obras" />
              <ColunaOrdenavel campo="fim" rotulo="Término" params={p} base="/obras" />
              <th>Prazo</th>
              <ColunaOrdenavel campo="valor" rotulo="Contrato" params={p} base="/obras" className="text-right" />
            </tr></thead>
            <tbody>
              {obras.map((o) => {
                const prazo = calcularPrazo({ ...o, situacao: o.situacao as SituacaoObra }, hoje);
                return (
                  <tr key={o.id}>
                    <td className="whitespace-nowrap"><Link href={`/obras/${o.id}`} className="font-medium text-marca hover:underline">{o.codigo}</Link></td>
                    <td><Link href={`/obras/${o.id}`} className="hover:text-marca">{o.nome}</Link>{o.cidade && <div className="text-xs text-suave">{o.cidade}{o.uf ? `/${o.uf}` : ""}</div>}</td>
                    <td>{o.clienteNome}</td>
                    <td><SeloSituacao situacao={o.situacao} /></td>
                    <td className="tabular whitespace-nowrap">{formatarData(o.dataInicio)}</td>
                    <td className="tabular whitespace-nowrap">{formatarData(o.dataFimContratual)}</td>
                    <td><SeloPrazo status={prazo.status} diasAtraso={prazo.diasAtraso} /></td>
                    <td className="tabular whitespace-nowrap text-right">{formatarMoeda(o.valorContratoOriginal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
