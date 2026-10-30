import { create } from 'xmlbuilder2';

export function montarXmlEvento(nota, emitenteCnpj, tipoEvento, descEvento, sequencial, justificativa = '') {
  const idEvento = `ID${tipoEvento}${nota.chave_acesso}${sequencial.toString().padStart(2, '0')}`;
  const cOrgao = nota.chave_acesso ? nota.chave_acesso.substring(0, 2) : '13';

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('envEvento', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '1.00' })
      .ele('idLote').txt('1').up()
      .ele('evento', { versao: '1.00' })
        .ele('infEvento', { Id: idEvento })
          .ele('cOrgao').txt(cOrgao).up()
          .ele('tpAmb').txt(String(nota.ambiente)).up()
          .ele('CNPJ').txt(String(emitenteCnpj || '').replace(/\D/g, '')).up()
          .ele('chNFe').txt(nota.chave_acesso).up()
          .ele('dhEvento').txt(new Date().toISOString()).up()
          .ele('tpEvento').txt(tipoEvento).up()
          .ele('nSeqEvento').txt(String(sequencial)).up()
          .ele('verEvento').txt('1.00').up()
          .ele('detEvento', { versao: '1.00' })
            .ele('descEvento').txt(descEvento).up();

  if (tipoEvento === '110111') {
    doc.ele('xJust').txt(justificativa).up();
  } else if (tipoEvento === '110110') {
    doc.ele('xCorrecao').txt(justificativa).up();
    doc.ele('xCondUso').txt('A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N...').up();
  } else if (['210200', '210210', '210220', '210240'].includes(tipoEvento)) {
    if (justificativa) doc.ele('xJust').txt(justificativa).up();
  }

  return doc.root().end({ prettyPrint: false });
}

export function montarXmlInutilizacao(estabelecimento, serie, numIni, numFin, justificativa) {
  const ano = new Date().getFullYear().toString().substring(2);
  const cnpj = String(estabelecimento.cnpj || '').replace(/\D/g, '');
  const cUf = (estabelecimento.codigo_municipio_ibge || '1302603').substring(0, 2);
  const idInut = `ID${cUf}${ano}${cnpj}55${serie.toString().padStart(3, '0')}${numIni.toString().padStart(9, '0')}${numFin.toString().padStart(9, '0')}`;

  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('inutNFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe', versao: '4.00' })
      .ele('infInut', { Id: idInut })
        .ele('tpAmb').txt('2').up()
        .ele('xServ').txt('INUTILIZAR').up()
        .ele('cUF').txt(cUf).up()
        .ele('ano').txt(ano).up()
        .ele('CNPJ').txt(cnpj).up()
        .ele('mod').txt('55').up()
        .ele('serie').txt(String(serie)).up()
        .ele('nNFIni').txt(String(numIni)).up()
        .ele('nNFFin').txt(String(numFin)).up()
        .ele('xJust').txt(justificativa).up();

  return root.root().end({ prettyPrint: false });
}
