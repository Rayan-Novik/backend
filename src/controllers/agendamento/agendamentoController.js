import { PrismaClient } from '@prisma/client';
import { processarPagamento } from '../../services/paymentFactory.js';
import { decrypt } from '../../services/cryptoService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/sender.js'; 

const prisma = new PrismaClient();

export const criarPedidoAgendamento = async (req, res, next) => {
    try {
        const { 
            id_loja, 
            id_funcionario, 
            id_servico, 
            data_inicio, 
            data_fim, 
            observacoes, 
            metodo_pagamento, 
            dados_pagamento 
        } = req.body;

        const id_usuario = req.user.id_usuario;
        const id_tenant = req.tenantId;

        // =========================================================
        // 0. BUSCA O CLIENTE COMPLETO NO BANCO DE DADOS
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

        // 🟢 CÁLCULO SEGURO DO FINAL DO AGENDAMENTO NO BACKEND
        const duracaoMinutos = servico.tempo_duracao || 60;
        const dataInicioObj = new Date(data_inicio);
        const dataFimCalculada = new Date(dataInicioObj.getTime() + duracaoMinutos * 60000);

        let whereConflito = {
            id_tenant,
            id_loja,
            status: { notIn: ['CANCELADO', 'FALHA'] },
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
            
            if (conflitos >= totalProfissionais) {
                return res.status(409).json({ message: "A loja atingiu o limite máximo de atendimentos para este horário." });
            }
        }

        const preco_total = servico.preco;

        const reserva = await prisma.$transaction(async (tx) => {
            const novoPedido = await tx.pedidos.create({
                data: {
                    id_tenant,
                    id_usuario,
                    metodo_pagamento: metodo_pagamento || "OFFLINE_PIX",
                    preco_itens: preco_total,
                    preco_frete: 0.00, 
                    preco_total: preco_total,
                    status_pagamento: "PENDENTE",
                    status_entrega: "AGENDADO",
                    canal_venda: "agendamento_online",
                    pedido_items: {
                        create: [{
                            id_produto: servico.id_produto,
                            nome: servico.nome,
                            quantidade: 1,
                            preco: servico.preco,
                            imagem_url: servico.imagem_url,
                            id_tenant: id_tenant
                        }]
                    }
                }
            });

            const novoAgendamento = await tx.agendamentos_servicos.create({
                data: {
                    id_tenant,
                    id_usuario,
                    id_loja,
                    id_funcionario: id_funcionario || null,
                    id_pedido: novoPedido.id_pedido, 
                    data_inicio: dataInicioObj,
                    data_fim: dataFimCalculada, 
                    observacoes,
                    status: "PENDENTE" 
                }
            });

            return { pedido: novoPedido, agendamento: novoAgendamento };
        });

        // =========================================================
        // 4. PROCESSA O PAGAMENTO
        // =========================================================
        try {
            const dadosPagamentoCompleto = {
                ...dados_pagamento,
                amount: preco_total,
                description: `Agendamento: ${servico.nome}`,
                email: emailDoCliente, 
                payment_method_id: metodo_pagamento === 'PIX' ? 'pix' : dados_pagamento?.payment_method_id,
                payer: {
                    email: emailDoCliente,
                    first_name: nomeDoCliente,
                    identification: { type: "CPF", number: cpfCliente }
                },
                metadata: {
                    id_pedido: reserva.pedido.id_pedido,
                    id_agendamento: reserva.agendamento.id_agendamento
                }
            };

            const resultadoPagamento = await processarPagamento(metodo_pagamento, dadosPagamentoCompleto, id_tenant);

            await prisma.pedidos.update({
                where: { id_pedido: reserva.pedido.id_pedido },
                data: {
                    id_pagamento_gateway: resultadoPagamento.id ? resultadoPagamento.id.toString() : null,
                    status_pagamento: resultadoPagamento.status === 'approved' ? 'PAGO' : 'PENDENTE',
                    gateway_provider: resultadoPagamento.gateway
                }
            });

            if (resultadoPagamento.status === 'approved') {
                await prisma.agendamentos_servicos.update({
                    where: { id_agendamento: reserva.agendamento.id_agendamento },
                    data: { status: 'CONFIRMADO' }
                });
            }

            // 🟢 Correção de Offline (incluindo a flag LOCAL enviada pelo seu frontend)
            const isOffline = String(metodo_pagamento).toUpperCase().includes('OFFLINE') || metodo_pagamento === 'LOCAL';
            const statusRealPagamento = resultadoPagamento.status === 'approved' ? 'PAGO' : 'PENDENTE';

            // =========================================================
            // 🟢 5. INTEGRAÇÃO COM O ERP FINANCEIRO (O QUE FALTAVA)
            // =========================================================
            try {
                // Pega o pedido atualizado com o status final
                const pedidoAtualizado = await prisma.pedidos.findUnique({ where: { id_pedido: reserva.pedido.id_pedido } });
                
                // 1. Gera a Conta a Receber (Paga se for aprovado na hora, ou Pendente se for Pagar no Local)
                await gerarRecebivelDePedido(pedidoAtualizado, id_tenant);

                // 2. Se aprovou na hora (ex: Cartão de Crédito), lança no Livro Razão
                if (statusRealPagamento === 'PAGO') {
                    await registrarEntradaFinanceira({
                        id_pedido: pedidoAtualizado.id_pedido,
                        id_usuario: id_usuario,
                        gateway_provider: resultadoPagamento.gateway || 'LOCAL',
                        gateway_id: resultadoPagamento.id ? resultadoPagamento.id.toString() : `AGEND-${pedidoAtualizado.id_pedido}`,
                        valor_bruto: preco_total,
                        valor_taxa_real: null, 
                        id_tenant
                    });
                    console.log(`✅ [AGENDAMENTO ERP] Financeiro registrado para pedido #${pedidoAtualizado.id_pedido}`);
                }
            } catch (finErr) {
                console.error("⚠️ [AGENDAMENTO ERP] Falha ao registrar financeiro:", finErr.message);
            }

            // =========================================================
            // 6. MENSAGERIA E NOTIFICAÇÕES
            // =========================================================
            try {
                const io = req.app.get('socketio');
                if (io) {
                    io.emit('novo_pedido', {
                        id: reserva.pedido.id_pedido,
                        total: preco_total,
                        cliente: usuarioBanco.nome_completo,
                        status: statusRealPagamento,
                        canal: 'agendamento_online',
                        risco: 0,
                        id_tenant: id_tenant
                    });
                }

                if (statusRealPagamento === 'PAGO' || isOffline) {
                    const lojaInfo = await prisma.tenants.findUnique({
                        where: { id: Number(id_tenant) },
                        select: { nome_fantasia: true, telefone_contato: true }
                    });
                    const nomeDaLoja = lojaInfo?.nome_fantasia || 'Nossa Loja';
                    const telefoneLojista = lojaInfo?.telefone_contato;

                    const dataFormatada = dataInicioObj.toLocaleString('pt-BR', { timeZone: 'America/Manaus' });
                    const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(preco_total);

                    if (telefoneClienteStr && telefoneClienteStr.length >= 10) {
                        const msgCliente = `🗓️ *AGENDAMENTO CONFIRMADO!*\n\n` +
                                           `Olá, *${nomeDoCliente}*!\n` +
                                           `Seu agendamento na *${nomeDaLoja}* foi recebido com sucesso.\n\n` +
                                           `📌 *Serviço:* ${servico.nome}\n` +
                                           `📅 *Data:* ${dataFormatada}\n` +
                                           `💳 *Valor:* ${valorFormatado}\n` +
                                           `📱 *Status:* ${statusRealPagamento}\n\n` +
                                           `Te esperamos no horário marcado! Obrigado pela preferência.`;
                        
                        await sendWhatsAppMessage(telefoneClienteStr, { text: msgCliente }, id_tenant);
                    }

                    if (telefoneLojista) {
                        let telLojistaLimpo = telefoneLojista.replace(/\D/g, '');
                        if (telLojistaLimpo.length >= 10) {
                            if (!telLojistaLimpo.startsWith('55')) telLojistaLimpo = '55' + telLojistaLimpo;

                            const linkPainelLojista = `https://admin.ararinhacloud.shop/admin/order/${reserva.pedido.id_pedido}`;
                            const zapClienteInfo = telefoneClienteStr ? `+55${telefoneClienteStr}` : 'Não informado';

                            const msgLojista = `🔔 *NOVO AGENDAMENTO RECEBIDO!* 🔔\n\n` +
                                               `Olá, equipe da *${nomeDaLoja}*!\n` +
                                               `Um novo serviço acabou de ser agendado.\n\n` +
                                               `📦 *Pedido:* #${reserva.pedido.id_pedido}\n` +
                                               `📌 *Serviço:* ${servico.nome}\n` +
                                               `📅 *Data:* ${dataFormatada}\n` +
                                               `👤 *Cliente:* ${usuarioBanco.nome_completo}\n` +
                                               `📞 *WhatsApp:* ${zapClienteInfo}\n` +
                                               `💳 *Valor Total:* ${valorFormatado}\n` +
                                               `📱 *Status Pagto:* ${statusRealPagamento}\n\n` +
                                               `Acesse seu painel para ver os detalhes:\n` +
                                               `🌐 ${linkPainelLojista}`;

                            await sendWhatsAppMessage(telLojistaLimpo, { text: msgLojista }, 1);
                        }
                    }
                }
            } catch (notifError) {
                console.error("⚠️ Erro ao enviar notificações de agendamento:", notifError);
            }

            return res.status(201).json({
                message: "Agendamento reservado com sucesso!",
                id_pedido: reserva.pedido.id_pedido,
                id_agendamento: reserva.agendamento.id_agendamento,
                pagamento: resultadoPagamento
            });

        } catch (pagamentoErro) {
            console.error("Erro no processamento do pagamento:", pagamentoErro.message);
            
            await prisma.agendamentos_servicos.update({
                where: { id_agendamento: reserva.agendamento.id_agendamento },
                data: { status: 'CANCELADO' }
            });

            await prisma.pedidos.update({
                where: { id_pedido: reserva.pedido.id_pedido },
                data: { status_pagamento: 'FALHA' }
            });

            return res.status(402).json({ 
                message: "A reserva foi feita, mas o pagamento falhou. Tente novamente.", 
                error: pagamentoErro.message 
            });
        }

    } catch (error) {
        next(error);
    }
};

