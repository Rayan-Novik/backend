import prisma from '../../config/prisma.js';
import { decrypt as decryptUserField } from '../../services/cryptoService.js';
import { getTenantId } from '../../modules/fiscal/shared/tenantHelper.js';
import { NFeService } from '../../modules/fiscal/services/NFeService.js';

const extractXmlTag = (xml, tag) => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
};

// ============================================================================
// 📤 GET /api/fiscal/saida (Lista notas de saída para ListaNotasFiscais e DanfeView)
// ============================================================================
export const listarNotasSaida = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);
        const idTenantInt = Number(tenant_id) || 1;

        const notasSaida = await prisma.notas_fiscais.findMany({
            where: { id_tenant: idTenantInt, tipo_operacao: 'SAIDA' },
            include: {
                pedidos: {
                    include: {
                        usuarios: true,
                        pedido_items: true,
                        enderecos: true
                    }
                },
                itens: true
            },
            orderBy: { data_emissao: 'desc' }
        });

        const formatadas = notasSaida.map(n => {
            if (n.pedidos?.usuarios) {
                try {
                    if (n.pedidos.usuarios.cpf_criptografado) {
                        n.pedidos.usuarios.cpf_descriptografado = decryptUserField(n.pedidos.usuarios.cpf_criptografado);
                    }
                    if (n.pedidos.usuarios.telefone_criptografado) {
                        n.pedidos.usuarios.telefone_descriptografado = decryptUserField(n.pedidos.usuarios.telefone_criptografado);
                    }
                } catch (e) {}
            }
            return n;
        });

        return res.status(200).json(formatadas);
    } catch (error) {
        console.error('Erro ao listar notas de saída:', error);
        return res.status(500).json({ message: 'Erro ao listar notas de saída.', error: error.message });
    }
};

// ============================================================================
// 📝 POST /api/fiscal/saida/rascunho (Gera rascunho de nota a partir do Pedido)
// ============================================================================
export const gerarRascunhoSaida = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);
        const idTenantInt = Number(tenant_id) || 1;
        const { id_pedido, tipo_nota = 'NFCE' } = req.body;

        if (!id_pedido) {
            return res.status(400).json({ message: 'ID do pedido é obrigatório.' });
        }

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant: idTenantInt },
            include: { pedido_items: true }
        });

        if (!pedido) {
            return res.status(404).json({ message: 'Pedido não encontrado.' });
        }

        // Verifica se já existe nota vinculada a este pedido
        const existente = await prisma.notas_fiscais.findUnique({
            where: { id_pedido: Number(id_pedido) },
            include: { itens: true }
        });

        if (existente) {
            const atualizada = await prisma.notas_fiscais.update({
                where: { id_nota: existente.id_nota },
                data: {
                    tipo_nota: String(tipo_nota).toUpperCase(),
                    motivo_status: `Rascunho (${tipo_nota}) pronto para transmissão.`
                },
                include: { itens: true }
            });
            return res.status(200).json({ message: 'Rascunho atualizado.', nota: atualizada });
        }

        const itensData = (pedido.pedido_items || []).map(item => ({
            id_produto: item.id_produto || null,
            nome_produto: item.nome || 'Produto',
            quantidade: Number(item.quantidade || 1),
            valor_unitario: Number(item.preco || 0),
            valor_total: Number(item.quantidade || 1) * Number(item.preco || 0),
            cfop: '5102',
            ncm: '00000000',
            cst_icms: '102',
            cst_pis_cofins: '49'
        }));

        const novaNota = await prisma.notas_fiscais.create({
            data: {
                id_tenant: idTenantInt,
                id_pedido: Number(id_pedido),
                tipo_operacao: 'SAIDA',
                tipo_nota: String(tipo_nota).toUpperCase(),
                serie: 1,
                status: 'RASCUNHO',
                motivo_status: 'Rascunho gerado. Aguardando transmissão para a SEFAZ.',
                valor_produtos: Number(pedido.preco_itens || pedido.preco_total || 0),
                valor_frete: Number(pedido.preco_frete || 0),
                valor_total: Number(pedido.preco_total || 0),
                itens: {
                    create: itensData
                }
            },
            include: { itens: true }
        });

        return res.status(201).json({ message: 'Rascunho gerado com sucesso!', nota: novaNota });
    } catch (error) {
        console.error('Erro ao gerar rascunho de nota:', error);
        return res.status(500).json({ message: error.message || 'Erro ao gerar rascunho.' });
    }
};

