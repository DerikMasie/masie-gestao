import { db } from "@/db";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarEtapasPadrao } from "@/servicos/cadastros";
import { BotaoEnviar, Caixa, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { salvarEtapaAcao } from "../acoes";

export const metadata = { title: "Etapas padrão" };

const TIPOS = [["CONTRATO", "Contrato"], ["ADITIVO", "Aditivo"], ["FATURAMENTO_DIRETO", "Faturamento direto"]] as const;
const inp = "rounded-lg border border-borda px-2 py-1.5 text-sm";

function Linha({ e, editar }: { e?: { id: string; ordem: number; nome: string; tipo: string; ativo: boolean }; editar: boolean }) {
  return (
    <Formulario acao={salvarEtapaAcao.bind(null, e?.id ?? null)} limparAoSalvar={!e} className="!space-y-1 border-t border-borda px-4 py-2 first:border-t-0">
      <fieldset disabled={!editar} className="flex flex-wrap items-center gap-2">
        <input name="ordem" type="number" min={1} defaultValue={e?.ordem} placeholder="Ordem" className={`${inp} w-20`} aria-label="Ordem" required />
        <input name="nome" defaultValue={e?.nome} placeholder="Nome da nova etapa" className={`${inp} min-w-48 flex-1`} aria-label="Nome" required />
        <select name="tipo" defaultValue={e?.tipo ?? "CONTRATO"} className={inp} aria-label="Tipo">{TIPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
        <Caixa nome="ativo" rotulo="Ativa" defaultChecked={e?.ativo ?? true} />
        {editar && <BotaoEnviar variante={e ? "secundario" : "primario"}>{e ? "Salvar" : "Adicionar"}</BotaoEnviar>}
      </fieldset>
    </Formulario>
  );
}

export default async function PaginaEtapas() {
  const u = await exigirPermissaoPagina("configuracoes");
  const etapas = await listarEtapasPadrao(db, u.empresaId);
  const editar = temPermissao(u, "configuracoes", "editar");
  return (
    <div className="max-w-4xl">
      <CabecalhoPagina titulo="Etapas padrão (EAP)" subtitulo="Copiadas para cada nova obra no momento do cadastro. Alterações aqui não mudam obras já criadas." />
      <Cartao semPadding>
        {etapas.map((e) => <Linha key={e.id} e={e} editar={editar} />)}
      </Cartao>
      {editar && <Cartao titulo="Nova etapa" className="mt-6" semPadding><Linha editar /></Cartao>}
    </div>
  );
}
