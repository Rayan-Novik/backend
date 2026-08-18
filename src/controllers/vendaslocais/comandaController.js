import { PrismaClient } from '@prisma/client';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../../services/financialService.js';
import { obterIdUsuarioReal } from './pdvController.js'; 

const prisma = new PrismaClient();

// 🟢 1. LISTAR COMANDAS ABERTAS
export const listarComandas = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const comandas = await prisma.pedidos.findMany({
            where: {
                id_tenant,
                canal_venda: 'COMANDA',
                // 🟢 CORREÇÃO: Agora ele traz tanto as abertas quanto as que o garçom pediu a conta!
                status_comanda: { in: ['ABERTA', 'FECHANDO'] } 
            },
            include: {
                pedido_items: true
            },
            orderBy: { data_pedido: 'asc' }
        });
        res.status(200).json(comandas);
    } catch (error) {
        next(error);
    }
};

// 🟢 2. ABRIR NOVA COMANDA
export const abrirComanda = async (req, res, next) => {
    try {
        const { codigo_comanda, nome_cliente } = req.body;
        const id_tenant = req.tenantId;

        const comandaExistente = await prisma.pedidos.findFirst({
            where: { id_tenant, codigo_comanda, status_comanda: { in: ['ABERTA', 'FECHANDO'] } }
        });

        if (comandaExistente) {
            return res.status(400).json({ message: `A comanda ${codigo_comanda} já está ativa.` });
        }

        // 🟢 RESOLUÇÃO DINÂMICA DE NOME (Tenants vs Funcionarios)
        let nomeDoAtendente = 'Atendente';
        const idBruto = req.user.id_usuario || req.user.id;

        if (idBruto === 'DONO' || req.user.role === 'PROPRIETÁRIO') {
            // Se for o dono, busca o nome fantasia na tabela tenants
            const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
            nomeDoAtendente = dono ? dono.nome_fantasia : 'Proprietário';
        } else {
            // Se for funcionário, busca o nome completo na tabela funcionarios
            const idUsuarioReal = await obterIdUsuarioReal(req.user, id_tenant);
            const funcionario = await prisma.funcionarios.findUnique({ where: { id_funcionario: idUsuarioReal } });
            nomeDoAtendente = funcionario ? funcionario.nome_completo : 'Atendente';
        }

        const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
        let consumidorPadrao = await prisma.usuarios.findFirst({ where: { email: emailPadrao, id_tenant } });

        const novaComanda = await prisma.pedidos.create({
            data: {
                id_tenant,
                id_usuario: consumidorPadrao.id_usuario,
                codigo_comanda,
                nome_cliente_comanda: nome_cliente || '',
                canal_venda: 'COMANDA', 
                metodo_envio: 'Consumo no Local',
                status_comanda: 'ABERTA',
                status_pagamento: 'PENDENTE',
                status_entrega: 'Pendente',
                preco_total: 0,
                preco_itens: 0,
                preco_frete: 0,
                metodo_pagamento: 'A DEFINIR',
                nome_atendente: nomeDoAtendente // Salva o nome resolvido
            }
        });

        res.status(201).json({ message: "Comanda aberta com sucesso!", comanda: novaComanda });
    } catch (error) {
        next(error);
    }
};

