import prisma from '../../../config/prisma.js';
import { NFePhpAdapter } from '../adapters/NFePhpAdapter.js';
import { decrypt } from '../shared/encryption.js';
import { fiscalEvents } from '../shared/events.js';

export class NFeEventosService {
  static async processarEvento(tenant_id, nota_id, tipo_evento, payloadEvento) {
    const nota = await prisma.fiscal_notas.findUnique({
      where: { id: nota_id },
      include: { serie: { include: { estabelecimento: { include: { empresa: true } } } } }
    });

    if (!nota) throw new Error('Nota não encontrada');

    const estabelecimento = nota.serie.estabelecimento;
    const empresa = estabelecimento.empresa;

    const certificadoAtivo = await prisma.fiscal_certificados.findFirst({
      where: { estabelecimento_id: estabelecimento.id, ativo: true }
    });
    if (!certificadoAtivo) throw new Error('Nenhum certificado ativo encontrado');

    const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);

    let emitCNPJ = String(estabelecimento.cnpj || '').replace(/\D/g, '');
    emitCNPJ = emitCNPJ.padStart(14, '0').substring(0, 14);

    const configNFePHP = {
      atualizacao: new Date().toISOString(),
      tpAmb: nota.ambiente,
      razaosocial: empresa.razao_social,
      siglaUF: estabelecimento.uf || empresa.uf,
      cnpj: emitCNPJ,
      schemes: 'PL_010_V1.30',
      versao: '4.00'
    };

    const payloadAdapter = {
      tipo_evento,
      modelo: nota.modelo,
      password: senhaStr,
      ...payloadEvento
    };

    const resPHP = await NFePhpAdapter.callAdapter('evento', payloadAdapter, configNFePHP, pfxBuffer.toString('base64'));

    if (resPHP.status === 'error') {
      throw new Error(`Erro Evento SPED-NFE: ${resPHP.message}`);
    }

    const cStat = resPHP.sefaz_response?.cStat || resPHP.sefaz_response?.retEvento?.infEvento?.cStat;
    const xMotivo = resPHP.sefaz_response?.xMotivo || resPHP.sefaz_response?.retEvento?.infEvento?.xMotivo || 'Retorno Sefaz';
    const protocolo = resPHP.sefaz_response?.retEvento?.infEvento?.nProt || resPHP.sefaz_response?.retEvento?.[0]?.infEvento?.nProt || null;

    if (tipo_evento === 'CANCELAMENTO' || tipo_evento === 'CC_E') {
      await prisma.fiscal_eventos.create({
        data: {
          tenant_id: String(tenant_id),
          nota_id: nota.id,
          tipo: tipo_evento,
          sequencial: payloadEvento.sequencial || 1,
          justificativa: payloadEvento.justificativa,
          codigo_status_sefaz: cStat ? String(cStat) : null,
          motivo_status_sefaz: String(xMotivo),
          protocolo_sefaz: protocolo,
          payload_xml_retorno: JSON.stringify(resPHP.sefaz_response),
        }
      });

      if (tipo_evento === 'CANCELAMENTO' && (cStat == 135 || cStat == 155)) {
        await prisma.fiscal_notas.update({
          where: { id: nota.id },
          data: { status: 'CANCELADA' }
        });
        fiscalEvents.emit('onNotaCancelada', {
          nota_id: nota.id,
          tenant_id: String(tenant_id),
          chave_acesso: nota.chave_acesso
        });
      } else {
        fiscalEvents.emit('onEventoRegistrado', {
          nota_id: nota.id,
          tenant_id: String(tenant_id),
          tipo: tipo_evento,
          protocolo
        });
      }
    }

    return {
      success: (cStat == 135 || cStat == 155 || cStat == 102),
      sefaz_response: resPHP.sefaz_response,
      cStat,
      xMotivo
    };
  }
}
