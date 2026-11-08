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

    // Extrai os dados reais do evento retornado pela SEFAZ
    // Atenção: A resposta envelope 'retEnvEvento' traz cStat=128 (Lote Processado).
    // O status específico da homologação do evento (135, 155, etc.) vem dentro de retEvento.infEvento.
    const infEvento = resPHP.sefaz_response?.retEvento?.infEvento 
                   || resPHP.sefaz_response?.retEvento?.[0]?.infEvento 
                   || resPHP.sefaz_response?.infEvento;

    const cStatEvento = infEvento?.cStat || resPHP.sefaz_response?.cStat;
    const xMotivoEvento = infEvento?.xMotivo || resPHP.sefaz_response?.xMotivo || 'Retorno Sefaz';
    const protocoloEvento = infEvento?.nProt || resPHP.sefaz_response?.retEvento?.nProt || resPHP.sefaz_response?.nProt || null;

    const isCanceladoSucesso = tipo_evento === 'CANCELAMENTO' && (
      cStatEvento == 135 || // Evento registrado e vinculado a NF-e
      cStatEvento == 155 || // Cancelamento de NF-e homologado fora de prazo
      cStatEvento == 136 || // Evento registrado, mas não vinculado
      cStatEvento == 101 || // Cancelamento homologado
      cStatEvento == 218    // NF-e já está cancelada na base da SEFAZ
    );

    if (tipo_evento === 'CANCELAMENTO' || tipo_evento === 'CC_E') {
      await prisma.fiscal_eventos.create({
        data: {
          tenant_id: String(tenant_id),
          nota_id: nota.id,
          tipo: tipo_evento,
          sequencial: payloadEvento.sequencial || 1,
          justificativa: payloadEvento.justificativa,
          codigo_status_sefaz: cStatEvento ? String(cStatEvento) : null,
          motivo_status_sefaz: String(xMotivoEvento),
          protocolo_sefaz: protocoloEvento,
          payload_xml_retorno: JSON.stringify(resPHP.sefaz_response),
        }
      });

      if (isCanceladoSucesso) {
        await prisma.fiscal_notas.update({
          where: { id: nota.id },
          data: { 
            status: 'CANCELADA',
            codigo_status_sefaz: cStatEvento ? String(cStatEvento) : undefined,
            motivo_status_sefaz: String(xMotivoEvento)
          }
        });

        // Sincroniza tabela notas_fiscais caso haja vínculo por chave ou id_pedido
        try {
          if (nota.chave_acesso) {
            await prisma.notas_fiscais.updateMany({
              where: { chave_acesso: nota.chave_acesso },
              data: {
                status: 'CANCELADA',
                motivo_status: String(xMotivoEvento).substring(0, 250)
              }
            });
          }
          if (nota.id_pedido) {
            await prisma.notas_fiscais.updateMany({
              where: { id_pedido: Number(nota.id_pedido) },
              data: {
                status: 'CANCELADA',
                motivo_status: String(xMotivoEvento).substring(0, 250)
              }
            });
          }
        } catch (syncErr) {
          console.warn('⚠️ Erro ao atualizar notas_fiscais em cancelamento:', syncErr.message);
        }

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
          protocolo: protocoloEvento
        });
      }
    }

    return {
      success: isCanceladoSucesso || (cStatEvento == 135 || cStatEvento == 136 || cStatEvento == 155 || cStatEvento == 102),
      sefaz_response: resPHP.sefaz_response,
      cStat: cStatEvento,
      xMotivo: xMotivoEvento,
      protocolo: protocoloEvento
    };
  }
}
