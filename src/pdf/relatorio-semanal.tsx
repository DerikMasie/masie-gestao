import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Circle, Document, G, Image, Line, Page, Path, Polyline, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { paginarFotos } from "@/dominio/relatorio";
import type { DadosRelatorio, TextosRelatorio } from "@/servicos/relatorios";

/**
 * PDF do relatório semanal (A4 retrato). Layout do modelo "Relatório Situação" da planilha, nas cores da Masie:
 * preto, cinza-claro e amarelo leve. Fonte Helvetica (embutida no leitor de PDF); por isso os textos usam "-"
 * comum no lugar do sinal de menos tipográfico.
 */

const PRETO = "#161616";
const CINZA = "#6b6b6b";
const CINZA_CLARO = "#ececea";
const BORDA = "#d9d9d6";
const AMARELO = "#f2d468";
const AMARELO_SUAVE = "#fbf3d3";

const s = StyleSheet.create({
  pagina: { paddingTop: 32, paddingBottom: 44, paddingHorizontal: 36, fontFamily: "Helvetica", fontSize: 9, color: PRETO },
  cab: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  titulo: { fontSize: 20, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  faixa: { flexDirection: "row", alignItems: "center", backgroundColor: PRETO, marginHorizontal: -36, paddingHorizontal: 36, paddingVertical: 6, marginBottom: 12 },
  faixaTexto: { color: "#ffffff", fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 1.2 },
  faixaMarca: { width: 4, height: 14, backgroundColor: AMARELO, marginRight: 8 },
  secao: { backgroundColor: AMARELO_SUAVE, paddingHorizontal: 8, paddingVertical: 3.5, marginTop: 8, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: AMARELO },
  secaoTitulo: { fontSize: 9.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.6 },
  texto: { fontSize: 8.8, lineHeight: 1.35, paddingHorizontal: 2 },
  suave: { color: CINZA },
  subtitulo: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: CINZA, letterSpacing: 0.8, marginBottom: 6 },
  rodape: { position: "absolute", bottom: 18, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: CINZA, borderTopWidth: 0.5, borderTopColor: BORDA, paddingTop: 5 },
  linhaTab: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDA, paddingVertical: 3.5 },
  cabTab: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: PRETO, paddingBottom: 3, marginBottom: 1 },
});