// ==========================================================
// 🔓 PÚBLICO/CLIENTE: Buscar horários disponíveis
// ==========================================================
export const getHorariosDisponiveis = async (req, res, next) => {
    try {
        const { data, id_funcionario, id_servico } = req.query; 
        let { id_loja } = req.query;
        const tenantId = req.headers['x-tenant-id'] || req.tenantId;

        if (!data) {
            return res.status(400).json({ message: "A data é obrigatória para ver a agenda." });
        }

        let loja;
        if (id_loja) {
            loja = await prisma.lojas.findFirst({
                where: { id_loja: Number(id_loja), id_tenant: Number(tenantId), ativo: true }
            });
        } else {
            loja = await prisma.lojas.findFirst({
                where: { id_tenant: Number(tenantId), ativo: true }
            });
        }

        if (!loja) return res.status(404).json({ message: "Nenhuma loja física ativa encontrada." });

        const profissionais = await prisma.funcionarios.findMany({
            where: { id_tenant: Number(tenantId), ativo: true },
            select: { id_funcionario: true, nome_completo: true, role: true }
        });

        let duracaoMinutos = 60; 
        if (id_servico) {
            const servico = await prisma.produtos.findFirst({
                where: { id_produto: Number(id_servico), id_tenant: Number(tenantId) }
            });
            if (servico && servico.tempo_duracao) {
                duracaoMinutos = servico.tempo_duracao;
            }
        }

        const horaAbertura = parseInt(loja.hora_abertura?.split(':')[0] || '08');
        const horaFechamento = parseInt(loja.hora_fechamento?.split(':')[0] || '18');
        
        let slotsPossiveis = [];
        let minutosAtual = horaAbertura * 60;
        const minutosFim = horaFechamento * 60;

        while (minutosAtual + duracaoMinutos <= minutosFim) {
            const h = Math.floor(minutosAtual / 60);
            const m = minutosAtual % 60;
            slotsPossiveis.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            minutosAtual += duracaoMinutos;
        }

        // 🟢 CORREÇÃO CRÍTICA DE TIMEZONE SHIFTING (Força amarração no fuso local -04:00)
        const [ano, mes, dia] = data.split(/[ T]/)[0].split('-');
        const inicioDia = new Date(`${ano}-${mes}-${dia}T00:00:00.000-04:00`);
        const fimDia = new Date(`${ano}-${mes}-${dia}T23:59:59.999-04:00`);

        const agendamentosOcupados = await prisma.agendamentos_servicos.findMany({
            where: {
                id_tenant: Number(tenantId),
                id_loja: loja.id_loja,
                status: { notIn: ['CANCELADO', 'FALHA'] }, 
                data_inicio: { gte: inicioDia, lte: fimDia }
            },
            select: { data_inicio: true, data_fim: true, id_funcionario: true }
        });

        const agoraManaus = new Date(new Date().toLocaleString("en-US", { timeZone: 'America/Manaus' }));
        const hojeAno = agoraManaus.getFullYear();
        const hojeMes = String(agoraManaus.getMonth() + 1).padStart(2, '0');
        const hojeDia = String(agoraManaus.getDate()).padStart(2, '0');
        const hojeFormatado = `${hojeAno}-${hojeMes}-${hojeDia}`;
        const ehHoje = (data === hojeFormatado);

        const totalFuncionarios = profissionais.length || 1; 

        const horariosLivres = slotsPossiveis.filter(slot => {
            const [slotHora, slotMinuto] = slot.split(':').map(Number);
            
            if (ehHoje) {
                const horaAtual = agoraManaus.getHours();
                const minutoAtual = agoraManaus.getMinutes();
                if (slotHora < horaAtual) return false;
                if (slotHora === horaAtual && slotMinuto <= minutoAtual) return false;
            }

            const slotInicioDate = new Date(inicioDia);
            slotInicioDate.setHours(slotHora, slotMinuto, 0, 0);
            const slotFimDate = new Date(slotInicioDate.getTime() + duracaoMinutos * 60000);

            let profissionaisOcupados = 0;

            for (const ag of agendamentosOcupados) {
                const colide = slotInicioDate < ag.data_fim && slotFimDate > ag.data_inicio;
                
                if (colide) {
                    if (id_funcionario && ag.id_funcionario === Number(id_funcionario)) {
                        return false; 
                    }
                    if (!id_funcionario) {
                        profissionaisOcupados++;
                    }
                }
            }

            if (!id_funcionario && profissionaisOcupados >= totalFuncionarios) {
                return false;
            }

            return true;
        });

        const diasFuncionamento = loja.dias_funcionamento 
            ? String(loja.dias_funcionamento).match(/\d/g).map(Number)
            : [0, 1, 2, 3, 4, 5, 6];

        // =========================================================
        // 🟢 BUSCA A CONFIGURAÇÃO DE SINAL DA LOJA PARA O FRONTEND
        // =========================================================
        const configSinal = await prisma.SiteConfig.findFirst({ 
            where: { chave: 'AGENDAMENTO_SINAL_PERCENT', id_tenant: Number(tenantId) } 
        });
        const percentualSinal = configSinal ? Number(configSinal.valor) : 100; // Padrão: 100% (Pagamento integral)

        res.json({ 
            data, 
            loja: { 
                id_loja: loja.id_loja, 
                nome: loja.nome,
                dias_funcionamento: diasFuncionamento.join(',') 
            }, 
            horarios_disponiveis: horariosLivres,
            profissionais: profissionais,
            sinal_percent: percentualSinal // 🟢 ENVIANDO A PORCENTAGEM PRO FRONTEND
        });
    } catch (error) {
        next(error);
    }
};

