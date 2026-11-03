import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { hojeIso, mesDaSemana } from "@/dominio/calendario";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { calcularPrazo, margemPrevista } from "@/dominio/obra";
import { exigirPermissaoPagina, podeAcessarObra, temPermissao } from "@/lib/auth/atual";
import { listarAnexos } from "@/servicos/anexos";
import { equipeObra, estruturaObra, obterObra } from "@/servicos/obras";
import { listarAuditoria } from "@/servicos/painel";
import { listarUsuariosAtivos } from "@/servicos/usuarios";
import { AuditoriaLista } from "@/componentes/auditoria-lista";
import { AcaoConfirmada, BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { BarraPrazo, SeloPrazo, SeloSituacao } from "@/componentes/rotulos";
import { Abas, Aviso, CabecalhoPagina, Cartao, Dl, Indicador, LinkBotao, Selo, Tabela } from "@/componentes/ui";
import { anexarAcao, desvincularAcao, excluirObraAcao, removerAnexoAcao, vincularAcao } from "../acoes";

const ABAS = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "estrutura", rotulo: "Estrutura" },
  { id: "equipe", rotulo: "Equipe e acesso" },
  { id: "documentos", rotulo: "Documentos" },
  { id: "historico", rotulo: "Histórico" },
];

const TIPO_ETAPA = { CONTRATO: ["Contrato", "azul"], ADITIVO: ["Aditivo", "amarelo"], FATURAMENTO_DIRETO: ["Faturamento direto", "roxo"] } as const;

