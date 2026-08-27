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

// 🟢 2. ABRIR NOVA COMANDA (Alterada para fixar o ID da Mesa e Criar Usuário)
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

        const mesa = await prisma.mesas.findFirst({ where: { nome: codigo_comanda, id_tenant } });

        let nomeDoAtendente = 'Atendente';
        const idBruto = req.user.id_usuario || req.user.id;

        if (idBruto === 'DONO' || req.user.role === 'PROPRIETÁRIO') {
            const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
            nomeDoAtendente = dono ? dono.nome_fantasia : 'Proprietário';
        } else {
            const idUsuarioReal = await obterIdUsuarioReal(req.user, id_tenant);
            const funcionario = await prisma.funcionarios.findUnique({ where: { id_funcionario: idUsuarioReal } });
            nomeDoAtendente = funcionario ? funcionario.nome_completo : 'Atendente';
        }

        const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
        let consumidorPadrao = await prisma.usuarios.findFirst({ where: { email: emailPadrao, id_tenant } });

        // 🟢 SEGURANÇA: Cria o consumidor padrão caso o banco tenha sido resetado
        if (!consumidorPadrao) {
            consumidorPadrao = await prisma.usuarios.create({
                data: {
                    nome_completo: 'Consumidor Local',
                    email: emailPadrao,
                    hash_senha: 'pdv_safe_pass',
                    id_tenant
                }
            });
        }

        const novaComanda = await prisma.pedidos.create({
            data: {
                id_tenant,
                id_usuario: consumidorPadrao.id_usuario,
                id_mesa: mesa ? mesa.id_mesa : null,
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
                nome_atendente: nomeDoAtendente
            }
        });
        
        if (mesa) {
            await prisma.mesas.update({
                where: { id_mesa: mesa.id_mesa },
                data: { status: 'OCUPADA' }
            });
        }

        res.status(201).json({ message: "Comanda aberta com sucesso!", comanda: novaComanda });
    } catch (error) {
        next(error);
    }
};