// 🟢 3. ADICIONAR ITEM NA COMANDA (Reserva Estoque)
export const adicionarItem = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const { id_produto, id_variacao, quantidade } = req.body;
        const id_tenant = req.tenantId;
        
        // 🟢 RESOLUÇÃO DINÂMICA DE NOME (Tenants vs Funcionarios)
        let nomeDoAtendente = 'Atendente';
        const idBruto = req.user.id_usuario || req.user.id;
        const idUsuarioLogadoReal = await obterIdUsuarioReal(req.user, id_tenant);

        if (idBruto === 'DONO' || req.user.role === 'PROPRIETÁRIO') {
            // Se for o dono, busca na tabela tenants
            const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
            nomeDoAtendente = dono ? dono.nome_fantasia : 'Proprietário';
        } else {
            // Se for funcionário, busca na tabela funcionarios
            const funcionario = await prisma.funcionarios.findUnique({ where: { id_funcionario: idUsuarioLogadoReal } });
            nomeDoAtendente = funcionario ? funcionario.nome_completo : 'Atendente';
        }

        const quantidadeNum = Number(quantidade);

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada ou finalizada." });

        const produto = await prisma.produtos.findUnique({
            where: { id_produto: Number(id_produto) }
        });

        if (!produto) return res.status(404).json({ message: "Produto não encontrado." });

        const subtotal = Number(produto.preco) * quantidadeNum;

        await prisma.$transaction(async (tx) => {
            await tx.pedido_items.create({
                data: {
                    id_pedido: comanda.id_pedido,
                    id_produto: produto.id_produto,
                    id_variacao: id_variacao || null,
                    nome: produto.nome,
                    quantidade: quantidadeNum,
                    preco: produto.preco,
                    imagem_url: produto.imagem_url,
                    id_tenant,
                    nome_atendente: nomeDoAtendente // Salva quem lançou o produto
                }
            });

            await tx.pedidos.update({
                where: { id_pedido: comanda.id_pedido },
                data: {
                    preco_total: { increment: subtotal },
                    preco_itens: { increment: subtotal },
                    status_comanda: 'ABERTA'
                }
            });

            await tx.produtos.update({
                where: { id_produto: produto.id_produto },
                data: { estoque: { decrement: quantidadeNum } }
            });

            await tx.movimentacaoEstoque.create({
                data: {
                    id_produto: produto.id_produto,
                    quantidade: quantidadeNum,
                    tipo: 'SAIDA',
                    saldo_momento: Number(produto.estoque) - quantidadeNum,
                    motivo: `Adicionado na Comanda #${comanda.codigo_comanda} por ${nomeDoAtendente}`,
                    origem_destino: 'COMANDA',
                    usuario_id: idUsuarioLogadoReal
                }
            });
        });

        res.status(200).json({ message: "Item adicionado com sucesso!" });
    } catch (error) {
        next(error);
    }
};

// 🟢 4. REMOVER ITEM DA COMANDA (Estorna Estoque)
export const removerItem = async (req, res, next) => {
    try {
        const { id_pedido, id_item } = req.params;
        const id_tenant = req.tenantId;
        const id_usuario_logado = await obterIdUsuarioReal(req.user, id_tenant);

        const item = await prisma.pedido_items.findFirst({
            where: { id_item: Number(id_item), id_pedido: Number(id_pedido), id_tenant }
        });

        if (!item) return res.status(404).json({ message: "Item não encontrado nesta comanda." });

        const subtotal = Number(item.preco) * Number(item.quantidade);

        await prisma.$transaction(async (tx) => {
            await tx.pedido_items.delete({
                where: { id_item: item.id_item }
            });

            await tx.pedidos.update({
                where: { id_pedido: Number(id_pedido) },
                data: {
                    preco_total: { decrement: subtotal },
                    preco_itens: { decrement: subtotal }
                }
            });

            if (item.id_produto) {
                const prod = await tx.produtos.findUnique({ where: { id_produto: item.id_produto } });
                
                await tx.produtos.update({
                    where: { id_produto: item.id_produto },
                    data: { estoque: { increment: item.quantidade } }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        id_produto: item.id_produto,
                        quantidade: item.quantidade,
                        tipo: 'ENTRADA',
                        saldo_momento: Number(prod.estoque) + Number(item.quantidade),
                        motivo: `Removido da Comanda (Estorno)`,
                        origem_destino: 'COMANDA',
                        usuario_id: id_usuario_logado
                    }
                });
            }
        });

        res.status(200).json({ message: "Item removido e estoque estornado." });
    } catch (error) {
        next(error);
    }
};

