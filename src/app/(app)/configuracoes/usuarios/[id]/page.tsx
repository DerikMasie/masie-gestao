import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { obra, usuarioObra } from "@/db/schema";
import { exigirPermissaoPagina, temPermissao } from "@/lib/auth/atual";
import { listarPerfis, listarUsuarios } from "@/servicos/usuarios";
import { AcaoConfirmada, BotaoEnviar, Caixa, Campo, CampoSelecao, Formulario } from "@/componentes/formulario";
import { CabecalhoPagina, Cartao } from "@/componentes/ui";
import { editarUsuarioAcao, redefinirSenhaAcao } from "../../acoes";

export const metadata = { title: "Usuário" };

export default async function EditarUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await exigirPermissaoPagina("usuarios");
  const [usuarios, perfis] = await Promise.all([listarUsuarios(db, u.empresaId), listarPerfis(db, u.empresaId)]);
  const x = usuarios.find((y) => y.id === id);
  if (!x) notFound();
  const obras = await db.select({ id: obra.id, codigo: obra.codigo, nome: obra.nome, papel: usuarioObra.papel }).from(usuarioObra)
    .innerJoin(obra, eq(obra.id, usuarioObra.obraId)).where(and(eq(usuarioObra.usuarioId, id), isNull(obra.excluidoEm)));
  const editar = temPermissao(u, "usuarios", "editar");
  const perfil = perfis.find((p) => p.id === x.perfilId);
  return (
    <div className="max-w-3xl space-y-6">
      <CabecalhoPagina titulo={x.nome} subtitulo={x.email} voltar={{ href: "/configuracoes/usuarios", rotulo: "Usuários" }}
        acoes={editar && <AcaoConfirmada acao={redefinirSenhaAcao.bind(null, id)} confirmacao={`Gerar nova senha provisória para ${x.nome}? As sessões abertas serão encerradas.`} variante="secundario">Redefinir senha</AcaoConfirmada>} />
      <Cartao>
        <Formulario acao={editarUsuarioAcao.bind(null, id)}>
          <fieldset disabled={!editar} className="grid gap-4 sm:grid-cols-2">
            <Campo nome="nome" rotulo="Nome" obrigatorio defaultValue={x.nome} />
            <Campo nome="email" rotulo="E-mail" type="email" obrigatorio defaultValue={x.email} />
            <CampoSelecao nome="perfilId" rotulo="Perfil" obrigatorio defaultValue={x.perfilId} opcoes={perfis.map((p) => ({ valor: p.id, rotulo: p.nome }))} />
            <Campo nome="cargo" rotulo="Cargo" defaultValue={x.cargo ?? ""} />
            <Campo nome="telefone" rotulo="Telefone" defaultValue={x.telefone ?? ""} />
            <div className="flex items-end pb-2"><Caixa nome="ativo" rotulo="Usuário ativo (inativar encerra as sessões)" defaultChecked={x.ativo} /></div>
          </fieldset>
          {editar && <BotaoEnviar>Salvar</BotaoEnviar>}
        </Formulario>
      </Cartao>
      <Cartao titulo="Acesso às obras">
        {perfil?.acessoTodasObras
          ? <p className="text-sm">O perfil <b>{perfil.nome}</b> tem acesso a todas as obras.</p>
          : obras.length === 0
            ? <p className="text-sm text-suave">Sem obras vinculadas. Vincule pela aba “Equipe e acesso” de cada obra.</p>
            : <ul className="space-y-1 text-sm">{obras.map((o) => <li key={o.id}><Link href={`/obras/${o.id}?aba=equipe`} className="text-texto underline-offset-4 hover:underline decoration-destaque decoration-2">{o.codigo} · {o.nome}</Link> <span className="text-suave">— {o.papel}</span></li>)}</ul>}
      </Cartao>
    </div>
  );
}