// 🟢 3. ADICIONAR ITEM NA COMANDA (ATUALIZADO COM JSON PARA COMPLEMENTOS)
export const adicionarItem = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const { id_produto, id_variacao, quantidade, complementos, observacao } = req.body;
        const id_tenant = req.tenantId;
        
        let nomeDoAtendente = 'Atendente';
        const idBruto = req.user.id_usuario || req.user.id;
        const idUsuarioLogadoReal = await obterIdUsuarioReal(req.user, id_tenant);

        if (idBruto === 'DONO' || req.user.role === 'PROPRIETÁRIO') {
            const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
            nomeDoAtendente = dono ? dono.nome_fantasia : 'Proprietário';
        } else {
            const funcionario = await prisma.funcionarios.findUnique({ where: { id_funcionario: idUsuarioLogadoReal } });
            nomeDoAtendente = funcionario ? funcionario.nome_completo : 'Atendente';
        }

        const quantidadeNum = Number(quantidade);

        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada ou finalizada." });

        const produto = await prisma.produtos.findUnique({ where: { id_produto: Number(id_produto) } });
        if (!produto) return res.status(404).json({ message: "Produto não encontrado." });

        await prisma.$transaction(async (tx) => {
            let precoBasePrincipal = Number(produto.preco);
            let nomeFinalPrincipal = produto.nome;

            // Tratamento de Variação (Tamanho/Cor)
            if (id_variacao) {
                const variacao = await tx.produto_variacoes.findUnique({ where: { id_variacao: Number(id_variacao) } });
                if (variacao) {
                    precoBasePrincipal += Number(variacao.preco_adicional);
                    nomeFinalPrincipal += ` (${variacao.tamanho || variacao.cor || 'Var'})`;
                }
            }

            const subtotalPrincipal = precoBasePrincipal * quantidadeNum;
            let subtotalGeral = subtotalPrincipal;

            // 🟢 1. PREPARA OS COMPLEMENTOS E DÁ BAIXA NO ESTOQUE ANTES DE CRIAR O ITEM PRINCIPAL
            const complementosArray = complementos || [];
            let complementosParaSalvar = [];

            for (const comp of complementosArray) {
                const prodAdic = await tx.produtos.findUnique({ where: { id_produto: Number(comp.id_produto_add) } });
                if (!prodAdic) continue;

                const qtdAdic = Number(comp.quantidade) || 1;
                const qtdTotalAdic = qtdAdic * quantidadeNum;
                const precoAdic = Number(comp.preco_adicional) || 0;
                
                const subtotalAdic = (precoAdic * qtdAdic) * quantidadeNum;
                subtotalGeral += subtotalAdic;

                // Guarda os dados no array que será jogado no campo JSON
                complementosParaSalvar.push({
                    id_produto_add: prodAdic.id_produto,
                    nome: prodAdic.nome,
                    quantidade: qtdAdic,
                    preco_adicional: precoAdic
                });

                // Baixa no estoque do adicional independentemente
                await tx.produtos.update({
                    where: { id_produto: prodAdic.id_produto },
                    data: { estoque: { decrement: qtdTotalAdic } }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        id_produto: prodAdic.id_produto, 
                        quantidade: qtdTotalAdic, 
                        tipo: 'SAIDA',
                        saldo_momento: Number(prodAdic.estoque) - qtdTotalAdic,
                        motivo: `Adicional lançado por ${nomeDoAtendente} (Comanda #${comanda.codigo_comanda})`,
                        origem_destino: 'COMANDA', 
                        usuario_id: idUsuarioLogadoReal
                    }
                });
            }

            // 🟢 2. CRIA APENAS 1 LINHA NO BANCO COM O ITEM PRINCIPAL + JSON DOS COMPLEMENTOS
            await tx.pedido_items.create({
                data: {
                    id_pedido: comanda.id_pedido, 
                    id_produto: produto.id_produto, 
                    id_variacao: id_variacao || null,
                    nome: nomeFinalPrincipal, 
                    quantidade: quantidadeNum, 
                    preco: precoBasePrincipal,
                    imagem_url: produto.imagem_url, 
                    id_tenant, 
                    nome_atendente: nomeDoAtendente,
                    observacao: observacao || null,
                    complementos: complementosParaSalvar.length > 0 ? complementosParaSalvar : null
                }
            });

            // 3. Atualiza os Totais da Comanda e Baixa Estoque do Principal
            await tx.pedidos.update({
                where: { id_pedido: comanda.id_pedido },
                data: {
                    preco_total: { increment: subtotalGeral },
                    preco_itens: { increment: subtotalGeral },
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
                    motivo: `Lançado por ${nomeDoAtendente} na Comanda #${comanda.codigo_comanda}`,
                    origem_destino: 'COMANDA', 
                    usuario_id: idUsuarioLogadoReal
                }
            });
        });

        res.status(200).json({ message: "Item e adicionais lançados com sucesso!" });
    } catch (error) { next(error); }
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

        // Aqui, calcula o estorno também considerando se houver adicionais atrelados
        // Se item.complementos for um array JSON, precisaremos somar os valores deles caso não venha no "item.preco" direto
        // Supondo que item.preco já reflete o valor correto ou o front resolva, mantemos a lógica ou calculamos com os complementos:
        
        let subtotalComplementos = 0;
        let complementosArray = [];
        
        if (item.complementos && typeof item.complementos === 'object') {
            complementosArray = Array.isArray(item.complementos) ? item.complementos : Object.values(item.complementos);
            complementosArray.forEach(comp => {
                subtotalComplementos += (Number(comp.preco_adicional) * Number(comp.quantidade)) * Number(item.quantidade);
            });
        }

        const subtotal = (Number(item.preco) * Number(item.quantidade)) + subtotalComplementos;

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

            // Estorno do estoque dos complementos vinculados
            if (complementosArray.length > 0) {
                for (const comp of complementosArray) {
                    const qtdTotalEstornar = Number(comp.quantidade) * Number(item.quantidade);
                    const prodAdic = await tx.produtos.findUnique({ where: { id_produto: Number(comp.id_produto_add) } });
                    
                    if (prodAdic) {
                        await tx.produtos.update({
                            where: { id_produto: prodAdic.id_produto },
                            data: { estoque: { increment: qtdTotalEstornar } }
                        });
                        
                        await tx.movimentacaoEstoque.create({
                            data: {
                                id_produto: prodAdic.id_produto,
                                quantidade: qtdTotalEstornar,
                                tipo: 'ENTRADA',
                                saldo_momento: Number(prodAdic.estoque) + qtdTotalEstornar,
                                motivo: `Adicional removido da Comanda (Estorno)`,
                                origem_destino: 'COMANDA',
                                usuario_id: id_usuario_logado
                            }
                        });
                    }
                }
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
            // 1. Atualiza o Pedido
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

            // 2. Incrementa visualizações dos produtos
            const itensVendidos = await tx.pedido_items.findMany({ where: { id_pedido: comanda.id_pedido } });
            for (const item of itensVendidos) {
                if (item.id_produto) {
                    await tx.produtos.updateMany({
                        where: { id_produto: item.id_produto },
                        data: { visualizacoes: { increment: 1 } }
                    });
                }
            }

            // 3. Atualiza o saldo do caixa
            await tx.caixa_pdv.updateMany({
                where: { id_caixa: caixaAtivo.id_caixa, id_tenant },
                data: { saldo_sistema: { increment: comanda.preco_total } }
            });

            // 4. 🟢 MÁGICA: Extrai todos os números separados (Ex: "03 + 02" vira ["03", "02"])
            const nomesMesas = comanda.codigo_comanda.split('+').map(n => n.replace(/[()]/g, '').trim());

            // Libera TODAS as mesas que fizeram parte dessa comanda de uma vez só!
            await tx.mesas.updateMany({
                where: {
                    id_tenant,
                    OR: [
                        { nome: { in: nomesMesas } },
                        { mesa_agrupada: { in: nomesMesas } },
                        { id_mesa: comanda.id_mesa || -1 }
                    ]
                },
                data: { status: 'LIVRE', mesa_agrupada: null }
            });
        });

        // 5. Integração com o Financeiro
        try {
            await gerarRecebivelDePedido(comanda, id_tenant);
            await registrarEntradaFinanceira({
                id_pedido: comanda.id_pedido,
                id_usuario: comanda.id_usuario,
                gateway_provider: 'PDV',
                gateway_id: `PDV-${comanda.id_pedido}`,
                valor_bruto: comanda.preco_total,
                valor_taxa_real: 0,
                id_tenant
            });
        } catch (finErr) {}

        if (req.app.get('io')) req.app.get('io').emit('ATUALIZAR_COMANDAS', { id_tenant });

        res.status(200).json({ message: "Comanda encerrada com sucesso e lançada no fluxo de caixa!" });
    } catch (error) {
        next(error);
    }
};

