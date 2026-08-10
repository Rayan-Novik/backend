import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../../services/cryptoService.js';
import { processarPagamento } from '../../services/paymentFactory.js'; 

const prisma = new PrismaClient();

// ============================================================================
// 1. CONSULTAR PRODUTOS
// ============================================================================
export const getProdutosPublicos = async (req, res) => {
    try {
        const tenantId = Number(req.tenant_id || req.tenantId);
        if (!tenantId) return res.status(401).json({ error: "Loja não identificada na chave de API." });

        const produtos = await prisma.produtos.findMany({
            where: { id_tenant: tenantId, ativo: true, active_ecommerce: true },
            include: {
                produto_variacoes: { where: { ativo: true } },
                categorias: { select: { nome: true } }
            }
        });

        const formatoSimplificado = produtos.map(p => ({
            id_produto: p.id_produto,
            nome: p.nome,
            categoria: p.categorias?.nome || 'Sem Categoria',
            preco: Number(p.preco),
            estoque: Number(p.estoque),
            descricao: p.descricao || "Sem descrição",
            variacoes: p.produto_variacoes.map(v => ({
                id_variacao: v.id_variacao,
                cor: v.cor,
                tamanho: v.tamanho,
                estoque: Number(v.estoque),
                preco_adicional: Number(v.preco_adicional)
            }))
        }));

        res.status(200).json(formatoSimplificado);
    } catch (error) {
        res.status(500).json({ error: "Erro ao consultar produtos." });
    }
};

// ============================================================================
// 2. ENCONTRAR OU CADASTRAR CLIENTE
// ============================================================================
export const gerenciarClientePublico = async (req, res) => {
    try {
        const tenantId = Number(req.tenant_id || req.tenantId);
        if (!tenantId) return res.status(401).json({ error: "Loja não identificada na chave de API." });

        const { telefone, nome, email, cpf } = req.body;

        if (!telefone) return res.status(400).json({ error: "O telefone é obrigatório para identificação." });

        const telefoneLimpo = telefone.replace(/\D/g, '');
        const telefoneHash = encrypt(telefoneLimpo);

        let cliente = await prisma.usuarios.findFirst({
            where: { telefone_criptografado: telefoneHash, id_tenant: tenantId },
            include: { enderecos: { where: { is_active: true } } }
        });

        let isNovo = false;

        if (!cliente) {
            const emailSeguro = email || `user.${telefoneLimpo}@integra.app`;
            const cpfHash = cpf ? encrypt(cpf.replace(/\D/g, '')) : null;
            const nomeFinal = req.is_sandbox ? `[TESTE] ${nome || "Cliente"}` : (nome || "Cliente Sistema Externo");

            cliente = await prisma.usuarios.create({
                data: {
                    id_tenant: tenantId,
                    nome_completo: nomeFinal,
                    email: emailSeguro,
                    hash_senha: "SENHA_GERADA_VIA_API_EXTERNA",
                    telefone_criptografado: telefoneHash,
                    cpf_criptografado: cpfHash,
                    score_reputacao: 50,
                    is_verified: true
                },
                include: { enderecos: true }
            });
            isNovo = true;
        }

        res.status(200).json({
            mensagem: isNovo ? "Novo cliente cadastrado." : "Cliente já existente.",
            id_usuario: cliente.id_usuario,
            nome: cliente.nome_completo,
            enderecos: cliente.enderecos.map(e => ({
                id_endereco: e.id_endereco,
                cep: e.cep,
                logradouro: e.logradouro,
                numero: e.numero,
                bairro: e.bairro,
                cidade: e.cidade
            }))
        });
    } catch (error) {
        res.status(500).json({ error: "Erro interno ao processar cliente." });
    }
};

