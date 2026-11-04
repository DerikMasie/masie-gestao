"use client";

import { useEffect, useState } from "react";
import { lerNFe, type DadosNFe } from "@/lib/nfe";
import { formatarMoeda } from "@/dominio/formato";
import { lerNumero } from "@/dominio/formato";
import type { EstadoForm } from "@/lib/acoes";
import { Aviso } from "./ui";
import { BotaoEnviar, Caixa, Campo, CampoArea, CampoSelecao, CampoSelecaoAgrupada, Formulario } from "./formulario";

type Op = { valor: string; rotulo: string };
interface Props {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  fornecedores: (Op & { documento: string | null })[];
  centros: (Op & { obraId: string | null })[];
  etapasPorObra: Record<string, Op[]>;
  gruposPlano: { rotulo: string; opcoes: Op[] }[];
  contas: Op[];
  hoje: string;
  buscarFornecedor: (doc: string) => Promise<{ id: string; nome: string } | null>;
  verba: (centroId: string, etapaId: string) => Promise<{ orcado: number; incorrido: number; saldo: number; temBase: boolean } | null>;
}

export function FormNota(p: Props) {
  const [xml, setXml] = useState<{ texto: string; dados: DadosNFe } | null>(null);
  const [erroXml, setErroXml] = useState<string | null>(null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState<{ documento: string; nome: string } | null>(null);
  const [centro, setCentro] = useState("");
  const [etapa, setEtapa] = useState("");
  const [tipo, setTipo] = useState("A_PRAZO");
  const [valor, setValor] = useState("");
  const [verba, setVerba] = useState<Awaited<ReturnType<Props["verba"]>>>(null);
  const [chave, setChave] = useState(0); // remonta campos ao carregar um XML

  const obraId = p.centros.find((c) => c.valor === centro)?.obraId ?? null;
  const etapas = obraId ? p.etapasPorObra[obraId] ?? [] : [];
  useEffect(() => {
    setVerba(null);
    if (centro && etapa) p.verba(centro, etapa).then(setVerba).catch(() => setVerba(null));
  }, [centro, etapa]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarXml(f: File | undefined) {
    setErroXml(null);
    if (!f) return;
    try {
      const texto = await f.text();
      const dados = lerNFe(texto);
      setXml({ texto, dados });
      setValor(dados.valorTotal.toFixed(2).replace(".", ","));
      setTipo(dados.duplicatas.length > 1 || (dados.duplicatas[0] && dados.duplicatas[0].vencimento > dados.emissao) ? "A_PRAZO" : "A_VISTA");
      const f2 = await p.buscarFornecedor(dados.emitente.documento);
      if (f2) { setFornecedorId(f2.id); setNovoFornecedor(null); } else { setFornecedorId(""); setNovoFornecedor({ documento: dados.emitente.documento, nome: dados.emitente.fantasia || dados.emitente.nome }); }
      setChave((k) => k + 1);
    } catch (e) {
      setXml(null);
      setErroXml((e as Error).message);
    }
  }

  const v = lerNumero(valor) ?? 0;
  const excede = verba && tipo !== "DEVOLUCAO" && verba.temBase && v > 0 && v > verba.saldo;
  const d = xml?.dados;
  const dup = d?.duplicatas ?? [];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-zinc-400 bg-white p-4">
        <label className="block text-sm font-medium" htmlFor="xmlNfe">Importar XML da NF-e (opcional)</label>
        <input id="xmlNfe" type="file" accept=".xml,text/xml" className="mt-1 block text-sm" onChange={(e) => carregarXml(e.target.files?.[0])} />
        <p className="mt-1 text-xs text-suave">Os dados são lidos e preenchidos abaixo para conferência; nada é gravado até você confirmar.</p>
        {erroXml && <p role="alert" className="mt-2 text-sm text-perigo">{erroXml}</p>}
        {d && (
          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm">
            <p><b>NF {d.numero}/{d.serie}</b> de {d.emissao.split("-").reverse().join("/")} · {d.emitente.nome} ({d.emitente.documento}) · <b>{formatarMoeda(d.valorTotal)}</b></p>
            <p className="text-xs text-suave">{d.itens.length} item(ns): {d.itens.slice(0, 4).map((i) => i.descricao).join("; ")}{d.itens.length > 4 ? "…" : ""}{dup.length ? ` · ${dup.length} duplicata(s)` : ""}</p>
          </div>
        )}
      </div>

      <Formulario acao={p.acao} key={chave}>
        {xml && <input type="hidden" name="xml" value={xml.texto} />}
        {novoFornecedor && <><input type="hidden" name="emitenteDocumento" value={novoFornecedor.documento} /><input type="hidden" name="emitenteNome" value={novoFornecedor.nome} /></>}
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            {novoFornecedor
              ? <div className="text-sm"><p className="mb-1 font-medium">Fornecedor</p><p className="rounded-lg border border-borda bg-destaque-suave px-3 py-2">{novoFornecedor.nome} · {novoFornecedor.documento} <span className="block text-xs text-destaque-texto">Não cadastrado: será criado ao salvar.</span></p></div>
              : <CampoSelecao nome="fornecedorId" rotulo="Fornecedor" obrigatorio vazio="Selecione…" opcoes={p.fornecedores} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} />}
          </div>
          <div className="sm:col-span-2"><Campo nome="numero" rotulo="Número da NF" obrigatorio defaultValue={d?.numero} /></div>
          <div className="sm:col-span-1"><Campo nome="serie" rotulo="Série" defaultValue={d?.serie ?? "1"} /></div>
          <div className="sm:col-span-2"><Campo nome="emissao" rotulo="Emissão (competência)" type="date" obrigatorio defaultValue={d?.emissao ?? p.hoje} /></div>
          <div className="sm:col-span-2"><CampoSelecao nome="tipo" rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} opcoes={[
            { valor: "A_PRAZO", rotulo: "A prazo" }, { valor: "A_VISTA", rotulo: "À vista / débito" }, { valor: "ACUMULADA", rotulo: "Acumulada" }, { valor: "DEVOLUCAO", rotulo: "Devolução (abate a verba)" },
          ]} /></div>
          <div className="sm:col-span-2"><Campo nome="valorTotal" rotulo="Valor total (R$)" obrigatorio inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div className="sm:col-span-6"><Campo nome="chaveNfe" rotulo="Chave de acesso (44 dígitos)" defaultValue={d?.chave} inputMode="numeric" ajuda="Evita lançar a mesma nota duas vezes." /></div>
        </div>

        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3"><CampoSelecao nome="centroCustoId" rotulo="Obra / centro de custo" obrigatorio vazio="Selecione…" opcoes={p.centros} value={centro} onChange={(e) => { setCentro(e.target.value); setEtapa(""); }} ajuda="Confira o endereço de entrega da nota." /></div>
          <div className="sm:col-span-3"><CampoSelecao nome="obraEtapaId" rotulo="Etapa (verba)" vazio={obraId ? "Pelo de-para da classificação" : "Não se aplica"} disabled={!obraId} opcoes={etapas} value={etapa} onChange={(e) => setEtapa(e.target.value)} /></div>
          <div className="sm:col-span-6"><CampoSelecaoAgrupada nome="planoContaId" rotulo="Classificação" obrigatorio vazio="Selecione…" grupos={p.gruposPlano} ajuda="De acordo com o tipo dos itens da nota (ex.: Custos de material › Elétrico)." /></div>
        </div>
        {verba && (
          excede
            ? <Aviso tom="perigo"><b>Esta compra ultrapassa a verba da etapa</b> em {formatarMoeda(v - verba.saldo)} (orçado {formatarMoeda(verba.orcado)}, já incorrido {formatarMoeda(verba.incorrido)}). Você pode gravar mesmo assim; o estouro aparecerá no controle da obra.</Aviso>
            : <Aviso tom={verba.temBase ? "info" : "alerta"}>{verba.temBase ? <>Verba da etapa: orçado {formatarMoeda(verba.orcado)} · incorrido {formatarMoeda(verba.incorrido)} · <b>saldo {formatarMoeda(verba.saldo)}</b>{v > 0 && <> · após esta nota: {formatarMoeda(verba.saldo - (tipo === "DEVOLUCAO" ? -v : v))}</>}</> : "A obra ainda não tem orçamento-base: a compra ficará como “valor não planejado”."}</Aviso>
        )}

        {tipo === "A_PRAZO" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo nome="parcelas" rotulo="Parcelas" type="number" min={1} max={60} defaultValue={String(dup.length || 1)} />
            <Campo nome="primeiroVencimento" rotulo="1º vencimento" type="date" defaultValue={dup[0]?.vencimento ?? p.hoje} />
            <Campo nome="intervaloDias" rotulo="Intervalo (dias)" type="number" min={1} defaultValue="30" />
          </div>
        )}
        {(tipo === "A_VISTA" || tipo === "ACUMULADA") && (
          <div className="grid gap-4 sm:grid-cols-2">
            {tipo === "ACUMULADA" && <Campo nome="primeiroVencimento" rotulo="Vencimento" type="date" defaultValue={dup[0]?.vencimento ?? p.hoje} />}
            {tipo === "A_VISTA" && <CampoSelecao nome="pagaNaConta" rotulo="Já paga? Baixar na conta" vazio="Não — registrar como a pagar" opcoes={p.contas} />}
          </div>
        )}
        <CampoArea nome="descricao" rotulo="Descrição / observação" rows={2} />
        <Caixa nome="faturadoAoCliente" rotulo="Faturada em nome do cliente (faturamento direto): abate o saldo do cliente e não é custo da Masie" />
        <BotaoEnviar>Lançar nota fiscal</BotaoEnviar>
      </Formulario>
    </div>
  );
}
