import { describe, expect, it } from "vitest";
import { lerNFe } from "@/lib/nfe";

const xml = (extra = "") => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe41261111222333000181550010000012341000012345" versao="4.00">
<ide><nNF>001234</nNF><serie>1</serie><dhEmi>2026-11-01T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>LOJA ELETRICA LTDA</xNome><xFant>Loja Elétrica</xFant></emit>
<dest><CNPJ>27527577000102</CNPJ><xNome>MASIE ENGENHARIA</xNome></dest>
<det nItem="1"><prod><xProd>CABO FLEX 2,5MM</xProd><qCom>100.0000</qCom><uCom>M</uCom><vProd>350.00</vProd></prod></det>
<det nItem="2"><prod><xProd>TOMADA 20A</xProd><qCom>10</qCom><uCom>UN</uCom><vProd>150.00</vProd></prod></det>
<total><ICMSTot><vNF>500.00</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-12-01</dVenc><vDup>250.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-31</dVenc><vDup>250.00</vDup></dup></cobr>
${extra}</infNFe></NFe></nfeProc>`;

describe("XML da NF-e", () => {
  it("extrai chave, número, emitente, total, duplicatas e itens", () => {
    const n = lerNFe(xml());
    expect(n).toMatchObject({ chave: "41261111222333000181550010000012341000012345", numero: "1234", serie: "1", emissao: "2026-11-01", valorTotal: 500 });
    expect(n.emitente).toEqual({ documento: "11222333000181", nome: "LOJA ELETRICA LTDA", fantasia: "Loja Elétrica" });
    expect(n.duplicatas).toEqual([{ numero: "001", vencimento: "2026-12-01", valor: 250 }, { numero: "002", vencimento: "2026-12-31", valor: 250 }]);
    expect(n.itens).toHaveLength(2);
  });
  it("rejeita arquivos que não são NF-e", () => {
    expect(() => lerNFe("<html></html>")).toThrow("não é um XML de NF-e");
    expect(() => lerNFe("isto não é xml <<<")).toThrow();
  });
  it("não expande entidades (proteção contra XML malicioso)", () => {
    const malicioso = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa">]>` + xml().replace(`<?xml version="1.0" encoding="UTF-8"?>`, "").replace("LOJA ELETRICA LTDA", "&a;&a;&a;");
    expect(lerNFe(malicioso).emitente.nome).toBe("&a;&a;&a;");
  });
});