// ============================================================================
// 3. CADASTRAR ENDEREÇO
// ============================================================================
export const cadastrarEnderecoPublico = async (req, res) => {
    try {
        const tenantId = Number(req.tenant_id || req.tenantId);
        if (!tenantId) return res.status(401).json({ error: "Loja não identificada na chave de API." });

        const { id_usuario, cep, logradouro, numero, complemento, bairro, cidade, estado } = req.body;

        if (!id_usuario || !cep || !logradouro || !numero || !bairro) {
            return res.status(400).json({ error: "Dados incompletos para endereço." });
        }

        const usuarioExiste = await prisma.usuarios.findFirst({
            where: { id_usuario: Number(id_usuario), id_tenant: tenantId }
        });

        if (!usuarioExiste) return res.status(404).json({ error: "Cliente não encontrado nesta loja." });

        const novoEndereco = await prisma.enderecos.create({
            data: {
                id_usuario: Number(id_usuario),
                cep: cep.replace(/\D/g, ''),
                logradouro,
                numero: String(numero),
                complemento,
                bairro,
                cidade,
                estado: estado || 'Não informado',
                is_active: true
            }
        });

        res.status(201).json({ id_endereco: novoEndereco.id_endereco, mensagem: "Endereço cadastrado com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao cadastrar endereço." });
    }
};

