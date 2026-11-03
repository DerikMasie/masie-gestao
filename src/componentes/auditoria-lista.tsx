import { formatarData } from "@/dominio/formato";
import { Selo, type Tom } from "./ui";

const ROTULO_ACAO: Record<string, [string, Tom]> = {
  CRIAR: ["Criação", "verde"], EDITAR: ["Edição", "azul"], EXCLUIR: ["Exclusão", "vermelho"], RESTAURAR: ["Restauração", "verde"],
  LOGIN: ["Login", "cinza"], LOGIN_FALHOU: ["Login falhou", "amarelo"], LOGOUT: ["Logout", "cinza"], TROCAR_SENHA: ["Senha", "roxo"],
  VER_DADOS_SENSIVEIS: ["Dados sensíveis", "amarelo"], ANEXAR: ["Anexo", "azul"], REMOVER_ANEXO: ["Anexo removido", "vermelho"],
  GERAR_ESTRUTURA: ["Estrutura gerada", "roxo"],
};

const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome", codigo: "Código", situacao: "Situação", dataInicio: "Início", dataFimContratual: "Término contratual",
  dataConclusao: "Conclusão", valorContratoOriginal: "Valor do contrato", percentualEntrada: "% entrada",
  orcamentoCustoAprovado: "Orçamento de custos", margemPrevista: "Margem prevista", clienteId: "Cliente",
  gestorId: "Gestor", responsavelTecnicoId: "Responsável técnico", perfilId: "Perfil", ativo: "Ativo", permissoes: "Permissões",
};

function valor(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 200);
  return String(v).slice(0, 200);
}

export interface LinhaAuditoria {
  id: number; acao: string; entidade: string; descricao: string | null; antes: unknown; depois: unknown;
  criadoEm: Date; usuarioNome: string | null; ip?: string | null;
}

export function AuditoriaLista({ linhas, mostrarEntidade }: { linhas: LinhaAuditoria[]; mostrarEntidade?: boolean }) {
  if (!linhas.length) return <p className="p-5 text-sm text-suave">Nenhum registro.</p>;
  return (
    <ol className="divide-y divide-borda">
      {linhas.map((l) => {
        const [rotulo, tom] = ROTULO_ACAO[l.acao] ?? [l.acao, "cinza" as Tom];
        const mudou = l.acao === "EDITAR" && l.depois && typeof l.depois === "object" ? Object.keys(l.depois as object) : [];
        return (
          <li key={l.id} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Selo tom={tom}>{rotulo}</Selo>
              {mostrarEntidade && <span className="text-xs uppercase tracking-wide text-suave">{l.entidade}</span>}
              <span className="font-medium">{l.usuarioNome ?? "Sistema"}</span>
              <span className="text-xs text-suave">{formatarData(l.criadoEm)}{l.ip ? ` · ${l.ip}` : ""}</span>
            </div>
            {l.descricao && <p className="mt-1 text-suave">{l.descricao}</p>}
            {mudou.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {mudou.map((c) => (
                  <li key={c}>
                    <span className="font-medium">{ROTULO_CAMPO[c] ?? c}:</span>{" "}
                    <span className="text-perigo line-through">{valor((l.antes as Record<string, unknown>)?.[c])}</span>{" → "}
                    <span className="text-sucesso">{valor((l.depois as Record<string, unknown>)[c])}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
