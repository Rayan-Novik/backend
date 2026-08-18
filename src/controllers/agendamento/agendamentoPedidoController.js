import { PrismaClient } from '@prisma/client';
import { processarPagamento } from '../../services/paymentFactory.js';
import { decrypt } from '../../services/cryptoService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/sender.js'; 
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../../services/financialService.js';

const prisma = new PrismaClient();

export const criarPedidoAgendamento = async (req, res, next) => {
    try {
        const { id_loja, id_funcionario, id_servico, data_inicio, data_fim, observacoes, metodo_pagamento, dados_pagamento } = req.body;
        const id_usuario = req.user.id_usuario;
        const id_tenant = req.tenantId;

        // =========================================================
        // 0. BUSCA O CLIENTE
        // =========================================================
        const usuarioBanco = await prisma.usuarios.findUnique({ where: { id_usuario } });
        if (!usuarioBanco) return res.status(404).json({ message: "Usuário não encontrado." });

        const emailDoCliente = usuarioBanco.email || "cliente@email.com";
        const nomeDoCliente = usuarioBanco.nome_completo ? usuarioBanco.nome_completo.split(' ')[0] : "Cliente";
        
        let cpfCliente = '00000000000';
        let telefoneClienteStr = '';

        if (usuarioBanco.cpf_criptografado) {
            try { cpfCliente = decrypt(usuarioBanco.cpf_criptografado).replace(/\D/g, ''); } catch (e) {}
        }
        if (usuarioBanco.telefone_criptografado) {
            try { telefoneClienteStr = decrypt(usuarioBanco.telefone_criptografado).replace(/\D/g, ''); } catch (e) {}
        }

        const servico = await prisma.produtos.findFirst({
            where: { id_produto: Number(id_servico), id_tenant }
        });

        if (!servico) return res.status(404).json({ message: "Serviço não encontrado." });

        const duracaoMinutos = servico.tempo_duracao || 60;
        const dataInicioObj = new Date(data_inicio);
        const dataFimCalculada = new Date(dataInicioObj.getTime() + duracaoMinutos * 60000);

        let whereConflito = {
            id_tenant, id_loja, status: { notIn: ['CANCELADO', 'FALHA'] },
            OR: [
                { data_inicio: { lt: dataFimCalculada, gte: dataInicioObj } },
                { data_fim: { gt: dataInicioObj, lte: dataFimCalculada } }
            ]
        };

        if (id_funcionario) {
            whereConflito.id_funcionario = id_funcionario;
            const conflito = await prisma.agendamentos_servicos.findFirst({ where: whereConflito });
            if (conflito) return res.status(409).json({ message: "Este profissional não está mais disponível neste horário." });
        } else {
            const profissionais = await prisma.funcionarios.count({ where: { id_tenant, ativo: true } });
            const totalProfissionais = profissionais || 1; 
            const conflitos = await prisma.agendamentos_servicos.count({ where: whereConflito });
            if (conflitos >= totalProfissionais) return res.status(409).json({ message: "A loja atingiu o limite máximo de atendimentos para este horário." });
        }

        const preco_total = Number(servico.preco);

        // =========================================================
        // 🟢 1. LÓGICA DO SINAL ANTECIPADO (Configurável no BD)
        // =========================================================
        const configSinal = await prisma.siteConfig.findFirst({ where: { chave: 'AGENDAMENTO_SINAL_PERCENT', id_tenant } });
        const percentualSinal = configSinal ? Number(configSinal.valor) : 100; // Padrão: 100% (Pagamento integral)
        
        const isOffline = String(metodo_pagamento).toUpperCase().includes('OFFLINE') || metodo_pagamento === 'LOCAL';
        
        // Se for offline, o valor cobrado no gateway agora é 0. Se for online, cobra a porcentagem.
        const valorCobrado = isOffline ? 0 : (preco_total * (percentualSinal / 100));

        // =========================================================
        // 2. CRIA O PEDIDO E RESERVA A AGENDA
        // =========================================================
        const reserva = await prisma.$transaction(async (tx) => {
            const novoPedido = await tx.pedidos.create({
                data: {
                    id_tenant, id_usuario,
                    metodo_pagamento: metodo_pagamento || "OFFLINE_PIX",
                    preco_itens: preco_total, preco_frete: 0.00, preco_total: preco_total,
                    status_pagamento: "PENDENTE", status_entrega: "AGENDADO", canal_venda: "agendamento_online",
                    pedido_items: {
                        create: [{
                            id_produto: servico.id_produto, nome: servico.nome, quantidade: 1,
                            preco: servico.preco, imagem_url: servico.imagem_url, id_tenant: id_tenant
                        }]
                    }
                }
            });

            const novoAgendamento = await tx.agendamentos_servicos.create({
                data: {
                    id_tenant, id_usuario, id_loja, id_funcionario: id_funcionario || null,
                    id_pedido: novoPedido.id_pedido, data_inicio: dataInicioObj,
                    data_fim: dataFimCalculada, observacoes, status: "PENDENTE" 
                }
            });

            return { pedido: novoPedido, agendamento: novoAgendamento };
        });

        // =========================================================
        // 3. PROCESSA O PAGAMENTO (Cobrando apenas o SINAL)
        // =========================================================
        let resultadoPagamento = { status: 'approved', gateway: 'OFFLINE', id: null };

        try {
            if (!isOffline && valorCobrado > 0) {
                const dadosPagamentoCompleto = {
                    ...dados_pagamento,
                    amount: valorCobrado, // 🟢 Manda SÓ o valor do sinal para o Asaas/Stripe/MP!
                    description: `Sinal (${percentualSinal}%) Agendamento: ${servico.nome}`,
                    email: emailDoCliente, 
                    payment_method_id: metodo_pagamento === 'PIX' ? 'pix' : dados_pagamento?.payment_method_id,
                    payer: {
                        email: emailDoCliente, first_name: nomeDoCliente,
                        identification: { type: "CPF", number: cpfCliente }
                    },
                    metadata: {
                        id_pedido: reserva.pedido.id_pedido,
                        id_agendamento: reserva.agendamento.id_agendamento
                    }
                };
                resultadoPagamento = await processarPagamento(metodo_pagamento, dadosPagamentoCompleto, id_tenant);
            }

            // Define o status inteligente: Se cobrou menos que 100%, é PARCIALMENTE_PAGO!
            let statusRealPagamento = 'PENDENTE';
            if (resultadoPagamento.status === 'approved') {
                if (isOffline) statusRealPagamento = 'PENDENTE';
                else statusRealPagamento = (percentualSinal < 100) ? 'PARCIALMENTE_PAGO' : 'PAGO';
            }

            await prisma.pedidos.update({
                where: { id_pedido: reserva.pedido.id_pedido },
                data: {
                    id_pagamento_gateway: resultadoPagamento.id ? resultadoPagamento.id.toString() : null,
                    status_pagamento: statusRealPagamento,
                    gateway_provider: resultadoPagamento.gateway
                }
            });

            if (resultadoPagamento.status === 'approved') {
                await prisma.agendamentos_servicos.update({
                    where: { id_agendamento: reserva.agendamento.id_agendamento },
                    data: { status: 'CONFIRMADO' }
                });
            }

            // =========================================================
            // 🟢 4. INTEGRAÇÃO COM O ERP FINANCEIRO
            // =========================================================
            try {
                const pedidoAtualizado = await prisma.pedidos.findUnique({ where: { id_pedido: reserva.pedido.id_pedido } });
                
                // 1. Gera a Conta a Receber PENDENTE com o valor total
                await gerarRecebivelDePedido(pedidoAtualizado, id_tenant);

                // 2. Se um valor de sinal foi pago, aciona a função de Baixa Automática!
                if ((statusRealPagamento === 'PAGO' || statusRealPagamento === 'PARCIALMENTE_PAGO') && valorCobrado > 0) {
                    await registrarEntradaFinanceira({
                        id_pedido: pedidoAtualizado.id_pedido,
                        id_usuario: id_usuario,
                        gateway_provider: resultadoPagamento.gateway || 'LOCAL',
                        gateway_id: resultadoPagamento.id ? resultadoPagamento.id.toString() : `AGEND-${pedidoAtualizado.id_pedido}`,
                        valor_bruto: valorCobrado, // 🟢 Dá baixa APENAS no valor do sinal no ERP!
                        valor_taxa_real: null, 
                        id_tenant
                    });
                    console.log(`✅ [AGENDAMENTO ERP] Sinal de ${percentualSinal}% registrado para pedido #${pedidoAtualizado.id_pedido}`);
                }
            } catch (finErr) {
                console.error("⚠️ [AGENDAMENTO ERP] Falha ao registrar financeiro:", finErr.message);
            }

            // =========================================================
            // 5. MENSAGERIA E NOTIFICAÇÕES (Mostrando o Saldo)
            // =========================================================
            try {
                const io = req.app.get('socketio');
                if (io) {
                    io.emit('novo_pedido', {
                        id: reserva.pedido.id_pedido, total: preco_total, cliente: usuarioBanco.nome_completo,
                        status: statusRealPagamento, canal: 'agendamento_online', risco: 0, id_tenant
                    });
                }

                if (resultadoPagamento.status === 'approved' || isOffline) {
                    const lojaInfo = await prisma.tenants.findUnique({
                        where: { id: Number(id_tenant) }, select: { nome_fantasia: true, telefone_contato: true }
                    });
                    const nomeDaLoja = lojaInfo?.nome_fantasia || 'Nossa Loja';
                    const telefoneLojista = lojaInfo?.telefone_contato;

                    const dataFormatada = dataInicioObj.toLocaleString('pt-BR', { timeZone: 'America/Manaus' });
                    const valorTotalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco_total);
                    const valorSinalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorCobrado);
                    const valorRestanteFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco_total - valorCobrado);

                    if (telefoneClienteStr && telefoneClienteStr.length >= 10) {
                        const msgFinanceira = (valorCobrado > 0 && valorCobrado < preco_total) 
                            ? `💰 *Valor Total:* ${valorTotalFmt}\n✅ *Sinal Pago:* ${valorSinalFmt}\n⚠️ *Restante no Local:* ${valorRestanteFmt}\n` 
                            : `💳 *Valor:* ${valorTotalFmt}\n`;

                        const msgCliente = `🗓️ *AGENDAMENTO CONFIRMADO!*\n\n` +
                                           `Olá, *${nomeDoCliente}*!\n` +
                                           `Seu agendamento na *${nomeDaLoja}* foi recebido.\n\n` +
                                           `📌 *Serviço:* ${servico.nome}\n` +
                                           `📅 *Data:* ${dataFormatada}\n` +
                                           msgFinanceira +
                                           `📱 *Status:* Confirmado\n\n` +
                                           `Te esperamos no horário marcado!`;
                        
                        await sendWhatsAppMessage(telefoneClienteStr, { text: msgCliente }, id_tenant);
                    }

                    if (telefoneLojista) {
                        let telLojistaLimpo = telefoneLojista.replace(/\D/g, '');
                        if (telLojistaLimpo.length >= 10) {
                            if (!telLojistaLimpo.startsWith('55')) telLojistaLimpo = '55' + telLojistaLimpo;
                            const msgLojista = `🔔 *NOVO AGENDAMENTO!* 🔔\n\n` +
                                               `📦 *Pedido:* #${reserva.pedido.id_pedido}\n` +
                                               `📌 *Serviço:* ${servico.nome}\n` +
                                               `📅 *Data:* ${dataFormatada}\n` +
                                               `👤 *Cliente:* ${usuarioBanco.nome_completo}\n` +
                                               `💳 *Valor Total:* ${valorTotalFmt} (Sinal cobrado: ${valorSinalFmt})\n`;
                            await sendWhatsAppMessage(telLojistaLimpo, { text: msgLojista }, 1);
                        }
                    }
                }
            } catch (notifError) {
                console.error("⚠️ Erro notificações de agendamento:", notifError);
            }

            return res.status(201).json({
                message: "Agendamento reservado com sucesso!",
                id_pedido: reserva.pedido.id_pedido,
                id_agendamento: reserva.agendamento.id_agendamento,
                pagamento: resultadoPagamento
            });

        } catch (pagamentoErro) {
            await prisma.agendamentos_servicos.update({
                where: { id_agendamento: reserva.agendamento.id_agendamento }, data: { status: 'CANCELADO' }
            });
            await prisma.pedidos.update({
                where: { id_pedido: reserva.pedido.id_pedido }, data: { status_pagamento: 'FALHA' }
            });

            return res.status(402).json({ 
                message: "O pagamento falhou. Tente novamente.", error: pagamentoErro.message 
            });
        }
    } catch (error) {
        next(error);
    }
};