import financeiroService from '../services/financialService.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getDashboardFinanceiro = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const dados = await financeiroService.getDashboardFinanceiro(startDate, endDate, req.tenantId);
        res.json(dados);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getRelatorioTransacoes = async (req, res) => {
    try {
        const { startDate, endDate, gateway } = req.query;
        const id_tenant = Number(req.tenantId);

        let whereClause = { id_tenant: id_tenant };

        // 1. Aplica o filtro de Datas
        if (startDate && endDate) {
            whereClause.data_criacao = {
                gte: new Date(startDate),
                lte: new Date(endDate) // O React já manda com T23:59:59
            };
        }

        // 2. Aplica o filtro de Gateway/Origem
        if (gateway && gateway !== 'ALL') {
            whereClause.gateway_provider = gateway;
        }

        // 3. Busca no banco incluindo os itens do pedido
        const transacoes = await prisma.transacoes_financeiras.findMany({
            where: whereClause,
            orderBy: { data_criacao: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } },
                pedidos: { 
                    include: { 
                        pedido_items: {
                            select: { nome: true, quantidade: true, preco: true }
                        } 
                    } 
                }
            }
        });

        // 4. MATA OS FANTASMAS (Remove duplicatas mantendo 1 por pedido)
        const transacoesUnicas = Array.from(new Map(transacoes.map(tx => [tx.id_pedido, tx])).values());

        // 5. Recalcula os totais com base na lista limpa e filtrada
        const summary = {
            bruto: transacoesUnicas.reduce((acc, tx) => acc + Number(tx.valor_bruto || 0), 0),
            taxas: transacoesUnicas.reduce((acc, tx) => acc + Number(tx.valor_taxa || 0), 0),
            liquido: transacoesUnicas.reduce((acc, tx) => acc + Number(tx.valor_liquido || 0), 0)
        };

        res.json({ summary, history: transacoesUnicas });
    } catch (error) {
        console.error("Erro no getRelatorioTransacoes:", error);
        res.status(500).json({ message: error.message });
    }
};

