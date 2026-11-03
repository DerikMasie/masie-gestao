import Link from "next/link";
import type { obra as tabelaObra } from "@/db/schema";
import { SITUACOES_OBRA } from "@/dominio/obra";
import { BotaoEnviar, Campo, CampoArea, CampoSelecao, Formulario } from "@/componentes/formulario";
import type { EstadoForm } from "@/lib/acoes";
import { Cartao } from "@/componentes/ui";

type Obra = typeof tabelaObra.$inferSelect;

const pctParaTela = (v: string | null | undefined) => (v == null ? "" : String(Number((Number(v) * 100).toFixed(2))).replace(".", ","));
const dinheiroParaTela = (v: string | null | undefined) => (v == null || Number(v) === 0 ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

export function FormObra({ acao, obra, clientes, usuarios, cancelar }: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  obra?: Obra;
  clientes: { id: string; nome: string }[];
  usuarios: { id: string; nome: string }[];
  cancelar: string;
}) {
  const opUsuarios = usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }));
  return (
    <Formulario acao={acao}>
      <Cartao titulo="Identificação">
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2"><Campo nome="codigo" rotulo="Código da obra" defaultValue={obra?.codigo} placeholder="Automático (ex.: 2026-0007)" ajuda={obra ? "Alterar o código também renomeia o centro de custo." : "Deixe em branco para gerar no padrão AAAA-NNNN."} /></div>
          <div className="sm:col-span-4"><Campo nome="nome" rotulo="Nome da obra" obrigatorio defaultValue={obra?.nome} /></div>
          <div className="sm:col-span-3">
            <CampoSelecao nome="clienteId" rotulo="Cliente" obrigatorio vazio="Selecione…" defaultValue={obra?.clienteId}
              opcoes={clientes.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              ajuda={<>Não encontrou? <Link href="/clientes/novo" className="text-marca underline" target="_blank">Cadastre o cliente</Link> e recarregue.</>} />
          </div>
          <div className="sm:col-span-3"><Campo nome="tipoObra" rotulo="Tipo de obra" defaultValue={obra?.tipoObra ?? ""} placeholder="Reforma comercial, residencial…" list="tipos-obra" /></div>
          <datalist id="tipos-obra">
            {["Reforma residencial", "Reforma comercial", "Construção residencial", "Construção comercial", "Retrofit", "Interiores corporativos"].map((t) => <option key={t} value={t} />)}
          </datalist>
          <div className="sm:col-span-4"><Campo nome="endereco" rotulo="Endereço" defaultValue={obra?.endereco ?? ""} /></div>
          <div className="sm:col-span-1"><Campo nome="cidade" rotulo="Cidade" defaultValue={obra?.cidade ?? ""} /></div>
          <div className="sm:col-span-1"><Campo nome="uf" rotulo="UF" maxLength={2} defaultValue={obra?.uf ?? ""} /></div>
          <div className="sm:col-span-3"><CampoSelecao nome="responsavelTecnicoId" rotulo="Responsável técnico" vazio="—" defaultValue={obra?.responsavelTecnicoId ?? ""} opcoes={opUsuarios} /></div>
          <div className="sm:col-span-3"><CampoSelecao nome="gestorId" rotulo="Gestor responsável" vazio="—" defaultValue={obra?.gestorId ?? ""} opcoes={opUsuarios} /></div>
        </div>
      </Cartao>

      <Cartao titulo="Prazo e situação">
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo nome="dataInicio" rotulo="Início" type="date" obrigatorio defaultValue={obra?.dataInicio} />
          <Campo nome="dataFimContratual" rotulo="Término contratual" type="date" obrigatorio defaultValue={obra?.dataFimContratual} />
          <CampoSelecao nome="situacao" rotulo="Situação" defaultValue={obra?.situacao ?? "EM_ORCAMENTO"} opcoes={Object.entries(SITUACOES_OBRA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
          <Campo nome="dataConclusao" rotulo="Data de conclusão" type="date" defaultValue={obra?.dataConclusao ?? ""} ajuda="Obrigatória se concluída." />
        </div>
      </Cartao>

      <Cartao titulo="Contrato">
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo nome="valorContratoOriginal" rotulo="Valor original do contrato (R$)" inputMode="decimal" defaultValue={dinheiroParaTela(obra?.valorContratoOriginal)} placeholder="0,00" />
          <Campo nome="percentualEntrada" rotulo="Entrada (%)" inputMode="decimal" defaultValue={pctParaTela(obra?.percentualEntrada)} placeholder="20" ajuda="Abatida proporcionalmente de cada medição do contrato." />
          <Campo nome="orcamentoCustoAprovado" rotulo="Orçamento de custos aprovado (R$)" inputMode="decimal" defaultValue={dinheiroParaTela(obra?.orcamentoCustoAprovado)} placeholder="0,00" ajuda="Na Fase 3 passa a vir do orçamento-base." />
          <Campo nome="margemPrevista" rotulo="Margem prevista (%)" inputMode="decimal" defaultValue={pctParaTela(obra?.margemPrevista)} ajuda="Em branco: calculada por contrato × custo." />
        </div>
        <p className="mt-3 text-xs text-suave">O valor atualizado com aditivos será calculado automaticamente quando o módulo de aditivos (Fase 4) estiver ativo; o contrato original nunca é sobrescrito.</p>
      </Cartao>

      <Cartao titulo="Observações">
        <CampoArea nome="observacoes" rotulo="Observações gerais" defaultValue={obra?.observacoes ?? ""} rows={4} />
      </Cartao>

      <div className="flex gap-2">
        <BotaoEnviar>{obra ? "Salvar alterações" : "Cadastrar obra e gerar estrutura"}</BotaoEnviar>
        <Link href={cancelar} className="rounded-lg px-4 py-2 text-sm font-medium text-suave hover:bg-slate-100">Cancelar</Link>
      </div>
    </Formulario>
  );
}