function tamanho(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export const metadata = { title: "Obra" };

export default async function PaginaObra({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; criada?: string; salva?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await exigirPermissaoPagina("obras");
  const dados = /^[0-9a-f-]{36}$/.test(id) ? await obterObra(db, u.empresaId, id) : null;
  if (!dados || !(await podeAcessarObra(u, id))) notFound();
  const { obra: o } = dados;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : "resumo";
  const podeEditar = temPermissao(u, "obras", "editar");
  const base = `/obras/${id}`;

  const prazo = calcularPrazo(o, hojeIso());
  const margem = o.margemPrevista != null ? Number(o.margemPrevista) : margemPrevista(Number(o.valorContratoOriginal), Number(o.orcamentoCustoAprovado));
  const entrada = Number(o.valorContratoOriginal) * Number(o.percentualEntrada);

  return (
    <>
      <CabecalhoPagina
        voltar={{ href: "/obras", rotulo: "Obras" }}
        titulo={<span className="flex items-center gap-3">{o.codigo} <SeloSituacao situacao={o.situacao} /></span>}
        subtitulo={`${o.nome} · ${dados.clienteNome}`}
        acoes={podeEditar && <LinkBotao href={`${base}/editar`} variante="secundario">Editar</LinkBotao>}
      />
      {sp.criada && <div className="mb-4"><Aviso tom="sucesso">Obra cadastrada. A estrutura operacional foi gerada — veja a aba <Link className="underline" href={`${base}?aba=estrutura`}>Estrutura</Link>.</Aviso></div>}
      {sp.salva && <div className="mb-4"><Aviso tom="sucesso">Alterações salvas e registradas no histórico.</Aviso></div>}
      <Abas abas={ABAS} ativa={aba} base={base} />

      {aba === "resumo" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Indicador rotulo="Contrato original" valor={formatarMoeda(o.valorContratoOriginal)} detalhe={`Entrada ${formatarPercentual(o.percentualEntrada)} = ${formatarMoeda(entrada)}`} />
            <Indicador rotulo="Orçamento de custos" valor={formatarMoeda(o.orcamentoCustoAprovado)} detalhe="Provisório até o orçamento-base (Fase 3)" />
            <Indicador rotulo="Margem prevista" valor={margem == null ? "—" : formatarPercentual(margem)} detalhe={o.margemPrevista != null ? "Informada" : "Calculada: (contrato − custo) ÷ contrato"} tom={margem != null && margem < 0 ? "perigo" : undefined} />
            <Indicador rotulo="Prazo decorrido" valor={prazo.status === "NAO_APLICAVEL" ? "—" : formatarPercentual(prazo.prazoDecorrido)} detalhe={<SeloPrazo status={prazo.status} diasAtraso={prazo.diasAtraso} />} />
          </div>
          <Cartao titulo="Ficha técnica">
            <Dl itens={[
              ["Cliente", dados.clienteNome], ["Tipo de obra", o.tipoObra], ["Endereço", [o.endereco, o.cidade, o.uf].filter(Boolean).join(" · ") || null],
              ["Responsável técnico", dados.responsavelNome], ["Gestor", dados.gestorNome], ["Início", formatarData(o.dataInicio)],
              ["Término contratual", formatarData(o.dataFimContratual)], ["Conclusão", o.dataConclusao ? formatarData(o.dataConclusao) : null],
              ["Duração contratual", `${prazo.diasTotais} dias`],
            ]} />
            {prazo.status !== "NAO_APLICAVEL" && <div className="mt-4 max-w-md"><BarraPrazo fracao={prazo.prazoDecorrido} /></div>}
            {o.observacoes && <p className="mt-4 whitespace-pre-wrap border-t border-borda pt-4 text-sm">{o.observacoes}</p>}
          </Cartao>
          <Cartao titulo="Módulos desta obra">
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li className="flex items-center justify-between gap-2"><span>Cadastro, ficha técnica, equipe, documentos e histórico</span><Selo tom="verde">Disponível</Selo></li>
              <li className="flex items-center justify-between gap-2"><span>Centro de custo, EAP e calendário semanal</span><Selo tom="verde">Gerado</Selo></li>
              <li className="flex items-center justify-between gap-2"><span>Orçamento, compras, notas fiscais e financeiro</span><Selo>Fase 3</Selo></li>
              <li className="flex items-center justify-between gap-2"><span>Planejamento semanal, medições e aditivos</span><Selo>Fase 4</Selo></li>
              <li className="flex items-center justify-between gap-2"><span>Relatório semanal em PDF e painel gerencial</span><Selo>Fase 5</Selo></li>
            </ul>
          </Cartao>
          {temPermissao(u, "obras", "excluir") && (
            <div className="flex justify-end">
              <AcaoConfirmada acao={excluirObraAcao.bind(null, id)} confirmacao={`Excluir a obra ${o.codigo}? Ela deixará de aparecer nas listas (exclusão lógica, registrada na auditoria).`} variante="secundario">Excluir obra</AcaoConfirmada>
            </div>
          )}
        </div>
      )}

      {aba === "estrutura" && <AbaEstrutura obraId={id} />}
      {aba === "equipe" && <AbaEquipe obraId={id} empresaId={u.empresaId} podeEditar={podeEditar} />}
      {aba === "documentos" && <AbaDocumentos obraId={id} empresaId={u.empresaId} podeEditar={podeEditar} />}
      {aba === "historico" && <AbaHistorico obraId={id} empresaId={u.empresaId} />}
    </>
  );
}

async function AbaEstrutura({ obraId }: { obraId: string }) {
  const e = await estruturaObra(db, obraId);
  const meses = new Map<string, number>();
  for (const s of e.semanas) meses.set(mesDaSemana(s), (meses.get(mesDaSemana(s)) ?? 0) + 1);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Cartao titulo="Centro de custo">
          {e.centroCusto ? <Dl itens={[["Código", e.centroCusto.codigo], ["Nome", e.centroCusto.nome], ["Situação", e.centroCusto.ativo ? "Ativo" : "Inativo"]]} /> : <p className="text-sm text-suave">—</p>}
          <p className="mt-3 text-xs text-suave">Todo lançamento financeiro desta obra (Fase 3) será obrigatoriamente associado a este centro de custo.</p>
        </Cartao>
        <Cartao titulo="Orçamentos">
          <ul className="text-sm">
            {e.orcamentos.map((o) => <li key={o.id} className="flex items-center justify-between py-1"><span>{o.titulo} · nº {o.numero}, rev. {o.revisao}</span><Selo tom="roxo">{o.status === "RASCUNHO" ? "Rascunho" : o.status}</Selo></li>)}
          </ul>
          {e.orcamentos[0] && (
            <p className="mt-3 text-xs text-suave">
              Parâmetros herdados da empresa: lucro MO {formatarPercentual(e.orcamentos[0].parametros.lucroMaoDeObra)}, lucro material {formatarPercentual(e.orcamentos[0].parametros.lucroMaterial)},
              impostos {formatarPercentual(e.orcamentos[0].parametros.impostos)}, fórmula {e.orcamentos[0].parametros.formula === "POR_DENTRO" ? "por dentro (imposto sobre o preço)" : "legada da planilha"}. O editor de itens chega na Fase 3.
            </p>
          )}
        </Cartao>
        <Cartao titulo={`Calendário semanal · ${e.semanas.length} semanas`}>
          <p className="text-sm">Semana 1: {formatarData(e.semanas[0]?.inicio)} a {formatarData(e.semanas[0]?.fim)} · última: semana {e.semanas.at(-1)?.numero} ({formatarData(e.semanas.at(-1)?.inicio)} a {formatarData(e.semanas.at(-1)?.fim)})</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...meses].map(([m, n]) => <Selo key={m}>{m.slice(5)}/{m.slice(0, 4)}: {n} sem.</Selo>)}
          </div>
          <p className="mt-3 text-xs text-suave">Semanas de segunda a domingo, sem limite de colunas. Quinzenas e meses de calendário são derivados das semanas. Prorrogar o término acrescenta semanas automaticamente.</p>
        </Cartao>
      </div>
      <Cartao titulo={`EAP · ${e.etapas.length} etapas`} semPadding>
        <Tabela>
          <thead><tr><th className="w-12">#</th><th>Etapa</th><th>Tipo</th></tr></thead>
          <tbody>
            {e.etapas.map((et) => {
              const [r, t] = TIPO_ETAPA[et.tipo];
              return <tr key={et.id}><td className="tabular text-suave">{et.ordem}</td><td>{et.nome}</td><td><Selo tom={t}>{r}</Selo></td></tr>;
            })}
          </tbody>
        </Tabela>
      </Cartao>
    </div>
  );
}

