import { create } from 'xmlbuilder2';

export function calcularDVMudulo11(chave43) {
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += parseInt(chave43[i], 10) * peso;
    peso++;
    if (peso > 9) peso = 2;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv > 9 ? 0 : dv;
}

export function gerarChaveAcesso(uf, data, cnpj, modelo, serie, numero, tipoEmissao, cNF) {
  const anoMes = `${data.getFullYear().toString().substring(2)}${(data.getMonth() + 1).toString().padStart(2, '0')}`;
  const chave43 = `${String(uf).padStart(2, '13')}${anoMes}${String(cnpj || '').replace(/\D/g, '').padStart(14, '0')}${String(modelo).padStart(2, '0')}${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}${tipoEmissao}${String(cNF).padStart(8, '0')}`;
  const dv = calcularDVMudulo11(chave43);
  return `${chave43}${dv}`;
}

export function montarXmlNFe(nota, empresa, estabelecimento, destinatario, itens, referenciados = []) {
  const chaveAcesso = nota.chave_acesso;
  const cMunEmit = estabelecimento.codigo_municipio_ibge || empresa.codigo_municipio_ibge || '1302603';

  const ideNode = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' })
      .ele('infNFe', { Id: `NFe${chaveAcesso}`, versao: '4.00' })
        .ele('ide')
          .ele('cUF').txt(cMunEmit.substring(0, 2)).up()
          .ele('cNF').txt(chaveAcesso.substring(35, 43)).up()
          .ele('natOp').txt(nota.natureza_operacao).up()
          .ele('mod').txt(String(nota.modelo)).up()
          .ele('serie').txt(String(nota.serie ?? 1)).up()
          .ele('nNF').txt(String(nota.numero)).up()
          .ele('dhEmi').txt(nota.data_emissao.toISOString()).up()
          .ele('tpNF').txt(String(nota.tipo)).up()
          .ele('idDest').txt((estabelecimento.uf || empresa.uf) === destinatario.uf ? '1' : '2').up()
          .ele('cMunFG').txt(cMunEmit).up()
          .ele('tpImp').txt('1').up()
          .ele('tpEmis').txt('1').up()
          .ele('tpAmb').txt(String(nota.ambiente)).up()
          .ele('finNFe').txt(String(nota.finalidade)).up()
          .ele('indFinal').txt(destinatario.tipo_contribuinte === 'CONTRIBUINTE' ? '0' : '1').up()
          .ele('indPres').txt('1').up();

  for (const ref of referenciados) {
    ideNode.ele('NFref').ele('refNFe').txt(ref.chave_acesso).up().up();
  }

  const root = ideNode.up()
    .ele('emit')
      .ele('CNPJ').txt(String(estabelecimento.cnpj || '').replace(/\D/g, '')).up()
      .ele('xNome').txt(estabelecimento.nome || empresa.razao_social).up()
      .ele('enderEmit')
        .ele('xLgr').txt(estabelecimento.logradouro || empresa.logradouro || 'Rua Principal').up()
        .ele('nro').txt(estabelecimento.numero || empresa.numero || 'SN').up()
        .ele('xBairro').txt(estabelecimento.bairro || empresa.bairro || 'Centro').up()
        .ele('cMun').txt(cMunEmit).up()
        .ele('xMun').txt(estabelecimento.municipio || empresa.municipio || 'Manaus').up()
        .ele('UF').txt(estabelecimento.uf || empresa.uf || 'AM').up()
        .ele('CEP').txt(String(estabelecimento.cep || empresa.cep || '69000000').replace(/\D/g, '')).up()
      .up()
      .ele('IE').txt(estabelecimento.ie || empresa.ie || '').up()
      .ele('CRT').txt(empresa.crt === 'SIMPLES_NACIONAL' ? '1' : '3').up()
    .up()
    .ele('dest')
      .ele(String(destinatario.cpf_cnpj || '').replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ')
        .txt(String(destinatario.cpf_cnpj || '').replace(/\D/g, '')).up()
      .ele('xNome').txt(destinatario.razao_social).up()
      .ele('enderDest')
        .ele('xLgr').txt(destinatario.logradouro || 'Rua').up()
        .ele('nro').txt(destinatario.numero || 'SN').up()
        .ele('xBairro').txt(destinatario.bairro || 'Centro').up()
        .ele('cMun').txt(destinatario.codigo_municipio_ibge || cMunEmit).up()
        .ele('xMun').txt(destinatario.municipio || 'Manaus').up()
        .ele('UF').txt(destinatario.uf || 'AM').up()
        .ele('CEP').txt(String(destinatario.cep || '69000000').replace(/\D/g, '')).up()
      .up()
      .ele('indIEDest').txt(destinatario.ie ? '1' : '9').up()
      .ele('IE').txt(destinatario.ie || '').up()
    .up();

  itens.forEach((item, index) => {
    const nItem = (index + 1).toString();
    const det = root.ele('det', { nItem });
    det.ele('prod')
      .ele('cProd').txt(String(item.codigo_produto)).up()
      .ele('cEAN').txt('SEM GTIN').up()
      .ele('xProd').txt(String(item.descricao_produto)).up()
      .ele('NCM').txt(String(item.ncm || '00000000').replace(/\D/g, '')).up()
      .ele('CFOP').txt(String(item.cfop || '5102').replace(/\D/g, '')).up()
      .ele('uCom').txt('UN').up()
      .ele('qCom').txt(Number(item.quantidade).toFixed(4)).up()
      .ele('vUnCom').txt(Number(item.valor_unitario).toFixed(4)).up()
      .ele('vProd').txt(Number(item.valor_total).toFixed(2)).up()
      .ele('cEANTrib').txt('SEM GTIN').up()
      .ele('uTrib').txt('UN').up()
      .ele('qTrib').txt(Number(item.quantidade).toFixed(4)).up()
      .ele('vUnTrib').txt(Number(item.valor_unitario).toFixed(4)).up()
      .ele('indTot').txt('1').up()
    .up();

    const impostoNode = det.ele('imposto');
    impostoNode.ele('vTotTrib').txt(Number(item.icms_valor || 0).toFixed(2)).up();

    impostoNode.ele('ICMS')
      .ele('ICMS00')
        .ele('orig').txt(String(item.origem ?? 0)).up()
        .ele('CST').txt(String(item.icms_cst_csosn || '00')).up()
        .ele('modBC').txt('3').up()
        .ele('vBC').txt(Number(item.icms_base || 0).toFixed(2)).up()
        .ele('pICMS').txt(Number(item.icms_aliquota || 0).toFixed(2)).up()
        .ele('vICMS').txt(Number(item.icms_valor || 0).toFixed(2)).up()
      .up()
    .up();

    const cstIbs = item.ibs_cst || '410';
    const classTrib = item.cClassTrib || '410001';
    const ibsCbsRoot = impostoNode.ele('IBSCBS');

    if (cstIbs === '410' || cstIbs === '400') {
      ibsCbsRoot.ele('CST').txt(cstIbs).up();
      ibsCbsRoot.ele('cClassTrib').txt(classTrib).up();
    } else {
      ibsCbsRoot.ele('CST').txt(cstIbs).up();
      ibsCbsRoot.ele('cClassTrib').txt(classTrib).up();
      ibsCbsRoot.ele('vBCIBSCBS').txt(Number(item.ibs_base || 0).toFixed(2)).up()
        .ele('pIBS').txt(Number(item.ibs_aliquota || 0).toFixed(2)).up()
        .ele('vIBS').txt(Number(item.ibs_valor || 0).toFixed(2)).up()
        .ele('pCBS').txt(Number(item.cbs_aliquota || 0).toFixed(2)).up()
        .ele('vCBS').txt(Number(item.cbs_valor || 0).toFixed(2)).up();
    }
    ibsCbsRoot.up();
    impostoNode.up();
    det.up();
  });

  root.ele('total')
    .ele('ICMSTot')
      .ele('vBC').txt(Number(nota.valor_total_produtos).toFixed(2)).up()
      .ele('vICMS').txt(Number(itens.reduce((acc, i) => acc + Number(i.icms_valor || 0), 0)).toFixed(2)).up()
      .ele('vICMSDeson').txt('0.00').up()
      .ele('vFCP').txt('0.00').up()
      .ele('vBCST').txt('0.00').up()
      .ele('vST').txt('0.00').up()
      .ele('vFCPST').txt('0.00').up()
      .ele('vFCPSTRet').txt('0.00').up()
      .ele('vProd').txt(Number(nota.valor_total_produtos).toFixed(2)).up()
      .ele('vFrete').txt(Number(nota.valor_frete || 0).toFixed(2)).up()
      .ele('vSeg').txt(Number(nota.valor_seguro || 0).toFixed(2)).up()
      .ele('vDesc').txt(Number(nota.valor_desconto || 0).toFixed(2)).up()
      .ele('vII').txt('0.00').up()
      .ele('vIPI').txt('0.00').up()
      .ele('vIPIDevol').txt('0.00').up()
      .ele('vPIS').txt('0.00').up()
      .ele('vCOFINS').txt('0.00').up()
      .ele('vOutro').txt(Number(nota.valor_outras || 0).toFixed(2)).up()
      .ele('vNF').txt(Number(nota.valor_total_nota).toFixed(2)).up()
    .up()
  .up()
  .ele('transp')
    .ele('modFrete').txt('9').up()
  .up()
  .ele('pag')
    .ele('detPag')
      .ele('tPag').txt('90').up()
      .ele('vPag').txt('0.00').up()
    .up()
  .up();

  return root.end({ prettyPrint: false });
}