// ============================================================================
// 🚀 POST /api/fiscal/saida/:id/emitir (Transmite nota do Pedido via NFeService)
// ============================================================================
export const emitirNotaSaida = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);
        const idTenantInt = Number(tenant_id) || 1;
        const id_nota = Number(req.params.id);

        const notaLocal = await prisma.notas_fiscais.findFirst({
            where: { id_nota, id_tenant: idTenantInt },
            include: {
                pedidos: {
                    include: {
                        pedido_items: true,
                        usuarios: true,
                        enderecos: true
                    }
                },
                itens: true
            }
        });

        if (!notaLocal) {
            return res.status(404).json({ message: 'Nota fiscal não encontrada.' });
        }

        const estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id },
            include: { empresa: true }
        });

        if (!estab) {
            return res.status(400).json({ message: 'Configure os Dados da Empresa Emitente em Configurações Fiscais antes de transmitir.' });
        }

        const modeloAlvo = notaLocal.tipo_nota === 'NFCE' ? '65' : '55';
        let cenario = await prisma.fiscal_cenarios_fiscais.findFirst({
            where: { tenant_id, modelo: modeloAlvo }
        });
        if (!cenario) {
            cenario = await prisma.fiscal_cenarios_fiscais.findFirst({ where: { tenant_id } });
        }
        if (!cenario) {
            return res.status(400).json({ message: 'Cadastre ao menos um Cenário Fiscal (Natureza de Operação) antes de emitir.' });
        }

        let destinatarioId = null;
        const pedido = notaLocal.pedidos;
        if (pedido?.usuarios) {
            let cpfCnpj = '';
            try {
                if (pedido.usuarios.cpf_criptografado) {
                    cpfCnpj = decryptUserField(pedido.usuarios.cpf_criptografado).replace(/\D/g, '');
                }
            } catch (e) {}

            if (cpfCnpj || modeloAlvo === '55') {
                const docFinal = cpfCnpj || '00000000000';
                let dest = await prisma.fiscal_destinatarios.findFirst({
                    where: { tenant_id, cpf_cnpj: docFinal }
                });
                if (!dest) {
                    dest = await prisma.fiscal_destinatarios.create({
                        data: {
                            tenant_id,
                            cpf_cnpj: docFinal,
                            razao_social: pedido.usuarios.nome_completo || 'Consumidor Final',
                            email: pedido.usuarios.email || null,
                            tipo_contribuinte: 'NAO_CONTRIBUINTE',
                            logradouro: pedido.entrega_logradouro || pedido.enderecos?.logradouro || estab.logradouro || 'Centro',
                            numero: pedido.entrega_numero || pedido.enderecos?.numero || 'S/N',
                            bairro: pedido.entrega_bairro || pedido.enderecos?.bairro || estab.bairro || 'Centro',
                            codigo_municipio_ibge: estab.codigo_municipio_ibge || '1302603',
                            municipio: pedido.entrega_cidade || pedido.enderecos?.cidade || estab.municipio || 'Manaus',
                            uf: (pedido.entrega_estado || pedido.enderecos?.estado || estab.uf || 'AM').substring(0, 2).toUpperCase(),
                            cep: (pedido.entrega_cep || pedido.enderecos?.cep || estab.cep || '69000000').replace(/\D/g, '')
                        }
                    });
                }
                destinatarioId = dest.id;
            }
        }

        const itensOriginais = notaLocal.itens?.length > 0 ? notaLocal.itens : (pedido?.pedido_items || []);
        const itensPayload = itensOriginais.map(item => ({
            produto_id: String(item.id_produto || item.id_item || '1'),
            quantidade: Number(item.quantidade || 1),
            valor_unitario: Number(item.valor_unitario || item.preco || 0),
            valor_desconto: 0,
            valor_frete: 0
        }));

        const resultado = await NFeService.emitir({
            tenant_id,
            estabelecimento_id: estab.id,
            cenario_id: cenario.id,
            destinatario_id: destinatarioId,
            itens: itensPayload,
            ambiente: 2,
            id_pedido: notaLocal.id_pedido ? Number(notaLocal.id_pedido) : undefined
        });

        const fiscalNotaGerada = await prisma.fiscal_notas.findUnique({
            where: { id: resultado.nota_id }
        });

        const notaAtualizada = await prisma.notas_fiscais.update({
            where: { id_nota: notaLocal.id_nota },
            data: {
                numero_nota: resultado.numero || fiscalNotaGerada?.numero || 1,
                serie: 1,
                chave_acesso: resultado.chave_acesso || fiscalNotaGerada?.chave_acesso || null,
                status: resultado.status || 'AUTORIZADA',
                motivo_status: resultado.motivo_rejeicao || resultado.motivo || (resultado.status === 'AUTORIZADA' ? 'Autorizado o uso da NF-e' : 'Processado pela SEFAZ'),
                xml_gerado: fiscalNotaGerada?.xml_autorizado || fiscalNotaGerada?.xml_assinado || fiscalNotaGerada?.xml_gerado || null,
                protocolo_sefaz: resultado.protocolo || fiscalNotaGerada?.protocolo_autorizacao || null,
                url_danfe: `/api/fiscal/notas/${resultado.nota_id}/pdf`
            },
            include: { itens: true }
        });

        return res.status(200).json({
            message: resultado.status === 'AUTORIZADA' ? 'Nota fiscal autorizada com sucesso!' : (resultado.motivo_rejeicao || 'Nota processada'),
            nota: notaAtualizada,
            fiscal_nota: resultado
        });
    } catch (error) {
        console.error('Erro ao emitir nota de saída:', error);
        return res.status(500).json({ message: error.message || 'Erro ao emitir nota para a SEFAZ.' });
    }
};

