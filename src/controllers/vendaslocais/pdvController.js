import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { decrypt, encrypt } from '../../services/cryptoService.js';
import { registrarEntradaFinanceira, gerarRecebivelDePedido } from '../../services/financialService.js';
import { NFeService } from '../../modules/fiscal/services/NFeService.js';

const prisma = new PrismaClient();

// ============================================================================
// 🟢 MÁGICA: INTERCEPTADOR DO "DONO DA LOJA"
// ============================================================================
export const obterIdUsuarioReal = async (reqUser, id_tenant) => {
    const idBruto = reqUser.id_usuario || reqUser.id;

    if (!isNaN(Number(idBruto)) && idBruto !== 'DONO' && Number(idBruto) !== 0) {
        return Number(idBruto);
    }

    const dono = await prisma.tenants.findUnique({ where: { id: id_tenant } });
    const emailDono = dono ? dono.email : `dono_${id_tenant}@sistema.interno`;
    const nomeDono = dono ? (dono.nome_fantasia || 'Proprietário') : 'Proprietário';

    let funcDono = await prisma.funcionarios.findFirst({
        where: { email: emailDono, id_tenant: id_tenant }
    });

    if (!funcDono) {
        funcDono = await prisma.funcionarios.create({
            data: {
                id_tenant: id_tenant,
                nome_completo: nomeDono,
                email: emailDono,
                hash_senha: 'dono_usa_tenant_para_logar', 
                role: 'ADMIN',
                isAdmin: true,
                ativo: true
            }
        });
    }

    return funcDono.id_funcionario;
};

// ============================================================================
// 🟢 FUNÇÕES DO CAIXA
// ============================================================================
export const abrirCaixa = async (req, res) => {
    try {
        const { saldo_inicial, observacoes } = req.body;
        const id_tenant = req.tenantId;

        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);
        const saldoFormatado = Number(saldo_inicial) || 0;

        // Verifica se o usuário ou o estabelecimento já tem um caixa aberto
        const caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { status: 'ABERTO', id_tenant },
            include: { funcionarios: { select: { nome_completo: true, role: true } } },
            orderBy: { data_abertura: 'desc' }
        });

        if (caixaAberto) {
            return res.status(400).json({ 
                message: `Já existe um caixa aberto para este estabelecimento (Operador: ${caixaAberto.funcionarios?.nome_completo || 'Ativo'}). Encerre o turno atual antes de abrir um novo.`,
                caixa: caixaAberto
            });
        }

        const novoCaixa = await prisma.caixa_pdv.create({
            data: {
                id_usuario,
                saldo_inicial: saldoFormatado,
                saldo_sistema: saldoFormatado,
                observacoes: observacoes || '',
                status: 'ABERTO',
                data_abertura: new Date(),
                id_tenant
            },
            include: {
                funcionarios: { select: { id_funcionario: true, nome_completo: true, email: true, role: true } }
            }
        });

        await prisma.movimentacao_caixa.create({
            data: {
                id_caixa: novoCaixa.id_caixa,
                tipo: 'ENTRADA',
                valor: saldoFormatado,
                motivo: 'Saldo Inicial (Abertura)'
            }
        });

        res.status(201).json({ message: 'Caixa aberto com sucesso!', caixa: novoCaixa });
    } catch (error) {
        res.status(400).json({ message: "Erro ao abrir o caixa. Verifique os dados.", details: error.message });
    }
};

export const conferirFechamento = async (req, res, next) => {
    try {
        const { valores_informados = {} } = req.body;
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        // Busca o caixa aberto do usuário ou qualquer caixa aberto do tenant
        let caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant },
            orderBy: { data_abertura: 'desc' }
        });

        if (!caixa) {
            caixa = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixa) return res.status(400).json({ message: "Caixa não encontrado ou já fechado." });

        // 1. Busca todas as formas de pagamento cadastradas no SEFAZ para esse tenant
        const formasSefazDb = await prisma.fiscal_formas_pagamento.findMany({
            where: { tenant_id: tenantStr },
            orderBy: [{ codigo_sefaz: 'asc' }, { descricao: 'asc' }]
        });

        // 2. Garante lista única deduplicada por descrição (preservando o primeiro ID e código SEFAZ)
        let formas = [];
        const vistas = new Set();
        formasSefazDb.forEach(f => {
            const descNorm = (f.descricao || '').trim();
            if (descNorm && !vistas.has(descNorm.toLowerCase())) {
                vistas.add(descNorm.toLowerCase());
                formas.push({
                    id: f.id,
                    codigo_sefaz: f.codigo_sefaz || '99',
                    descricao: descNorm
                });
            }
        });

        if (formas.length === 0) {
            formas = [
                { id: 'def_01', codigo_sefaz: '01', descricao: 'Dinheiro' },
                { id: 'def_17', codigo_sefaz: '17', descricao: 'PIX' },
                { id: 'def_03', codigo_sefaz: '03', descricao: 'Cartão de Crédito' },
                { id: 'def_04', codigo_sefaz: '04', descricao: 'Cartão de Débito' }
            ];
        }

        // 3. Vendas agrupadas por método de pagamento do turno atual
        const vendas = await prisma.pedidos.groupBy({
            by: ['metodo_pagamento'],
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            _sum: { preco_total: true }
        });

        // 4. Movimentações detalhadas (Sangrias e Suprimentos)
        const movsDetalhadas = await prisma.movimentacao_caixa.findMany({
            where: { id_caixa: caixa.id_caixa }
        });

        // Mapeia o esperado para cada forma SEFAZ
        const esperadoPorForma = {};
        formas.forEach(f => {
            esperadoPorForma[f.descricao] = 0;
        });

        // Localiza a forma de dinheiro físico (código 01 ou contendo "dinheiro")
        const formaDinheiro = formas.find(f => f.codigo_sefaz === '01' || f.descricao.toLowerCase().includes('dinheiro')) || formas[0];
        if (formaDinheiro) {
            esperadoPorForma[formaDinheiro.descricao] = Number(caixa.saldo_inicial || 0);
            movsDetalhadas.forEach(m => {
                if (m.motivo === 'Saldo Inicial (Abertura)') return;
                if (m.tipo === 'ENTRADA') esperadoPorForma[formaDinheiro.descricao] += Number(m.valor || 0);
                if (m.tipo === 'SAIDA') esperadoPorForma[formaDinheiro.descricao] -= Number(m.valor || 0);
            });
        }

        // Distribui as vendas nos métodos correspondentes
        vendas.forEach(v => {
            const metodoVenda = (v.metodo_pagamento || '').trim();
            const valor = Number(v._sum.preco_total || 0);

            // 1º Match exato pela descrição (case-insensitive)
            let matchForma = formas.find(f => f.descricao.toLowerCase() === metodoVenda.toLowerCase());

            // 2º Match por aliases conhecidos
            if (!matchForma) {
                const upper = metodoVenda.toUpperCase();
                if (upper === 'DINHEIRO' || upper.includes('DINHEIRO') || upper === '01') {
                    matchForma = formaDinheiro;
                } else if (upper.includes('PIX') || upper === '17') {
                    matchForma = formas.find(f => f.codigo_sefaz === '17' || f.descricao.toUpperCase().includes('PIX'));
                } else if (upper.includes('CREDITO') || upper === '03' || upper === 'CARTAO_CREDITO') {
                    matchForma = formas.find(f => f.codigo_sefaz === '03' || f.descricao.toUpperCase().includes('CREDITO'));
                } else if (upper.includes('DEBITO') || upper === '04' || upper === 'CARTAO_DEBITO') {
                    matchForma = formas.find(f => f.codigo_sefaz === '04' || f.descricao.toUpperCase().includes('DEBITO'));
                } else if (upper.includes('BOLETO') || upper === '15') {
                    matchForma = formas.find(f => f.codigo_sefaz === '15' || f.descricao.toUpperCase().includes('BOLETO'));
                } else if (upper.includes('ALIMENTACAO') || upper === '10') {
                    matchForma = formas.find(f => f.codigo_sefaz === '10' || f.descricao.toUpperCase().includes('ALIMENTA'));
                } else if (upper.includes('REFEICAO') || upper === '11') {
                    matchForma = formas.find(f => f.codigo_sefaz === '11' || f.descricao.toUpperCase().includes('REFEIC'));
                }
            }

            if (matchForma) {
                esperadoPorForma[matchForma.descricao] = (esperadoPorForma[matchForma.descricao] || 0) + valor;
            } else {
                if (esperadoPorForma[metodoVenda] === undefined) {
                    esperadoPorForma[metodoVenda] = 0;
                    formas.push({ id: `custom_${metodoVenda}`, codigo_sefaz: '99', descricao: metodoVenda });
                }
                esperadoPorForma[metodoVenda] += valor;
            }
        });

        // Monta o resultado final de conferência
        const resultado = formas.map(f => {
            const valorEsperado = Number((esperadoPorForma[f.descricao] || 0).toFixed(2));

            let valorInformado = 0;
            if (valores_informados) {
                if (valores_informados[f.descricao] !== undefined) {
                    valorInformado = Number(valores_informados[f.descricao]) || 0;
                } else if (valores_informados[f.id] !== undefined) {
                    valorInformado = Number(valores_informados[f.id]) || 0;
                } else {
                    const upper = f.descricao.toUpperCase();
                    if (valores_informados[upper] !== undefined) {
                        valorInformado = Number(valores_informados[upper]) || 0;
                    } else if (upper.includes('DINHEIRO') && valores_informados['DINHEIRO'] !== undefined) {
                        valorInformado = Number(valores_informados['DINHEIRO']) || 0;
                    } else if (upper.includes('PIX') && valores_informados['PIX'] !== undefined) {
                        valorInformado = Number(valores_informados['PIX']) || 0;
                    } else if (upper.includes('CREDITO') && valores_informados['CREDITO'] !== undefined) {
                        valorInformado = Number(valores_informados['CREDITO']) || 0;
                    } else if (upper.includes('DEBITO') && valores_informados['DEBITO'] !== undefined) {
                        valorInformado = Number(valores_informados['DEBITO']) || 0;
                    }
                }
            }

            const diferenca = Number((valorInformado - valorEsperado).toFixed(2));

            return {
                id: f.id,
                metodo: f.descricao,
                codigo_sefaz: f.codigo_sefaz || '99',
                esperado: valorEsperado,
                informado: valorInformado,
                diferenca: diferenca,
                status: Math.abs(diferenca) < 0.05 ? 'OK' : (diferenca > 0 ? 'SOBRA' : 'QUEBRA')
            };
        });

        const saldoSistemaTotal = Number(caixa.saldo_sistema);
        const saldoFinalInformado = Number(resultado.reduce((acc, curr) => acc + curr.informado, 0).toFixed(2));

        res.json({
            conferencia: resultado,
            saldo_sistema_total: saldoSistemaTotal,
            saldo_informado_total: saldoFinalInformado,
            divergencia_total: Number((saldoFinalInformado - saldoSistemaTotal).toFixed(2))
        });

    } catch (error) {
        next(error);
    }
};

export const fecharCaixa = async (req, res, next) => {
    try {
        const { valores_informados, observacoes } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        // Busca o caixa aberto do usuário logado ou o caixa aberto do estabelecimento
        let caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant },
            orderBy: { data_abertura: 'desc' }
        });

        if (!caixaAberto) {
            caixaAberto = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixaAberto) return res.status(400).json({ message: "Nenhum caixa aberto para fechar." });

        const saldoFinalInformado = Object.values(valores_informados || {}).reduce((a, b) => Number(a) + (Number(b) || 0), 0);
        const detalheFechamento = JSON.stringify(valores_informados || {});
        const obsFinal = `[Fechamento] Inf: R$${Number(saldoFinalInformado).toFixed(2)} | Detalhes: ${detalheFechamento} | Obs: ${observacoes || 'Sem obs'}`;

        await prisma.caixa_pdv.updateMany({
            where: { id_caixa: caixaAberto.id_caixa, id_tenant },
            data: {
                status: 'FECHADO',
                saldo_final: Number(saldoFinalInformado.toFixed(2)),
                data_fechamento: new Date(),
                observacoes: obsFinal
            }
        });

        const caixaFechado = await prisma.caixa_pdv.findFirst({
            where: { id_caixa: caixaAberto.id_caixa, id_tenant }
        });

        res.json(caixaFechado);
    } catch (error) {
        next(error);
    }
};

export const getStatusCaixa = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        // 1. Busca se o usuário logado tem caixa aberto
        let caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant },
            include: {
                funcionarios: {
                    select: { id_funcionario: true, nome_completo: true, email: true, role: true }
                }
            },
            orderBy: { data_abertura: 'desc' }
        });

        // 2. Se o usuário atual não abriu (ex: logou dono ou outro operador), mas a loja tem um caixa ABERTO ativo, retorna ele para manter o caixa aberto
        if (!caixa) {
            caixa = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                include: {
                    funcionarios: {
                        select: { id_funcionario: true, nome_completo: true, email: true, role: true }
                    }
                },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixa) {
            return res.json({ status: 'FECHADO' });
        }

        res.json({ status: 'ABERTO', dados: caixa });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ============================================================================
