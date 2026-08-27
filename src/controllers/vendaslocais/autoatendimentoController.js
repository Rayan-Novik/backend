import { PrismaClient } from '@prisma/client';
import { processarPagamento } from '../../services/paymentFactory.js';

const prisma = new PrismaClient();

// 🟢 FÓRMULA MATEMÁTICA: Calcula a distância em Metros entre o Cliente e a Loja
const calcularDistancia = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Raio da Terra em metros
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
};

// 🟢 VALIDADOR DE SEGURANÇA: Horários, Dias e GPS!
const validarAcessoLoja = async (id_tenant, clientLat, clientLng) => {
    // Busca a loja principal (Evita pegar uma loja fantasma vazia)
    const loja = await prisma.lojas.findFirst({ 
        where: { id_tenant, ativo: true },
        orderBy: { id_loja: 'asc' } 
    });
    
    if (!loja) return null; // Se não tem loja, libera acesso

    // 1. --- VALIDAÇÃO DE HORÁRIOS E DIAS ---
    const agora = new Date();
    const horaBrasilia = new Date(agora.getTime() - (3 * 60 * 60 * 1000));
    const diaAtual = horaBrasilia.getDay(); 

    if (loja.dias_funcionamento) {
        const diasAbertos = loja.dias_funcionamento.split(',').map(Number);
        if (!diasAbertos.includes(diaAtual)) {
            return { bloqueado: true, message: "O estabelecimento está fechado hoje." };
        }
    }

    if (loja.hora_abertura && loja.hora_fechamento) {
        const h = String(horaBrasilia.getUTCHours()).padStart(2, '0');
        const m = String(horaBrasilia.getUTCMinutes()).padStart(2, '0');
        const horaAtual = `${h}:${m}`;

        let isAberto = false;
        if (loja.hora_abertura <= loja.hora_fechamento) {
            isAberto = (horaAtual >= loja.hora_abertura && horaAtual <= loja.hora_fechamento);
        } else {
            isAberto = (horaAtual >= loja.hora_abertura || horaAtual <= loja.hora_fechamento);
        }

        if (!isAberto) {
            return { bloqueado: true, message: `Estamos fechados no momento. Horário: ${loja.hora_abertura} às ${loja.hora_fechamento}.` };
        }
    }

    // 2. --- VALIDAÇÃO DE GPS (CERCADINHO VIRTUAL 150 METROS) ---
    if (loja.latitude && loja.longitude) {
        if (!clientLat || !clientLng || isNaN(clientLat) || isNaN(clientLng)) {
            console.log(`🔒 [SEGURANÇA] Bloqueado. Cliente não enviou coordenadas válidas.`);
            return { bloqueado: true, pede_gps: true, message: "Para sua segurança, precisamos confirmar que você está no estabelecimento." };
        }

        const distanciaMetros = calcularDistancia(Number(loja.latitude), Number(loja.longitude), Number(clientLat), Number(clientLng));
        
        // 🚨 OLHE PARA O SEU TERMINAL (NODE.JS) QUANDO ACESSAR O CELULAR
        console.log(`📍 [GPS DETECTADO] Distância entre Cliente e Loja: ${Math.round(distanciaMetros)} metros. (Limite: 150m)`);

        if (distanciaMetros > 150) { 
            return { 
                bloqueado: true, 
                message: `Você está muito longe (${Math.round(distanciaMetros)}m de distância). É necessário estar no local para acessar o cardápio.` 
            };
        }
    } else {
        // 🚨 SE APARECER ISSO NO SEU TERMINAL, É PORQUE VOCÊ ESQUECEU DE SALVAR O GPS NA LOJA
        console.log(`⚠️ [ALERTA] A Loja '${loja.nome}' não tem Latitude/Longitude cadastrada. Segurança de GPS está desligada.`);
    }

    return null; // Acesso Liberado
};