// ============================================================================
// 📥 POST /api/fiscal/entrada/importar (Lê arquivo XML de Fornecedor)
// ============================================================================
export const importarXmlEntrada = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Nenhum arquivo XML enviado.' });
        }

        const xmlContent = req.file.buffer.toString('utf-8');

        const emitBlock = extractXmlTag(xmlContent, 'emit');
        const ideBlock = extractXmlTag(xmlContent, 'ide');
        const totalBlock = extractXmlTag(xmlContent, 'ICMSTot');

        const cnpjFornecedor = extractXmlTag(emitBlock, 'CNPJ') || extractXmlTag(emitBlock, 'CPF');
        const nomeFornecedor = extractXmlTag(emitBlock, 'xFant') || extractXmlTag(emitBlock, 'xNome') || 'Fornecedor XML';
        const numeroNota = Number(extractXmlTag(ideBlock, 'nNF')) || 1;
        const serieNota = Number(extractXmlTag(ideBlock, 'serie')) || 1;
        const valorTotal = Number(extractXmlTag(totalBlock, 'vNF')) || 0;

        const chaveMatch = xmlContent.match(/Id="NFe(\d{44})"/i) || xmlContent.match(/<chNFe>(\d{44})<\/chNFe>/i);
        const chaveAcesso = chaveMatch ? chaveMatch[1] : null;

        const detMatches = [...xmlContent.matchAll(/<det[^>]*>([\s\S]*?)<\/det>/gi)];
        const itens = detMatches.map(m => {
            const detXml = m[1];
            const prodXml = extractXmlTag(detXml, 'prod');
            const eanRaw = extractXmlTag(prodXml, 'cEAN');
            return {
                codigo: extractXmlTag(prodXml, 'cProd'),
                ean: eanRaw && eanRaw !== 'SEM GTIN' ? eanRaw : '',
                nome: extractXmlTag(prodXml, 'xProd'),
                ncm: extractXmlTag(prodXml, 'NCM'),
                cfop: extractXmlTag(prodXml, 'CFOP'),
                unidade: extractXmlTag(prodXml, 'uCom') || 'UN',
                quantidade: Number(extractXmlTag(prodXml, 'qCom')) || 1,
                valor_unitario: Number(extractXmlTag(prodXml, 'vUnCom')) || 0,
                valor_total: Number(extractXmlTag(prodXml, 'vProd')) || 0
            };
        });

        if (itens.length === 0) {
            return res.status(400).json({ message: 'Não foi possível encontrar itens (<det>) no arquivo XML.' });
        }

        return res.status(200).json({
            chave_acesso: chaveAcesso,
            numero_nota: numeroNota,
            serie: serieNota,
            valor_total: valorTotal,
            xml_gerado: xmlContent,
            fornecedor: {
                cnpj: cnpjFornecedor,
                nome_loja: nomeFornecedor
            },
            itens
        });
    } catch (error) {
        console.error('Erro ao ler XML de entrada:', error);
        return res.status(500).json({ message: 'Erro ao processar arquivo XML: ' + error.message });
    }
};