// 🟢 VENDA PADRÃO DO PDV (ATUALIZADA COM COMPLEMENTOS E INTEGRAÇÃO FISCAL REAL)
// ============================================================================
export const registrarVendaPDV = async (req, res, next) => {
    try {
        const {
            itens,
            metodo_pagamento,
            forma_pagamento_id = null,
            caixa_id = null,
            serie_numero = null,
            valor_recebido,
            cliente_id,
            estabelecimento_id = null,
            emitir_fiscal = true,
            tipo_documento_fiscal = 'NFCE',
            cenario_id = null,
            ambiente_fiscal = null,
            cpf_cnpj_nota = null,
            nome_nota = null,
            desconto = 0,
            pagamentos_multiplos = null
        } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario_logado = await obterIdUsuarioReal(req.user, id_tenant);

        if (!itens || itens.length === 0) return res.status(400).json({ message: "O carrinho está vazio." });

        let caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario: id_usuario_logado, status: 'ABERTO', id_tenant },
            orderBy: { data_abertura: 'desc' }
        });

        if (!caixaAberto) {
            caixaAberto = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixaAberto) return res.status(400).json({ message: "Caixa fechado. Abra o caixa para vender." });

        const idsProdutos = itens.map(item => item.id_produto);
        const produtosDb = await prisma.produtos.findMany({
            where: { id_produto: { in: idsProdutos }, id_tenant },
            include: { composicao_pai: { include: { insumo: true } } }
        });

        let totalVenda = 0;
        const itensParaSalvar = itens.map(itemFront => {
            const produtoReal = produtosDb.find(p => p.id_produto === itemFront.id_produto);
            if (!produtoReal) throw new Error(`Produto ID ${itemFront.id_produto} não encontrado.`);

            const precoBase = Number(itemFront.preco !== undefined ? itemFront.preco : produtoReal.preco);
            const quantidade = Number(itemFront.quantidade);
            
            let subtotalComplementos = 0;
            if (itemFront.complementos && itemFront.complementos.length > 0) {
                itemFront.complementos.forEach(comp => {
                    subtotalComplementos += (Number(comp.preco_adicional) * Number(comp.quantidade));
                });
            }

            const precoUnitFinal = Number((precoBase + subtotalComplementos).toFixed(2));
            totalVenda += (precoUnitFinal * quantidade);

            return {
                id_produto: produtoReal.id_produto,
                nome: produtoReal.nome,
                quantidade: quantidade,
                preco: precoUnitFinal,
                imagem_url: produtoReal.imagem_url,
                estoque_atual: Number(produtoReal.estoque),
                receita: produtoReal.composicao_pai || [],
                observacao: itemFront.observacao || null,
                variacao_selecionada: itemFront.variacao_selecionada,
                complementos: itemFront.complementos && itemFront.complementos.length > 0 ? itemFront.complementos : null
            };
        });

        const descontoVenda = Math.max(0, Math.min(Number(desconto || 0), totalVenda - 0.01));
        const totalLiquido = Number(Math.max(0.01, totalVenda - descontoVenda).toFixed(2));

        let idClienteFinal = cliente_id;

        if (!idClienteFinal) {
            const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
            let consumidorPadrao = await prisma.usuarios.findFirst({ where: { email: emailPadrao, id_tenant } });

            if (!consumidorPadrao) {
                consumidorPadrao = await prisma.usuarios.create({
                    data: {
                        nome_completo: 'Consumidor Final',
                        email: emailPadrao,
                        hash_senha: 'pdv_password_safe',
                        cpf_criptografado: null,
                        telefone_criptografado: null,
                        id_tenant
                    }
                });
            }
            idClienteFinal = consumidorPadrao.id_usuario;
        }

        let metodoPagamentoFinal = metodo_pagamento || 'DINHEIRO';
        if (Array.isArray(pagamentos_multiplos) && pagamentos_multiplos.length > 0) {
            if (pagamentos_multiplos.length === 1) {
                metodoPagamentoFinal = pagamentos_multiplos[0].descricao || pagamentos_multiplos[0].metodo || 'DINHEIRO';
            } else {
                metodoPagamentoFinal = 'MÚLTIPLO';
            }
        }

        const venda = await prisma.$transaction(async (tx) => {
            const novoPedido = await tx.pedidos.create({
                data: {
                    usuarios: { connect: { id_usuario: idClienteFinal } },
                    caixa_pdv: { connect: { id_caixa: caixaAberto.id_caixa } },
                    preco_total: totalLiquido,
                    preco_itens: Number(totalVenda.toFixed(2)),
                    preco_frete: 0,
                    metodo_pagamento: metodoPagamentoFinal,
                    status_pagamento: 'PAGO',
                    status_entrega: 'Entregue',
                    canal_venda: 'PDV',
                    data_pedido: new Date(),
                    tenants: { connect: { id: id_tenant } },
                    pedido_items: {
                        create: itensParaSalvar.map(item => ({
                            id_produto: item.id_produto,
                            id_variacao: item.variacao_selecionada?.id_variacao || null, 
                            nome: item.nome,
                            quantidade: item.quantidade,
                            preco: item.preco,
                            imagem_url: item.imagem_url,
                            observacao: item.observacao || null,
                            complementos: item.complementos 
                        }))
                    }
                },
                include: { pedido_items: true }
            });

            await tx.caixa_pdv.updateMany({
                where: { id_caixa: caixaAberto.id_caixa, id_tenant },
                data: { saldo_sistema: { increment: totalLiquido } }
            });

            // Gerenciamento de Baixa de Estoque
            for (const item of itensParaSalvar) {
                const idVariacao = item.variacao_selecionada?.id_variacao;

                if (idVariacao) {
                    const variacaoDb = await tx.produto_variacoes.findUnique({ where: { id_variacao: Number(idVariacao) } });
                    if (variacaoDb) {
                        const novoEstoqueVar = Number(variacaoDb.estoque) - Number(item.quantidade);
                        await tx.produto_variacoes.update({
                            where: { id_variacao: Number(idVariacao) }, data: { estoque: novoEstoqueVar }
                        });
                        await tx.movimentacaoEstoque.create({
                            data: {
                                id_produto: item.id_produto, id_variacao: Number(idVariacao), quantidade: item.quantidade,
                                tipo: 'SAIDA', saldo_momento: novoEstoqueVar,
                                motivo: `Venda PDV #${novoPedido.id_pedido} (Var: ${idVariacao})`,
                                origem_destino: 'PDV', usuario_id: id_usuario_logado
                            }
                        });
                    }
                } else {
                    await tx.produtos.updateMany({
                        where: { id_produto: item.id_produto, id_tenant },
                        data: { estoque: { decrement: item.quantidade }, visualizacoes: { increment: 1 } }
                    });
                    await tx.movimentacaoEstoque.create({
                        data: {
                            id_produto: item.id_produto, quantidade: item.quantidade, tipo: 'SAIDA',
                            saldo_momento: item.estoque_atual - item.quantidade, motivo: `Venda PDV #${novoPedido.id_pedido}`,
                            origem_destino: 'PDV', usuario_id: id_usuario_logado
                        }
                    });
                }

                if (item.complementos && item.complementos.length > 0) {
                    for (const comp of item.complementos) {
                        const qtdAdic = Number(comp.quantidade) || 1;
                        const qtdTotalAdic = qtdAdic * item.quantidade;
                        const prodAdic = await tx.produtos.findUnique({ where: { id_produto: Number(comp.id_produto_add) } });

                        if (prodAdic) {
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
                                    motivo: `Venda PDV #${novoPedido.id_pedido} (Adicional)`,
                                    origem_destino: 'PDV',
                                    usuario_id: id_usuario_logado
                                }
                            });
                        }
                    }
                }
            }

            return novoPedido;
        });

        try {
            await gerarRecebivelDePedido(venda, id_tenant);
            if (Array.isArray(pagamentos_multiplos) && pagamentos_multiplos.length > 1) {
                for (let idx = 0; idx < pagamentos_multiplos.length; idx++) {
                    const pg = pagamentos_multiplos[idx];
                    await registrarEntradaFinanceira({
                        id_pedido: venda.id_pedido,
                        id_usuario: idClienteFinal,
                        gateway_provider: 'PDV',
                        gateway_id: `PDV-${venda.id_pedido}-${idx + 1}`,
                        tipo: pg.descricao || pg.metodo || 'PDV',
                        valor_bruto: Number(pg.valor),
                        valor_taxa_real: 0,
                        id_tenant
                    });
                }
            } else {
                await registrarEntradaFinanceira({
                    id_pedido: venda.id_pedido,
                    id_usuario: idClienteFinal,
                    gateway_provider: 'PDV',
                    gateway_id: `PDV-${venda.id_pedido}`,
                    valor_bruto: totalLiquido,
                    valor_taxa_real: 0,
                    id_tenant
                });
            }
        } catch (finError) {
            console.error("⚠️ Erro ao registrar financeiro do PDV:", finError);
        }

        // ============================================================================
        // 🟢 INTEGRAÇÃO FISCAL NATIVA (SE MODO FISCAL ESTIVER ATIVO NA VENDA)
        // ============================================================================
        let notaEmitida = null;
        let fiscalError = null;

        if (emitir_fiscal !== false) {
            try {
                notaEmitida = await processarEmissaoFiscalVendaPDV({
                    id_tenant,
                    pedido: venda,
                    itensParaSalvar,
                    metodo_pagamento: metodoPagamentoFinal,
                    forma_pagamento_id,
                    caixa_id,
                    serie_numero,
                    cliente_id,
                    estabelecimento_id,
                    cpf_cnpj_nota,
                    nome_nota,
                    tipo_documento_fiscal,
                    cenario_id,
                    ambiente_fiscal,
                    descontoVenda,
                    pagamentos_multiplos,
                    origem: req.body.origem || req.headers['x-origem'] || 'BALCAO',
                    ambiente: req.body.ambiente || (req.headers['x-token-caixa'] ? 'EXE' : 'WEB')
                });
            } catch (fiscalErr) {
                console.error("❌ Erro ao emitir nota no PDV:", fiscalErr.message);
                fiscalError = fiscalErr.message;
            }
        }

        res.status(201).json({
            message: "Venda realizada!",
            pedido: venda,
            nota_fiscal: notaEmitida,
            fiscal: notaEmitida,
            fiscal_error: fiscalError,
            modo_fiscal: emitir_fiscal !== false
        });
    } catch (error) {
        res.status(400).json({ message: "Erro ao processar venda.", details: error.message });
    }
};

// Helper interno e rota dedicada para emitir nota fiscal de uma venda do PDV (imediata ou posterior)
export const processarEmissaoFiscalVendaPDV = async ({
    id_tenant,
    pedido,
    itensParaSalvar,
    metodo_pagamento,
    forma_pagamento_id = null,
    caixa_id = null,
    serie_numero = null,
    cliente_id,
    cpf_cnpj_nota,
    nome_nota,
    tipo_documento_fiscal = 'NFCE',
    estabelecimento_id = null,
    cenario_id = null,
    ambiente_fiscal = null,
    descontoVenda = 0,
    pagamentos_multiplos = null,
    origem = null,
    ambiente = null
}) => {
    const tenantStr = String(id_tenant);

    // 1. Resolução da Série NFC-e vinculada ao Caixa (Ex: Caixa 1 -> Série 1, Caixa 2 -> Série 2)
    // REGRA SEFAZ:
    // - Desktop (.EXE): Série = numero_caixa (Caixa 1 = Série 1, Caixa 2 = Série 2)
    // - Web (Navegador): Série = 50 + numero_caixa (Caixa 1 = Série 51, Caixa 2 = Série 52)
    const isWeb = String(origem || ambiente || '').toUpperCase() === 'WEB';
    let serieAlvo = serie_numero ? Number(serie_numero) : null;
    let serieIdAlvo = null;

    if (caixa_id) {
        const cx = await prisma.pdv_caixas.findFirst({
            where: { id: String(caixa_id), tenant_id: tenantStr },
            include: { serie: true }
        });
        if (cx) {
            const numCaixa = cx.numero_caixa || 1;
            serieAlvo = isWeb ? (50 + numCaixa) : (serie_numero ? Number(serie_numero) : numCaixa);

            const estabId = estabelecimento_id || cx.estabelecimento_id;
            const serieFiscal = await prisma.fiscal_series.findFirst({
                where: { estabelecimento_id: estabId, modelo: '65', serie: serieAlvo }
            });
            if (serieFiscal) {
                serieIdAlvo = serieFiscal.id;
            }
        }
    } else if (isWeb && (!serieAlvo || serieAlvo < 50)) {
        serieAlvo = 51;
    }

    const MAP_PDV_TO_RULE = {
        'DINHEIRO': 'OFFLINE_CASH',
        'CREDITO': 'OFFLINE_CREDIT',
        'CARTAO_CREDITO': 'OFFLINE_CREDIT',
        'DEBITO': 'OFFLINE_DEBIT',
        'CARTAO_DEBITO': 'OFFLINE_DEBIT',
        'PIX': 'OFFLINE_PIX'
    };
    const MAP_PDV_TO_SEFAZ = {
        'DINHEIRO': '01',
        'CREDITO': '03',
        'CARTAO_CREDITO': '03',
        'DEBITO': '04',
        'CARTAO_DEBITO': '04',
        'PIX': '17'
    };
    const methodKey = MAP_PDV_TO_RULE[metodo_pagamento] || metodo_pagamento;

    const regraPgto = await prisma.gateway_rules.findFirst({
        where: { method: methodKey, id_tenant }
    });

    let formaPagamentoId = forma_pagamento_id || regraPgto?.fiscal_payment_id || null;
    if (!formaPagamentoId) {
        const codSefaz = MAP_PDV_TO_SEFAZ[metodo_pagamento] || '99';
        const fp = await prisma.fiscal_formas_pagamento.findFirst({
            where: { tenant_id: tenantStr, codigo_sefaz: codSefaz }
        }) || await prisma.fiscal_formas_pagamento.findFirst({
            where: { tenant_id: tenantStr }
        });
        formaPagamentoId = fp?.id || null;
    }

    let estab = null;
    if (estabelecimento_id) {
        estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { id: String(estabelecimento_id), tenant_id: tenantStr },
            include: { certificados: { where: { ativo: true } } }
        });
        if (estab && (!estab.certificados || estab.certificados.length === 0)) {
            const estabComCert = await prisma.fiscal_estabelecimentos.findFirst({
                where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } },
                include: { certificados: { where: { ativo: true } } }
            });
            if (estabComCert) estab = estabComCert;
        }
    }
    if (!estab) {
        estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } },
            include: { certificados: { where: { ativo: true } } }
        });
    }
    if (!estab) {
        estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr },
            include: { certificados: { where: { ativo: true } } }
        });
    }

    const modeloAlvo = tipo_documento_fiscal === 'NFE' ? '55' : '65';
    let cenarioEscolhido = null;
    if (cenario_id) {
        cenarioEscolhido = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: String(cenario_id) } });
    }
    if (!cenarioEscolhido) {
        cenarioEscolhido = await prisma.fiscal_cenarios_fiscais.findFirst({
            where: { tenant_id: tenantStr, modelo: modeloAlvo }
        }) || await prisma.fiscal_cenarios_fiscais.findFirst({
            where: { tenant_id: tenantStr }
        });
    }

    if (!estab || !cenarioEscolhido) {
        throw new Error("Estabelecimento Emissor ou Cenário Fiscal não configurados.");
    }

    // Busca ambiente da config fiscal se não vier no payload
    let tpAmb = Number(ambiente_fiscal) || 2;
    if (!ambiente_fiscal) {
        const cfgFiscal = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant: Number(id_tenant) } });
        if (cfgFiscal?.ambiente === 'PRODUCAO') tpAmb = 1;
    }

    let descRestante = Number(descontoVenda || 0);
    const itensFiscal = itensParaSalvar.map((item, idx) => {
        const valorItemTotal = Number(item.preco) * Number(item.quantidade);
        let descItem = 0;
        if (descRestante > 0) {
            if (idx === itensParaSalvar.length - 1) {
                descItem = Math.min(descRestante, valorItemTotal - 0.01);
            } else {
                descItem = Math.min(descRestante, Number((valorItemTotal * (descontoVenda / Number(pedido.preco_itens || valorItemTotal))).toFixed(2)));
            }
            descRestante = Number((descRestante - descItem).toFixed(2));
        }
        return {
            produto_id: String(item.id_produto),
            quantidade: Number(item.quantidade),
            valor_unitario: Number(item.preco),
            valor_desconto: descItem,
            tenant_id: tenantStr
        };
    });

    let pagamentosSefaz = null;
    if (Array.isArray(pagamentos_multiplos) && pagamentos_multiplos.length > 0) {
        pagamentosSefaz = pagamentos_multiplos.map(pg => ({
            codigo: pg.codigo_sefaz || pg.codigo || MAP_PDV_TO_SEFAZ[pg.metodo] || '01',
            valor: Number(pg.valor)
        }));
    }

    return await NFeService.emitir({
        tenant_id: tenantStr,
        estabelecimento_id: estab.id,
        cenario_id: cenarioEscolhido.id,
        destinatario_id: cliente_id || null,
        cpf_cnpj_nota: cpf_cnpj_nota || null,
        nome_nota: nome_nota || null,
        forma_pagamento_id: formaPagamentoId,
        serie: serieAlvo || 1,
        serie_id: serieIdAlvo || undefined,
        ambiente: tpAmb,
        apenas_salvar: false,
        contingencia: false,
        id_pedido: Number(pedido.id_pedido),
        itens: itensFiscal,
        pagamentos: pagamentosSefaz
    });
};