// 🟢 6. JUNTAR COMANDAS (MERGE) - Atualizado e Seguro!
export const juntarComandas = async (req, res, next) => {
    try {
        const { id_mesa_origem, id_comanda_destino, tipo_juncao } = req.body;
        const id_tenant = req.tenantId;

        if (!id_mesa_origem || !id_comanda_destino) {
            return res.status(400).json({ message: "Dados incompletos para juntar as mesas." });
        }

        const destino = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_comanda_destino), id_tenant, status_comanda: 'ABERTA' }
        });

        if (!destino) return res.status(404).json({ message: "A mesa destino não está aberta." });

        const mesaOrigem = await prisma.mesas.findFirst({
            where: { id_mesa: Number(id_mesa_origem), id_tenant }
        });

        if (!mesaOrigem) return res.status(404).json({ message: "Mesa de origem não encontrada." });

        // 🟢 ACHA A MESA DESTINO FÍSICA PARA AMARRAR CORRETAMENTE NO AUTOATENDIMENTO
        let nomeMesaDestinoFisica = destino.codigo_comanda; // Fallback
        if (destino.id_mesa) {
            const md = await prisma.mesas.findFirst({ where: { id_mesa: destino.id_mesa } });
            if (md) nomeMesaDestinoFisica = md.nome;
        } else {
            // Se a destino for fantasma, o codigo_comanda é o próprio nome original
            nomeMesaDestinoFisica = destino.codigo_comanda.split(' + ')[0]; 
        }

        if (mesaOrigem.nome === nomeMesaDestinoFisica) return res.status(400).json({ message: "Não pode juntar a mesa com ela mesma." });

        // 🟢 MÁGICA: Buscar a comanda da mesa de origem de forma "blindada" (Fantasmas incluídas)
        const origemComanda = await prisma.pedidos.findFirst({
            where: { 
                OR: [
                    { id_mesa: mesaOrigem.id_mesa },
                    { codigo_comanda: mesaOrigem.nome }
                ],
                id_tenant, 
                status_comanda: { in: ['ABERTA', 'FECHANDO'] } 
            },
            include: { pedido_items: true }
        });

        await prisma.$transaction(async (tx) => {
            if (tipo_juncao === 'UNIR_CONTAS') {
                // 🟢 OPÇÃO 1: Juntar TUDO em 1 comanda só
                const novoNomeDestino = `${destino.codigo_comanda} + ${mesaOrigem.nome}`;

                if (origemComanda) {
                    // Se tinha itens na mesa 1, joga todos para a mesa 2
                    if (origemComanda.pedido_items.length > 0) {
                        await tx.pedido_items.updateMany({
                            where: { id_pedido: origemComanda.id_pedido },
                            data: { id_pedido: destino.id_pedido }
                        });
                    }

                    // Atualiza a comanda destino com os valores e novo nome
                    await tx.pedidos.update({
                        where: { id_pedido: destino.id_pedido },
                        data: {
                            preco_total: { increment: origemComanda.preco_total },
                            preco_itens: { increment: origemComanda.preco_itens },
                            codigo_comanda: novoNomeDestino
                        }
                    });

                    // Invalida a comanda antiga para não contar duas vezes
                    await tx.pedidos.update({
                        where: { id_pedido: origemComanda.id_pedido },
                        data: { status_comanda: 'MESCLADA', preco_total: 0, preco_itens: 0 }
                    });
                } else {
                    // Se não tinha pedido, só atualiza o nome
                    await tx.pedidos.update({
                        where: { id_pedido: destino.id_pedido },
                        data: { codigo_comanda: novoNomeDestino }
                    });
                }

                // Bloqueia a mesa origem e amarra à MESA FÍSICA de destino
                await tx.mesas.update({
                    where: { id_mesa: mesaOrigem.id_mesa },
                    data: { status: 'AGRUPADA', mesa_agrupada: nomeMesaDestinoFisica }
                });

            } else {
                // 🟢 OPÇÃO 2: Contas Separadas (Apenas visual)
                if (origemComanda) {
                    await tx.pedidos.update({
                        where: { id_pedido: origemComanda.id_pedido },
                        data: { codigo_comanda: `${mesaOrigem.nome} (+${nomeMesaDestinoFisica})` }
                    });
                }
                await tx.pedidos.update({
                    where: { id_pedido: destino.id_pedido },
                    data: { codigo_comanda: `${destino.codigo_comanda} (+${mesaOrigem.nome})` }
                });
            }
        });

        if (req.app.get('io')) {
            req.app.get('io').emit('ATUALIZAR_COMANDAS', { id_tenant });
        }

        res.status(200).json({ message: "Mesas organizadas com sucesso!" });
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
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO', 'MESCLADA'] } },
            include: { pedido_items: true }
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada." });
        
        if (comanda.pedido_items && comanda.pedido_items.length > 0) {
            return res.status(400).json({ message: "Não é possível cancelar uma comanda que possui itens." });
        }

        await prisma.$transaction(async (tx) => {
            await tx.pedidos.delete({ where: { id_pedido: comanda.id_pedido } });
            
            // 🟢 MÁGICA DE DESBLOQUEIO TAMBÉM NO CANCELAMENTO
            const nomesMesas = comanda.codigo_comanda.split('+').map(n => n.replace(/[()]/g, '').trim());

            await tx.mesas.updateMany({
                where: {
                    id_tenant,
                    OR: [
                        { nome: { in: nomesMesas } },
                        { mesa_agrupada: { in: nomesMesas } },
                        { id_mesa: comanda.id_mesa || -1 }
                    ]
                },
                data: { status: 'LIVRE', mesa_agrupada: null }
            });
        });

        if (req.app.get('io')) req.app.get('io').emit('ATUALIZAR_COMANDAS', { id_tenant });

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

        // 1. Busca a comanda apenas com os itens (Sem tentar o include do produto)
        const comanda = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } },
            include: { pedido_items: true } 
        });

        if (!comanda) return res.status(404).json({ message: "Comanda não encontrada." });
        if (comanda.pedido_items.length === 0) return res.status(400).json({ message: "A comanda está vazia." });

        // 2. Extrai os IDs dos produtos e busca eles separadamente junto com as categorias
        const idsProdutos = comanda.pedido_items.map(i => i.id_produto).filter(id => id !== null);
        const produtosDb = await prisma.produtos.findMany({
            where: { id_produto: { in: idsProdutos }, id_tenant },
            include: { categorias: true }
        });

        // 3. Busca todas as impressoras
        const impressoras = await prisma.impressoras.findMany({ where: { id_tenant, ativo: true } });
        const impPadrao = impressoras.find(i => i.is_padrao) || impressoras[0];

        // 4. Agrupa os itens por impressora
        const jobs = {};

        comanda.pedido_items.forEach(item => {
            // Acha os dados do produto correspondente
            const produtoReal = produtosDb.find(p => p.id_produto === item.id_produto);
            
            // Descobre o ID da impressora amarrada na categoria do produto
            const idImp = produtoReal?.categorias?.id_impressora;
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
                quantidade: item.quantidade,
                observacao: item.observacao,
                // 🟢 Agora a impressora também recebe os complementos (JSON) para a via da cozinha!
                complementos: item.complementos || [] 
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