import Link from "next/link";
import { db } from "@/db";
import { datasDaSemana } from "@/dominio/fisico";
import { formatarData, formatarMoeda, formatarPercentual } from "@/dominio/formato";
import { somarDias } from "@/dominio/calendario";
import { temPermissao } from "@/lib/auth/atual";
import type { UsuarioSessao } from "@/servicos/sessoes";
import { carregarRelatorio, listarRelatorios } from "@/servicos/relatorios";
import { AcaoConfirmada, BotaoEnviar, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import { FotosRelatorio } from "@/componentes/fotos-relatorio";
import { Aviso, Cartao, LinkBotao, Selo, Tabela, Vazio } from "@/componentes/ui";
import {
  criarRelatorioAcao, emitirRelatorioAcao, enviarFotoAcao, excluirRelatorioAcao, moverFotoAcao, reabrirRelatorioAcao, removerFotoAcao,
  salvarFotoAcao, salvarTextosAcao,
} from "../relatorios/acoes";

export async function VistaRelatorio({ obraId, u, sp, base, inicioObra, semanaAtual, nSemanas }: {
  obraId: string; u: UsuarioSessao; sp: Record<string, string | undefined>; base: string; inicioObra: string; semanaAtual: number; nSemanas: number;
}) {
  if (!temPermissao(u, "relatorios")) return <Aviso tom="alerta">Seu perfil não tem acesso aos relatórios semanais.</Aviso>;
  const podeCriar = temPermissao(u, "relatorios", "criar");
  const podeEmitir = temPermissao(u, "relatorios", "editar");
  const lista = await listarRelatorios(db, obraId);
  const sexta = (s: number) => somarDias(datasDaSemana(inicioObra, s).inicio, 4);

  if (sp.rel && /^[0-9a-f-]{36}$/.test(sp.rel)) {
    const c = await carregarRelatorio(db, u.empresaId, obraId, sp.rel).catch(() => null);
    if (!c) return <Aviso tom="alerta">Relatório não encontrado. <Link className="underline" href={`${base}&vista=relatorio`}>Voltar</Link></Aviso>;
    const r = c.relatorio;
    const rascunho = r.status === "RASCUNHO";
    const editavel = rascunho && podeCriar;
    const d = c.dados;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`${base}&vista=relatorio`} className="text-sm text-suave hover:text-texto">← Relatórios</Link>
          <h2 className="text-lg font-semibold">Relatório da semana {r.semana} · {formatarData(d.data)}</h2>
          <Selo tom={rascunho ? "amarelo" : "verde"}>{rascunho ? (r.versao ? `Em revisão (v${r.versao + 1})` : "Rascunho") : `Emitido · v${r.versao}`}</Selo>
          <div className="ml-auto flex flex-wrap gap-2">
            <LinkBotao href={`/api/relatorios/${r.id}/pdf`} target="_blank" variante={rascunho ? "secundario" : "primario"}>{rascunho ? "Ver prévia do PDF" : "Baixar PDF"}</LinkBotao>
            {rascunho && podeEmitir && (
              <AcaoConfirmada acao={emitirRelatorioAcao.bind(null, obraId, r.id)} variante="secundario"
                confirmacao={`Emitir o relatório da semana ${r.semana}? Os números (avanço, medições, contrato) ficam congelados nesta versão.`}>Emitir relatório</AcaoConfirmada>
            )}
            {!rascunho && podeEmitir && (
              <AcaoConfirmada acao={reabrirRelatorioAcao.bind(null, obraId, r.id)} variante="secundario" confirmacao="Reabrir para editar? Ao emitir de novo será gerada a versão seguinte.">Reabrir para editar</AcaoConfirmada>
            )}
            {rascunho && r.versao === 0 && temPermissao(u, "relatorios", "excluir") && (
              <AcaoConfirmada acao={excluirRelatorioAcao.bind(null, obraId, r.id)} confirmacao="Excluir este rascunho e suas fotos?">Excluir</AcaoConfirmada>
            )}
          </div>
        </div>
        {!rascunho && <Aviso tom="sucesso">Emitido em {r.emitidoEm!.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}. O PDF mostra os números congelados na emissão.</Aviso>}

        <div className="grid gap-5 lg:grid-cols-3">
          <Cartao titulo="Situação da obra (automático)">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-suave">Avanço realizado</dt><dd className="tabular font-semibold">{formatarPercentual(d.avanco.realizado)}</dd></div>
              <div className="flex justify-between"><dt className="text-suave">Previsto até a semana</dt><dd className="tabular">{formatarPercentual(d.avanco.previsto)}</dd></div>
              <div className="flex justify-between"><dt className="text-suave">Etapas no relatório</dt><dd>{d.avanco.etapas.length}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-suave">Rosca, evolução por tipo de serviço e curva de avanço vêm do <Link className="underline" href={`${base}&vista=realizado`}>Realizado físico</Link>.</p>
          </Cartao>
          <Cartao titulo="Relatório financeiro (automático)">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-suave">Contrato</dt><dd className="tabular">{formatarMoeda(d.contrato.contrato)}</dd></div>
              <div className="flex justify-between"><dt className="text-suave">Medições quitadas</dt><dd className="tabular">{formatarMoeda(d.contrato.quitadas)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>Saldo a pagar</dt><dd className="tabular">{formatarMoeda(d.contrato.saldo)}</dd></div>
              <div className="flex justify-between"><dt className="text-suave">Medições listadas</dt><dd>{d.medicoes.length}</dd></div>
            </dl>
            {!d.empresa.banco && !d.empresa.pix && <p className="mt-3 text-xs text-alerta">Cadastre banco/PIX em Configurações → Empresa para aparecerem em &quot;Informações para depósito&quot;.</p>}
          </Cartao>
          <Cartao titulo="Fotos">
            <p className="text-sm"><b>{c.fotos.length}</b> foto(s) · {Math.ceil(c.fotos.length / 6)} página(s) no PDF</p>
            <p className="mt-2 text-xs text-suave">Até 6 por página, em grade simétrica, todas no formato 4:3. A ordem abaixo é a do PDF.</p>
          </Cartao>
        </div>

        <Cartao titulo="Textos do relatório">
          {editavel ? (
            <Formulario acao={salvarTextosAcao.bind(null, obraId, r.id)}>
              <div className="grid gap-4 lg:grid-cols-2">
                <CampoArea nome="tarefasRealizadas" rotulo="Tarefas finalizadas e em andamento" rows={7} defaultValue={r.tarefasRealizadas} ajuda="Sugestão gerada pelo realizado da semana. Edite à vontade." />
                <CampoArea nome="tarefasProximaSemana" rotulo="Tarefas da próxima semana" rows={7} defaultValue={r.tarefasProximaSemana} ajuda="Sugestão gerada pelo previsto da próxima semana." />
                <CampoArea nome="anomalias" rotulo="Anomalias ou irregularidades observadas" rows={5} defaultValue={r.anomalias} ajuda="Ex.: cliente pedindo coisas diretamente aos prestadores, chuvas, materiais do cliente que faltaram, atrasos de terceiros, falta de projetos." />
                <CampoArea nome="acompanhamentoPrazo" rotulo="Acompanhamento do prazo" rows={5} defaultValue={r.acompanhamentoPrazo} ajuda="Ex.: obra será entregue para a marcenaria no dia XX/mês." />
              </div>
              <BotaoEnviar>Salvar textos</BotaoEnviar>
            </Formulario>
          ) : (
            <div className="grid gap-4 text-sm lg:grid-cols-2">
              {([["Tarefas finalizadas e em andamento", r.tarefasRealizadas], ["Tarefas da próxima semana", r.tarefasProximaSemana], ["Anomalias ou irregularidades observadas", r.anomalias], ["Acompanhamento do prazo", r.acompanhamentoPrazo]] as const).map(([t, v]) => (
                <div key={t}><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-suave">{t}</div><p className="whitespace-pre-line">{v || "—"}</p></div>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao titulo="Relatório fotográfico">
          <FotosRelatorio fotos={c.fotos} editavel={editavel}
            enviar={enviarFotoAcao.bind(null, obraId, r.id)} salvar={salvarFotoAcao.bind(null, obraId, r.id)}
            mover={moverFotoAcao.bind(null, obraId, r.id)} remover={removerFotoAcao.bind(null, obraId, r.id)} />
        </Cartao>
      </div>
    );
  }

  const existentes = new Set(lista.map((x) => x.r.semana));
  const opcoes = Array.from({ length: nSemanas }, (_, i) => i + 1).filter((s) => !existentes.has(s) && s <= semanaAtual + 1).reverse()
    .map((s) => ({ valor: String(s), rotulo: `Semana ${s} · sexta ${formatarData(sexta(s))}${s === semanaAtual ? " (atual)" : ""}` }));
  return (
    <div className="space-y-5">
      {podeCriar && (
        <Cartao titulo="Novo relatório semanal">
          {opcoes.length ? (
            <Formulario acao={criarRelatorioAcao.bind(null, obraId)}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64"><CampoSelecao nome="semana" rotulo="Semana" opcoes={opcoes} defaultValue={String(existentes.has(semanaAtual) ? opcoes[0]?.valor : semanaAtual)} /></div>
                <BotaoEnviar>Criar relatório</BotaoEnviar>
              </div>
              <p className="text-xs text-suave">Os textos de tarefas e prazo já vêm sugeridos a partir do realizado e do previsto da semana. Situação da obra e financeiro são preenchidos automaticamente.</p>
            </Formulario>
          ) : <p className="text-sm text-suave">Todas as semanas até a próxima já têm relatório.</p>}
        </Cartao>
      )}
      <Cartao titulo="Relatórios da obra" semPadding>
        {lista.length === 0 ? <Vazio titulo="Nenhum relatório ainda">Crie o relatório da semana para enviar ao cliente.</Vazio> : (
          <Tabela>
            <thead><tr><th>Semana</th><th>Data</th><th>Situação</th><th className="text-right">Fotos</th><th>Emitido em</th><th /></tr></thead>
            <tbody>
              {lista.map(({ r, fotos }) => (
                <tr key={r.id}>
                  <td className="font-semibold"><Link href={`${base}&vista=relatorio&rel=${r.id}`} className="hover:underline decoration-destaque decoration-2 underline-offset-4">Semana {r.semana}</Link></td>
                  <td className="tabular">{formatarData(sexta(r.semana))}</td>
                  <td><Selo tom={r.status === "EMITIDO" ? "verde" : "amarelo"}>{r.status === "EMITIDO" ? `Emitido · v${r.versao}` : r.versao ? `Em revisão (v${r.versao + 1})` : "Rascunho"}</Selo></td>
                  <td className="tabular text-right">{fotos}</td>
                  <td className="tabular">{r.emitidoEm ? r.emitidoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`${base}&vista=relatorio&rel=${r.id}`} className="mr-3 text-sm underline decoration-destaque decoration-2 underline-offset-4">Abrir</Link>
                    <a href={`/api/relatorios/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-sm underline decoration-destaque decoration-2 underline-offset-4">PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </div>
  );
}
