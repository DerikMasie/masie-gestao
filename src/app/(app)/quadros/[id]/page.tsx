import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Settings2, X } from "lucide-react";
import { db } from "@/db";
import { hojeIso } from "@/dominio/calendario";
import { formatarData } from "@/dominio/formato";
import { CORES_ETIQUETA, situacaoCartao, type CorEtiqueta } from "@/dominio/quadro";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarAnexos } from "@/servicos/anexos";
import { listarObras } from "@/servicos/obras";
import { detalheCartao, obterQuadroCompleto } from "@/servicos/quadros";
import { listarUsuariosAtivos } from "@/servicos/usuarios";
import { AcaoConfirmada, BotaoEnviar, Caixa, Campo, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import { QuadroKanban, SeloEtiqueta } from "@/componentes/kanban";
import { CabecalhoPagina, LinkBotao } from "@/componentes/ui";
import {
  anexarCartaoAcao, arquivarCartaoAcao, checklistAdicionarAcao, checklistAlternarAcao, checklistRemoverAcao, comentarAcao,
  criarCartaoRapidoAcao, editarQuadroAcao, excluirCartaoAcao, excluirColunaAcao, excluirEtiquetaAcao, moverCartaoAcao,
  moverCartaoFormAcao, moverColunaAcao, removerAnexoCartaoAcao, salvarCartaoAcao, salvarColunaAcao, salvarEtiquetaAcao,
} from "../acoes";

export const metadata = { title: "Quadro" };
const uuid = /^[0-9a-f-]{36}$/;

export default async function PaginaQuadro({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ cartao?: string; config?: string; resp?: string; etq?: string; q?: string; arquivados?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("quadro");
  if (!uuid.test(id)) notFound();
  const dados = await obterQuadroCompleto(db, u.empresaId, id, {
    responsavelId: sp.resp && uuid.test(sp.resp) ? sp.resp : undefined, etiquetaId: sp.etq && uuid.test(sp.etq) ? sp.etq : undefined,
    q: sp.q?.slice(0, 100), mostrarArquivados: sp.arquivados === "1",
  }).catch(() => null);
  if (!dados) notFound();
  const usuarios = await listarUsuariosAtivos(db, u.empresaId);
  const podeEditar = temPermissao(u, "quadro", "editar");
  const base = `/quadros/${id}`;
  const filtrando = Boolean(sp.resp || sp.etq || sp.q);

  return (
    <>
      <CabecalhoPagina titulo={dados.quadro.nome} subtitulo={dados.quadro.descricao ?? undefined} voltar={{ href: "/quadros", rotulo: "Quadros" }}
        acoes={<>
          <LinkBotao href={`/quadros/calendario?quadro=${id}`} variante="secundario"><CalendarDays className="size-4" /> Calendário</LinkBotao>
          {podeEditar && <LinkBotao href={`${base}?config=1`} variante="secundario"><Settings2 className="size-4" /> Colunas e etiquetas</LinkBotao>}
        </>} />

      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Buscar cartões…" className="min-w-48 flex-1 rounded-lg border border-borda bg-white px-3 py-1.5 sm:flex-none" />
        <select name="resp" defaultValue={sp.resp ?? ""} className="rounded-lg border border-borda bg-white px-2 py-1.5" aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          <option value={u.id}>Somente meus</option>
          {usuarios.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
        <select name="etq" defaultValue={sp.etq ?? ""} className="rounded-lg border border-borda bg-white px-2 py-1.5" aria-label="Etiqueta">
          <option value="">Todas as etiquetas</option>
          {dados.etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <label className="flex items-center gap-1.5 px-1"><input type="checkbox" name="arquivados" value="1" defaultChecked={sp.arquivados === "1"} /> Arquivados</label>
        <button className="rounded-lg bg-marca px-3 py-1.5 font-medium text-white">Filtrar</button>
        {(filtrando || sp.arquivados) && <Link href={base} className="px-2 py-1.5 text-suave">Limpar</Link>}
      </form>

      <QuadroKanban quadroId={id} colunas={dados.colunas} cartoes={dados.cartoes} etiquetas={dados.etiquetas} hoje={hojeIso()}
        podeEditar={podeEditar && !filtrando} podeCriar={temPermissao(u, "quadro", "criar")}
        mover={moverCartaoAcao} criarRapido={criarCartaoRapidoAcao.bind(null, id)} />
      {filtrando && podeEditar && <p className="text-xs text-suave">Arrastar está desativado com filtros ativos, para não reordenar com cartões ocultos.</p>}

      {sp.cartao && uuid.test(sp.cartao) && <PainelCartao quadroId={id} cartaoId={sp.cartao} empresaId={u.empresaId} podeEditar={podeEditar}
        podeExcluir={temPermissao(u, "quadro", "excluir")} colunas={dados.colunas} etiquetas={dados.etiquetas} usuarios={usuarios}
        acesso={{ id: u.id, empresaId: u.empresaId, acessoTodasObras: u.perfil.acessoTodasObras }} />}
      {sp.config && podeEditar && <PainelConfig quadroId={id} dados={dados} podeExcluir={temPermissao(u, "quadro", "excluir")} />}
    </>
  );
}

function Gaveta({ fechar, titulo, children }: { fechar: string; titulo: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <Link href={fechar} scroll={false} className="absolute inset-0 bg-black/30" aria-label="Fechar" />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-fundo shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borda bg-white px-5 py-4">
          <div className="min-w-0">{titulo}</div>
          <Link href={fechar} scroll={false} className="rounded p-1 hover:bg-zinc-100" aria-label="Fechar"><X className="size-5" /></Link>
        </div>
        <div className="space-y-5 p-5">{children}</div>
      </div>
    </div>
  );
}

const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-borda bg-white p-4"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-suave">{titulo}</h3>{children}</section>
);

async function PainelCartao({ quadroId, cartaoId, empresaId, podeEditar, podeExcluir, colunas, etiquetas, usuarios, acesso }: {
  quadroId: string; cartaoId: string; empresaId: string; podeEditar: boolean; podeExcluir: boolean;
  colunas: { id: string; nome: string; concluida: boolean }[]; etiquetas: { id: string; nome: string; cor: string }[];
  usuarios: { id: string; nome: string }[]; acesso: { id: string; empresaId: string; acessoTodasObras: boolean };
}) {
  const d = await detalheCartao(db, empresaId, cartaoId).catch(() => null);
  const fechar = `/quadros/${quadroId}`;
  if (!d || d.cartao.quadroId !== quadroId) return <Gaveta fechar={fechar} titulo="Cartão não encontrado"><p className="text-sm">Ele pode ter sido excluído.</p></Gaveta>;
  const [obras, anexos] = await Promise.all([listarObras(db, acesso, { ordem: "codigo", direcao: "desc" }), listarAnexos(db, empresaId, "cartao", cartaoId)]);
  const c = d.cartao;
  const s = situacaoCartao({ dataEntrega: c.dataEntrega, concluido: d.coluna.concluida }, hojeIso());
  return (
    <Gaveta fechar={fechar} titulo={<>
      <p className="text-xs text-suave">em <b className="text-texto">{d.coluna.nome}</b>{c.arquivado && " · arquivado"}</p>
      <h2 className="mt-0.5 text-lg font-semibold leading-snug">{c.titulo}</h2>
      {s === "ATRASADO" && <p className="mt-1 text-xs font-medium text-perigo">Entrega vencida em {formatarData(c.dataEntrega)}</p>}
    </>}>
      <Bloco titulo="Detalhes">
        <Formulario acao={salvarCartaoAcao.bind(null, quadroId, cartaoId)}>
          <fieldset disabled={!podeEditar} className="space-y-4">
            <Campo nome="titulo" rotulo="Título" obrigatorio defaultValue={c.titulo} />
            <CampoArea nome="descricao" rotulo="Descrição" defaultValue={c.descricao ?? ""} rows={4} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelecao nome="responsavelId" rotulo="Responsável" vazio="—" defaultValue={c.responsavelId ?? ""} opcoes={usuarios.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
              <CampoSelecao nome="obraId" rotulo="Obra relacionada" vazio="Nenhuma (interno)" defaultValue={c.obraId ?? ""} opcoes={obras.map((o) => ({ valor: o.id, rotulo: `${o.codigo} · ${o.nome}` }))} />
              <Campo nome="dataInicio" rotulo="Início" type="date" defaultValue={c.dataInicio ?? ""} />
              <Campo nome="dataEntrega" rotulo="Entrega" type="date" defaultValue={c.dataEntrega ?? ""} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Etiquetas</p>
              <div className="flex flex-wrap gap-2">
                {etiquetas.map((e) => {
                  const cor = CORES_ETIQUETA[e.cor as CorEtiqueta] ?? CORES_ETIQUETA.cinza;
                  return (
                    <label key={e.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs has-[:checked]:ring-2 has-[:checked]:ring-zinc-900" style={{ background: cor.fundo, color: cor.texto, borderColor: cor.borda }}>
                      <input type="checkbox" name="etiquetas" value={e.id} defaultChecked={d.etiquetas.includes(e.id)} className="size-3.5" />{e.nome}
                    </label>
                  );
                })}
              </div>
            </div>
          </fieldset>
          {podeEditar && <BotaoEnviar>Salvar</BotaoEnviar>}
        </Formulario>
      </Bloco>

      {podeEditar && (
        <Bloco titulo="Mover">
          <Formulario acao={moverCartaoFormAcao.bind(null, quadroId, cartaoId)} className="!space-y-0">
            <div className="flex gap-2">
              <select name="colunaId" defaultValue={c.colunaId} aria-label="Mover para a coluna" className="flex-1 rounded-lg border border-borda bg-white px-3 py-2 text-sm">
                {colunas.map((k) => <option key={k.id} value={k.id}>{k.nome}{k.concluida ? " ✓" : ""}</option>)}
              </select>
              <BotaoEnviar variante="secundario">Mover</BotaoEnviar>
            </div>
          </Formulario>
        </Bloco>
      )}

      <Bloco titulo={`Checklist ${d.checklist.length ? `· ${d.checklist.filter((i) => i.feito).length}/${d.checklist.length}` : ""}`}>
        {d.checklist.length > 0 && (
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-zinc-900" style={{ width: `${(d.checklist.filter((i) => i.feito).length / d.checklist.length) * 100}%` }} />
          </div>
        )}
        <ul className="space-y-1">
          {d.checklist.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              {podeEditar ? (
                <AcaoConfirmadaSilenciosa acao={checklistAlternarAcao.bind(null, quadroId, i.id)} rotulo={i.feito ? "Desmarcar" : "Marcar como feito"} marcado={i.feito} />
              ) : <input type="checkbox" checked={i.feito} readOnly className="size-4" />}
              <span className={i.feito ? "flex-1 text-suave line-through" : "flex-1"}>{i.texto}</span>
              {podeEditar && <AcaoConfirmada acao={checklistRemoverAcao.bind(null, quadroId, i.id)} confirmacao="Remover este item?" variante="secundario">×</AcaoConfirmada>}
            </li>
          ))}
        </ul>
        {podeEditar && (
          <Formulario acao={checklistAdicionarAcao.bind(null, quadroId, cartaoId)} limparAoSalvar className="mt-3 !space-y-0">
            <div className="flex gap-2"><input name="texto" placeholder="Novo item" aria-label="Novo item do checklist" className="flex-1 rounded-lg border border-borda px-3 py-1.5 text-sm" /><BotaoEnviar variante="secundario">Adicionar</BotaoEnviar></div>
          </Formulario>
        )}
      </Bloco>

      <Bloco titulo={`Anexos · ${anexos.length}`}>
        <ul className="space-y-1 text-sm">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener" className="truncate underline decoration-destaque decoration-2 underline-offset-2">{a.nomeArquivo}</a>
              {podeEditar && <AcaoConfirmada acao={removerAnexoCartaoAcao.bind(null, quadroId, a.id)} confirmacao={`Remover "${a.nomeArquivo}"?`} variante="secundario">Remover</AcaoConfirmada>}
            </li>
          ))}
        </ul>
        {podeEditar && (
          <Formulario acao={anexarCartaoAcao.bind(null, quadroId, cartaoId)} limparAoSalvar className="mt-3 !space-y-2">
            <input type="file" name="arquivo" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.xml,.dwg" aria-label="Arquivos" className="block w-full text-sm" />
            <BotaoEnviar variante="secundario">Anexar</BotaoEnviar>
          </Formulario>
        )}
      </Bloco>

      <Bloco titulo={`Comentários · ${d.comentarios.length}`}>
        <Formulario acao={comentarAcao.bind(null, quadroId, cartaoId)} limparAoSalvar className="mb-4 !space-y-2">
          <textarea name="texto" rows={2} placeholder="Escreva um comentário…" aria-label="Comentário" className="block w-full rounded-lg border border-borda px-3 py-2 text-sm" />
          <BotaoEnviar variante="secundario">Comentar</BotaoEnviar>
        </Formulario>
        <ol className="space-y-3">
          {d.comentarios.map((m) => (
            <li key={m.id} className="text-sm">
              <p><b>{m.autor}</b> <span className="text-xs text-suave">{formatarData(m.criadoEm)}</span></p>
              <p className="mt-0.5 whitespace-pre-wrap">{m.texto}</p>
            </li>
          ))}
        </ol>
      </Bloco>

      {(podeEditar || podeExcluir) && (
        <div className="flex flex-wrap justify-end gap-2">
          {podeEditar && <AcaoConfirmada acao={arquivarCartaoAcao.bind(null, quadroId, cartaoId, !c.arquivado)} confirmacao={c.arquivado ? "Restaurar este cartão?" : "Arquivar este cartão? Ele some do quadro, mas pode ser restaurado."} variante="secundario">{c.arquivado ? "Restaurar" : "Arquivar"}</AcaoConfirmada>}
          {podeExcluir && <AcaoConfirmada acao={excluirCartaoAcao.bind(null, quadroId, cartaoId)} confirmacao="Excluir definitivamente este cartão, com checklist e comentários?">Excluir</AcaoConfirmada>}
        </div>
      )}
    </Gaveta>
  );
}