// 🟢 5. FECHAR E PAGAR COMANDA NO CAIXA
export const fecharPagamentoComanda = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const { metodo_pagamento } = req.body;
        const id_tenant = req.tenantId;

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada." });

        const caixaAtivo = await prisma.caixa_pdv.findFirst({
            where: { id_tenant, status: 'ABERTO' }
        });

        if (!caixaAtivo) {
            return res.status(400).json({ message: "Caixa fechado. Abra o caixa para receber a comanda." });
        }

        await prisma.$transaction(async (tx) => {
            // 1. Atualiza o Pedido (Injetando no Caixa PDV correto)
            await tx.pedidos.update({
                where: { id_pedido: comanda.id_pedido },
                data: {
                    status_comanda: 'FINALIZADO',
                    status_pagamento: 'PAGO',
                    status_entrega: 'Entregue',
                    metodo_pagamento: metodo_pagamento,
                    id_caixa_pdv: caixaAtivo.id_caixa
                }
            });

            // 2. Incrementa visualizações para o Dashboard!
            const itensVendidos = await tx.pedido_items.findMany({ where: { id_pedido: comanda.id_pedido } });
            for (const item of itensVendidos) {
                if (item.id_produto) {
                    await tx.produtos.updateMany({
                        where: { id_produto: item.id_produto },
                        data: { visualizacoes: { increment: 1 } }
                    });
                }
            }

            // ❌ O CLONE DA TRANSAÇÃO FOI DELETADO DAQUI (Passo 3 apagado)

            // 4. Atualiza o saldo do sistema no caixa na hora
            await tx.caixa_pdv.updateMany({
                where: { id_caixa: caixaAtivo.id_caixa, id_tenant },
                data: { saldo_sistema: { increment: comanda.preco_total } }
            });

            // 5. Libera a mesa física
            await tx.mesas.updateMany({
                where: { nome: comanda.codigo_comanda, id_tenant },
                data: { status: 'LIVRE', mesa_agrupada: null }
            });
        });

        // 6. Integra com o Fechamento Global do Sistema
        try {
            await gerarRecebivelDePedido(comanda, id_tenant);
            
            // 🟢 Aqui é o ÚNICO lugar onde o financeiro é chamado!
            await registrarEntradaFinanceira({
                id_pedido: comanda.id_pedido,
                id_usuario: comanda.id_usuario,
                gateway_provider: 'PDV',
                gateway_id: `PDV-${comanda.id_pedido}`,
                valor_bruto: comanda.preco_total,
                valor_taxa_real: 0,
                id_tenant
            });
        } catch (finErr) {
            console.log("Aviso Financeiro Global:", finErr.message);
        }

        res.status(200).json({ message: "Comanda encerrada com sucesso e lançada no fluxo de caixa!" });
    } catch (error) {
        next(error);
    }
};

// 🟢 6. JUNTAR COMANDAS (MERGE) - Atualizado e Seguro!
export const juntarComandas = async (req, res, next) => {
    try {
        const { id_mesa_origem, id_comanda_destino } = req.body;
        const id_tenant = req.tenantId;

        if (!id_mesa_origem || !id_comanda_destino) {
            return res.status(400).json({ message: "Dados incompletos para juntar as mesas." });
        }

        const destino = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_comanda_destino), id_tenant, status_comanda: 'ABERTA' }
        });

        if (!destino) return res.status(404).json({ message: "A mesa de destino precisa estar aberta." });

        const mesaOrigem = await prisma.mesas.findFirst({
            where: { id_mesa: Number(id_mesa_origem), id_tenant }
        });

        if (!mesaOrigem) return res.status(404).json({ message: "Mesa de origem não encontrada." });
        if (mesaOrigem.nome === destino.codigo_comanda) return res.status(400).json({ message: "Não pode juntar a mesa com ela mesma." });

        // Tenta achar a comanda da mesa que o garçom arrastou (pode não existir se estiver livre)
        const origemComanda = await prisma.pedidos.findFirst({
            where: { codigo_comanda: mesaOrigem.nome, id_tenant, status_comanda: 'ABERTA' },
            include: { pedido_items: true }
        });

        await prisma.$transaction(async (tx) => {
            // Se a mesa arrastada tinha uma comanda ativa, nós transferimos tudo para o destino
            if (origemComanda) {
                if (origemComanda.pedido_items.length > 0) {
                    await tx.pedido_items.updateMany({
                        where: { id_pedido: origemComanda.id_pedido },
                        data: { id_pedido: destino.id_pedido }
                    });

                    await tx.pedidos.update({
                        where: { id_pedido: destino.id_pedido },
                        data: {
                            preco_total: { increment: origemComanda.preco_total },
                            preco_itens: { increment: origemComanda.preco_itens }
                        }
                    });
                }

                // Mata a comanda antiga para não dar conflito financeiro
                await tx.pedidos.update({
                    where: { id_pedido: origemComanda.id_pedido },
                    data: { status_comanda: 'MESCLADA', preco_total: 0, preco_itens: 0 }
                });
            }

            // O passo principal: Travar a mesa no mundo físico
            await tx.mesas.update({
                where: { id_mesa: mesaOrigem.id_mesa },
                data: { 
                    status: 'AGRUPADA', 
                    mesa_agrupada: destino.codigo_comanda 
                }
            });
        });

        res.status(200).json({ message: "Mesas unidas com sucesso!" });
    } catch (error) {
        next(error);
    }
};