// Função auxiliar para resolver o ID do Tenant de forma segura no celular do cliente
const resolverTenantId = async (req) => {
    let id_tenant = Number(req.headers['x-tenant-id']);
    if (!id_tenant || isNaN(id_tenant)) {
        const slug = req.headers['x-tenant-slug'];
        if (slug) {
            const tenant = await prisma.tenants.findUnique({ where: { slug } });
            if (tenant) id_tenant = tenant.id;
        }
    }
    return id_tenant || 1; // Fallback seguro
};

// 🟢 1. LISTAR PRODUTOS DISPONÍVEIS PARA A MESA
export const listarProdutosAutoatendimento = async (req, res, next) => {
    try {
        const id_tenant = await resolverTenantId(req);

        const produtos = await prisma.produtos.findMany({
            where: {
                id_tenant,
                ativo: true,
                active_ecommerce: true,
                tipo_produto: { in: ['FINAL', 'MISTO'] } 
            },
            include: { 
                categorias: true,
                // 🟢 MÁGICA AQUI: Traz os grupos de adicionais pro celular do cliente
                grupos_complemento: {
                    orderBy: { ordem: 'asc' },
                    include: {
                        complementos: {
                            include: {
                                produto_add: {
                                    select: { id_produto: true, nome: true, imagem_url: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        res.status(200).json(produtos);
    } catch (error) {
        next(error);
    }
};

// 🟢 2. BUSCAR A COMANDA ATUAL DA MESA USANDO O TOKEN
export const verComandaMesa = async (req, res, next) => {
    try {
        const { token } = req.params;
        const clientLat = parseFloat(req.query.lat);
        const clientLng = parseFloat(req.query.lng);

        const mesa = await prisma.mesas.findFirst({ where: { token: token } });
        if (!mesa) return res.status(404).json({ message: "Mesa inválida ou QR Code incorreto." });
        
        const id_tenant = mesa.id_tenant;

        // 🔒 BARREIRA DE SEGURANÇA (GPS E HORÁRIO)
        const validacao = await validarAcessoLoja(id_tenant, clientLat, clientLng);
        if (validacao && validacao.bloqueado) {
            return res.status(403).json(validacao);
        }

        let buscaMesaId = mesa.id_mesa;
        let codigoExibicao = mesa.nome;

        // 🟢 MÁGICA: Se a mesa foi 'Agrupada/Unida', nós puxamos os dados da Mesa PAI
        if (mesa.status === 'AGRUPADA' && mesa.mesa_agrupada) {
            const mesaPai = await prisma.mesas.findFirst({ where: { nome: mesa.mesa_agrupada, id_tenant } });
            if (mesaPai) {
                buscaMesaId = mesaPai.id_mesa;
                codigoExibicao = `${mesaPai.nome} + ${mesa.nome}`;
            }
        }

        const comanda = await prisma.pedidos.findFirst({
            where: { 
                id_mesa: buscaMesaId, 
                id_tenant, 
                status_comanda: { in: ['ABERTA', 'FECHANDO'] } 
            },
            include: { pedido_items: true }
        });

        res.status(200).json(comanda || { preco_total: 0, pedido_items: [], codigo_comanda: codigoExibicao });
    } catch (error) {
        next(error);
    }
};

// 🟢 3. CLIENTE ENVIA PEDIDOS PELO CELULAR (Com suporte a Adicionais/Complementos)
export const enviarPedidoMesa = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { itens, lat, lng } = req.body; 

        if (!itens || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ message: "Nenhum item enviado." });
        }

        const mesa = await prisma.mesas.findFirst({ where: { token: token } });
        if (!mesa) return res.status(404).json({ message: "Mesa inválida." });
        
        const id_tenant = mesa.id_tenant;

        const validacao = await validarAcessoLoja(id_tenant, parseFloat(lat), parseFloat(lng));
        if (validacao && validacao.bloqueado) return res.status(403).json({ message: validacao.message });

        let buscaMesaId = mesa.id_mesa;
        let codigoComandaFinal = mesa.nome;

        if (mesa.status === 'AGRUPADA' && mesa.mesa_agrupada) {
            const mesaPai = await prisma.mesas.findFirst({ where: { nome: mesa.mesa_agrupada, id_tenant } });
            if (mesaPai) {
                buscaMesaId = mesaPai.id_mesa;
                codigoComandaFinal = mesaPai.nome;
            }
        }

        const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
        let consumidorPadrao = await prisma.usuarios.findFirst({ where: { email: emailPadrao, id_tenant } });

        if (!consumidorPadrao) {
            consumidorPadrao = await prisma.usuarios.create({
                data: { nome_completo: 'Consumidor Autoatendimento', email: emailPadrao, hash_senha: 'autoatendimento_safe_pass', id_tenant }
            });
        }

        let comanda = await prisma.pedidos.findFirst({
            where: { id_mesa: buscaMesaId, id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } }
        });

        await prisma.$transaction(async (tx) => {
            if (!comanda) {
                comanda = await tx.pedidos.create({
                    data: {
                        id_tenant, id_usuario: consumidorPadrao.id_usuario, id_mesa: buscaMesaId,
                        codigo_comanda: codigoComandaFinal, nome_cliente_comanda: 'Cliente (Mesa)',
                        canal_venda: 'COMANDA', metodo_envio: 'Consumo no Local', status_comanda: 'ABERTA',
                        status_pagamento: 'PENDENTE', status_entrega: 'Pendente', preco_total: 0,
                        preco_itens: 0, preco_frete: 0, metodo_pagamento: 'A DEFINIR', nome_atendente: 'Autoatendimento' 
                    }
                });
            }

            let subtotalGeral = 0;

            for (const item of itens) {
                const produto = await tx.produtos.findUnique({ where: { id_produto: Number(item.id_produto) } });
                if (!produto) continue;

                const quantidadeNum = Number(item.quantidade);
                const subtotalPrincipal = Number(produto.preco) * quantidadeNum;
                subtotalGeral += subtotalPrincipal;

                // 🟢 1. PREPARA OS ADICIONAIS E DÁ BAIXA NO ESTOQUE DELES
                const complementos = item.complementos || [];
                let complementosParaSalvar = [];

                for (const comp of complementos) {
                    const prodAdic = await tx.produtos.findUnique({ where: { id_produto: Number(comp.id_produto_add) } });
                    if (!prodAdic) continue;

                    const qtdAdic = Number(comp.quantidade) || 1;
                    const qtdTotalAdic = qtdAdic * quantidadeNum;
                    const precoAdic = Number(comp.preco_adicional) || 0;
                    
                    const subtotalAdic = (precoAdic * qtdAdic) * quantidadeNum;
                    subtotalGeral += subtotalAdic;

                    // Guarda os dados formatados para o JSON
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
                            motivo: `Adicional Autoatendimento QR Code (Mesa: ${codigoComandaFinal})`,
                            origem_destino: 'COMANDA', 
                            usuario_id: null
                        }
                    });
                }

                // 🟢 2. CRIA APENAS 1 LINHA NO BANCO COM O ITEM PRINCIPAL + JSON DOS COMPLEMENTOS
                await tx.pedido_items.create({
                    data: {
                        id_pedido: comanda.id_pedido, 
                        id_produto: produto.id_produto, 
                        nome: produto.nome,
                        quantidade: quantidadeNum, 
                        preco: produto.preco, 
                        imagem_url: produto.imagem_url,
                        id_tenant, 
                        observacao: item.observacao || null,
                        nome_atendente: 'Autoatendimento',
                        complementos: complementosParaSalvar.length > 0 ? complementosParaSalvar : null // <- MÁGICA AQUI
                    }
                });

                // 3. Baixa no estoque do produto principal
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
                        motivo: `Autoatendimento QR Code`, 
                        origem_destino: 'COMANDA', 
                        usuario_id: null
                    }
                });
            }

            await tx.pedidos.update({
                where: { id_pedido: comanda.id_pedido },
                data: {
                    preco_total: { increment: subtotalGeral }, 
                    preco_itens: { increment: subtotalGeral },
                    status_comanda: 'ABERTA', 
                    canal_venda: 'COMANDA' 
                }
            });

            if (mesa.status !== 'AGRUPADA') {
                await tx.mesas.update({ where: { id_mesa: mesa.id_mesa }, data: { status: 'OCUPADA' } });
            }
        });

        if (req.app.get('io')) req.app.get('io').emit('ATUALIZAR_COMANDAS', { id_tenant });
        res.status(200).json({ message: "Pedido enviado para a cozinha com sucesso!" });
    } catch (error) { next(error); }
};

