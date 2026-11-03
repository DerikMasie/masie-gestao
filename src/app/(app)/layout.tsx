import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { pode, type Modulo } from "@/dominio/permissoes";
import { exigirUsuario } from "@/lib/auth/atual";
import { obterEmpresa } from "@/servicos/cadastros";
import { MenuLateral, type ItemMenu } from "@/componentes/menu-lateral";
import { sair } from "../login/acoes";

const MENU: (ItemMenu & { modulo: Modulo })[] = [
  { href: "/", rotulo: "Dashboard", icone: "LayoutDashboard", modulo: "dashboard" },
  { href: "/obras", rotulo: "Obras", icone: "HardHat", modulo: "obras", grupo: "Operação" },
  { href: "/quadros", rotulo: "Quadros", icone: "KanbanSquare", modulo: "quadro", grupo: "Escritório" },
  { href: "/quadros/calendario", rotulo: "Calendário", icone: "CalendarDays", modulo: "quadro", grupo: "Escritório" },
  { href: "/clientes", rotulo: "Clientes", icone: "UserRound", modulo: "clientes", grupo: "Cadastros" },
  { href: "/fornecedores", rotulo: "Fornecedores", icone: "Truck", modulo: "fornecedores", grupo: "Cadastros" },
  { href: "/configuracoes/empresa", rotulo: "Empresa", icone: "Building2", modulo: "configuracoes", grupo: "Administração" },
  { href: "/configuracoes/etapas", rotulo: "Etapas padrão", icone: "ClipboardList", modulo: "configuracoes", grupo: "Administração" },
  { href: "/configuracoes/usuarios", rotulo: "Usuários", icone: "Users", modulo: "usuarios", grupo: "Administração" },
  { href: "/configuracoes/perfis", rotulo: "Perfis e permissões", icone: "ShieldCheck", modulo: "usuarios", grupo: "Administração" },
  { href: "/auditoria", rotulo: "Auditoria", icone: "Settings", modulo: "auditoria", grupo: "Administração" },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const caminho = (await headers()).get("x-caminho") ?? "";
  if (u.deveTrocarSenha && caminho !== "/conta/senha") redirect("/conta/senha");
  const empresa = await obterEmpresa(db, u.empresaId);
  const itens = MENU.filter((m) => pode(u.perfil.permissoes, m.modulo)).map(({ modulo: _m, ...i }) => i);

  return (
    <div style={{ ["--marca" as string]: empresa?.corPrimaria ?? "#111111" }} className="min-h-screen">
      <MenuLateral itens={itens} usuario={u.nome} perfil={u.perfil.nome} sair={sair} />
      <main className="min-w-0 overflow-x-clip lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