export const listarContasPagar = async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        // Garante que o tenantId é número (Evita falha silenciosa do Prisma)
        let where = { id_tenant: Number(req.tenantId) };
        
        if (status && status !== 'TODOS') {
            where.status = status;
            
            // Se filtrou por status específico (ex: PAGO), só olha as datas do filtro
            if (startDate && endDate) {
                where.data_vencimento = {
                    gte: new Date(`${startDate.split('T')[0]}T00:00:00.000Z`),
                    lte: new Date(`${endDate.split('T')[0]}T23:59:59.999Z`)
                };
            }
        } else {
            // LÓGICA DE ERP: Traz contas do mês + Dívidas antigas em aberto
            if (startDate && endDate) {
                const start = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`);
                const end = new Date(`${endDate.split('T')[0]}T23:59:59.999Z`);
                
                where.OR = [
                    { 
                        // Dívidas em aberto (não importa o mês)
                        status: { in: ['PENDENTE', 'VENCIDO', 'PARCIALMENTE_PAGO'] } 
                    },
                    {
                        // Contas pagas ou canceladas (APENAS se for do mês filtrado)
                        status: { in: ['PAGO', 'CANCELADO'] },
                        data_vencimento: { gte: start, lte: end } 
                    }
                ];
            }
        }

        console.log("🔍 QUERY ENVIADA AO BANCO (PAGAR):", JSON.stringify(where, null, 2));

        const contas = await prisma.financeiro_contas_pagar.findMany({
            where,
            include: {
                // 🟢 CORRIGIDO AQUI: "fornecedores" no plural conforme seu banco de dados
                fornecedores: { select: { nome_loja: true } },
                financeiro_categorias: true 
            },
            orderBy: { data_vencimento: 'asc' }
        });

        console.log("✅ RESULTADO DO BANCO (PAGAR):", contas.length, "contas.");

        const contasFormatadas = contas.map(c => ({
            ...c,
            // 🟢 CORRIGIDO AQUI: Adaptando o nome de volta para o frontend
            fornecedor: c.fornecedores ? { nome_loja: c.fornecedores.nome_loja } : null,
            categoria: c.financeiro_categorias
        }));

        res.json(contasFormatadas);
    } catch (error) {
        console.error("❌ ERRO FATAL (LISTAR PAGAR):", error);
        res.status(500).json({ message: error.message });
    }
};

export const criarContaPagar = async (req, res) => {
    try {
        const userId = req.user.id_usuario;
        
        const contas = await financeiroService.criarContaPagar(req.body, req.body.parcelas || 1, 30, userId, req.tenantId);
        res.status(201).json({ message: "Contas geradas com sucesso", contas });
    } catch (error) {
        console.error("❌ Erro criar conta pagar:", error);
        res.status(400).json({ message: error.message });
    }
};

export const baixarContaPagar = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id_usuario;
        
        const resultado = await financeiroService.baixarContaPagar(id, req.body, userId, req.tenantId);
        res.json({ message: "Baixa realizada com sucesso", ...resultado });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getContaPagarById = async (req, res) => {
    try {
        const { id } = req.params;
        const conta = await prisma.financeiro_contas_pagar.findFirst({
            where: { 
                id: Number(id),
                id_tenant: Number(req.tenantId)
            },
            include: {
                financeiro_baixas: true, 
                // 🟢 CORRIGIDO AQUI: "fornecedores" no plural
                fornecedores: { select: { nome_loja: true } },
                financeiro_categorias: true 
            }
        });

        if (!conta) return res.status(404).json({ message: "Conta não encontrada." });

        const response = {
            ...conta,
            // 🟢 CORRIGIDO AQUI: Adaptando o nome
            fornecedor: conta.fornecedores ? { nome_loja: conta.fornecedores.nome_loja } : null,
            baixas: conta.financeiro_baixas || [],
            categoria: conta.financeiro_categorias || null
        };

        res.json(response);
    } catch (error) {
        console.error("Erro ao buscar conta pagar:", error);
        res.status(500).json({ message: error.message });
    }
};

export const listarContasReceber = async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        
        let where = { id_tenant: Number(req.tenantId) };
        
        if (status && status !== 'TODOS') {
            where.status = status;
            
            if (startDate && endDate) {
                where.data_vencimento = {
                    gte: new Date(`${startDate.split('T')[0]}T00:00:00.000Z`),
                    lte: new Date(`${endDate.split('T')[0]}T23:59:59.999Z`)
                };
            }
        } else {
            // LÓGICA DE ERP PARA RECEBIMENTOS
            if (startDate && endDate) {
                const start = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`);
                const end = new Date(`${endDate.split('T')[0]}T23:59:59.999Z`);

                where.OR = [
                    { 
                        // Recebimentos atrasados/pendentes (não importa a data)
                        status: { in: ['PENDENTE', 'VENCIDO', 'PARCIALMENTE_PAGO'] } 
                    },
                    {
                        // Recebimentos baixados (APENAS se for do mês filtrado)
                        status: { in: ['PAGO', 'CANCELADO'] },
                        data_vencimento: { gte: start, lte: end }
                    }
                ];
            }
        }

        console.log("🔍 QUERY ENVIADA AO BANCO (RECEBER):", JSON.stringify(where, null, 2));

        const contas = await prisma.financeiro_contas_receber.findMany({
            where,
            include: {
                usuarios: { select: { nome_completo: true } },
                financeiro_categorias: true
            },
            orderBy: { data_vencimento: 'asc' }
        });

        console.log("✅ RESULTADO DO BANCO (RECEBER):", contas.length, "contas.");

        const contasFormatadas = contas.map(c => ({
            ...c,
            categoria: c.financeiro_categorias
        }));

        res.json(contasFormatadas);
    } catch (error) {
        console.error("❌ ERRO FATAL (LISTAR RECEBER):", error);
        res.status(500).json({ message: error.message });
    }
};