// ============================================================================
// ✅ POST /api/fiscal/entrada/confirmar (Confirma entrada do XML e atualiza estoque)
// ============================================================================
export const confirmarXmlEntrada = async (req, res) => {
    try {
        const tenant_id = getTenantId(req);
        const idTenantInt = Number(tenant_id) || 1;
        const dadosNota = req.body;

        if (!dadosNota || !Array.isArray(dadosNota.itens)) {
            return res.status(400).json({ message: 'Dados da nota inválidos.' });
        }

        const resultado = await prisma.$transaction(async (tx) => {
            let fornecedorId = null;
            if (dadosNota.fornecedor?.cnpj) {
                const cnpjLimpo = String(dadosNota.fornecedor.cnpj).replace(/\D/g, '');
                let forn = await tx.fornecedores.findFirst({
                    where: { cnpj: cnpjLimpo, id_tenant: idTenantInt }
                });
                if (!forn) {
                    forn = await tx.fornecedores.create({
                        data: {
                            id_tenant: idTenantInt,
                            nome_loja: dadosNota.fornecedor.nome_loja || 'Fornecedor XML',
                            cnpj: cnpjLimpo
                        }
                    });
                }
                fornecedorId = forn.id_fornecedor;
            }

            for (const item of dadosNota.itens) {
                if (item.id_produto_vinculado) {
                    const idProd = Number(item.id_produto_vinculado);
                    const fator = Number(item.fator_conversao) || 1;
                    const entradaReal = Math.round(Number(item.quantidade) * fator);
                    const custoUnReal = Number(item.valor_unitario) / fator;

                    const prodAtualizado = await tx.produtos.update({
                        where: { id_produto: idProd },
                        data: {
                            estoque: { increment: entradaReal },
                            preco_custo: custoUnReal,
                            ...(item.ncm ? { ncm: String(item.ncm).replace(/\D/g, '') } : {})
                        }
                    });

                    await tx.movimentacaoEstoque.create({
                        data: {
                            id_produto: idProd,
                            quantidade: entradaReal,
                            tipo: 'ENTRADA',
                            saldo_momento: prodAtualizado.estoque,
                            motivo: `Entrada XML Nota #${dadosNota.numero_nota || 'S/N'}`,
                            origem_destino: dadosNota.fornecedor?.nome_loja || 'Fornecedor XML',
                            custo_unitario: custoUnReal
                        }
                    });
                }
            }

            const notaCriada = await tx.notas_fiscais.create({
                data: {
                    id_tenant: idTenantInt,
                    id_fornecedor: fornecedorId,
                    tipo_operacao: 'ENTRADA',
                    tipo_nota: 'NFE',
                    numero_nota: Number(dadosNota.numero_nota) || 1,
                    serie: Number(dadosNota.serie) || 1,
                    chave_acesso: dadosNota.chave_acesso || null,
                    status: 'AUTORIZADA',
                    motivo_status: 'Nota de Entrada importada via XML',
                    xml_gerado: dadosNota.xml_gerado || null,
                    valor_produtos: Number(dadosNota.valor_total) || 0,
                    valor_total: Number(dadosNota.valor_total) || 0,
                    itens: {
                        create: dadosNota.itens.map(i => ({
                            id_produto: i.id_produto_vinculado ? Number(i.id_produto_vinculado) : null,
                            nome_produto: i.nome || 'Item XML',
                            quantidade: Number(i.quantidade) || 1,
                            valor_unitario: Number(i.valor_unitario) || 0,
                            valor_total: Number(i.valor_total) || (Number(i.quantidade || 1) * Number(i.valor_unitario || 0)),
                            cfop: i.cfop || '1102',
                            ncm: i.ncm || '00000000'
                        }))
                    }
                }
            });

            return notaCriada;
        });

        return res.status(200).json({
            message: 'Nota de entrada confirmada e estoque atualizado com sucesso!',
            nota: resultado
        });
    } catch (error) {
        console.error('Erro ao confirmar XML de entrada:', error);
        return res.status(500).json({ message: 'Erro ao salvar a nota: ' + error.message });
    }
};