export const emitirNotaDeVendaPDV = async (req, res) => {
    try {
        const { id_pedido } = req.params;
        const {
            tipo_documento_fiscal = 'NFCE',
            estabelecimento_id = null,
            cpf_cnpj_nota = null,
            nome_nota = null,
            cenario_id = null,
            ambiente_fiscal = null,
            caixa_id = null,
            serie_numero = null,
            forma_pagamento_id = null
        } = req.body;
        const id_tenant = req.tenantId;

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant },
            include: { pedido_items: true, usuarios: true }
        });
        if (!pedido) return res.status(404).json({ message: "Venda não encontrada." });

        const itensParaSalvar = pedido.pedido_items.map(it => ({
            id_produto: it.id_produto,
            nome: it.nome,
            quantidade: Number(it.quantidade),
            preco: Number(it.preco)
        }));

        const descontoVenda = Math.max(0, Number(pedido.preco_itens) - Number(pedido.preco_total));

        const notaEmitida = await processarEmissaoFiscalVendaPDV({
            id_tenant,
            pedido,
            itensParaSalvar,
            metodo_pagamento: pedido.metodo_pagamento,
            forma_pagamento_id,
            caixa_id,
            serie_numero,
            cliente_id: pedido.id_usuario,
            estabelecimento_id,
            cpf_cnpj_nota,
            nome_nota: nome_nota || pedido.usuarios?.nome_completo,
            tipo_documento_fiscal,
            cenario_id,
            ambiente_fiscal,
            descontoVenda,
            origem: req.body.origem || req.headers['x-origem'] || 'BALCAO',
            ambiente: req.body.ambiente || (req.headers['x-token-caixa'] ? 'EXE' : 'WEB')
        });

        res.status(200).json({ message: "Documento fiscal processado!", nota_fiscal: notaEmitida });
    } catch (error) {
        res.status(400).json({ message: error.message || "Erro ao emitir nota fiscal da venda." });
    }
};

// ============================================================================
// 🟢 RECEBER RESTANTE DO AGENDAMENTO (SINAL ONLINE + RESTANTE NA LOJA)
// ============================================================================
export const receberSaldoPendente = async (req, res, next) => {
    try {
        const { id_pedido } = req.params;
        const { metodo_pagamento, valor_recebido } = req.body; 
        const id_tenant = req.tenantId;
        const id_usuario_logado = await obterIdUsuarioReal(req.user, id_tenant);

        let caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_usuario: id_usuario_logado, status: 'ABERTO', id_tenant },
            orderBy: { data_abertura: 'desc' }
        });

        if (!caixaAberto) {
            caixaAberto = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixaAberto) return res.status(400).json({ message: "Caixa fechado. Você precisa abrir o caixa para receber pagamentos." });

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: Number(id_pedido), id_tenant },
            include: { pedido_items: true }
        });

        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });
        if (pedido.status_pagamento === 'PAGO') return res.status(400).json({ message: "Este pedido já está totalmente pago." });

        let valorRestante = 0;

        const conta = await prisma.financeiro_contas_receber.findFirst({
            where: { id_pedido: pedido.id_pedido, id_tenant }
        });

        if (conta) {
            valorRestante = Number(conta.saldo_restante);
        } else {
            const transacoes = await prisma.transacoes_financeiras.findMany({
                where: { id_pedido: pedido.id_pedido, id_tenant }
            });
            const valorJaPago = transacoes.reduce((acc, t) => acc + Number(t.valor_bruto), 0);
            valorRestante = Number(pedido.preco_total) - valorJaPago;
        }
        
        if (valorRestante <= 0) {
             await prisma.pedidos.update({ where: { id_pedido: pedido.id_pedido }, data: { status_pagamento: 'PAGO' }});
             return res.status(400).json({ message: "O saldo deste pedido já está zerado." });
        }

        const recebido = Number(valor_recebido || 0);
        let troco = 0;
        if (metodo_pagamento === 'DINHEIRO') {
            if (recebido < valorRestante) return res.status(400).json({ message: "Valor recebido insuficiente." });
            troco = recebido - valorRestante;
        }

        const metodoCombinado = `${pedido.metodo_pagamento} + ${metodo_pagamento}`;

        await prisma.$transaction(async (tx) => {
            await tx.pedidos.update({
                where: { id_pedido: pedido.id_pedido },
                data: {
                    status_pagamento: 'PAGO',
                    metodo_pagamento: metodoCombinado, 
                    id_caixa_pdv: caixaAberto.id_caixa 
                }
            });

            await tx.caixa_pdv.update({
                where: { id_caixa: caixaAberto.id_caixa },
                data: { saldo_sistema: { increment: valorRestante } }
            });

            if (conta) {
                await tx.financeiro_contas_receber.update({
                    where: { id_conta: conta.id_conta },
                    data: {
                        saldo_restante: 0,
                        status: 'PAGO',
                        data_recebimento: new Date()
                    }
                });
            }
        });

        try {
            await registrarEntradaFinanceira({
                id_pedido: pedido.id_pedido,
                id_usuario: pedido.id_usuario,
                gateway_provider: 'PDV', 
                gateway_id: `PDV-RESTO-${pedido.id_pedido}-${Date.now()}`,
                valor_bruto: valorRestante,
                valor_taxa_real: 0,
                id_tenant
            });
        } catch(finErr) {
            console.error("Erro ao registrar entrada financeira no recebimento final:", finErr);
        }

        res.status(200).json({ 
            message: "Restante recebido com sucesso!", 
            valor_pago: valorRestante, 
            troco: troco
        });

    } catch (error) {
        next(error);
    }
};

// ============================================================================
// 🟢 ROTAS DE IMPRESSÃO
// ============================================================================
export const gerarPdfA4 = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: id_pedido, id_tenant: id_tenant },
            include: { pedido_items: true, usuarios: true }
        });
        
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const transacoes = await prisma.transacoes_financeiras.findMany({
            where: { id_pedido: pedido.id_pedido, id_tenant },
            orderBy: { data_criacao: 'asc' }
        });

        let itensHtml = '';
        pedido.pedido_items.forEach(item => {
            itensHtml += `
                <tr>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.quantidade}x</td>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.nome_produto || item.nome}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${Number(item.preco_unitario || item.preco).toFixed(2)}</td>
                </tr>
            `;

            if (item.complementos && Array.isArray(item.complementos)) {
                item.complementos.forEach(comp => {
                    itensHtml += `
                        <tr>
                            <td style="padding: 5px 10px; border-bottom: 1px dotted #ccc;"></td>
                            <td style="padding: 5px 10px; border-bottom: 1px dotted #ccc; color: #555; font-size: 13px;"> ↳ ${comp.quantidade}x ${comp.nome}</td>
                            <td style="padding: 5px 10px; border-bottom: 1px dotted #ccc; text-align: right; color: #555; font-size: 13px;">R$ ${Number(comp.preco_adicional).toFixed(2)}</td>
                        </tr>
                    `;
                });
            }
        });

        let pagamentosHtml = '';
        transacoes.forEach((t, i) => {
            let desc = i === 0 && transacoes.length > 1 ? "Sinal (Online)" : (transacoes.length > 1 ? "Restante (Local)" : "Pagamento");
            pagamentosHtml += `<p style="margin: 3px 0;"><strong>${desc} via ${t.gateway_provider}:</strong> R$ ${Number(t.valor_bruto).toFixed(2)}</p>`;
        });

        if (transacoes.length === 0) {
            pagamentosHtml = `<p>Sem registro financeiro (Pendente)</p>`;
        }

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Pedido #${pedido.id_pedido}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: auto; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                    .info-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { background: #eee; padding: 10px; text-align: left; }
                    .total { text-align: right; font-size: 24px; font-weight: bold; margin-bottom: 20px; }
                    .payments { background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #bbf7d0; }
                </style>
            </head>
            <body onload="window.print()">
                <div class="header">
                    <h1>DOCUMENTO DE PEDIDO</h1>
                    <h2>PEDIDO #${pedido.id_pedido}</h2>
                </div>
                
                <div class="info-box">
                    <p><strong>Cliente:</strong> ${pedido.usuarios?.nome_completo || 'Não informado'}</p>
                    <p><strong>Data:</strong> ${new Date(pedido.data_pedido).toLocaleString('pt-BR')}</p>
                    <p><strong>Status do Pedido:</strong> ${pedido.status_pagamento}</p>
                    <p><strong>Método(s) Usado(s):</strong> ${pedido.metodo_pagamento}</p>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Qtd</th>
                            <th>Produto</th>
                            <th style="text-align: right;">Valor Unitário</th>
                        </tr>
                    </thead>
                    <tbody>${itensHtml}</tbody>
                </table>

                <div class="total">TOTAL: R$ ${Number(pedido.preco_total).toFixed(2)}</div>

                <div class="payments">
                    <h3 style="margin-top: 0; font-size: 16px;">Histórico de Pagamento:</h3>
                    ${pagamentosHtml}
                </div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);

    } catch (error) {
        next(error);
    }
};

export const imprimirTermicaCaixa = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = req.tenantId;

        const pedido = await prisma.pedidos.findFirst({
            where: { id_pedido: id_pedido, id_tenant },
            include: { pedido_items: true }
        });
        
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const impPadrao = await prisma.impressoras.findFirst({
            where: { id_tenant, is_padrao: true, ativo: true }
        });

        if (!impPadrao) return res.status(400).json({ message: "Nenhuma impressora padrão configurada na loja." });

        const transacoes = await prisma.transacoes_financeiras.findMany({
            where: { id_pedido: pedido.id_pedido, id_tenant },
            orderBy: { data_criacao: 'asc' }
        });

        let historicoPagto = transacoes.map((t, idx) => ({
            label: idx === 0 && transacoes.length > 1 ? "Sinal" : "Pgto",
            metodo: t.gateway_provider,
            valor: Number(t.valor_bruto)
        }));

        const printJob = {
            tipo: 'CONTA',
            mesa: `Pedido #${pedido.id_pedido}`,
            impressora: impPadrao,
            total: pedido.preco_total,
            itens: pedido.pedido_items.map(i => ({ 
                nome: i.nome_produto || i.nome, 
                quantidade: i.quantidade, 
                preco: i.preco_unitario || i.preco,
                complementos: i.complementos || [] 
            })),
            pagamentos: historicoPagto 
        };

        if (req.app.get('io')) {
            req.app.get('io').emit('NOVA_IMPRESSAO', {
                id_tenant: id_tenant,
                jobs: [printJob]
            });
        }

        res.status(200).json({ message: "Comando de impressão enviado para a máquina do caixa!" });

    } catch (error) {
        next(error);
    }
};

// ============================================================================
// OUTRAS FUNÇÕES GLOBAIS (Não alteradas)
// ============================================================================
export const adicionarMovimentacao = async (req, res) => {
    try {
        const { tipo, valor, motivo } = req.body;
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);

        let caixa = await prisma.caixa_pdv.findFirst({
            where: { id_usuario, status: 'ABERTO', id_tenant },
            orderBy: { data_abertura: 'desc' }
        });

        if (!caixa) {
            caixa = await prisma.caixa_pdv.findFirst({
                where: { status: 'ABERTO', id_tenant },
                orderBy: { data_abertura: 'desc' }
            });
        }

        if (!caixa) return res.status(400).json({ message: 'Caixa fechado.' });

        const valorNum = Number(valor);
        const novoSaldo = tipo === 'ENTRADA' ? Number(caixa.saldo_sistema) + valorNum : Number(caixa.saldo_sistema) - valorNum;

        await prisma.$transaction([
            prisma.movimentacao_caixa.create({
                data: { id_caixa: caixa.id_caixa, tipo, valor: valorNum, motivo }
            }),
            prisma.caixa_pdv.updateMany({
                where: { id_caixa: caixa.id_caixa, id_tenant }, data: { saldo_sistema: novoSaldo }
            })
        ]);

        res.json({ message: 'Movimentação registrada.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getHistoricoVendas = async (req, res, next) => {
    try {
        const vendas = await prisma.pedidos.findMany({
            where: { id_caixa_pdv: { not: null }, id_tenant: req.tenantId },
            take: 60,
            orderBy: { data_pedido: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } },
                pedido_items: true,
                nota_fiscal: true
            }
        });

        const idsPedidos = vendas.map(v => v.id_pedido);
        const notasMotor = idsPedidos.length > 0
            ? await prisma.fiscal_notas.findMany({
                where: { id_pedido: { in: idsPedidos }, tenant_id: String(req.tenantId) },
                orderBy: { created_at: 'desc' }
            })
            : [];

        const vendasComFiscal = vendas.map(v => {
            const nfMotor = notasMotor.find(n => n.id_pedido === v.id_pedido) || null;
            return {
                ...v,
                fiscal_nota: nfMotor
            };
        });

        res.status(200).json(vendasComFiscal);
    } catch (error) {
        next(error);
    }
};