export const baixarContaReceber = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id_usuario;
        
        const resultado = await financeiroService.baixarContaReceber(id, req.body, userId, req.tenantId);
        res.json({ message: "Recebimento registrado com sucesso", ...resultado });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getContaReceberById = async (req, res) => {
    try {
        const { id } = req.params;
        const conta = await prisma.financeiro_contas_receber.findFirst({
            where: { 
                id: Number(id),
                id_tenant: Number(req.tenantId)
            },
            include: {
                financeiro_baixas: true, 
                usuarios: { select: { nome_completo: true } },
                financeiro_categorias: true 
            }
        });

        if (!conta) return res.status(404).json({ message: "Conta não encontrada." });

        const response = {
            ...conta,
            baixas: conta.financeiro_baixas || [],
            categoria: conta.financeiro_categorias || null
        };

        res.json(response);
    } catch (error) {
        console.error("Erro ao buscar conta receber:", error);
        res.status(500).json({ message: error.message });
    }
};

export const listarCategorias = async (req, res) => {
    try {
        const categorias = await prisma.financeiro_categorias.findMany({
            where: { 
                ativo: 1,
                id_tenant: Number(req.tenantId)
            }
        });
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const criarCategoria = async (req, res) => {
    try {
        const nova = await prisma.financeiro_categorias.create({
            data: { 
                ...req.body, 
                ativo: 1,
                id_tenant: Number(req.tenantId)
            }
        });
        res.status(201).json(nova);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getDRE = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const id_tenant = Number(req.tenantId);

        // Define o início e fim do dia para a busca
        const start = new Date(`${startDate.split('T')[0]}T00:00:00.000Z`);
        const end = new Date(`${endDate.split('T')[0]}T23:59:59.999Z`);

        // 1. Busca todas as Receitas (Entradas) PAGAS agrupadas por categoria
        const receitas = await prisma.financeiro_contas_receber.groupBy({
            by: ['id_categoria'],
            where: { 
                id_tenant, 
                status: 'PAGO', 
                data_liquidacao: { gte: start, lte: end } // 🟢 CORRIGIDO AQUI
            },
            _sum: { valor_recebido: true, valor_total: true } // 🟢 CORRIGIDO AQUI (se usar valor_pago na base, ajuste para valor_recebido conforme seu log)
        });

        // 2. Busca todas as Despesas (Saídas) PAGAS agrupadas por categoria
        const despesas = await prisma.financeiro_contas_pagar.groupBy({
            by: ['id_categoria'],
            where: { 
                id_tenant, 
                status: 'PAGO', 
                data_liquidacao: { gte: start, lte: end } // 🟢 CORRIGIDO AQUI
            },
            _sum: { valor_pago: true, valor_total: true }
        });

        // 3. Busca os Nomes das Categorias para montar a tabela
        const categorias = await prisma.financeiro_categorias.findMany({
            where: { id_tenant }
        });

        let receitaBruta = 0;
        let totalDespesas = 0;

        // 4. Monta o DRE cruzando os valores com os nomes das categorias
        const detalhamento = categorias.map(cat => {
            const rec = receitas.find(r => r.id_categoria === cat.id_categoria);
            const desp = despesas.find(d => d.id_categoria === cat.id_categoria);
            
            // Pega o valor_pago (ou valor_total como fallback)
            const valorReceita = rec ? Number(rec._sum.valor_pago || rec._sum.valor_total || 0) : 0;
            const valorDespesa = desp ? Number(desp._sum.valor_pago || desp._sum.valor_total || 0) : 0;
            
            receitaBruta += valorReceita;
            totalDespesas += valorDespesa;

            return {
                id_categoria: cat.id_categoria,
                categoria: cat.nome,
                receitas: valorReceita,
                despesas: valorDespesa,
                saldo: valorReceita - valorDespesa
            };
        }).filter(item => item.receitas > 0 || item.despesas > 0); // Remove categorias sem movimento no mês

        const lucroLiquido = receitaBruta - totalDespesas;
        const margemLucro = receitaBruta > 0 ? ((lucroLiquido / receitaBruta) * 100) : 0;

        res.json({
            resumo: {
                receitaBruta,
                totalDespesas,
                lucroLiquido,
                margemLucro: margemLucro.toFixed(2) + '%'
            },
            detalhamento: detalhamento.sort((a, b) => b.saldo - a.saldo) // Ordena do maior pro menor
        });

    } catch (error) {
        console.error("❌ Erro ao gerar DRE:", error);
        res.status(500).json({ message: "Erro ao compilar o Demonstrativo de Resultados." });
    }
};