const moeda = (v: number | null | undefined) => (v == null ? "-" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/−/g, "-").replace(/\s/g, " "));
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("pt-BR")}%`;
const br = (iso: string) => iso.split("-").reverse().join("/");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const limpar = (t: string) => t.replace(/−/g, "-");

let logoCache: Buffer | null = null;
function logo() {
  if (!logoCache) logoCache = readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "public", "logo-masie.png"));
  return logoCache;
}

function Faixa({ children }: { children: ReactNode }) {
  return <View style={s.faixa}><View style={s.faixaMarca} /><Text style={s.faixaTexto}>{children}</Text></View>;
}

function Rodape({ d, versao }: { d: DadosRelatorio; versao: string }) {
  return (
    <View style={s.rodape} fixed>
      <Text>{d.empresa.nome} · {d.obra.codigo} · Relatório semanal - semana {d.semana} · {versao}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Cabecalho({ d }: { d: DadosRelatorio }) {
  return (
    <View style={s.cab}>
      <View style={{ maxWidth: 380 }}>
        <Text style={s.titulo}>RELATÓRIO SEMANAL</Text>
        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 6 }}>{d.obra.cliente}</Text>
        <Text style={{ marginTop: 2 }}>{d.obra.codigo} · {d.obra.nome}</Text>
        {d.obra.endereco ? <Text style={[s.suave, { marginTop: 1 }]}>{d.obra.endereco}</Text> : null}
        <Text style={[s.suave, { marginTop: 3 }]}>Semana {d.semana} · {br(d.data)}</Text>
      </View>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={logo()} style={{ width: 66, height: 56 }} />
    </View>
  );
}

/** Rosca de progresso. */
function Rosca({ valor, tamanho = 104 }: { valor: number; tamanho?: number }) {
  const v = Math.max(0, Math.min(valor, 1));
  const r = tamanho / 2 - 9;
  const c = tamanho / 2;
  const ang = v * 2 * Math.PI - Math.PI / 2;
  const x = c + r * Math.cos(ang), y = c + r * Math.sin(ang);
  const arco = v >= 0.9999 ? null : `M ${c} ${c - r} A ${r} ${r} 0 ${v > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
  return (
    <View style={{ width: tamanho, height: tamanho, alignSelf: "center" }}>
      <Svg width={tamanho} height={tamanho}>
        <Circle cx={c} cy={c} r={r} stroke={CINZA_CLARO} strokeWidth={14} fill="none" />
        {v >= 0.9999 ? <Circle cx={c} cy={c} r={r} stroke={PRETO} strokeWidth={14} fill="none" /> : v > 0 && arco ? <Path d={arco} stroke={PRETO} strokeWidth={14} fill="none" /> : null}
      </Svg>
      <View style={{ position: "absolute", top: 0, left: 0, width: tamanho, height: tamanho, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold" }}>{pct(v)}</Text>
        <Text style={[s.suave, { fontSize: 7 }]}>concluído</Text>
      </View>
    </View>
  );
}

function Etapas({ etapas }: { etapas: DadosRelatorio["avanco"]["etapas"] }) {
  return (
    <View>
      {etapas.map((e) => (
        <View key={e.nome} style={{ flexDirection: "row", alignItems: "center", marginBottom: 2.4 }}>
          <Text style={{ width: 128, fontSize: 7, color: CINZA, textTransform: "uppercase" }}>{e.nome.length > 32 ? `${e.nome.slice(0, 31)}…` : e.nome}</Text>
          <View style={{ flexGrow: 1, height: 6, backgroundColor: CINZA_CLARO, borderRadius: 3, position: "relative" }}>
            <View style={{ width: `${Math.min(e.realizado, 1) * 100}%`, height: 6, backgroundColor: PRETO, borderRadius: 3 }} />
            {e.previsto > 0 ? <View style={{ position: "absolute", left: `${Math.min(e.previsto, 1) * 100}%`, top: -2, width: 1.2, height: 10, backgroundColor: "#6b5300" }} /> : null}
          </View>
          <Text style={{ width: 34, textAlign: "right", fontSize: 7.5, fontFamily: "Helvetica-Bold" }}>{pct(e.realizado)}</Text>
        </View>
      ))}
      <Text style={[s.suave, { fontSize: 6.5, marginTop: 2 }]}>Barra: realizado · traço: previsto até a semana</Text>
    </View>
  );
}

/** Curva de avanço físico acumulado (previsto tracejado × realizado). */
function Curva({ pontos, largura = 523, altura = 132 }: { pontos: DadosRelatorio["avanco"]["curva"]; largura?: number; altura?: number }) {
  if (!pontos.length) return null;
  const esq = 30, dir = 6, topo = 6, base = 22;
  const w = largura - esq - dir, h = altura - topo - base;
  const n = pontos.length;
  const px = (i: number) => esq + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const py = (v: number) => topo + h - Math.max(0, Math.min(v, 1)) * h;
  const prev = pontos.map((p, i) => `${px(i).toFixed(1)},${py(p.previsto).toFixed(1)}`).join(" ");
  const real = pontos.filter((p) => p.realizado != null).map((p) => `${px(pontos.indexOf(p)).toFixed(1)},${py(p.realizado!).toFixed(1)}`).join(" ");
  const passo = Math.max(1, Math.ceil(n / 14));
  return (
    <Svg width={largura} height={altura}>
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <G key={v}>
          <Line x1={esq} x2={esq + w} y1={py(v)} y2={py(v)} stroke={CINZA_CLARO} strokeWidth={0.6} />
          <Text x={esq - 4} y={py(v) + 2.5} style={{ fontSize: 6.5 }} fill={CINZA} textAnchor="end">{`${v * 100}%`}</Text>
        </G>
      ))}
      {pontos.map((p, i) => (i % passo === 0 || i === n - 1 ? <Text key={p.semana} x={px(i)} y={topo + h + 12} style={{ fontSize: 6.2 }} fill={CINZA} textAnchor="middle">{ddmm(p.inicio)}</Text> : null))}
      <Polyline points={prev} stroke="#a1a1aa" strokeWidth={1.4} strokeDasharray="4 3" fill="none" />
      {real ? <Polyline points={real} stroke={PRETO} strokeWidth={1.8} fill="none" /> : null}
      {pontos.filter((p) => p.realizado != null).map((p) => <Circle key={p.semana} cx={px(pontos.indexOf(p))} cy={py(p.realizado!)} r={1.8} fill={PRETO} />)}
      <Rect x={esq + w - 128} y={topo + h + 15} width={8} height={2} fill="#a1a1aa" />
      <Text x={esq + w - 116} y={topo + h + 18} style={{ fontSize: 6.5 }} fill={CINZA}>Previsto</Text>
      <Rect x={esq + w - 70} y={topo + h + 15} width={8} height={2} fill={PRETO} />
      <Text x={esq + w - 58} y={topo + h + 18} style={{ fontSize: 6.5 }} fill={CINZA}>Realizado</Text>
    </Svg>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View wrap={false} minPresenceAhead={40}>
      <View style={s.secao}><Text style={s.secaoTitulo}>{titulo}</Text></View>
      <View>{children}</View>
    </View>
  );
}

