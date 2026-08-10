// caminho: services/whatsapp/whatsappPaymentService.js

import { getSession } from './connection.js';
import { PrismaClient } from '@prisma/client';
import { processarPagamento } from '../paymentFactory.js';
import { encrypt } from '../cryptoService.js';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../financialService.js';

const prisma = new PrismaClient();

const formatJid = (phoneOrJid) => {
    let jid = phoneOrJid;
    if (!String(jid).includes('@')) {
        let formattedPhone = String(phoneOrJid).replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) formattedPhone = '55' + formattedPhone;
        jid = `${formattedPhone}@s.whatsapp.net`;
    }
    return jid;
};

// ============================================================================
// 📱 ENVIO DO PIX PARA O CLIENTE NO WHATSAPP
// ============================================================================
export const sendPixCobrança = async (id_tenant, phoneOrJid, valor, descricao, pixData) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') {
        throw new Error("WhatsApp não está conectado.");
    }

    const jid = formatJid(phoneOrJid);
    const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    try {
        let textoCobrança = `🛒 *NOVA COBRANÇA GERADA*\n\n`;
        if (descricao) textoCobrança += `*Referente a:* ${descricao}\n`;
        textoCobrança += `*Valor:* ${valorFormatado}\n\n`;
        
        textoCobrança += `Pague via *PIX* escaneando o QR Code abaixo ou copiando o código:\n\n`;
        
        if (pixData.qr_code_url) {
            textoCobrança += `🔗 *Link de pagamento:*\n${pixData.qr_code_url}\n\n`;
        }

        textoCobrança += `✂️ *Pix Copia e Cola:*`;

        await session.sock.sendMessage(jid, { text: textoCobrança });

        const codigoPix = pixData.qr_code || pixData.qr_code_url;
        await session.sock.sendMessage(jid, { text: codigoPix });

        if (pixData.qr_code_base64) {
            const base64Data = pixData.qr_code_base64.replace(/^data:image\/\w+;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, 'base64');

            await session.sock.sendMessage(jid, { 
                image: imageBuffer, 
                caption: `📱 QR Code no valor de ${valorFormatado}` 
            });
        }

        console.log(`✅ [Tenant ${id_tenant}] Cobrança PIX enviada para: ${jid}`);
        return true;

    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar cobrança via WhatsApp:`, error);
        throw new Error("Falha ao enviar mensagem de cobrança no WhatsApp.");
    }
};

// ============================================================================
// 🛠️ FUNÇÃO AUXILIAR: IDENTIFICAR OU CRIAR USUÁRIO
// ============================================================================
const getOrCreateUsuarioAvulso = async (jid, id_tenant) => {
    const telefoneLimpo = String(jid).replace(/\D/g, ''); 
    
    // 1. Tenta achar o nome real do cliente no CRM
    const contatoCrm = await prisma.whatsappContatos.findUnique({
        where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } }
    });
    const nomeDoCliente = contatoCrm?.nome || 'Cliente WhatsApp';

    // 2. Busca o usuário "Venda Avulsa" ÚNICO para esta loja (Tenant)
    let clienteGenerico = await prisma.usuarios.findFirst({
        where: { 
            nome_completo: 'Venda Avulsa WhatsApp', 
            id_tenant: Number(id_tenant) 
        }
    });

    // 3. Se não existir, cria UM ÚNICO usuário padrão para a loja
    if (!clienteGenerico) {
        clienteGenerico = await prisma.usuarios.create({
            data: {
                nome_completo: 'Venda Avulsa WhatsApp',
                email: `vendas_avulsas_t${id_tenant}@ararinhacloud.shop`, 
                telefone_criptografado: await encrypt('00000000000'),
                cpf_criptografado: await encrypt('00000000000'), 
                hash_senha: 'senha_padrao_whatsapp', 
                id_tenant: Number(id_tenant)
            }
        });
    }

    return { 
        clienteFinal: clienteGenerico, 
        telefoneLimpo, 
        nomeDoCliente 
    };
};

// ============================================================================
// 🛠️ FUNÇÃO AUXILIAR: PROCESSAR ITENS DO PEDIDO (EXTRAIR DO TEXTO DA IA)
// ============================================================================
const processarItensParaBanco = async (itensCompradosIA, id_tenant, descricaoIA, valorTotalIA) => {
    const itensDoCarrinho = [];
    
    if (itensCompradosIA && itensCompradosIA.length > 0) {
        for (const itemIA of itensCompradosIA) {
            const produtoDb = await prisma.produtos.findUnique({
                where: { id_produto: Number(itemIA.id_produto) }
            });

            if (produtoDb) {
                // Monta o item do pedido puxando a foto e os dados reais
                itensDoCarrinho.push({
                    id_produto: produtoDb.id_produto,
                    nome: produtoDb.nome,
                    quantidade: itemIA.quantidade,
                    preco: Number(produtoDb.preco),
                    imagem_url: produtoDb.imagem_url, // 🟢 FOTO DO PRODUTO AQUI!
                    id_tenant: Number(id_tenant)
                });
            }
        }
    }

    // Fallback: Se a IA não mandou os IDs, a gente cria um genérico para não quebrar o painel
    if (itensDoCarrinho.length === 0) {
        itensDoCarrinho.push({
            nome: descricaoIA || 'Produtos Diversos (Venda WhatsApp)',
            quantidade: 1.0,
            preco: Number(valorTotalIA),
            id_tenant: Number(id_tenant)
        });
    }

    return itensDoCarrinho;
};

// ============================================================================
// 🤖 TOOL DA IA: GERAÇÃO DE PIX AUTÔNOMA
// ============================================================================
export const gerarPixViaIA = async (jid, valor, id_tenant, descricao, metodo_envio = 'A Combinar', endereco = '', itens_comprados = []) => {
    try {
        const { clienteFinal, telefoneLimpo, nomeDoCliente } = await getOrCreateUsuarioAvulso(jid, id_tenant);

        // Processa o pagamento no Gateway
        const dadosPagamento = {
            amount: valor,
            description: descricao || 'Cobrança via Assistente Virtual (WhatsApp)',
            payer: {
                email: clienteFinal.email, 
                firstName: nomeDoCliente,
                lastName: '',
                identification: { type: 'CPF', number: '00000000000' }
            }
        };

        const resultadoPix = await processarPagamento('PIX', dadosPagamento, id_tenant);
        if (!resultadoPix || !resultadoPix.pix_data) {
            throw new Error("O Gateway não retornou os dados do PIX.");
        }

        // Configurações de Envio e Endereço para bater com a tabela Oficial do seu E-commerce
        const statusDeEntrega = metodo_envio === 'RETIRADA' ? 'Retirada na Loja' : 'Pendente';
        let dadosLogradouro = {};
        if (endereco && metodo_envio !== 'RETIRADA') {
            dadosLogradouro = {
                entrega_logradouro: endereco,
                entrega_numero: "S/N",
                entrega_bairro: "Endereço via Chat",
                entrega_cidade: "Manaus",
                entrega_estado: "AM",
                entrega_cep: "00000000"
            };
        }

        // 🟢 Transforma os IDs da IA em um array de produtos reais (com foto!)
        const itensFormatados = await processarItensParaBanco(itens_comprados, id_tenant, descricao, valor);

        // Salva o Pedido na Tabela Oficial
        const pedidoData = {
            id_usuario: clienteFinal.id_usuario,
            canal_venda: 'whatsapp',
            metodo_pagamento: 'PIX',
            status_pagamento: 'PENDENTE',
            status_entrega: statusDeEntrega,
            ...dadosLogradouro,
            preco_itens: Number(valor),
            preco_frete: 0,
            preco_total: Number(valor),
            id_pagamento_gateway: String(resultadoPix.id),
            gateway_provider: resultadoPix.gateway,
            linha_digitavel: resultadoPix.pix_data.qr_code,
            url_boleto: resultadoPix.pix_data.qr_code_url || null,
            id_tenant: Number(id_tenant),
            pedido_items: { create: itensFormatados }
        };

        const pedidoCriado = await prisma.pedidos.create({
            data: pedidoData,
            include: { pedido_items: true }
        });

        // Dispara a cobrança no WhatsApp
        await sendPixCobrança(id_tenant, jid, valor, descricao, resultadoPix.pix_data);

        // 🟢 O PULO DO GATO: Retira a conversa do Robô e joga para os Humanos (pendentes)!
        await prisma.whatsappContatos.update({
            where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } },
            data: { status: 'pendentes' }
        });

        // 🟢 EMITE O SOCKET PARA O PAINEL ATUALIZAR AO VIVO!
        try {
            const io = global.io; 
            if (io) {
                io.emit('novo_pedido', {
                    id: pedidoCriado.id_pedido,
                    total: pedidoCriado.preco_total,
                    cliente: nomeDoCliente,
                    status: 'PENDENTE',
                    canal: 'whatsapp',
                    risco: 100, 
                    id_tenant: id_tenant
                });
            }
        } catch(e){}

        return { success: true, id_pedido: pedidoCriado.id_pedido };

    } catch (error) {
        console.error("❌ Erro interno ao gerar PIX via IA:", error);
        throw error;
    }
};

// ============================================================================
// 🤖 TOOL DA IA: REGISTRAR PAGAMENTO NA ENTREGA
// ============================================================================
export const registrarPedidoPagamentoNaEntrega = async (jid, id_tenant, valor, descricao, metodo_envio = 'A Combinar', endereco = '', itens_comprados = []) => {
    try {
        const { clienteFinal, telefoneLimpo, nomeDoCliente } = await getOrCreateUsuarioAvulso(jid, id_tenant);

        // Configurações de Envio e Endereço
        const statusDeEntrega = metodo_envio === 'RETIRADA' ? 'Retirada na Loja' : 'Pendente';
        let dadosLogradouro = {};
        if (endereco && metodo_envio !== 'RETIRADA') {
            dadosLogradouro = {
                entrega_logradouro: endereco,
                entrega_numero: "S/N",
                entrega_bairro: "Endereço via Chat",
                entrega_cidade: "Manaus",
                entrega_estado: "AM",
                entrega_cep: "00000000"
            };
        }

        // 🟢 Transforma os IDs da IA em um array de produtos reais (com foto!)
        const itensFormatados = await processarItensParaBanco(itens_comprados, id_tenant, descricao, valor);

        // Salva o Pedido na Tabela Oficial
        const pedidoData = {
            id_usuario: clienteFinal.id_usuario,
            canal_venda: 'whatsapp',
            metodo_pagamento: 'DINHEIRO/CARTAO_ENTREGA',
            status_pagamento: 'PENDENTE', 
            status_entrega: statusDeEntrega,
            ...dadosLogradouro,
            preco_itens: Number(valor),
            preco_frete: 0,
            preco_total: Number(valor),
            id_tenant: Number(id_tenant),
            pedido_items: { create: itensFormatados }
        };

        const pedidoCriado = await prisma.pedidos.create({
            data: pedidoData,
            include: { pedido_items: true }
        });

        console.log(`✅ [Tenant ${id_tenant}] Pedido para Pagamento na Entrega registrado para: ${jid}`);

        // 🟢 O PULO DO GATO: Retira a conversa do Robô e joga para os Humanos!
        await prisma.whatsappContatos.update({
            where: { jid_id_tenant: { jid: String(jid), id_tenant: Number(id_tenant) } },
            data: { status: 'pendentes' }
        });

        // 🟢 EMITE O SOCKET PARA O PAINEL ATUALIZAR AO VIVO!
        try {
            const io = global.io; 
            if (io) {
                io.emit('novo_pedido', {
                    id: pedidoCriado.id_pedido,
                    total: pedidoCriado.preco_total,
                    cliente: nomeDoCliente,
                    status: 'PENDENTE',
                    canal: 'whatsapp',
                    risco: 100, 
                    id_tenant: id_tenant
                });
            }
        } catch(e){}

        return { success: true, id_pedido: pedidoCriado.id_pedido };

    } catch (error) {
        console.error("❌ Erro interno ao registrar pedido na entrega via IA:", error);
        throw error;
    }
};

export const confirmarAgendamentoViaIA = async (jid, id_tenant, id_servico, data_inicio, observacoes, valor_total, metodo_pagamento, id_funcionario = null, nome_cliente = "Cliente Novo") => {
    try {
        const telefoneLimpo = String(jid).replace(/\D/g, ''); 

        // 🟢 1. ATUALIZA APENAS O CRM DO WHATSAPP COM O NOME REAL
        await prisma.whatsappContatos.updateMany({
            where: { jid: String(jid), id_tenant: Number(id_tenant) },
            data: { nome: nome_cliente }
        });

        // 🟢 2. PEGA O "USUÁRIO FANTASMA" PARA O PEDIDO (Evita poluição no DB)
        let clienteGenerico = await prisma.usuarios.findFirst({
            where: { nome_completo: 'Venda Avulsa WhatsApp', id_tenant: Number(id_tenant) }
        });

        if (!clienteGenerico) {
            clienteGenerico = await prisma.usuarios.create({
                data: {
                    nome_completo: 'Venda Avulsa WhatsApp',
                    email: `avulsa_t${id_tenant}@sistema.com`,
                    telefone_criptografado: '00000000000', 
                    cpf_criptografado: '00000000000',
                    hash_senha: 'senha_sistema_whatsapp',
                    id_tenant: Number(id_tenant)
                }
            });
        }

        const id_usuario_final = clienteGenerico.id_usuario;

        const servico = await prisma.produtos.findFirst({
            where: { id_produto: Number(id_servico), id_tenant: Number(id_tenant) }
        });

        const duracaoMinutos = servico?.tempo_duracao || 60;
        const dataInicioObj = new Date(data_inicio);
        const dataFimCalculada = new Date(dataInicioObj.getTime() + duracaoMinutos * 60000);

        const loja = await prisma.lojas.findFirst({
            where: { id_tenant: Number(id_tenant), ativo: true }
        });

        // Montamos uma observação detalhada para a agenda
        const observacaoDetalhada = `[Agendamento via IA]\n👤 Cliente Real: ${nome_cliente}\n📱 WhatsApp: ${telefoneLimpo}\n📝 Obs: ${observacoes || 'Nenhuma'}`;

        // 🟢 3. CRIA A RESERVA (Observações salvas SOMENTE na agenda)
        const reserva = await prisma.$transaction(async (tx) => {
            const novoPedido = await tx.pedidos.create({
                data: {
                    id_tenant: Number(id_tenant),
                    id_usuario: id_usuario_final, 
                    metodo_pagamento: metodo_pagamento, 
                    preco_itens: valor_total,
                    preco_frete: 0,
                    preco_total: valor_total,
                    status_pagamento: "PENDENTE",
                    status_entrega: "AGENDADO",
                    canal_venda: "agendamento_whatsapp",
                    // ❌ REMOVIDO DAQUI: A tabela de pedidos não tem campo "observacoes"
                    pedido_items: {
                        create: [{
                            id_produto: Number(id_servico),
                            nome: servico?.nome || "Serviço",
                            quantidade: 1,
                            preco: valor_total,
                            id_tenant: Number(id_tenant)
                        }]
                    }
                }
            });

            const novoAgendamento = await tx.agendamentos_servicos.create({
                data: {
                    id_tenant: Number(id_tenant),
                    id_usuario: id_usuario_final, 
                    id_loja: loja?.id_loja || 1,
                    id_funcionario: id_funcionario ? Number(id_funcionario) : null,
                    id_pedido: novoPedido.id_pedido,
                    data_inicio: dataInicioObj,
                    data_fim: dataFimCalculada,
                    observacoes: observacaoDetalhada, // ✅ SALVO AQUI: A tabela de agenda tem esse campo!
                    status: "CONFIRMADO"
                }
            });

            return { pedido: novoPedido, agendamento: novoAgendamento };
        });

        return reserva;
    } catch (error) {
        console.error(`❌ Erro ao confirmar agendamento via IA:`, error);
        throw error;
    }
};