// 🟢 7. SEPARAR COMANDA (SPLIT)
export const separarComanda = async (req, res, next) => {
    try {
        const { id_comanda_origem, itens_para_mover, nome_cliente_novo } = req.body;
        const id_tenant = req.tenantId;

        if (!itens_para_mover || itens_para_mover.length === 0) {
            return res.status(400).json({ message: "Nenhum item selecionado para separar." });
        }

        const origem = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_comanda_origem), id_tenant, status_comanda: 'ABERTA' }
        });

        if (!origem) return res.status(404).json({ message: "Comanda de origem não encontrada." });

        const itens = await prisma.pedido_items.findMany({
            where: { 
                id_item: { in: itens_para_mover },
                id_pedido: origem.id_pedido 
            }
        });

        if (itens.length === 0) return res.status(400).json({ message: "Itens inválidos." });

        const valorTransferido = itens.reduce((acc, item) => acc + (Number(item.preco) * Number(item.quantidade)), 0);

        await prisma.$transaction(async (tx) => {
            const novaComanda = await tx.pedidos.create({
                data: {
                    id_tenant,
                    id_usuario: origem.id_usuario, 
                    id_mesa: origem.id_mesa, 
                    codigo_comanda: `${origem.codigo_comanda} (Parcial)`,
                    nome_cliente_comanda: nome_cliente_novo || 'Cliente Separado',
                    canal_venda: 'COMANDA',
                    status_comanda: 'ABERTA',
                    status_pagamento: 'PENDENTE',
                    status_entrega: 'Pendente',
                    preco_total: valorTransferido,
                    preco_itens: valorTransferido,
                    preco_frete: 0,
                    metodo_pagamento: 'A DEFINIR'
                }
            });

            await tx.pedido_items.updateMany({
                where: { id_item: { in: itens_para_mover } },
                data: { id_pedido: novaComanda.id_pedido }
            });

            await tx.pedidos.update({
                where: { id_pedido: origem.id_pedido },
                data: {
                    preco_total: { decrement: valorTransferido },
                    preco_itens: { decrement: valorTransferido }
                }
            });
        });

        res.status(200).json({ message: "Comanda dividida com sucesso!" });
    } catch (error) {
        next(error);
    }
};

export const verificarCaixaLoja = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        // Procura se tem QUALQUER caixa aberto neste tenant
        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_tenant, status: 'ABERTO' }
        });
        
        res.status(200).json({ isAberto: !!caixaAberto });
    } catch (error) {
        next(error);
    }
};

export const cancelarComanda = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const id_tenant = req.tenantId;

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: 'ABERTA' },
            include: { pedido_items: true }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada." });
        
        // Trava de segurança: Se tiver itens, não deixa apagar.
        if (comanda.pedido_items && comanda.pedido_items.length > 0) {
            return res.status(400).json({ message: "Não é possível cancelar uma comanda que possui itens." });
        }

        await prisma.$transaction(async (tx) => {
            // Deleta o pedido fantasma
            await tx.pedidos.delete({
                where: { id_pedido: comanda.id_pedido }
            });
            
            // Libera a mesa física associada a esse nome
            await tx.mesas.updateMany({
                where: { nome: comanda.codigo_comanda, id_tenant },
                data: { status: 'LIVRE', mesa_agrupada: null }
            });
        });

        res.status(200).json({ message: "Atendimento cancelado e mesa liberada." });
    } catch (error) {
        next(error);
    }
};


