import { exigirUsuario } from "@/lib/auth/atual";
import { Aviso, CabecalhoPagina, Cartao } from "@/componentes/ui";
import { BotaoEnviar, Campo, Formulario } from "@/componentes/formulario";
import { trocarSenha } from "./acoes";

export const metadata = { title: "Alterar senha" };

export default async function PaginaSenha() {
  const u = await exigirUsuario();
  return (
    <div className="max-w-lg">
      <CabecalhoPagina titulo="Alterar senha" subtitulo={u.email} />
      {u.deveTrocarSenha && <div className="mb-4"><Aviso tom="alerta">Por segurança, defina uma nova senha antes de continuar.</Aviso></div>}
      <Cartao>
        <Formulario acao={trocarSenha}>
          <Campo nome="senhaAtual" rotulo="Senha atual" type="password" autoComplete="current-password" required />
          <Campo nome="novaSenha" rotulo="Nova senha" type="password" autoComplete="new-password" required ajuda="Mínimo de 8 caracteres, com letras e números." />
          <Campo nome="confirmacao" rotulo="Confirme a nova senha" type="password" autoComplete="new-password" required />
          <BotaoEnviar>Salvar nova senha</BotaoEnviar>
        </Formulario>
      </Cartao>
    </div>
  );
}