// 🟢 4. CLIENTE CLICA EM "PAGAR COM PIX"
export const gerarPixMesa = async (req, res, next) => {
    try {
        const { token } = req.params;

        const mesa = await prisma.mesas.findFirst({
            where: { token: token }
        });

        if (!mesa) return res.status(404).json({ message: "Mesa inválida." });
        const id_tenant = mesa.id_tenant;

        const comanda = await prisma.pedidos.findFirst({
            where: { codigo_comanda: mesa.nome, id_tenant, status_comanda: { in: ['ABERTA', 'FECHANDO'] } },
            include: { pedido_items: true }
        });

        if (!comanda || Number(comanda.preco_total) <= 0) {
            return res.status(400).json({ message: "Nenhum valor em aberto para pagar." });
        }

        // 🟢 MÁGICA 1: Gerador de CPF válido matematicamente para o Mercado Pago não bloquear a mesa anônima
        const gerarCpfValido = () => {
            const rnd = (n) => Math.round(Math.random() * n);
            const mod = (dividendo, divisor) => Math.round(dividendo - (Math.floor(dividendo / divisor) * divisor));
            const n = Array(9).fill(0).map(() => rnd(9));
            let d1 = n.reduce((total, num, i) => total + (num * (10 - i)), 0);
            d1 = 11 - mod(d1, 11);
            if (d1 >= 10) d1 = 0;
            let d2 = (d1 * 2) + n.reduce((total, num, i) => total + (num * (11 - i)), 0);
            d2 = 11 - mod(d2, 11);
            if (d2 >= 10) d2 = 0;
            return `${n.join('')}${d1}${d2}`;
        };

        const dadosPagamento = {
            amount: comanda.preco_total,
            orderId: `PDV-${comanda.id_pedido}`,
            device_id: `MESA-${mesa.nome}`,
            payer: {
                email: `mesa${mesa.id_mesa}@autoatendimento.com`,
                firstName: "Cliente",
                lastName: mesa.nome,
                identification: { type: "CPF", number: gerarCpfValido() }
            },
            // 🟢 CORREÇÃO VITAL AQUI: Soma o valor base + valor dos complementos embutidos no JSON 
            items: comanda.pedido_items.map(i => {
                let precoUnitarioReal = Number(i.preco);
                
                if (i.complementos && typeof i.complementos === 'object') {
                    const compArray = Array.isArray(i.complementos) ? i.complementos : Object.values(i.complementos);
                    compArray.forEach(c => {
                        precoUnitarioReal += (Number(c.preco_adicional) * Number(c.quantidade));
                    });
                }

                return {
                    id: i.id_produto,
                    title: i.nome,
                    quantity: i.quantidade,
                    unit_price: precoUnitarioReal // Envia a soma consolidada ao gateway
                };
            })
        };

        const respostaPix = await processarPagamento('PIX', dadosPagamento, id_tenant);

        await prisma.pedidos.update({
            where: { id_pedido: comanda.id_pedido },
            data: { 
                status_comanda: 'FECHANDO',
                id_pagamento_gateway: String(respostaPix.id), // Força virar String pro Prisma não quebrar
                gateway_provider: respostaPix.gateway 
            }
        });

        res.status(200).json({
            message: "PIX gerado com sucesso!",
            qr_code: respostaPix.pix_data.qr_code,
            qr_code_base64: respostaPix.pix_data.qr_code_base64
        });
    } catch (error) {
        console.error("❌ Erro ao gerar PIX da mesa:", error);
        res.status(500).json({ message: error.message || "Erro interno ao gerar o PIX." });
    }
};