export const getHistoricoCaixas = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const id_usuario = await obterIdUsuarioReal(req.user, id_tenant);
        const isAdmin = Boolean(req.user?.isAdmin || req.user?.is_dono || req.user?.role === 'ADMIN' || req.user?.role === 'GERENTE');

        const whereFilter = isAdmin
            ? { id_tenant }
            : { id_tenant, id_usuario };

        const caixas = await prisma.caixa_pdv.findMany({
            where: whereFilter,
            include: { funcionarios: { select: { id_funcionario: true, nome_completo: true, role: true } } },
            orderBy: { data_abertura: 'desc' },
            take: 30
        });

        res.json(caixas);
    } catch (error) {
        next(error);
    }
};

export const getRelatorioFechamento = async (req, res, next) => {
    try {
        const { id_caixa } = req.params;
        const id_tenant = req.tenantId;

        const caixa = await prisma.caixa_pdv.findFirst({
            where: { id_caixa: Number(id_caixa), id_tenant },
            include: { funcionarios: { select: { nome_completo: true } } } 
        });

        if (!caixa) return res.status(404).json({ message: "Caixa não encontrado." });

        const vendasPorMetodo = await prisma.pedidos.groupBy({
            by: ['metodo_pagamento'],
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            _sum: { preco_total: true }
        });

        const movimentacoes = await prisma.movimentacao_caixa.groupBy({
            by: ['tipo'],
            where: { id_caixa: caixa.id_caixa },
            _sum: { valor: true }
        });

        const totalVendas = vendasPorMetodo.reduce((acc, curr) => acc + Number(curr._sum.preco_total || 0), 0);
        const totalEntradas = movimentacoes.find(m => m.tipo === 'ENTRADA')?._sum.valor || 0;
        const totalSaidas = movimentacoes.find(m => m.tipo === 'SAIDA')?._sum.valor || 0;
        const diferenca = Number(caixa.saldo_final || 0) - Number(caixa.saldo_sistema);

        const listaVendas = await prisma.pedidos.findMany({
            where: { id_caixa_pdv: caixa.id_caixa, status_pagamento: 'PAGO', id_tenant },
            select: {
                id_pedido: true, data_pedido: true, metodo_pagamento: true, preco_total: true,
                usuarios: { select: { nome_completo: true } }
            },
            orderBy: { data_pedido: 'desc' }
        });

        const relatorio = {
            info: {
                id: caixa.id_caixa, 
                operador: caixa.funcionarios?.nome_completo || 'Operador não identificado', 
                abertura: caixa.data_abertura,
                fechamento: caixa.data_fechamento, status: caixa.status, observacoes: caixa.observacoes
            },
            financeiro: {
                saldo_inicial: Number(caixa.saldo_inicial), total_vendas: totalVendas,
                total_suprimentos: Number(totalEntradas), total_sangrias: Number(totalSaidas),
                saldo_sistema_calculado: Number(caixa.saldo_sistema), saldo_informado_fechamento: Number(caixa.saldo_final || 0),
                quebra_caixa: diferenca
            },
            detalhamento_pagamentos: vendasPorMetodo.map(v => ({
                metodo: v.metodo_pagamento, total: Number(v._sum.preco_total)
            })),
            vendas: listaVendas
        };

        res.json(relatorio);
    } catch (error) {
        next(error);
    }
};

// ============================================================
// 📦 GESTÃO DE CAIXAS DO PDV E SÉRIES NFC-E
// ============================================================

const gerarTokenCaixa = () => {
    return 'CX-' + crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,4}/g).join('-');
};

export const garantirSeriesCaixa = async (tenantStr, estabelecimentoId, numeroCaixa, ultimoNumero = 0) => {
    const num = Number(numeroCaixa) || 1;
    const serieExeNum = num;
    const serieWebNum = 50 + num;

    // 1. Série Desktop (.EXE): número do caixa (Caixa 1 = Série 1, Caixa 2 = Série 2, ...)
    let serieExe = await prisma.fiscal_series.findFirst({
        where: { estabelecimento_id: estabelecimentoId, modelo: '65', serie: serieExeNum },
        include: { numeracoes: true }
    });
    if (!serieExe) {
        serieExe = await prisma.fiscal_series.create({
            data: {
                tenant_id: tenantStr,
                estabelecimento_id: estabelecimentoId,
                modelo: '65',
                serie: serieExeNum,
                ativo: true
            }
        });
        const numRec = await prisma.fiscal_numeracoes.create({
            data: {
                tenant_id: tenantStr,
                serie_id: serieExe.id,
                ultimo_numero: Math.max(0, Number(ultimoNumero) || 0)
            }
        });
        serieExe.numeracoes = numRec;
    } else if (!serieExe.numeracoes) {
        const numRec = await prisma.fiscal_numeracoes.create({
            data: {
                tenant_id: tenantStr,
                serie_id: serieExe.id,
                ultimo_numero: Math.max(0, Number(ultimoNumero) || 0)
            }
        });
        serieExe.numeracoes = numRec;
    }

    // 2. Série Navegador (Web): 50 + número do caixa (Caixa 1 = Série 51, Caixa 2 = Série 52, ...)
    let serieWeb = await prisma.fiscal_series.findFirst({
        where: { estabelecimento_id: estabelecimentoId, modelo: '65', serie: serieWebNum },
        include: { numeracoes: true }
    });
    if (!serieWeb) {
        serieWeb = await prisma.fiscal_series.create({
            data: {
                tenant_id: tenantStr,
                estabelecimento_id: estabelecimentoId,
                modelo: '65',
                serie: serieWebNum,
                ativo: true
            }
        });
        const numRec = await prisma.fiscal_numeracoes.create({
            data: {
                tenant_id: tenantStr,
                serie_id: serieWeb.id,
                ultimo_numero: 0
            }
        });
        serieWeb.numeracoes = numRec;
    } else if (!serieWeb.numeracoes) {
        const numRec = await prisma.fiscal_numeracoes.create({
            data: {
                tenant_id: tenantStr,
                serie_id: serieWeb.id,
                ultimo_numero: 0
            }
        });
        serieWeb.numeracoes = numRec;
    }

    return { serieExe, serieWeb };
};

export const listarCaixasPDV = async (req, res, next) => {
    try {
        await garantirTabelaPdvSessoes();
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);

        // Busca o tenant e o limite de caixas permitido no plano
        const tenant = await prisma.tenants.findUnique({
            where: { id: Number(id_tenant) }
        });
        const limiteCaixas = tenant?.limite_caixas || 1;

        // Busca estabelecimento ativo (preferencialmente com certificado)
        let estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } }
        }) || await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr }
        });

        let caixas = await prisma.pdv_caixas.findMany({
            where: { tenant_id: tenantStr },
            include: {
                serie: {
                    include: { numeracoes: true }
                },
                turnos: {
                    where: { status: 'ABERTO' },
                    take: 1
                }
            },
            orderBy: { numero_caixa: 'asc' }
        });

        // Auto-seed: se não existir nenhum caixa, cria automaticamente o Caixa 01 vinculado à Série 1 (.exe) e Série 51 (web)
        if (caixas.length === 0 && estab) {
            const { serieExe } = await garantirSeriesCaixa(tenantStr, estab.id, 1, 0);

            const novoCaixa1 = await prisma.pdv_caixas.create({
                data: {
                    tenant_id: tenantStr,
                    estabelecimento_id: estab.id,
                    nome: 'Caixa 01 - Principal',
                    numero_caixa: 1,
                    serie_id: serieExe.id,
                    token_conexao: gerarTokenCaixa(),
                    ativo: true
                },
                include: {
                    serie: { include: { numeracoes: true } },
                    turnos: { where: { status: 'ABERTO' } }
                }
            });
            caixas = [novoCaixa1];
        }

        // Garante que todo caixa existente tenha um token gerado e ambas as séries criadas
        for (const c of caixas) {
            if (!c.token_conexao) {
                const tokenGerado = gerarTokenCaixa();
                await prisma.pdv_caixas.update({
                    where: { id: c.id },
                    data: { token_conexao: tokenGerado }
                });
                c.token_conexao = tokenGerado;
            }
            if (estab) {
                await garantirSeriesCaixa(tenantStr, estab.id, c.numero_caixa);
            }
        }

        const formatados = await Promise.all(caixas.map(async (c) => {
            const serieExeNum = c.numero_caixa;
            const serieWebNum = 50 + c.numero_caixa;

            let serieExe = null;
            let serieWeb = null;

            if (estab) {
                serieExe = await prisma.fiscal_series.findFirst({
                    where: { estabelecimento_id: estab.id, modelo: '65', serie: serieExeNum },
                    include: { numeracoes: true }
                });
                serieWeb = await prisma.fiscal_series.findFirst({
                    where: { estabelecimento_id: estab.id, modelo: '65', serie: serieWebNum },
                    include: { numeracoes: true }
                });
            }

            const sessaoAtual = sessoesAtivasMap.get(c.id);

            return {
                id: c.id,
                nome: c.nome,
                numero_caixa: c.numero_caixa,
                ativo: c.ativo,
                estabelecimento_id: c.estabelecimento_id,
                serie_id: c.serie_id,
                serie_numero: c.numero_caixa, // Default EXE
                serie_exe: serieExeNum,
                ultimo_numero_exe: serieExe?.numeracoes?.ultimo_numero ?? 0,
                proximo_numero_exe: (serieExe?.numeracoes?.ultimo_numero ?? 0) + 1,
                serie_web: serieWebNum,
                ultimo_numero_web: serieWeb?.numeracoes?.ultimo_numero ?? 0,
                proximo_numero_web: (serieWeb?.numeracoes?.ultimo_numero ?? 0) + 1,
                modelo: '65',
                ultimo_numero: (c.serie?.numeracoes?.ultimo_numero ?? 0),
                proximo_numero: (c.serie?.numeracoes?.ultimo_numero ?? 0) + 1,
                tem_turno_aberto: Boolean(c.turnos && c.turnos.length > 0),
                token_conexao: c.token_conexao,
                hardware_id: c.hardware_id,
                dispositivo_vinculado: Boolean(c.hardware_id),
                ambiente_ativo: sessaoAtual?.ambiente_ativo || null,
                operador_ativo_nome: sessaoAtual?.operador_nome || null,
                operador_ativo_id: sessaoAtual?.operador_id || null
            };
        }));

        res.json({
            caixas: formatados,
            total_caixas: formatados.length,
            limite_caixas: limiteCaixas,
            pode_adicionar: formatados.length < limiteCaixas
        });
    } catch (error) {
        next(error);
    }
};

export const criarCaixaPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { nome, numero_caixa, serie_numero, ultimo_numero = 0 } = req.body;

        // 1. Validação de Limite de Caixas no Plano SaaS
        const tenant = await prisma.tenants.findUnique({
            where: { id: Number(id_tenant) }
        });
        const limiteCaixas = tenant?.limite_caixas || 1;
        const totalCaixasAtuais = await prisma.pdv_caixas.count({
            where: { tenant_id: tenantStr, ativo: true }
        });

        if (totalCaixasAtuais >= limiteCaixas) {
            return res.status(403).json({
                message: `Limite de caixas atingido para o plano da sua loja (${limiteCaixas} caixa(s)). Faça upgrade do seu plano para cadastrar mais caixas.`
            });
        }

        // 2. Estabelecimento
        const estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } }
        }) || await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr }
        });

        if (!estab) {
            return res.status(400).json({ message: "Nenhum estabelecimento fiscal cadastrado para vincular o caixa." });
        }

        // Determina número do caixa
        const numCaixa = Number(numero_caixa) || (totalCaixasAtuais + 1);
        const nomeCaixa = nome ? String(nome).trim() : `Caixa ${String(numCaixa).padStart(2, '0')}`;

        // 3. Garante ou cria as Séries NFC-e correspondentes (Modelo 65)
        // Caixa 1 -> Série 1 (.exe) e Série 51 (web)
        // Caixa 2 -> Série 2 (.exe) e Série 52 (web)
        const { serieExe, serieWeb } = await garantirSeriesCaixa(tenantStr, estab.id, numCaixa, ultimo_numero);
        const serie = serieExe;

        // 4. Gera o Token Único do Caixa
        const tokenConexao = gerarTokenCaixa();

        // 5. Cria o Caixa
        const novoCaixa = await prisma.pdv_caixas.create({
            data: {
                tenant_id: tenantStr,
                estabelecimento_id: estab.id,
                nome: nomeCaixa,
                numero_caixa: numCaixa,
                serie_id: serie.id,
                token_conexao: tokenConexao,
                ativo: true
            },
            include: {
                serie: { include: { numeracoes: true } }
            }
        });

        res.status(201).json({
            message: `Caixa ${nomeCaixa} (Série ${serieNum}) cadastrado com sucesso!`,
            caixa: {
                id: novoCaixa.id,
                nome: novoCaixa.nome,
                numero_caixa: novoCaixa.numero_caixa,
                serie_id: novoCaixa.serie_id,
                serie_numero: serieNum,
                ultimo_numero: Math.max(0, Number(ultimo_numero) || 0),
                token_conexao: novoCaixa.token_conexao,
                ativo: novoCaixa.ativo
            }
        });
    } catch (error) {
        next(error);
    }
};