// ==========================================================
// 🖨️ ROTEAMENTO DE IMPRESSÃO VIA SOCKET.IO (P/ O COMPUTADOR DO CAIXA)
// ==========================================================

// 🟢 9. GARÇOM SOLICITA O FECHAMENTO DA CONTA
export const solicitarFechamentoComanda = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const id_tenant = req.tenantId;

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } },
            include: { pedido_items: true }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada ou já fechada." });
        if (Number(comanda.preco_total) <= 0) return res.status(400).json({ message: "Comanda vazia, cancele os itens." });

        await prisma.pedidos.update({
            where: { id_pedido: comanda.id_pedido },
            data: { 
                status_comanda: 'FECHANDO',
                canal_venda: 'COMANDA',
                metodo_envio: 'Consumo no Local'
            }
        });

        // 🟢 PREPARA O PACOTE DE IMPRESSÃO (Envia a conta inteira para a Impressora Padrão)
        const impPadrao = await prisma.impressoras.findFirst({
            where: { id_tenant, is_padrao: true, ativo: true }
        });

        let printJobs = [];
        if (impPadrao && comanda.pedido_items.length > 0) {
            printJobs.push({
                tipo: 'CONTA',
                mesa: comanda.codigo_comanda,
                impressora: impPadrao,
                total: comanda.preco_total,
                itens: comanda.pedido_items.map(i => ({ nome: i.nome, quantidade: i.quantidade, preco: i.preco }))
            });
        }

        // 📣 AVISA O COMPUTADOR PRINCIPAL VIA SOCKET.IO PARA IMPRIMIR
        if (req.app.get('io') && printJobs.length > 0) {
            req.app.get('io').emit('NOVA_IMPRESSAO', {
                id_tenant: id_tenant,
                jobs: printJobs
            });
        }

        res.status(200).json({ message: "Conta solicitada! O caixa foi notificado e a impressão iniciada." });
    } catch (error) {
        next(error);
    }
};

// 🟢 11. IMPRIMIR PEDIDO PARA A COZINHA E BAR (Roteamento Inteligente)
export const imprimirCozinha = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const id_tenant = req.tenantId;

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } },
            include: { 
                pedido_items: {
                    include: {
                        produtos: { include: { categorias: true } }
                    }
                } 
            }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada." });
        if (comanda.pedido_items.length === 0) return res.status(400).json({ message: "A comanda está vazia." });

        // 🟢 BUSCA TODAS AS IMPRESSORAS DO TENANT
        const impressoras = await prisma.impressoras.findMany({ where: { id_tenant, ativo: true } });
        const impPadrao = impressoras.find(i => i.is_padrao) || impressoras[0];

        // 🟢 SEPARA OS ITENS POR IMPRESSORA BASEADO NA CATEGORIA
        const jobs = {};

        comanda.pedido_items.forEach(item => {
            const idImp = item.produtos?.categorias?.id_impressora;
            const printer = impressoras.find(i => i.id_impressora === idImp) || impPadrao;

            if (!printer) return; // Se não tiver impressora cadastrada, ignora

            if (!jobs[printer.id_impressora]) {
                jobs[printer.id_impressora] = {
                    tipo: 'COZINHA',
                    mesa: comanda.codigo_comanda,
                    impressora: printer,
                    itens: []
                };
            }
            jobs[printer.id_impressora].itens.push({
                nome: item.nome,
                quantidade: item.quantidade
            });
        });

        const pacotesDeImpressao = Object.values(jobs);

        // 📣 AVISA O COMPUTADOR PRINCIPAL VIA SOCKET.IO PARA IMPRIMIR
        if (req.app.get('io') && pacotesDeImpressao.length > 0) {
            req.app.get('io').emit('NOVA_IMPRESSAO', {
                id_tenant: id_tenant,
                jobs: pacotesDeImpressao
            });
        }

        res.status(200).json({ message: "Pedido enviado para a produção! A central de impressão foi notificada." });
    } catch (error) {
        next(error);
    }
};