/** Caixa de seleção que dispara a action ao clicar (sem confirmação). */
function AcaoConfirmadaSilenciosa({ acao, rotulo, marcado }: { acao: (e: object) => Promise<object>; rotulo: string; marcado: boolean }) {
  return (
    <form action={async () => { "use server"; await acao({}); }}>
      <button aria-label={rotulo} title={rotulo} className={marcado ? "flex size-4 items-center justify-center rounded border border-zinc-900 bg-zinc-900 text-[10px] text-destaque" : "size-4 rounded border border-zinc-400 bg-white hover:border-zinc-900"}>
        {marcado ? "✓" : ""}
      </button>
    </form>
  );
}

const CORES = Object.keys(CORES_ETIQUETA) as CorEtiqueta[];

function PainelConfig({ quadroId, dados, podeExcluir }: { quadroId: string; dados: Awaited<ReturnType<typeof obterQuadroCompleto>>; podeExcluir: boolean }) {
  const inp = "rounded-lg border border-borda px-2 py-1.5 text-sm";
  return (
    <Gaveta fechar={`/quadros/${quadroId}`} titulo={<h2 className="text-lg font-semibold">Configurar quadro</h2>}>
      <Bloco titulo="Quadro">
        <Formulario acao={editarQuadroAcao.bind(null, quadroId)}>
          <Campo nome="nome" rotulo="Nome" obrigatorio defaultValue={dados.quadro.nome} />
          <Campo nome="descricao" rotulo="Descrição" defaultValue={dados.quadro.descricao ?? ""} />
          <Caixa nome="arquivado" rotulo="Arquivar quadro (some do calendário)" defaultChecked={dados.quadro.arquivado} />
          <div><BotaoEnviar>Salvar</BotaoEnviar></div>
        </Formulario>
      </Bloco>
      <Bloco titulo="Colunas do fluxo (na ordem)">
        <ul className="space-y-3">
          {dados.colunas.map((k, i) => (
            <li key={k.id} className="rounded-lg border border-borda p-2">
              <Formulario acao={salvarColunaAcao.bind(null, quadroId, k.id)} className="!space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input name="nome" defaultValue={k.nome} aria-label="Nome da coluna" required className={`${inp} min-w-32 flex-1`} />
                  <input name="limite" type="number" min={1} defaultValue={k.limite ?? ""} placeholder="Limite" aria-label="Limite de cartões" className={`${inp} w-20`} />
                  <Caixa nome="concluida" rotulo="Conclui" defaultChecked={k.concluida} />
                  <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
                </div>
              </Formulario>
              <div className="mt-2 flex gap-2">
                {i > 0 && <AcaoConfirmadaSemPergunta acao={moverColunaAcao.bind(null, quadroId, k.id, -1)} rotulo="← Antes" />}
                {i < dados.colunas.length - 1 && <AcaoConfirmadaSemPergunta acao={moverColunaAcao.bind(null, quadroId, k.id, 1)} rotulo="Depois →" />}
                {podeExcluir && <span className="ml-auto"><AcaoConfirmada acao={excluirColunaAcao.bind(null, quadroId, k.id)} confirmacao={`Excluir a coluna "${k.nome}"? Só é possível se estiver vazia.`} variante="secundario">Excluir</AcaoConfirmada></span>}
              </div>
            </li>
          ))}
        </ul>
        <Formulario acao={salvarColunaAcao.bind(null, quadroId, null)} limparAoSalvar className="mt-4 !space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input name="nome" placeholder="Nova coluna" aria-label="Nome da nova coluna" required className={`${inp} flex-1`} />
            <input name="limite" type="number" min={1} placeholder="Limite" aria-label="Limite" className={`${inp} w-20`} />
            <Caixa nome="concluida" rotulo="Conclui" />
            <BotaoEnviar>Adicionar</BotaoEnviar>
          </div>
        </Formulario>
        <p className="mt-2 text-xs text-suave">“Conclui”: cartões nesta coluna contam como concluídos. “Limite”: máximo de cartões ao mesmo tempo (WIP).</p>
      </Bloco>
      <Bloco titulo="Etiquetas">
        <ul className="space-y-2">
          {dados.etiquetas.map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <Formulario acao={salvarEtiquetaAcao.bind(null, quadroId, e.id)} className="!space-y-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeloEtiqueta e={e} />
                  <input name="nome" defaultValue={e.nome} aria-label="Nome da etiqueta" required className={`${inp} min-w-28 flex-1`} />
                  <select name="cor" defaultValue={e.cor} aria-label="Cor" className={inp}>{CORES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
                  <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
                </div>
              </Formulario>
              <AcaoConfirmada acao={excluirEtiquetaAcao.bind(null, quadroId, e.id)} confirmacao={`Excluir a etiqueta "${e.nome}"? Ela sai de todos os cartões.`} variante="secundario">×</AcaoConfirmada>
            </li>
          ))}
        </ul>
        <Formulario acao={salvarEtiquetaAcao.bind(null, quadroId, null)} limparAoSalvar className="mt-3 !space-y-0">
          <div className="flex gap-2">
            <input name="nome" placeholder="Nova etiqueta" aria-label="Nome da nova etiqueta" required className={`${inp} flex-1`} />
            <select name="cor" defaultValue="amarelo" aria-label="Cor" className={inp}>{CORES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <BotaoEnviar>Adicionar</BotaoEnviar>
          </div>
        </Formulario>
      </Bloco>
    </Gaveta>
  );
}

function AcaoConfirmadaSemPergunta({ acao, rotulo }: { acao: (e: object) => Promise<object>; rotulo: string }) {
  return (
    <form action={async () => { "use server"; await acao({}); }}>
      <button className="rounded-md border border-borda bg-white px-2 py-1 text-xs hover:bg-zinc-50">{rotulo}</button>
    </form>
  );
}