export const regerarTokenCaixaPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { id } = req.params;

        const caixa = await prisma.pdv_caixas.findFirst({
            where: { id: String(id), tenant_id: tenantStr }
        });

        if (!caixa) {
            return res.status(404).json({ message: "Caixa não encontrado." });
        }

        const novoToken = gerarTokenCaixa();

        const atualizado = await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: {
                token_conexao: novoToken,
                hardware_id: null // Reseta a trava física para permitir pareamento em novo computador
            }
        });

        res.json({
            message: `Novo token gerado com sucesso para ${caixa.nome}!`,
            token_conexao: atualizado.token_conexao,
            hardware_id: null
        });
    } catch (error) {
        next(error);
    }
};

export const atualizarCaixaPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { id } = req.params;
        const { nome, numero_caixa, serie_numero, ultimo_numero, ativo } = req.body;

        const caixa = await prisma.pdv_caixas.findFirst({
            where: { id: String(id), tenant_id: tenantStr },
            include: { serie: { include: { numeracoes: true } } }
        });

        if (!caixa) {
            return res.status(404).json({ message: "Caixa não encontrado." });
        }

        const dataUpdate = {};
        if (nome !== undefined) dataUpdate.nome = String(nome).trim();
        if (numero_caixa !== undefined) dataUpdate.numero_caixa = Number(numero_caixa);
        if (ativo !== undefined) dataUpdate.ativo = Boolean(ativo);

        // Se alterou a numeração de série
        if (serie_numero !== undefined && Number(serie_numero) !== caixa.serie?.serie) {
            const novoNumSerie = Number(serie_numero);
            let novaSerie = await prisma.fiscal_series.findFirst({
                where: { estabelecimento_id: caixa.estabelecimento_id, modelo: '65', serie: novoNumSerie },
                include: { numeracoes: true }
            });
            if (!novaSerie) {
                novaSerie = await prisma.fiscal_series.create({
                    data: {
                        tenant_id: tenantStr,
                        estabelecimento_id: caixa.estabelecimento_id,
                        modelo: '65',
                        serie: novoNumSerie,
                        ativo: true
                    }
                });
                await prisma.fiscal_numeracoes.create({
                    data: {
                        tenant_id: tenantStr,
                        serie_id: novaSerie.id,
                        ultimo_numero: ultimo_numero !== undefined ? Number(ultimo_numero) : 0
                    }
                });
            }
            dataUpdate.serie_id = novaSerie.id;
        } else if (ultimo_numero !== undefined && caixa.serie_id) {
            await prisma.fiscal_numeracoes.upsert({
                where: { serie_id: caixa.serie_id },
                create: {
                    tenant_id: tenantStr,
                    serie_id: caixa.serie_id,
                    ultimo_numero: Number(ultimo_numero)
                },
                update: {
                    ultimo_numero: Number(ultimo_numero)
                }
            });
        }

        const atualizado = await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: dataUpdate,
            include: { serie: { include: { numeracoes: true } } }
        });

        res.json({
            message: "Caixa atualizado com sucesso!",
            caixa: {
                id: atualizado.id,
                nome: atualizado.nome,
                numero_caixa: atualizado.numero_caixa,
                serie_id: atualizado.serie_id,
                serie_numero: atualizado.serie?.serie,
                ultimo_numero: atualizado.serie?.numeracoes?.ultimo_numero ?? 0,
                ativo: atualizado.ativo
            }
        });
    } catch (error) {
        next(error);
    }
};

export const excluirCaixaPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { id } = req.params;

        const totalCaixas = await prisma.pdv_caixas.count({
            where: { tenant_id: tenantStr, ativo: true }
        });
        if (totalCaixas <= 1) {
            return res.status(400).json({ message: "Não é possível excluir o único caixa do sistema." });
        }

        await prisma.pdv_caixas.update({
            where: { id: String(id), tenant_id: tenantStr },
            data: { ativo: false }
        });

        res.json({ message: "Caixa desativado com sucesso!" });
    } catch (error) {
        next(error);
    }
};

const garantirTabelaCargasSync = async () => {
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS pdv_cargas_sync (
                id VARCHAR(100) NOT NULL PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                caixa_id VARCHAR(64) NOT NULL,
                dados_json LONGTEXT NOT NULL,
                versao BIGINT DEFAULT 1,
                status VARCHAR(32) DEFAULT 'PENDENTE',
                total_produtos INT DEFAULT 0,
                total_categorias INT DEFAULT 0,
                total_formas INT DEFAULT 0,
                disparado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
                sincronizado_em DATETIME NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_caixa_tenant (caixa_id, tenant_id),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        // Garante que a coluna versao seja BIGINT para comportar timestamps em milissegundos
        await prisma.$executeRawUnsafe(`
            ALTER TABLE pdv_cargas_sync MODIFY COLUMN versao BIGINT DEFAULT 1;
        `).catch(() => {});
    } catch (e) {
        console.warn('[PDV] Aviso ao verificar tabela pdv_cargas_sync:', e.message);
    }
};

export const dispararCargaCaixasPDV = async (req, res, next) => {
    try {
        await garantirTabelaCargasSync();

        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { caixas_ids = [], opcoes = {} } = req.body;

        if (!Array.isArray(caixas_ids) || caixas_ids.length === 0) {
            return res.status(400).json({ message: "Selecione ao menos um caixa para receber a carga de informações." });
        }

        // 1. Busca os produtos reais do tenant no MySQL
        const produtosDb = await prisma.produtos.findMany({
            where: { id_tenant: Number(id_tenant), ativo: true },
            include: { categorias: true }
        });

        // 2. Busca as categorias reais do tenant no MySQL
        const categoriasDb = await prisma.categorias.findMany({
            where: { id_tenant: Number(id_tenant) }
        });

        // 3. Busca as formas de pagamento SEFAZ reais do tenant no MySQL
        const formasSefazDb = await prisma.fiscal_formas_pagamento.findMany({
            where: { tenant_id: tenantStr },
            orderBy: [{ codigo_sefaz: 'asc' }, { descricao: 'asc' }]
        });

        // 4. Busca os dados fiscais da empresa emitente
        const estabDb = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: tenantStr },
            include: { empresa: true }
        });

        const tenantDb = await prisma.tenants.findUnique({
            where: { id: Number(id_tenant) }
        });

        // Formatação fiel para o SQLite config.db do caixa offline
        const produtosFormatados = produtosDb.map(p => ({
            id: String(p.id_produto),
            codigo_barras: p.id_externo || String(p.id_produto),
            sku: p.id_fiscal ? p.id_fiscal.substring(0, 10).toUpperCase() : `PRD-${p.id_produto}`,
            nome: p.nome,
            descricao: p.descricao || '',
            preco_venda: Number(p.preco || 0),
            preco_custo: Number(p.preco_custo || 0),
            unidade_medida: p.unidade || 'UN',
            estoque_atual: Number(p.estoque || 0),
            imagem_url: p.imagem_url || '',
            categoria_id: p.id_categoria ? String(p.id_categoria) : '',
            categoria_nome: p.categorias?.nome || 'Geral',
            ncm: p.ncm || '21069090',
            cest: p.cest || '',
            cfop_padrao: p.cfop_padrao || '5102',
            origem: Number(p.origem || 0),
            csosn: p.cst_icms || '102',
            cst_icms: p.cst_icms || '00',
            aliquota_icms: Number(p.aliq_icms || 0),
            cst_pis: p.cst_pis_cofins || '07',
            aliquota_pis: Number(p.aliq_pis || 0),
            cst_cofins: p.cst_pis_cofins || '07',
            aliquota_cofins: Number(p.aliq_cofins || 0)
        }));

        const categoriasFormatadas = categoriasDb.map(c => ({
            id: String(c.id_categoria),
            nome: c.nome
        }));

        const formasFormatadas = formasSefazDb.map(f => ({
            id: f.id,
            codigo_sefaz: f.codigo_sefaz,
            descricao: f.descricao,
            permite_troco: f.codigo_sefaz === '01' ? 1 : 0
        }));

        const empresaFormatada = {
            razao_social: estabDb?.empresa?.razao_social || tenantDb?.nome_fantasia || 'Empresa',
            nome_fantasia: estabDb?.empresa?.nome_fantasia || tenantDb?.nome_fantasia || 'Empresa',
            cnpj: estabDb?.empresa?.cnpj || estabDb?.cnpj || '',
            ie: estabDb?.empresa?.ie || estabDb?.ie || '',
            crt: estabDb?.empresa?.crt || 'SIMPLES_NACIONAL',
            logo_url: tenantDb?.logo_url || ''
        };

        // 5. Busca funcionários do tenant
        const funcsDb = await prisma.funcionarios.findMany({
            where: { id_tenant: Number(id_tenant), ativo: true },
            include: { cargos: true }
        });

        const funcionariosFormatados = funcsDb.map(f => {
            let papel = 'OPERADOR';
            if (f.isAdmin) {
                papel = 'ADMIN';
            } else if (f.cargos?.nome) {
                papel = f.cargos.nome;
            } else if (f.role) {
                papel = f.role;
            }

            const dadosAcesso = {
                id_funcionario: f.id_funcionario,
                codigo_acesso: f.codigo_acesso || '',
                hash_senha: f.hash_senha || '',
                role: papel,
                isAdmin: Boolean(f.isAdmin),
                permissoes: f.cargos?.permissoes || []
            };

            const payloadCriptografado = encrypt(JSON.stringify(dadosAcesso));

            return {
                id: String(f.id_funcionario),
                id_funcionario: f.id_funcionario,
                nome: f.nome_completo,
                email: f.email,
                codigo_acesso: f.codigo_acesso || '',
                role: papel,
                isAdmin: Boolean(f.isAdmin),
                ativo: f.ativo ? 1 : 0,
                permissoes: f.cargos?.permissoes || [],
                dados_acesso_criptografado: payloadCriptografado
            };
        });

        // 6. Busca mesas reais do tenant
        const mesasDb = await prisma.mesas.findMany({
            where: { id_tenant: Number(id_tenant) },
            include: {
                pedidos: {
                    where: { 
                        status_comanda: { in: ['ABERTO', 'ABERTA', 'EM_PREPARO', 'AGUARDANDO_PAGAMENTO', 'FECHANDO'] },
                        status_pagamento: { not: 'CANCELADO' }
                    },
                    orderBy: { id_pedido: 'desc' },
                    include: {
                        pedido_items: true
                    }
                }
            },
            orderBy: { id_mesa: 'asc' }
        });

        const mesasFormatadas = [];
        for (const m of mesasDb) {
            let valorTotal = 0;
            let itensMesa = [];
            let pedidoAtivo = m.pedidos && m.pedidos.length > 0 ? m.pedidos[0] : null;

            let statusReal = m.status;
            if (!pedidoAtivo || pedidoAtivo.status_pagamento === 'CANCELADO') {
                if (statusReal === 'OCUPADA') {
                    await prisma.mesas.update({
                        where: { id_mesa: m.id_mesa },
                        data: { status: 'LIVRE', mesa_agrupada: null }
                    }).catch(() => {});
                    statusReal = 'LIVRE';
                }
                pedidoAtivo = null;
            } else {
                statusReal = 'OCUPADA';
            }

            if (pedidoAtivo) {
                valorTotal = Number(pedidoAtivo.preco_total || pedidoAtivo.total_pedido || 0);
                if (pedidoAtivo.pedido_items) {
                    itensMesa = pedidoAtivo.pedido_items.map(pi => ({
                        id_produto: pi.id_produto,
                        nome: pi.nome || pi.nome_produto || 'Item',
                        qtd: Number(pi.quantidade || 1),
                        preco: Number(pi.preco || pi.preco_unitario || 0)
                    }));
                }
            }
            const num = parseInt(m.nome.replace(/\D/g, '')) || m.id_mesa;
            mesasFormatadas.push({
                id: m.id_mesa,
                id_mesa: m.id_mesa,
                numero: num,
                nome: m.nome,
                status: statusReal || (pedidoAtivo ? 'OCUPADA' : 'LIVRE'),
                valor: valorTotal,
                id_pedido: pedidoAtivo ? pedidoAtivo.id_pedido : 0,
                itens: itensMesa,
                tempo: (pedidoAtivo?.data_pedido || pedidoAtivo?.criado_em) ? Math.round((Date.now() - new Date(pedidoAtivo.data_pedido || pedidoAtivo.criado_em).getTime()) / 60000) + 'm' : '--',
                garcom: '--'
            });
        }

        // 5. Busca configurações visuais e módulos da loja
        const configsDb = await prisma.configuracoes.findMany({
            where: {
                id_tenant: Number(id_tenant),
                chave: { in: ['HEADER_PRIMARY_COLOR', 'HEADER_SECONDARY_COLOR', 'LOGO_URL', 'FAVICON_URL', 'SITE_TITLE', 'PDV_MODULO_ENTREGAS_MAPA'] }
            }
        });
        const aparenciaMap = {};
        configsDb.forEach(c => { aparenciaMap[c.chave] = c.valor; });
        const entregasMapaHabilitado = aparenciaMap.PDV_MODULO_ENTREGAS_MAPA !== '0' && aparenciaMap.PDV_MODULO_ENTREGAS_MAPA !== 'false';

        const pacoteSincronizacao = {
            gerado_em: new Date().toISOString(),
            versao: Date.now(),
            tenant_id: tenantStr,
            empresa: empresaFormatada,
            modulos: {
                entregas_mapa: entregasMapaHabilitado,
                modulo_mesas: true,
                modulo_salao: true,
                modulo_agenda: true,
                modulo_vendas: true
            },
            aparencia: {
                cor_primaria: aparenciaMap.HEADER_PRIMARY_COLOR || '#0284c7',
                cor_secundaria: aparenciaMap.HEADER_SECONDARY_COLOR || '#0369a1',
                logo_url: aparenciaMap.LOGO_URL || '',
                favicon_url: aparenciaMap.FAVICON_URL || '',
                titulo_site: aparenciaMap.SITE_TITLE || ''
            },
            total_produtos: produtosFormatados.length,
            total_categorias: categoriasFormatadas.length,
            total_formas: formasFormatadas.length,
            total_funcionarios: funcionariosFormatados.length,
            total_mesas: mesasFormatadas.length,
            produtos: produtosFormatados,
            categorias: categoriasFormatadas,
            formas_pagamento: formasFormatadas,
            funcionarios: funcionariosFormatados,
            mesas: mesasFormatadas
        };

        const dadosJsonStr = JSON.stringify(pacoteSincronizacao);

        // Grava o lote direcionado para cada caixa selecionado
        for (const caixaId of caixas_ids) {
            const syncId = `SYNC-${caixaId}-${Date.now()}`;
            await prisma.$executeRawUnsafe(
                `DELETE FROM pdv_cargas_sync WHERE caixa_id = ? AND tenant_id = ? AND status = 'PENDENTE'`,
                caixaId, tenantStr
            );

            await prisma.$executeRawUnsafe(
                `INSERT INTO pdv_cargas_sync (id, tenant_id, caixa_id, dados_json, versao, status, total_produtos, total_categorias, total_formas, disparado_em)
                 VALUES (?, ?, ?, ?, ?, 'PENDENTE', ?, ?, ?, NOW())`,
                syncId,
                tenantStr,
                caixaId,
                dadosJsonStr,
                pacoteSincronizacao.versao,
                produtosFormatados.length,
                categoriasFormatadas.length,
                formasFormatadas.length
            );
        }

        res.json({
            success: true,
            message: `Lote de dados reais disparado com sucesso para ${caixas_ids.length} caixa(s)!`,
            total_caixas: caixas_ids.length,
            total_produtos: produtosFormatados.length,
            total_categorias: categoriasFormatadas.length,
            total_formas: formasFormatadas.length,
            total_funcionarios: funcionariosFormatados.length,
            total_mesas: mesasFormatadas.length,
            versao: pacoteSincronizacao.versao
        });

    } catch (error) {
        next(error);
    }
};