// ==========================================================
// 🟢 RESTAURADA: Criar Agendamento SIMPLES (Sem gateway de pagamento)
// ==========================================================
export const criarAgendamento = async (req, res, next) => {
    try {
        const { id_loja, id_funcionario, data_inicio, data_fim, observacoes, id_pedido } = req.body;
        const id_usuario = req.user.id_usuario;
        const id_tenant = req.tenantId;

        let whereConflito = {
            id_tenant,
            id_loja,
            status: { notIn: ['CANCELADO', 'FALHA'] },
            OR: [
                { data_inicio: { lt: new Date(data_fim), gte: new Date(data_inicio) } },
                { data_fim: { gt: new Date(data_inicio), lte: new Date(data_fim) } }
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
             
             if (conflitos >= totalProfissionais) {
                 return res.status(409).json({ message: "A loja atingiu o limite máximo de atendimentos para este horário." });
             }
        }

        const novoAgendamento = await prisma.agendamentos_servicos.create({
            data: {
                id_tenant,
                id_usuario,
                id_loja,
                id_funcionario: id_funcionario || null,
                id_pedido: id_pedido || null, 
                data_inicio: new Date(data_inicio),
                data_fim: new Date(data_fim),
                observacoes,
                status: "PENDENTE"
            }
        });

        res.status(201).json(novoAgendamento);
    } catch (error) {
        next(error);
    }
};

// ==========================================================
// 💼 ADMIN/DONO: Ver agendamentos e infos do cliente
// ==========================================================
export const getAgendamentosAdmin = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;

        const agendamentos = await prisma.agendamentos_servicos.findMany({
            where: { id_tenant },
            include: {
                usuarios: {
                    select: {
                        nome_completo: true,
                        email: true,
                        telefone_criptografado: true,
                        cpf_criptografado: true
                    }
                },
                funcionarios: { select: { nome_completo: true, role: true } },
                lojas: { select: { nome: true } },
                pedidos: { select: { status_pagamento: true, preco_total: true, metodo_pagamento: true } }
            },
            orderBy: { data_inicio: 'asc' }
        });

        const agendamentosFormatados = agendamentos.map(ag => ({
            id_agendamento: ag.id_agendamento,
            id_pedido: ag.id_pedido,
            data_inicio: ag.data_inicio,
            data_fim: ag.data_fim,
            status: ag.status,
            observacoes: ag.observacoes,
            loja: ag.lojas.nome,
            profissional: ag.funcionarios ? ag.funcionarios.nome_completo : "Qualquer",
            cliente: {
                nome: ag.usuarios.nome_completo,
                email: ag.usuarios.email,
                telefone: ag.usuarios.telefone_criptografado ? decrypt(ag.usuarios.telefone_criptografado) : null,
                cpf: ag.usuarios.cpf_criptografado ? decrypt(ag.usuarios.cpf_criptografado) : null
            },
            pagamento: ag.pedidos ? {
                status: ag.pedidos.status_pagamento,
                total: ag.pedidos.preco_total,
                metodo: ag.pedidos.metodo_pagamento
            } : "Não vinculado"
        }));

        res.status(200).json(agendamentosFormatados);
    } catch (error) {
        next(error);
    }
};

