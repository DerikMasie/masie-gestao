import Link from "next/link";
import { ACOES, ACOES_POR_MODULO, MODULOS, TODAS_ACOES, TODOS_MODULOS, type MatrizPermissoes } from "@/dominio/permissoes";
import type { EstadoForm } from "@/lib/acoes";
import { BotaoEnviar, Caixa, Campo, Formulario } from "@/componentes/formulario";
import { Cartao, Tabela } from "@/componentes/ui";

export function FormPerfil({ acao, perfil, bloqueado }: {
  acao: (e: EstadoForm, fd: FormData) => Promise<EstadoForm>;
  perfil?: { nome: string; descricao: string | null; acessoTodasObras: boolean; permissoes: MatrizPermissoes; sistema: boolean };
  bloqueado?: boolean;
}) {
  return (
    <Formulario acao={acao}>
      <fieldset disabled={bloqueado} className="space-y-4">
        <Cartao>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo nome="nome" rotulo="Nome do perfil" obrigatorio defaultValue={perfil?.nome} readOnly={perfil?.sistema} ajuda={perfil?.sistema ? "Perfis padrão não podem ser renomeados." : undefined} />
            <Campo nome="descricao" rotulo="Descrição" defaultValue={perfil?.descricao ?? ""} />
          </div>
          <div className="mt-4"><Caixa nome="acessoTodasObras" rotulo="Acesso a todas as obras (sem precisar de vínculo)" defaultChecked={perfil?.acessoTodasObras} /></div>
        </Cartao>
        <Cartao titulo="Permissões por módulo" semPadding>
          <Tabela>
            <thead><tr><th>Módulo</th>{TODAS_ACOES.map((a) => <th key={a} className="text-center">{ACOES[a]}</th>)}</tr></thead>
            <tbody>
              {TODOS_MODULOS.map((m) => (
                <tr key={m}>
                  <td className="font-medium">{MODULOS[m]}</td>
                  {TODAS_ACOES.map((a) => (
                    <td key={a} className="text-center">
                      {ACOES_POR_MODULO[m].includes(a)
                        ? <input type="checkbox" name={`perm_${m}`} value={a} defaultChecked={perfil?.permissoes[m]?.includes(a)} aria-label={`${MODULOS[m]}: ${ACOES[a]}`} className="size-4 accent-[var(--marca)]" />
                        : <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Tabela>
          <p className="border-t border-borda px-5 py-3 text-xs text-suave">Qualquer ação marcada inclui automaticamente “Ver”. Módulos das fases seguintes já podem ser configurados e passam a valer quando forem liberados.</p>
        </Cartao>
      </fieldset>
      <div className="flex gap-2">
        {!bloqueado && <BotaoEnviar>Salvar perfil</BotaoEnviar>}
        <Link href="/configuracoes/perfis" className="rounded-lg px-4 py-2 text-sm font-medium text-suave hover:bg-slate-100">Voltar</Link>
      </div>
    </Formulario>
  );
}