export const obterCargaSyncCaixa = async (req, res, next) => {
    try {
        await garantirTabelaCargasSync();
        const token = req.query.token || req.headers['x-token-caixa'] || req.headers['x-token-dispositivo'];
        const hwid = req.query.hwid || req.headers['x-hwid'] || req.body?.hwid;
        const computador = req.query.computador || req.headers['x-computador'] || req.body?.computador;

        let caixa = null;
        if (token) {
            caixa = await prisma.pdv_caixas.findFirst({
                where: { token_conexao: String(token) }
            });
        }

        const id_tenant = req.tenantId || (caixa ? Number(caixa.tenant_id) : 1);
        const tenantStr = String(id_tenant);

        if (!caixa) {
            caixa = await prisma.pdv_caixas.findFirst({
                where: { tenant_id: tenantStr, ativo: true }
            });
        }

        if (!caixa) {
            return res.status(404).json({ message: "Nenhum caixa encontrado para sincronizar." });
        }

        // 🛡️ VERIFICAÇÃO DE SEGURANÇA DE HARDWARE (HWID 1:1 ANTI-PIRATARIA / ANTI-USO CONCORRENTE)
        const hwidRecebido = hwid ? String(hwid).split(' ')[0].trim() : '';
        const hwidStr = hwid ? (computador ? `${hwid} (${computador})` : String(hwid)) : (caixa.hardware_id || 'PAREADO');

        if (caixa.hardware_id) {
            const hwidEsperado = caixa.hardware_id.split(' ')[0].trim();
            if (hwidRecebido && hwidEsperado && hwidRecebido !== hwidEsperado) {
                return res.status(403).json({
                    error: `Acesso negado: Este caixa já está vinculado a outro computador (${caixa.hardware_id}).`,
                    code: "HWID_BLOQUEADO",
                    hardware_cadastrado: caixa.hardware_id
                });
            }
        } else if (hwid) {
            // Se estava livre (desvinculado), vincula à máquina atual
            await prisma.pdv_caixas.update({
                where: { id: caixa.id },
                data: {
                    hardware_id: hwidStr,
                    updated_at: new Date()
                }
            });
            caixa.hardware_id = hwidStr;
        }

        // Verifica se há carga gerada pendente para este caixa
        const cargas = await prisma.$queryRawUnsafe(
            `SELECT id, dados_json, versao FROM pdv_cargas_sync WHERE caixa_id = ? AND tenant_id = ? AND status = 'PENDENTE' ORDER BY disparado_em DESC LIMIT 1`,
            caixa.id, tenantStr
        );

        if (cargas && cargas.length > 0) {
            const carga = cargas[0];
            await prisma.$executeRawUnsafe(
                `UPDATE pdv_cargas_sync SET status = 'SINCRONIZADO', sincronizado_em = NOW() WHERE id = ?`,
                carga.id
            );

            const dados = JSON.parse(carga.dados_json);
            // 🟢 Injeta mesas sempre em tempo real para não carregar dados defasados
            const mesasVivas = await obterMesasDbFormatadas(id_tenant);
            dados.mesas = mesasVivas;
            dados.total_mesas = mesasVivas.length;
            return res.json(dados);
        }

        // Se não houver carga disparada pendente, gera na hora com base no banco principal
        const fakeReq = { tenantId: id_tenant, body: { caixas_ids: [caixa.id] } };
        const fakeRes = { json: () => {} };
        await dispararCargaCaixasPDV(fakeReq, fakeRes, () => {});

        const novaCarga = await prisma.$queryRawUnsafe(
            `SELECT id, dados_json FROM pdv_cargas_sync WHERE caixa_id = ? AND tenant_id = ? ORDER BY disparado_em DESC LIMIT 1`,
            caixa.id, tenantStr
        );

        if (novaCarga && novaCarga.length > 0) {
            const dados = JSON.parse(novaCarga[0].dados_json);
            const mesasVivas = await obterMesasDbFormatadas(id_tenant);
            dados.mesas = mesasVivas;
            dados.total_mesas = mesasVivas.length;
            return res.json(dados);
        }

        return res.json({ produtos: [], categorias: [], formas_pagamento: [], mesas: [] });

    } catch (error) {
        next(error);
    }
};

export const vincularCaixaPDV = async (req, res, next) => {
    try {
        const token = req.body?.token || req.query?.token || req.headers['x-token-caixa'];
        const hwid = req.body?.hwid || req.headers['x-hwid'] || 'PAREADO';
        const computador = req.body?.computador || req.headers['x-computador'] || 'Terminal-PDV';

        if (!token) {
            return res.status(400).json({ error: "Token não informado." });
        }

        const caixa = await prisma.pdv_caixas.findFirst({
            where: { token_conexao: String(token) }
        });

        if (!caixa) {
            return res.status(404).json({ error: "Caixa não encontrado com o token fornecido." });
        }

        const hwidRecebido = String(hwid).split(' ')[0].trim();
        if (caixa.hardware_id) {
            const hwidAtual = caixa.hardware_id.split(' ')[0].trim();
            if (hwidRecebido && hwidAtual && hwidRecebido !== hwidAtual) {
                return res.status(403).json({
                    error: `Este caixa já está vinculado a outro computador (${caixa.hardware_id}). Desvincule no painel web ou utilize a recincronização.`,
                    code: "HWID_BLOQUEADO",
                    hardware_atual: caixa.hardware_id
                });
            }
        }

        const hwidStr = `${hwid} (${computador})`.substring(0, 255);
        await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: {
                hardware_id: hwidStr,
                updated_at: new Date()
            }
        });

        res.json({
            success: true,
            message: `Caixa ${caixa.nome} pareado com sucesso!`,
            hardware_id: hwidStr
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// 🔒 VALIDAÇÃO RIGOROSA DE CÓDIGO DO CAIXA E TRAVA DE HARDWARE (HWID)
// ============================================================================
export const validarEVincularCaixa = async (req, res, next) => {
    try {
        const { codigo, hwid, computador } = req.body;

        if (!codigo || typeof codigo !== 'string') {
            return res.status(400).json({
                success: false,
                error: "Código do caixa é obrigatório."
            });
        }

        const codigoLimpo = codigo.trim();

        // 1. Validação estrita de formato: não pode ser minúsculo e não pode ser sem os traços (ex: CX-5BB9-97BF)
        const regexFormato = /^CX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!regexFormato.test(codigoLimpo)) {
            return res.status(400).json({
                success: false,
                error: "Formato do código de caixa inválido. O código não pode conter letras minúsculas nem estar sem os traços. Padrão obrigatório: CX-XXXX-XXXX (ex: CX-5BB9-97BF)."
            });
        }

        // 2. Consulta no banco de dados para checar se é um caixa real existente
        const caixa = await prisma.pdv_caixas.findFirst({
            where: { token_conexao: codigoLimpo }
        });

        if (!caixa) {
            return res.status(404).json({
                success: false,
                error: `Código de caixa '${codigoLimpo}' não foi encontrado no sistema. Verifique o código cadastrado no painel web da sua loja.`
            });
        }

        if (!caixa.ativo) {
            return res.status(400).json({
                success: false,
                error: `O caixa '${caixa.nome}' (${codigoLimpo}) está inativo no sistema.`
            });
        }

        // 3. Validação de HWID (Hardware ID Lock 1:1)
        const hwidRecebido = hwid ? String(hwid).split(' ')[0].trim() : '';
        const hwidCompleto = `${hwid || 'HWID-DESCONHECIDO'}${computador ? ' (' + computador + ')' : ''}`;

        if (caixa.hardware_id) {
            const hwidAtual = caixa.hardware_id.split(' ')[0].trim();
            if (hwidRecebido && hwidAtual && hwidRecebido !== hwidAtual) {
                return res.status(403).json({
                    success: false,
                    code: "HWID_BLOQUEADO",
                    error: `Este código de caixa já está vinculado a outro computador (${caixa.hardware_id}). Para usar nesta máquina, desvincule o caixa no painel web ou utilize a opção de recincronizar.`,
                    hardware_atual: caixa.hardware_id
                });
            }
        }

        // Vincula o HWID desta máquina no banco
        await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: {
                hardware_id: hwidCompleto,
                updated_at: new Date()
            }
        });

        // 4. Sincroniza o Tenant
        const tenant = await prisma.tenants.findUnique({
            where: { id: Number(caixa.tenant_id) }
        });

        const estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: String(caixa.tenant_id) }
        });

        return res.json({
            success: true,
            message: `Caixa ${caixa.nome} validado e vinculado com sucesso à máquina ${hwidCompleto}!`,
            caixa: {
                id: caixa.id,
                nome: caixa.nome,
                numero_caixa: caixa.numero_caixa,
                token_conexao: caixa.token_conexao,
                hardware_id: hwidCompleto,
                serie_id: caixa.serie_id
            },
            tenant: {
                id: caixa.tenant_id,
                nome_fantasia: tenant?.nome_fantasia || 'Empresa',
                razao_social: tenant?.razao_social || 'Empresa',
                documento: tenant?.documento || ''
            },
            estabelecimento: estab ? {
                id: estab.id,
                cnpj: estab.cnpj,
                razao_social: estab.razao_social,
                nome_fantasia: estab.nome_fantasia
            } : null
        });

    } catch (err) {
        next(err);
    }
};

// ============================================================================
// 🔄 RECINCRONIZAÇÃO DE MÁQUINA FORMATADA OU NOVO COMPUTADOR (COM SENHA ADMIN)
// ============================================================================
export const recincronizarHwidCaixa = async (req, res, next) => {
    try {
        const { codigo, email, senha, novo_hwid, computador } = req.body;

        if (!codigo || !email || !senha) {
            return res.status(400).json({
                success: false,
                error: "Código do caixa, e-mail e senha de administrador são obrigatórios para recincronizar."
            });
        }

        const codigoLimpo = codigo.trim();
        const regexFormato = /^CX-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!regexFormato.test(codigoLimpo)) {
            return res.status(400).json({
                success: false,
                error: "Código de caixa inválido. Padrão obrigatório: CX-XXXX-XXXX (ex: CX-5BB9-97BF)."
            });
        }

        const caixa = await prisma.pdv_caixas.findFirst({
            where: { token_conexao: codigoLimpo }
        });

        if (!caixa) {
            return res.status(404).json({
                success: false,
                error: "Código de caixa não encontrado no sistema."
            });
        }

        const id_tenant = Number(caixa.tenant_id);

        // Autentica as credenciais com o Tenant (Dono) ou Funcionário Admin do Tenant
        let autenticado = false;
        let nomeAutorizador = '';

        // 1. Tenta autenticar pelo Tenant (Dono)
        const tenant = await prisma.tenants.findUnique({
            where: { id: id_tenant }
        });

        if (tenant && tenant.email && tenant.email.toLowerCase() === email.trim().toLowerCase() && tenant.hash_senha) {
            const senhaOk = await bcrypt.compare(senha, tenant.hash_senha);
            if (senhaOk) {
                autenticado = true;
                nomeAutorizador = tenant.nome_fantasia || 'Proprietário';
            }
        }

        // 2. Tenta autenticar por funcionário com permissão ADMIN do tenant
        if (!autenticado) {
            const funcionario = await prisma.funcionarios.findFirst({
                where: {
                    id_tenant: id_tenant,
                    email: email.trim().toLowerCase(),
                    OR: [
                        { role: 'ADMIN' },
                        { isAdmin: true }
                    ]
                }
            });

            if (funcionario && funcionario.hash_senha) {
                const senhaOk = await bcrypt.compare(senha, funcionario.hash_senha);
                if (senhaOk) {
                    autenticado = true;
                    nomeAutorizador = funcionario.nome_completo || 'Administrador';
                }
            }
        }

        if (!autenticado) {
            return res.status(401).json({
                success: false,
                error: "Credenciais de administrador inválidas para este estabelecimento. Verifique o e-mail e a senha informados."
            });
        }

        // Autorizado! Atualiza o HWID para a nova máquina ou máquina formatada
        const hwidCompleto = `${novo_hwid || 'HWID-DESCONHECIDO'}${computador ? ' (' + computador + ')' : ''}`;
        await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: {
                hardware_id: hwidCompleto,
                updated_at: new Date()
            }
        });

        const estab = await prisma.fiscal_estabelecimentos.findFirst({
            where: { tenant_id: String(caixa.tenant_id) }
        });

        return res.json({
            success: true,
            message: `Caixa ${caixa.nome} recincronizado com sucesso por ${nomeAutorizador}! Novo computador vinculado: ${hwidCompleto}`,
            caixa: {
                id: caixa.id,
                nome: caixa.nome,
                numero_caixa: caixa.numero_caixa,
                token_conexao: caixa.token_conexao,
                hardware_id: hwidCompleto
            },
            tenant: {
                id: caixa.tenant_id,
                nome_fantasia: tenant?.nome_fantasia || 'Empresa',
                razao_social: tenant?.razao_social || 'Empresa'
            },
            estabelecimento: estab ? {
                id: estab.id,
                cnpj: estab.cnpj,
                razao_social: estab.razao_social
            } : null
        });

    } catch (err) {
        next(err);
    }
};