export const updateStatusAgendamento = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await prisma.agendamentos_servicos.updateMany({
            where: { id_agendamento: Number(id), id_tenant: req.tenantId },
            data: { status }
        });

        res.status(200).json({ message: "Status atualizado com sucesso." });
    } catch (error) {
        next(error);
    }
};

export const getMeusAgendamentos = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const id_tenant = req.tenantId;

        const agendamentos = await prisma.agendamentos_servicos.findMany({
            where: { id_tenant: id_tenant, id_usuario: id_usuario },
            include: {
                lojas: { select: { nome: true, logradouro: true, numero: true, bairro: true, cidade: true } },
                funcionarios: { select: { nome_completo: true } },
                usuarios: { select: { nome_completo: true } },
                pedidos: {
                    select: {
                        preco_total: true,
                        status_pagamento: true,
                        pedido_items: { select: { nome: true, imagem_url: true } }
                    }
                }
            },
            orderBy: { data_inicio: 'desc' }
        });

        const formatados = agendamentos.map(ag => {
            const servico = ag.pedidos?.pedido_items?.[0]; 
            return {
                id_agendamento: ag.id_agendamento,
                data_inicio: ag.data_inicio,
                status_agendamento: ag.status,
                cliente_nome: ag.usuarios?.nome_completo,
                profissional: ag.funcionarios ? ag.funcionarios.nome_completo : "Qualquer profissional",
                local_nome: ag.lojas?.nome,
                local_endereco: `${ag.lojas?.logradouro}, ${ag.lojas?.numero} - ${ag.lojas?.bairro}, ${ag.lojas?.cidade}`,
                servico_nome: servico?.nome || "Serviço",
                servico_imagem: servico?.imagem_url,
                valor_total: ag.pedidos?.preco_total || 0,
                status_pagamento: ag.pedidos?.status_pagamento || "PENDENTE"
            };
        });

        res.status(200).json(formatados);
    } catch (error) {
        next(error);
    }
};