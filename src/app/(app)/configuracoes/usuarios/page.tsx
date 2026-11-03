import Link from "next/link";
import { db } from "@/db";
import { formatarData } from "@/dominio/formato";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarPerfis, listarUsuarios } from "@/servicos/usuarios";
import { BotaoEnviar, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { Aviso, CabecalhoPagina, Cartao, Selo, Tabela } from "@/componentes/ui";
import { criarUsuarioAcao } from "../acoes";

export const metadata = { title: "Usuários" };

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirPermissaoPagina("usuarios");
  const { salvo } = await searchParams;
  const [usuarios, perfis] = await Promise.all([listarUsuarios(db, u.empresaId), listarPerfis(db, u.empresaId)]);
  const criar = temPermissao(u, "usuarios", "criar");
  return (
    <>
      <CabecalhoPagina titulo="Usuários" subtitulo={`${usuarios.filter((x) => x.ativo).length} ativo(s) de ${usuarios.length}`} />
      {salvo && <div className="mb-4"><Aviso tom="sucesso">Usuário atualizado.</Aviso></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao semPadding className="lg:col-span-2">
          <Tabela>
            <thead><tr><th>Nome</th><th>Perfil</th><th>Último acesso</th><th>Situação</th></tr></thead>
            <tbody>
              {usuarios.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/configuracoes/usuarios/${x.id}`} className="font-medium text-texto underline-offset-4 hover:underline decoration-destaque decoration-2">{x.nome}</Link><div className="text-xs text-suave">{x.email}{x.cargo ? ` · ${x.cargo}` : ""}</div></td>
                  <td>{x.perfilNome}</td>
                  <td className="whitespace-nowrap text-suave">{x.ultimoLoginEm ? formatarData(x.ultimoLoginEm) : "Nunca"}</td>
                  <td>{x.ativo ? <Selo tom="verde">Ativo</Selo> : <Selo tom="vermelho">Inativo</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
        {criar && (
          <Cartao titulo="Novo usuário">
            <Formulario acao={criarUsuarioAcao} limparAoSalvar>
              <Campo nome="nome" rotulo="Nome" obrigatorio />
              <Campo nome="email" rotulo="E-mail" type="email" obrigatorio />
              <CampoSelecao nome="perfilId" rotulo="Perfil" obrigatorio vazio="Selecione…" opcoes={perfis.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
              <Campo nome="cargo" rotulo="Cargo" placeholder="Engenheiro, estagiário…" />
              <BotaoEnviar>Criar e gerar senha provisória</BotaoEnviar>
            </Formulario>
          </Cartao>
        )}
      </div>
    </>
  );
}