// ============================================================================
// 🔓 DESVINCULAR MÁQUINA (PARA USO NO PAINEL WEB)
// ============================================================================
export const desvincularHwidCaixa = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { id } = req.params;

        const caixa = await prisma.pdv_caixas.findFirst({
            where: { id: String(id), tenant_id: tenantStr }
        });

        if (!caixa) {
            return res.status(404).json({ message: "Caixa não encontrado." });
        }

        const hwidAnterior = caixa.hardware_id;

        await prisma.pdv_caixas.update({
            where: { id: caixa.id },
            data: {
                hardware_id: null,
                updated_at: new Date()
            }
        });

        res.json({
            success: true,
            message: `Computador (${hwidAnterior || 'nenhum'}) desvinculado com sucesso do ${caixa.nome}! O código ${caixa.token_conexao} está livre para ser pareado em uma nova máquina ou máquina formatada.`
        });
    } catch (err) {
        next(err);
    }
};

// ============================================================================
// 🚀 CONTROLE DE VERSÕES E ATUALIZAÇÃO AUTOMÁTICA DO .EXE
// ============================================================================
export const obterVersaoPDV = async (req, res) => {
    res.json({
        versao_mais_recente: "1.0.1",
        versao_minima_obrigatoria: "1.0.0",
        url_download: "https://backcore.azun.com.br/downloads/Instalador_AzunPDV_Setup.exe",
        tamanho_mb: 5.1,
        obrigatoria: false,
        novidades: [
            "Validação estrita de formato do código de caixa (CX-XXXX-XXXX)",
            "Consulta em tempo real de existência do caixa e sincronização do Tenant",
            "Trava de segurança de hardware única (HWID 1:1) anti-pirataria",
            "Opção de recincronização facilitada para máquinas formatadas ou novos computadores",
            "Verificação automática de novas atualizações do executável"
        ],
        data_lancamento: "2026-11-16T12:00:00Z"
    });
};

export const obterMesasDbFormatadas = async (id_tenant) => {
    const mesasDb = await prisma.mesas.findMany({
        where: { id_tenant: Number(id_tenant) },
        include: {
            pedidos: {
                where: { 
                    status_comanda: { in: ['ABERTO', 'ABERTA', 'EM_PREPARO', 'AGUARDANDO_PAGAMENTO', 'FECHANDO'] },
                    status_pagamento: { not: 'CANCELADO' }
                },
                orderBy: { id_pedido: 'desc' },
                include: {
                    pedido_items: true
                }
            }
        },
        orderBy: { id_mesa: 'asc' }
    });

    const mesasFormatadas = [];
    for (const m of mesasDb) {
        let valorTotal = 0;
        let itensMesa = [];
        let pedidoAtivo = m.pedidos && m.pedidos.length > 0 ? m.pedidos[0] : null;

        // Se a mesa constar como OCUPADA mas não possuir pedido ativo real (ou se o pedido foi cancelado/finalizado), auto-repara para LIVRE
        let statusReal = m.status;
        if (!pedidoAtivo || pedidoAtivo.status_pagamento === 'CANCELADO') {
            if (statusReal === 'OCUPADA') {
                await prisma.mesas.update({
                    where: { id_mesa: m.id_mesa },
                    data: { status: 'LIVRE', mesa_agrupada: null }
                }).catch(() => {});
                statusReal = 'LIVRE';
            }
            pedidoAtivo = null;
        } else {
            statusReal = 'OCUPADA';
        }

        if (pedidoAtivo) {
            valorTotal = Number(pedidoAtivo.preco_total || pedidoAtivo.total_pedido || 0);
            if (pedidoAtivo.pedido_items) {
                itensMesa = pedidoAtivo.pedido_items.map(pi => ({
                    id_produto: pi.id_produto,
                    nome: pi.nome || pi.nome_produto || 'Item',
                    qtd: Number(pi.quantidade || 1),
                    preco: Number(pi.preco || pi.preco_unitario || 0)
                }));
            }
        }
        const num = parseInt(m.nome.replace(/\D/g, '')) || m.id_mesa;
        mesasFormatadas.push({
            id: m.id_mesa,
            id_mesa: m.id_mesa,
            numero: num,
            nome: m.nome,
            status: statusReal || (pedidoAtivo ? 'OCUPADA' : 'LIVRE'),
            valor: valorTotal,
            id_pedido: pedidoAtivo ? pedidoAtivo.id_pedido : 0,
            itens: itensMesa,
            tempo: (pedidoAtivo?.data_pedido || pedidoAtivo?.criado_em) ? Math.round((Date.now() - new Date(pedidoAtivo.data_pedido || pedidoAtivo.criado_em).getTime()) / 60000) + 'm' : '--',
            garcom: '--'
        });
    }

    return mesasFormatadas;
};

export const obterMesasSync = async (req, res, next) => {
    try {
        const token = req.query.token || req.headers['x-token-caixa'];
        let id_tenant = req.tenantId;
        if (!id_tenant && token) {
            const caixa = await prisma.pdv_caixas.findFirst({
                where: { token_conexao: String(token) }
            });
            if (caixa) id_tenant = Number(caixa.tenant_id);
        }
        if (!id_tenant) id_tenant = 1;

        const mesasFormatadas = await obterMesasDbFormatadas(id_tenant);
        res.json(mesasFormatadas);
    } catch (err) {
        next(err);
    }
};

export const liberarMesaCaixa = async (req, res, next) => {
    try {
        const token = req.body?.token || req.query?.token || req.headers['x-token-caixa'];
        const { id_mesa, nome, id_pedido } = req.body;
        let id_tenant = req.tenantId;
        if (!id_tenant && token) {
            const caixa = await prisma.pdv_caixas.findFirst({
                where: { token_conexao: String(token) }
            });
            if (caixa) id_tenant = Number(caixa.tenant_id);
        }
        if (!id_tenant) id_tenant = 1;

        // 1. Finaliza pedido/comanda associado
        const condicoesPedido = [];
        if (id_pedido && Number(id_pedido) > 0) {
            condicoesPedido.push({ id_pedido: Number(id_pedido) });
        }
        if (id_mesa && Number(id_mesa) > 0) {
            condicoesPedido.push({ id_mesa: Number(id_mesa) });
        }
        if (nome) {
            condicoesPedido.push({ codigo_comanda: String(nome) });
        }

        if (condicoesPedido.length > 0) {
            await prisma.pedidos.updateMany({
                where: {
                    id_tenant: Number(id_tenant),
                    OR: condicoesPedido,
                    status_comanda: { in: ['ABERTO', 'ABERTA', 'EM_PREPARO', 'AGUARDANDO_PAGAMENTO', 'FECHANDO'] }
                },
                data: {
                    status_comanda: 'FINALIZADO',
                    status_pagamento: 'PAGO',
                    status_entrega: 'Entregue'
                }
            }).catch(() => {});
        }

        // 2. Libera a mesa no MySQL
        const condicoesMesa = [];
        if (id_mesa && Number(id_mesa) > 0) {
            condicoesMesa.push({ id_mesa: Number(id_mesa) });
        }
        if (nome) {
            condicoesMesa.push({ nome: String(nome) });
            condicoesMesa.push({ mesa_agrupada: String(nome) });
        }

        if (condicoesMesa.length > 0) {
            await prisma.mesas.updateMany({
                where: {
                    id_tenant: Number(id_tenant),
                    OR: condicoesMesa
                },
                data: {
                    status: 'LIVRE',
                    mesa_agrupada: null
                }
            }).catch(() => {});
        }

        // 3. Notifica o painel Web via Socket.IO
        if (req.app.get('io')) {
            req.app.get('io').emit('ATUALIZAR_MESAS', { id_tenant });
            req.app.get('io').emit('ATUALIZAR_COMANDAS', { id_tenant });
        }

        res.json({ success: true, message: "Mesa liberada com sucesso no servidor web!" });
    } catch (err) {
        next(err);
    }
};

export const cancelarVendaPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const tenantStr = String(id_tenant);
        const { venda_id, id_pedido, motivo } = req.body;
        const motivoCancel = motivo || 'Cancelamento solicitado pelo PDV Desktop';

        let pedido = null;
        const idPed = Number(id_pedido || venda_id);
        if (!isNaN(idPed) && idPed > 0) {
            pedido = await prisma.pedidos.findFirst({
                where: { id_pedido: idPed, id_tenant: Number(id_tenant) }
            });
        }
        if (!pedido && venda_id) {
            pedido = await prisma.pedidos.findFirst({
                where: { sync_id: String(venda_id), id_tenant: Number(id_tenant) }
            });
        }

        if (pedido) {
            await prisma.pedidos.update({
                where: { id_pedido: pedido.id_pedido },
                data: {
                    status_pagamento: 'CANCELADO',
                    status_entrega: 'Cancelado'
                }
            });

            // Estorna produtos ao estoque
            const itens = await prisma.pedido_items.findMany({ where: { id_pedido: pedido.id_pedido } });
            for (const it of itens) {
                if (it.id_produto) {
                    await prisma.produtos.updateMany({
                        where: { id_produto: it.id_produto, id_tenant: Number(id_tenant) },
                        data: { estoque: { increment: Number(it.quantidade || 1) } }
                    }).catch(() => {});
                }
            }

            // Atualiza tabela notas_fiscais
            await prisma.notas_fiscais.updateMany({
                where: { id_pedido: pedido.id_pedido },
                data: { status: 'CANCELADA', motivo_status: String(motivoCancel).substring(0, 250) }
            }).catch(() => {});
        }

        // Localiza e cancela nota na SEFAZ e em fiscal_notas
        let fiscalNota = null;
        if (pedido) {
            fiscalNota = await prisma.fiscal_notas.findFirst({
                where: { id_pedido: pedido.id_pedido, tenant_id: tenantStr }
            });
        }
        if (!fiscalNota && venda_id) {
            fiscalNota = await prisma.fiscal_notas.findFirst({
                where: {
                    tenant_id: tenantStr,
                    OR: [
                        { chave_acesso: String(venda_id) },
                        { id: String(venda_id) }
                    ]
                }
            });
        }

        if (fiscalNota) {
            if (fiscalNota.status === 'AUTORIZADA' && fiscalNota.chave_acesso && fiscalNota.protocolo_autorizacao) {
                try {
                    const { NFeEventosService } = await import('../../modules/fiscal/services/NFeEventosService.js');
                    await NFeEventosService.processarEvento(
                        tenantStr,
                        fiscalNota.id,
                        'CANCELAMENTO',
                        {
                            chave_acesso: fiscalNota.chave_acesso,
                            protocolo_autorizacao: fiscalNota.protocolo_autorizacao,
                            justificativa: motivoCancel.length >= 15 ? motivoCancel : (motivoCancel + ' - Cancelamento pelo PDV')
                        }
                    );
                } catch (e) {
                    console.warn('[PDV] Falha ao cancelar nota na SEFAZ:', e.message);
                    await prisma.fiscal_notas.update({
                        where: { id: fiscalNota.id },
                        data: { status: 'CANCELADA', motivo_status_sefaz: `Cancelado pelo PDV: ${motivoCancel}` }
                    }).catch(() => {});
                }
            } else {
                await prisma.fiscal_notas.update({
                    where: { id: fiscalNota.id },
                    data: { status: 'CANCELADA', motivo_status_sefaz: `Cancelado pelo PDV: ${motivoCancel}` }
                }).catch(() => {});
            }
        }

        return res.json({
            success: true,
            message: "Venda e nota fiscal canceladas com sucesso no sistema!",
            venda_id: venda_id || pedido?.id_pedido
        });
    } catch (err) {
        next(err);
    }
};

// ==========================================
// 📦 CONTROLE DE MÓDULOS DO PDV DESKTOP (.EXE)
// ==========================================
export const obterModulosConfigPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const cfg = await prisma.configuracoes.findFirst({
            where: { id_tenant: Number(id_tenant), chave: 'PDV_MODULO_ENTREGAS_MAPA' }
        });
        const entregas_mapa = cfg ? (cfg.valor === '1' || cfg.valor === 'true') : true;
        res.json({
            success: true,
            modulos: {
                entregas_mapa,
                mesas: true,
                salao: true,
                agenda: true,
                vendas: true
            }
        });
    } catch (e) {
        next(e);
    }
};

export const atualizarModulosConfigPDV = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { entregas_mapa } = req.body;
        const valorStr = (entregas_mapa === true || entregas_mapa === 1 || entregas_mapa === '1' || entregas_mapa === 'true') ? '1' : '0';

        await prisma.configuracoes.upsert({
            where: { chave_id_tenant: { chave: 'PDV_MODULO_ENTREGAS_MAPA', id_tenant: Number(id_tenant) } },
            create: { chave: 'PDV_MODULO_ENTREGAS_MAPA', valor: valorStr, id_tenant: Number(id_tenant) },
            update: { valor: valorStr }
        });

        res.json({
            success: true,
            message: 'Configuração dos módulos do PDV salva com sucesso!',
            entregas_mapa: valorStr === '1'
        });
    } catch (e) {
        next(e);
    }
};