async function AbaEquipe({ obraId, empresaId, podeEditar }: { obraId: string; empresaId: string; podeEditar: boolean }) {
  const [equipe, usuarios] = await Promise.all([equipeObra(db, obraId), listarUsuariosAtivos(db, empresaId)]);
  const disponiveis = usuarios.filter((x) => !equipe.some((e) => e.usuarioId === x.id));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Cartao titulo="Pessoas vinculadas" className="lg:col-span-2" semPadding>
        <Tabela>
          <thead><tr><th>Nome</th><th>Papel</th><th>E-mail</th>{podeEditar && <th />}</tr></thead>
          <tbody>
            {equipe.map((e) => (
              <tr key={e.usuarioId}>
                <td>{e.nome}{!e.ativo && <span className="ml-2"><Selo tom="vermelho">Inativo</Selo></span>}</td>
                <td>{e.papel}</td><td className="text-suave">{e.email}</td>
                {podeEditar && <td className="text-right"><AcaoConfirmada acao={desvincularAcao.bind(null, obraId, e.usuarioId)} confirmacao={`Remover ${e.nome} desta obra?`} variante="secundario">Remover</AcaoConfirmada></td>}
              </tr>
            ))}
          </tbody>
        </Tabela>
        <p className="border-t border-borda px-5 py-3 text-xs text-suave">Perfis com “acesso a todas as obras” (Administrador, Diretoria, Administrativo/Financeiro) enxergam esta obra sem vínculo. Engenharia e Colaborador de obra precisam estar vinculados.</p>
      </Cartao>
      {podeEditar && (
        <Cartao titulo="Vincular pessoa">
          <Formulario acao={vincularAcao.bind(null, obraId)} limparAoSalvar>
            <CampoSelecao nome="usuarioId" rotulo="Usuário" obrigatorio vazio="Selecione…" opcoes={disponiveis.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
            <Campo nome="papel" rotulo="Papel na obra" placeholder="Equipe, Engenheiro residente, Estagiário…" />
            <BotaoEnviar>Vincular</BotaoEnviar>
          </Formulario>
        </Cartao>
      )}
    </div>
  );
}

async function AbaDocumentos({ obraId, empresaId, podeEditar }: { obraId: string; empresaId: string; podeEditar: boolean }) {
  const anexos = await listarAnexos(db, empresaId, "obra", obraId);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Cartao titulo={`Documentos · ${anexos.length}`} className="lg:col-span-2" semPadding>
        {anexos.length === 0 ? <p className="p-5 text-sm text-suave">Nenhum documento anexado.</p> : (
          <Tabela>
            <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Enviado por</th>{podeEditar && <th />}</tr></thead>
            <tbody>
              {anexos.map((a) => (
                <tr key={a.id}>
                  <td><a href={`/api/anexos/${a.id}`} className="font-medium text-texto underline-offset-4 hover:underline decoration-destaque decoration-2" target="_blank" rel="noopener">{a.nomeArquivo}</a>{a.descricao && <div className="text-xs text-suave">{a.descricao}</div>}</td>
                  <td className="tabular whitespace-nowrap text-suave">{tamanho(a.tamanho)}</td>
                  <td className="text-suave">{a.autor} · {formatarData(a.criadoEm)}</td>
                  {podeEditar && <td className="text-right"><AcaoConfirmada acao={removerAnexoAcao.bind(null, obraId, a.id)} confirmacao={`Remover "${a.nomeArquivo}"?`} variante="secundario">Remover</AcaoConfirmada></td>}
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
      {podeEditar && (
        <Cartao titulo="Anexar documentos">
          <Formulario acao={anexarAcao.bind(null, obraId)} limparAoSalvar>
            <Campo nome="arquivo" rotulo="Arquivos" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.docx,.xml,.dwg" ajuda="PDF, imagens, XLSX, DOCX, XML ou DWG — até 20 MB cada." />
            <Campo nome="descricao" rotulo="Descrição" placeholder="Contrato assinado, ART, projeto…" />
            <BotaoEnviar>Enviar</BotaoEnviar>
          </Formulario>
        </Cartao>
      )}
    </div>
  );
}

async function AbaHistorico({ obraId, empresaId }: { obraId: string; empresaId: string }) {
  const linhas = await listarAuditoria(db, empresaId, { obraId, limite: 200 });
  return <Cartao titulo="Histórico de alterações" semPadding><AuditoriaLista linhas={linhas.slice(0, 200)} /></Cartao>;
}