// ============================================================================
// 4. CALCULAR FRETE
// ============================================================================
export const calcularFretePublico = async (req, res) => {
    try {
        const { cep_destino } = req.body;
        if (!cep_destino) return res.status(400).json({ error: "CEP de destino é obrigatório." });

        res.status(200).json({
            cep_consultado: cep_destino,
            opcoes: [
                { tipo: "Motoboy Padrão", prazo: "Hoje", custo: 15.00 },
                { tipo: "Retirada na Loja", prazo: "Imediato", custo: 0.00 }
            ]
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao calcular frete." });
    }
};

// ============================================================================
// 5. GERAR PEDIDO COM PAGAMENTO (PIX / LINK)
// ============================================================================
export const gerarPedidoPublico = async (req, res) => {
    try {
        const tenantId = Number(req.tenant_id || req.tenantId);
        if (!tenantId) return res.status(401).json({ error: "Loja não identificada na chave de API." });

        const { id_usuario, id_endereco_entrega, itens, valor_frete, metodo_pagamento, observacoes } = req.body;

        if (!id_usuario || !itens || !itens.length || !metodo_pagamento) {
            return res.status(400).json({ error: "Usuário, itens e metodo_pagamento são obrigatórios." });
        }

        const clienteDb = await prisma.usuarios.findUnique({
            where: { id_usuario: Number(id_usuario) },
            include: { enderecos: { where: { id_endereco: id_endereco_entrega ? Number(id_endereco_entrega) : undefined } } }
        });

        if (!clienteDb) return res.status(404).json({ error: "Cliente não encontrado." });

        let valor_itens = 0;
        const itensTratados = [];
        const itemsParaGateway = [];

        for (const item of itens) {
            const produtoDb = await prisma.produtos.findFirst({
                where: { id_produto: Number(item.id_produto), id_tenant: tenantId }
            });

            if (!produtoDb) return res.status(404).json({ error: `Produto ID ${item.id_produto} não encontrado.` });

            let precoUnitario = Number(produtoDb.preco);

            if (item.id_variacao) {
                const variacaoDb = await prisma.produto_variacoes.findUnique({
                    where: { id_variacao: Number(item.id_variacao) }
                });
                if (variacaoDb) precoUnitario += Number(variacaoDb.preco_adicional);
            }

            valor_itens += precoUnitario * Number(item.quantidade);

            itensTratados.push({
                id_tenant: tenantId,
                id_produto: produtoDb.id_produto,
                id_variacao: item.id_variacao ? Number(item.id_variacao) : null,
                nome: produtoDb.nome,
                quantidade: Number(item.quantidade),
                preco: precoUnitario
            });

            itemsParaGateway.push({
                id: String(produtoDb.id_produto),
                title: produtoDb.nome,
                description: `Pedido via Bot WhatsApp`,
                quantity: Number(item.quantidade),
                unit_price: precoUnitario
            });
        }

        const preco_total = valor_itens + Number(valor_frete || 0);

        if (Number(valor_frete) > 0) {
            itemsParaGateway.push({
                id: "FRETE", title: "Taxa de Entrega", quantity: 1, unit_price: Number(valor_frete)
            });
        }

        let resultadoPagamento = null;
        const statusReal = req.is_sandbox ? "SANDBOX_TESTE" : "PENDENTE";
        let gatewayProvider = "Padrão";
        let idPagamentoGateway = null;
        let urlBoletoFinal = null;
        let linhaDigitavelFinal = null;
        let qrCodePix = null;
        let copypastePix = null;

        const isOffline = String(metodo_pagamento).toUpperCase().includes('OFFLINE') || String(metodo_pagamento).toUpperCase().includes('DINHEIRO');

        if (!req.is_sandbox && !isOffline) {
            try {
                const [primeiroNome, ...sobrenomeArray] = clienteDb.nome_completo.split(' ');
                const enderecoCli = clienteDb.enderecos?.[0] || {};
                
                let cpfDecrypted = '00000000000';
                try { if (clienteDb.cpf_criptografado) cpfDecrypted = decrypt(clienteDb.cpf_criptografado); } catch(e){}

                const dadosPagamento = {
                    amount: preco_total,
                    orderId: `BOT-${Date.now()}`,
                    items: itemsParaGateway,
                    payer: {
                        email: clienteDb.email,
                        firstName: primeiroNome,
                        lastName: sobrenomeArray.join(' ') || 'Cliente',
                        identification: { type: "CPF", number: cpfDecrypted },
                        address: {
                            zip_code: enderecoCli.cep || '00000000',
                            street_name: enderecoCli.logradouro || 'Nao informado',
                            street_number: enderecoCli.numero || 1,
                            neighborhood: enderecoCli.bairro || 'Centro',
                            city: enderecoCli.cidade || 'Cidade',
                            federal_unit: enderecoCli.estado || 'SP'
                        }
                    }
                };

                resultadoPagamento = await processarPagamento(metodo_pagamento, dadosPagamento, tenantId);

                gatewayProvider = resultadoPagamento.gateway;
                idPagamentoGateway = String(resultadoPagamento.id);

                if (resultadoPagamento.pix_data) {
                    qrCodePix = resultadoPagamento.pix_data.qr_code_base64;
                    copypastePix = resultadoPagamento.pix_data.qr_code;
                }
                
                if (resultadoPagamento.boleto_data) {
                    urlBoletoFinal = resultadoPagamento.url_boleto || resultadoPagamento.boleto_data.url_boleto;
                    linhaDigitavelFinal = resultadoPagamento.linha_digitavel || resultadoPagamento.boleto_data.linha_digitavel;
                } else if (resultadoPagamento.payment_url) {
                    urlBoletoFinal = resultadoPagamento.payment_url;
                }

            } catch (payError) {
                console.error("Erro ao gerar pagamento via Bot:", payError.message);
                return res.status(400).json({ error: `Erro no Pagamento: ${payError.message}` });
            }
        }

        let atendenteTexto = req.is_sandbox ? "[TESTE] Bot IA" : "Bot IA";
        if (observacoes) atendenteTexto += ` (Obs: ${observacoes})`;

        const pedidoCriado = await prisma.pedidos.create({
            data: {
                id_tenant: tenantId, 
                id_usuario: Number(id_usuario),
                id_endereco_entrega: id_endereco_entrega ? Number(id_endereco_entrega) : null,
                preco_itens: valor_itens,
                preco_frete: Number(valor_frete || 0),
                preco_total: preco_total,
                metodo_pagamento: metodo_pagamento,
                status_pagamento: statusReal,
                status_entrega: "Pendente",
                canal_venda: req.is_sandbox ? "api_sandbox" : "bot_whatsapp",
                nome_atendente: atendenteTexto,
                gateway_provider: gatewayProvider,
                id_pagamento_gateway: idPagamentoGateway,
                url_boleto: urlBoletoFinal,
                linha_digitavel: copypastePix || linhaDigitavelFinal,
                pedido_items: { create: itensTratados }
            }
        });

        res.status(201).json({
            mensagem: req.is_sandbox ? "Pedido de TESTE gerado!" : "Pedido gerado com sucesso!",
            id_pedido: pedidoCriado.id_pedido,
            valor_total: pedidoCriado.preco_total,
            status_pagamento: pedidoCriado.status_pagamento,
            metodo_escolhido: metodo_pagamento,
            is_sandbox: req.is_sandbox,
            dados_pagamento: {
                copia_cola_pix: copypastePix,
                qr_code_base64: qrCodePix,
                link_pagamento: urlBoletoFinal,
                linha_digitavel_boleto: linhaDigitavelFinal
            }
        });
    } catch (error) {
        console.error("Erro na geração de pedido API Externa:", error);
        res.status(500).json({ error: "Erro interno ao gerar o pedido." });
    }
};