function TextoLivre({ texto, vazio }: { texto: string; vazio: string }) {
  const t = limpar(texto.trim());
  return t ? <Text style={s.texto}>{t}</Text> : <Text style={[s.texto, s.suave]}>{vazio}</Text>;
}

function LinhaResumo({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5 }, forte ? { borderTopWidth: 1, borderTopColor: PRETO, borderStyle: "dashed", marginTop: 2, paddingTop: 5 } : {}]}>
      <Text style={forte ? { fontFamily: "Helvetica-Bold" } : { color: CINZA }}>{rotulo}</Text>
      <Text style={forte ? { fontFamily: "Helvetica-Bold" } : {}}>{valor}</Text>
    </View>
  );
}

export interface FotoPdf { dados: Buffer; legenda: string | null; focoX: number; focoY: number }

export function RelatorioSemanalPdf({ d, textos, fotos, versao }: { d: DadosRelatorio; textos: TextosRelatorio; fotos: FotoPdf[]; versao: string }) {
  const c = d.contrato;
  const deposito: [string, string | null][] = [["Banco", d.empresa.banco], ["Agência", d.empresa.agencia], ["Conta", d.empresa.conta], ["CNPJ", d.empresa.cnpj], ["PIX", d.empresa.pix]];
  const paginas = paginarFotos(fotos.length);
  const larguraUtil = 523;
  return (
    <Document title={`Relatório semanal ${d.obra.codigo} - semana ${d.semana}`} author={d.empresa.nome} creator="Masie Gestão" language="pt-BR">
      {/* Página 1 — Situação da obra */}
      <Page size="A4" style={s.pagina}>
        <Cabecalho d={d} />
        <Faixa>SITUAÇÃO DA OBRA</Faixa>
        <View style={{ flexDirection: "row", marginBottom: 8 }}>
          <View style={{ width: 170, paddingRight: 12 }}>
            <Text style={s.subtitulo}>PROGRESSO DA OBRA</Text>
            <Rosca valor={d.avanco.realizado} />
            <Text style={[s.suave, { textAlign: "center", marginTop: 6, fontSize: 7.5 }]}>Previsto até a semana: {pct(d.avanco.previsto)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.subtitulo}>EVOLUÇÃO POR TIPO DE SERVIÇO</Text>
            <Etapas etapas={d.avanco.etapas} />
          </View>
        </View>
        <Text style={s.subtitulo}>AVANÇO FÍSICO</Text>
        <Curva pontos={d.avanco.curva} />
        <Secao titulo="TAREFAS FINALIZADAS E EM ANDAMENTO"><TextoLivre texto={textos.tarefasRealizadas} vazio="Nenhuma tarefa registrada na semana." /></Secao>
        <Secao titulo="TAREFAS DA PRÓXIMA SEMANA"><TextoLivre texto={textos.tarefasProximaSemana} vazio="-" /></Secao>
        <Secao titulo="ANOMALIAS OU IRREGULARIDADES OBSERVADAS"><TextoLivre texto={textos.anomalias} vazio="Nenhuma anomalia observada na semana." /></Secao>
        <Secao titulo="ACOMPANHAMENTO DO PRAZO"><TextoLivre texto={textos.acompanhamentoPrazo} vazio="-" /></Secao>
        <Rodape d={d} versao={versao} />
      </Page>

      {/* Página 2 — Relatório financeiro */}
      <Page size="A4" style={s.pagina}>
        <Cabecalho d={d} />
        <Faixa>RELATÓRIO FINANCEIRO</Faixa>
        <View style={{ flexDirection: "row", gap: 24 }}>
          <View style={{ flex: 1.15 }}>
            <Text style={s.subtitulo}>RESUMO DO CONTRATO</Text>
            <LinhaResumo rotulo="Valor total do contrato" valor={moeda(c.contrato)} />
            <LinhaResumo rotulo={`Entrada (${pct(c.percentualEntrada)})`} valor={moeda(-c.entrada)} />
            <LinhaResumo rotulo="Aditivos / descontos / reembolsos" valor={moeda(c.ajustes)} />
            <LinhaResumo rotulo="Medições quitadas" valor={moeda(c.quitadas ? -c.quitadas : 0)} />
            <LinhaResumo rotulo="Material já faturado em nome do cliente" valor={moeda(c.faturamentoDireto ? -c.faturamentoDireto : 0)} />
            <LinhaResumo rotulo="Saldo a pagar" valor={moeda(c.saldo)} forte />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.subtitulo, { textAlign: "right" }]}>INFORMAÇÕES PARA DEPÓSITO</Text>
            <Text style={{ textAlign: "right", fontFamily: "Helvetica-Bold", marginBottom: 3 }}>{d.empresa.razaoSocial}</Text>
            {deposito.filter(([, v]) => v).map(([k, v]) => <Text key={k} style={{ textAlign: "right", paddingVertical: 2.5 }}>{k}: {v}</Text>)}
            {deposito.every(([, v]) => !v) ? <Text style={[s.suave, { textAlign: "right" }]}>{"Cadastre os dados bancários em Configurações > Empresa."}</Text> : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 24, marginTop: 18 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.subtitulo}>MEDIÇÕES</Text>
            <View style={s.cabTab}>
              <Text style={{ width: 22, fontFamily: "Helvetica-Bold" }}>Nº</Text><Text style={{ width: 52, fontFamily: "Helvetica-Bold" }}>Data</Text>
              <Text style={{ flex: 1, textAlign: "right", fontFamily: "Helvetica-Bold" }}>Valor total</Text><Text style={{ width: 54, textAlign: "center", fontFamily: "Helvetica-Bold" }}>Situação</Text>
            </View>
            {d.medicoes.map((m) => (
              <View key={m.numero} style={s.linhaTab} wrap={false}>
                <Text style={{ width: 22 }}>{m.numero}</Text>
                <Text style={{ width: 52 }}>{br(m.data).slice(0, 5)}</Text>
                <Text style={{ flex: 1, textAlign: "right", color: m.valor == null ? CINZA : PRETO }}>{m.valor == null ? "-" : moeda(m.valor)}</Text>
                <View style={{ width: 54, alignItems: "center", justifyContent: "center" }}>
                  <Svg width={9} height={9}><Circle cx={4.5} cy={4.5} r={3.6} stroke={PRETO} strokeWidth={0.8} fill={m.situacao === "PAGA" ? PRETO : "none"} /></Svg>
                </View>
              </View>
            ))}
            <Text style={[s.suave, { fontSize: 6.5, marginTop: 4 }]}>Círculo preenchido = paga; vazio = não paga. Valor = medido no período × (1 - entrada) + aditivos ± descontos/reembolsos.</Text>
          </View>
          <View style={{ flex: 1.2 }}>
            <Text style={s.subtitulo}>ADITIVOS / DESCONTOS / REEMBOLSOS</Text>
            <View style={s.cabTab}>
              <Text style={{ width: 58, fontFamily: "Helvetica-Bold" }}>Tipo</Text><Text style={{ width: 68, textAlign: "right", fontFamily: "Helvetica-Bold" }}>Valor</Text>
              <Text style={{ flex: 1, paddingLeft: 8, fontFamily: "Helvetica-Bold" }}>Descrição</Text>
            </View>
            {d.ajustes.length === 0 ? <Text style={[s.suave, { paddingVertical: 4 }]}>Nenhum lançamento.</Text> : d.ajustes.map((a, i) => (
              <View key={i} style={s.linhaTab} wrap={false}>
                <Text style={{ width: 58 }}>{a.tipo === "ADITIVO" ? "Aditivo" : a.tipo === "DESCONTO" ? "Desconto" : "Reembolso"}</Text>
                <Text style={{ width: 68, textAlign: "right" }}>{moeda(a.tipo === "DESCONTO" ? -a.valor : a.valor)}</Text>
                <Text style={{ flex: 1, paddingLeft: 8 }}>{limpar(a.descricao)}</Text>
              </View>
            ))}
          </View>
        </View>
        <Rodape d={d} versao={versao} />
      </Page>

      {/* Páginas 3+ — Relatório fotográfico (simétrico, recorte 4:3) */}
      {paginas.map((pag, ip) => (
        <Page key={ip} size="A4" style={s.pagina}>
          <Cabecalho d={d} />
          <Faixa>{`RELATÓRIO FOTOGRÁFICO${paginas.length > 1 ? ` (${ip + 1}/${paginas.length})` : ""}`}</Faixa>
          {pag.map((linha, il) => {
            const gap = 12;
            const larg = linha.colunas === 1 ? larguraUtil * (pag.length === 1 ? 1 : 0.78) : (larguraUtil - gap) / 2;
            const alt = larg * 0.75;
            return (
              <View key={il} style={{ flexDirection: "row", justifyContent: "center", gap, marginBottom: 10 }}>
                {linha.fotos.map((i) => {
                  const f = fotos[i]!;
                  return (
                    <View key={i} style={{ width: larg }}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text */}
                      <Image src={f.dados} style={{ width: larg, height: alt, objectFit: "cover", objectPosition: `${f.focoX}% ${f.focoY}%` }} />
                      {f.legenda ? <Text style={[s.suave, { fontSize: 7.5, marginTop: 3 }]}>{limpar(f.legenda)}</Text> : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          <Rodape d={d} versao={versao} />
        </Page>
      ))}
    </Document>
  );
}