export const obterModulosConfigCaixaPublico = async (req, res, next) => {
    try {
        const token = req.query.token || req.headers['x-token-caixa'] || req.headers['x-token-dispositivo'];
        let tenantId = req.tenantId;
        if (!tenantId && token) {
            const cx = await prisma.pdv_caixas.findFirst({
                where: { token_conexao: String(token), ativo: true }
            });
            if (cx) tenantId = Number(cx.tenant_id);
        }
        if (!tenantId) {
            return res.json({
                success: true,
                modulos: { entregas_mapa: true, mesas: true, salao: true, agenda: true, vendas: true }
            });
        }
        const cfg = await prisma.configuracoes.findFirst({
            where: { id_tenant: Number(tenantId), chave: 'PDV_MODULO_ENTREGAS_MAPA' }
        });
        const entregas_mapa = cfg ? (cfg.valor === '1' || cfg.valor === 'true') : true;
        res.json({
            success: true,
            modulos: {
                entregas_mapa,
                mesas: true,
                salao: true,
                agenda: true,
                vendas: true
            }
        });
    } catch (e) {
        next(e);
    }
};

// ============================================================================
// 🔒 GESTÃO DE SESSÕES EXCLUSIVAS (DESKTOP .EXE vs NAVEGADOR WEB)
// ============================================================================
const sessoesAtivasMap = new Map();

export const garantirTabelaPdvSessoes = async () => {
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS pdv_sessoes_ativas (
                caixa_id VARCHAR(64) NOT NULL PRIMARY KEY,
                tenant_id VARCHAR(64) NOT NULL,
                ambiente_ativo VARCHAR(16) NOT NULL,
                operador_id VARCHAR(64) NULL,
                operador_nome VARCHAR(255) NULL,
                operador_codigo VARCHAR(64) NULL,
                session_token VARCHAR(128) NOT NULL,
                desconectado TINYINT(1) DEFAULT 0,
                desconectado_motivo VARCHAR(255) NULL,
                ultimo_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_sessao_tenant (tenant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
    } catch (e) {
        console.warn('[PDV] Aviso ao verificar tabela pdv_sessoes_ativas:', e.message);
    }
};

const validarSenhaOperador = async (tenantId, senha, operadorIdAtivo) => {
    if (!senha) return { valido: false };
    const tenantNum = Number(tenantId);

    // 1. Tenta validar o operador ativo informado
    if (operadorIdAtivo) {
        const op = await prisma.funcionarios.findFirst({
            where: { id_funcionario: Number(operadorIdAtivo), id_tenant: tenantNum }
        });
        if (op && op.hash_senha) {
            const ok = await bcryptjs.compare(senha, op.hash_senha);
            if (ok) return { valido: true, nome: op.nome_completo, operador: op };
        }
    }

    // 2. Tenta qualquer funcionário ativo do tenant
    const funcs = await prisma.funcionarios.findMany({
        where: { id_tenant: tenantNum, ativo: true }
    });
    for (const f of funcs) {
        if (f.hash_senha) {
            const ok = await bcryptjs.compare(senha, f.hash_senha);
            if (ok) return { valido: true, nome: f.nome_completo, operador: f };
        }
    }

    // 3. Tenta o dono da loja (Admin / Tenant)
    const dono = await prisma.tenants.findUnique({
        where: { id: tenantNum }
    });
    if (dono && dono.hash_senha) {
        const ok = await bcryptjs.compare(senha, dono.hash_senha);
        if (ok) return { valido: true, nome: dono.nome_fantasia || 'Administrador', operador: { role: 'ADMIN' } };
    }

    return { valido: false };
};

export const obterStatusSessaoCaixa = async (req, res, next) => {
    try {
        await garantirTabelaPdvSessoes();
        const caixaId = req.params.id || req.query.caixa_id;
        const token = req.query.token || req.headers['x-token-caixa'];

        let cx = null;
        if (caixaId) {
            cx = await prisma.pdv_caixas.findUnique({ where: { id: String(caixaId) } });
        } else if (token) {
            cx = await prisma.pdv_caixas.findFirst({ where: { token_conexao: String(token) } });
        }

        if (!cx) {
            return res.status(404).json({ error: 'Caixa não encontrado.' });
        }

        const sessaoMem = sessoesAtivasMap.get(cx.id);
        if (sessaoMem) {
            return res.json({
                caixa_id: cx.id,
                numero_caixa: cx.numero_caixa,
                nome: cx.nome,
                serie_exe: cx.numero_caixa,
                serie_web: 50 + cx.numero_caixa,
                ambiente_ativo: sessaoMem.ambiente_ativo,
                operador_id: sessaoMem.operador_id,
                operador_nome: sessaoMem.operador_nome,
                operador_codigo: sessaoMem.operador_codigo,
                ultimo_heartbeat: sessaoMem.ultimo_heartbeat,
                ativo: true
            });
        }

        const sessoesDb = await prisma.$queryRawUnsafe(
            `SELECT * FROM pdv_sessoes_ativas WHERE caixa_id = ? LIMIT 1`,
            cx.id
        ).catch(() => []);

        if (sessoesDb && sessoesDb.length > 0) {
            const s = sessoesDb[0];
            sessoesAtivasMap.set(cx.id, s);
            return res.json({
                caixa_id: cx.id,
                numero_caixa: cx.numero_caixa,
                nome: cx.nome,
                serie_exe: cx.numero_caixa,
                serie_web: 50 + cx.numero_caixa,
                ambiente_ativo: s.ambiente_ativo,
                operador_id: s.operador_id,
                operador_nome: s.operador_nome,
                operador_codigo: s.operador_codigo,
                ultimo_heartbeat: s.ultimo_heartbeat,
                ativo: true
            });
        }

        return res.json({
            caixa_id: cx.id,
            numero_caixa: cx.numero_caixa,
            nome: cx.nome,
            serie_exe: cx.numero_caixa,
            serie_web: 50 + cx.numero_caixa,
            ambiente_ativo: null,
            operador_id: null,
            operador_nome: null,
            ativo: false
        });
    } catch (e) {
        next(e);
    }
};

export const iniciarSessaoCaixa = async (req, res, next) => {
    try {
        await garantirTabelaPdvSessoes();
        const { caixa_id, token_caixa, ambiente = 'WEB', operador_id, operador_nome, operador_codigo } = req.body;

        let cx = null;
        if (caixa_id) {
            cx = await prisma.pdv_caixas.findUnique({ where: { id: String(caixa_id) } });
        } else if (token_caixa) {
            cx = await prisma.pdv_caixas.findFirst({ where: { token_conexao: String(token_caixa) } });
        }

        if (!cx) {
            return res.status(404).json({ error: 'Caixa informado não existe.' });
        }

        const ambienteReq = String(ambiente).toUpperCase();
        const sessaoAtual = sessoesAtivasMap.get(cx.id);

        if (sessaoAtual && sessaoAtual.ambiente_ativo && sessaoAtual.ambiente_ativo !== ambienteReq) {
            return res.status(409).json({
                conflito: true,
                ambiente_ativo: sessaoAtual.ambiente_ativo,
                operador_nome: sessaoAtual.operador_nome || 'Operador em atividade',
                operador_id: sessaoAtual.operador_id,
                message: `Este caixa já está aberto no ${sessaoAtual.ambiente_ativo === 'EXE' ? 'PDV Desktop (.EXE)' : 'PDV Web'} por ${sessaoAtual.operador_nome || 'outro operador'}.`
            });
        }

        const novoToken = crypto.randomUUID();
        const sessao = {
            caixa_id: cx.id,
            tenant_id: cx.tenant_id,
            ambiente_ativo: ambienteReq,
            operador_id: String(operador_id || ''),
            operador_nome: String(operador_nome || 'Operador'),
            operador_codigo: String(operador_codigo || ''),
            session_token: novoToken,
            desconectado: 0,
            desconectado_motivo: null,
            ultimo_heartbeat: new Date()
        };

        sessoesAtivasMap.set(cx.id, sessao);

        await prisma.$executeRawUnsafe(
            `REPLACE INTO pdv_sessoes_ativas (caixa_id, tenant_id, ambiente_ativo, operador_id, operador_nome, operador_codigo, session_token, desconectado, desconectado_motivo, ultimo_heartbeat)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW())`,
            cx.id, cx.tenant_id, ambienteReq, sessao.operador_id, sessao.operador_nome, sessao.operador_codigo, novoToken
        ).catch(err => console.warn('[PDV] Erro ao persistir sessao:', err.message));

        const serieEscolhida = ambienteReq === 'WEB' ? (50 + cx.numero_caixa) : cx.numero_caixa;

        res.json({
            success: true,
            caixa_id: cx.id,
            numero_caixa: cx.numero_caixa,
            ambiente_ativo: ambienteReq,
            serie: serieEscolhida,
            session_token: novoToken,
            message: `Sessão iniciada no ${ambienteReq} com sucesso!`
        });
    } catch (e) {
        next(e);
    }
};

export const assumirSessaoCaixa = async (req, res, next) => {
    try {
        await garantirTabelaPdvSessoes();
        const {
            caixa_id,
            token_caixa,
            ambiente = 'WEB',
            senha_operador,
            operador_id,
            operador_nome,
            operador_codigo
        } = req.body;

        let cx = null;
        if (caixa_id) {
            cx = await prisma.pdv_caixas.findUnique({ where: { id: String(caixa_id) } });
        } else if (token_caixa) {
            cx = await prisma.pdv_caixas.findFirst({ where: { token_conexao: String(token_caixa) } });
        }

        if (!cx) {
            return res.status(404).json({ error: 'Caixa informado não existe.' });
        }

        const ambienteReq = String(ambiente).toUpperCase();
        const ambienteAnterior = ambienteReq === 'WEB' ? 'EXE' : 'WEB';
        const sessaoAtual = sessoesAtivasMap.get(cx.id);

        const idOperadorAtivo = sessaoAtual?.operador_id || null;
        const validacao = await validarSenhaOperador(cx.tenant_id, senha_operador, idOperadorAtivo);

        if (!validacao.valido) {
            return res.status(401).json({
                success: false,
                message: 'Senha incorreta. Digite a senha do operador que está utilizando o caixa ou de um Administrador para assumir.'
            });
        }

        const motivoDesconexao = `Caixa assumido no ${ambienteReq === 'WEB' ? 'PDV Web' : 'PDV Desktop (.EXE)'} pelo operador ${operador_nome || validacao.nome || 'Autorizado'}.`;
        
        if (sessaoAtual) {
            sessaoAtual.desconectado = 1;
            sessaoAtual.desconectado_motivo = motivoDesconexao;
        }

        const novoToken = crypto.randomUUID();
        const novaSessao = {
            caixa_id: cx.id,
            tenant_id: cx.tenant_id,
            ambiente_ativo: ambienteReq,
            operador_id: String(operador_id || validacao.operador?.id_funcionario || ''),
            operador_nome: String(operador_nome || validacao.nome || 'Operador'),
            operador_codigo: String(operador_codigo || validacao.operador?.codigo_acesso || ''),
            session_token: novoToken,
            desconectado: 0,
            desconectado_motivo: null,
            ultimo_heartbeat: new Date()
        };

        sessoesAtivasMap.set(cx.id, novaSessao);

        await prisma.$executeRawUnsafe(
            `REPLACE INTO pdv_sessoes_ativas (caixa_id, tenant_id, ambiente_ativo, operador_id, operador_nome, operador_codigo, session_token, desconectado, desconectado_motivo, ultimo_heartbeat)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NOW())`,
            cx.id, cx.tenant_id, ambienteReq, novaSessao.operador_id, novaSessao.operador_nome, novaSessao.operador_codigo, novoToken
        ).catch(err => console.warn('[PDV] Erro ao persistir sessao:', err.message));

        const serieEscolhida = ambienteReq === 'WEB' ? (50 + cx.numero_caixa) : cx.numero_caixa;

        res.json({
            success: true,
            caixa_id: cx.id,
            numero_caixa: cx.numero_caixa,
            ambiente_ativo: ambienteReq,
            serie: serieEscolhida,
            session_token: novoToken,
            message: `Terminal assumido com sucesso! O aplicativo anterior (${ambienteAnterior}) foi desconectado.`
        });
    } catch (e) {
        next(e);
    }
};

export const heartbeatSessaoCaixa = async (req, res, next) => {
    try {
        const { caixa_id, token_caixa, session_token, ambiente } = req.body;

        let cx = null;
        if (caixa_id) {
            cx = await prisma.pdv_caixas.findUnique({ where: { id: String(caixa_id) } });
        } else if (token_caixa) {
            cx = await prisma.pdv_caixas.findFirst({ where: { token_conexao: String(token_caixa) } });
        }

        if (!cx) {
            return res.json({ online: false, desconectado: true, motivo: 'Caixa não cadastrado.' });
        }

        const sessao = sessoesAtivasMap.get(cx.id);

        if (!sessao) {
            return res.json({ online: true, ambiente_ativo: null });
        }

        const ambienteReq = String(ambiente || '').toUpperCase();

        if (sessao.desconectado || (session_token && sessao.session_token !== session_token) || (ambienteReq && sessao.ambiente_ativo !== ambienteReq)) {
            return res.json({
                online: false,
                desconectado: true,
                ambiente_ativo: sessao.ambiente_ativo,
                operador_nome: sessao.operador_nome,
                motivo: sessao.desconectado_motivo || `Caixa assumido no ${sessao.ambiente_ativo === 'WEB' ? 'PDV Web' : 'PDV Desktop (.EXE)'} pelo operador ${sessao.operador_nome || 'ativo'}.`
            });
        }

        sessao.ultimo_heartbeat = new Date();
        return res.json({
            online: true,
            desconectado: false,
            ambiente_ativo: sessao.ambiente_ativo,
            operador_nome: sessao.operador_nome
        });
    } catch (e) {
        next(e);
    }
};

export const encerrarSessaoCaixa = async (req, res, next) => {
    try {
        const { caixa_id, token_caixa } = req.body;
        let cxId = caixa_id;
        if (!cxId && token_caixa) {
            const cx = await prisma.pdv_caixas.findFirst({ where: { token_conexao: String(token_caixa) } });
            if (cx) cxId = cx.id;
        }
        if (cxId) {
            sessoesAtivasMap.delete(cxId);
            await prisma.$executeRawUnsafe(
                `DELETE FROM pdv_sessoes_ativas WHERE caixa_id = ?`,
                cxId
            ).catch(() => {});
        }
        res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
    } catch (e) {
        next(e);
    }
};