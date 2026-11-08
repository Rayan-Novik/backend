import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import generateToken from '../utils/generateToken.js';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import { decrypt } from '../services/cryptoService.js';

const prisma = new PrismaClient();

// Fórmula de Haversine para cálculo de distância em KM
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(1));
}

// Cálculo do Repasse conforme configuração da loja
function calculatePayout(distanceKm, config) {
    const km = parseFloat(distanceKm || 0);
    switch (config.payment_type) {
        case 'NONE':
            return 0;
        case 'FIXED':
            return parseFloat(config.fixed_fee || 0);
        case 'DISTANCE':
            return parseFloat((km * (config.km_rate || 0)).toFixed(2));
        case 'HYBRID':
            return parseFloat(((config.base_fee || 0) + (km * (config.km_rate || 0))).toFixed(2));
        default:
            return 0;
    }
}

// 🟢 1. LOGIN EXCLUSIVO DO APLICATIVO DO ENTREGADOR COM CHECAGEM DE PERMISSÃO
export const driverLogin = async (req, res, next) => {
    try {
        const { email, senha, tenantSlug } = req.body;

        if (!email || !senha) {
            return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
        }

        // 1. Busca o funcionário pelo e-mail
        const funcionario = await prisma.funcionarios.findFirst({
            where: { email: email.trim(), ativo: true },
            include: { cargos: true, tenants: true }
        });

        if (!funcionario) {
            return res.status(404).json({ message: 'Entregador não encontrado ou cadastro inativo.' });
        }

        const id_tenant = funcionario.id_tenant;
        const loja = funcionario.tenants;

        if (!loja || !loja.ativo) {
            return res.status(403).json({ message: 'A loja vinculada a esta conta está inativa.' });
        }

        // Se informou tenantSlug, valida se pertence à mesma loja
        if (tenantSlug && loja.slug && loja.slug.toLowerCase() !== tenantSlug.toLowerCase()) {
            return res.status(403).json({ message: 'Esta conta pertence a outra unidade/loja.' });
        }

        // 2. Validação da Senha
        const isMatch = await bcrypt.compare(senha, funcionario.hash_senha);
        if (!isMatch) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        // 3. 🔒 CHECAGEM DA PERMISSÃO DO APLICATIVO ANDROID (DRIVER_APP_ACCESS)
        const permissoes = funcionario.cargos ? funcionario.cargos.permissoes : [];
        const isMaster = funcionario.isAdmin || funcionario.role === 'ADMIN';
        const hasDriverPermission = isMaster || permissoes.includes('DRIVER_APP_ACCESS');

        if (!hasDriverPermission) {
            const cargoNome = funcionario.cargos?.nome || 'Sem Cargo';
            return res.status(403).json({
                message: `Acesso negado: O cargo '${cargoNome}' não possui a permissão necessária para acessar o Aplicativo do Entregador (DRIVER_APP_ACCESS).`,
                erro_permissao: true,
                cargo: cargoNome,
                permissao_faltante: 'DRIVER_APP_ACCESS'
            });
        }

        // 4. Gera nova sessão e token
        const novaSessaoToken = crypto.randomUUID();
        await prisma.funcionarios.update({
            where: { id_funcionario: funcionario.id_funcionario },
            data: { sessao_token: novaSessaoToken }
        });

        // 5. Coleta configurações de entrega atuais da loja
        const [distMode, payType, fixedFee, kmRate, baseFee, maxKm] = await Promise.all([
            ConfiguracaoModel.get('DELIVERY_DISTRIBUTION_MODE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_PAYMENT_TYPE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_FIXED_FEE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_KM_RATE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_BASE_FEE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_MAX_KM', id_tenant)
        ]);

        const configLogistica = {
            distribution_mode: distMode || 'MANUAL',
            payment_type: payType || 'FIXED',
            fixed_fee: parseFloat(fixedFee || 7.00),
            km_rate: parseFloat(kmRate || 1.50),
            base_fee: parseFloat(baseFee || 5.00),
            max_km: parseFloat(maxKm || 15)
        };

        const token = generateToken(funcionario.id_funcionario, loja.id, novaSessaoToken);

        const lojaFisica = await prisma.lojas.findFirst({
            where: { id_tenant, ativo: true },
            select: { id_loja: true, nome: true, latitude: true, longitude: true }
        });

        return res.json({
            success: true,
            token,
            driver: {
                id_funcionario: funcionario.id_funcionario,
                nome_completo: funcionario.nome_completo,
                email: funcionario.email,
                cargo: funcionario.cargos?.nome || 'Entregador',
                imagem: funcionario.imagem || null,
                permissoes
            },
            loja: {
                id: loja.id,
                nome: lojaFisica?.nome || loja.nome_fantasia || loja.razao_social || 'Loja',
                slug: loja.slug,
                latitude: lojaFisica?.latitude ? parseFloat(lojaFisica.latitude) : null,
                longitude: lojaFisica?.longitude ? parseFloat(lojaFisica.longitude) : null,
                telefone: lojaFisica?.telefone || loja.telefone_contato || null
            },
            config_logistica: configLogistica
        });

    } catch (error) {
        console.error('Erro no login do motorista:', error);
        next(error);
    }
};

// 🟢 2. FEED PRINCIPAL DO APLICATIVO DO ENTREGADOR (FILA ABERTA + MINHAS ENTREGAS + HISTÓRICO)
export const getDriverFeed = async (req, res, next) => {
    try {
        const id_tenant = Number(req.tenantId);
        const id_funcionario = Number(req.user.id_usuario);
        const driverTrackingCode = `DRIVER_FUNC_${id_funcionario}`;

        // 1. Configurações de Logística da Loja e Origem Física
        const [distMode, payType, fixedFee, kmRate, baseFee, maxKm, lojaFisica, tenantData] = await Promise.all([
            ConfiguracaoModel.get('DELIVERY_DISTRIBUTION_MODE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_PAYMENT_TYPE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_FIXED_FEE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_KM_RATE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_BASE_FEE', id_tenant),
            ConfiguracaoModel.get('DELIVERY_MAX_KM', id_tenant),
            prisma.lojas.findFirst({
                where: { id_tenant, ativo: true },
                select: { id_loja: true, nome: true, latitude: true, longitude: true }
            }),
            prisma.tenants.findUnique({
                where: { id: id_tenant },
                select: { id: true, nome_fantasia: true, telefone_contato: true }
            })
        ]);

        const config = {
            distribution_mode: distMode || 'MANUAL',
            payment_type: payType || 'FIXED',
            fixed_fee: parseFloat(fixedFee || 7.00),
            km_rate: parseFloat(kmRate || 1.50),
            base_fee: parseFloat(baseFee || 5.00),
            max_km: parseFloat(maxKm || 15)
        };

        const lojaLat = lojaFisica?.latitude ? parseFloat(lojaFisica.latitude) : null;
        const lojaLng = lojaFisica?.longitude ? parseFloat(lojaFisica.longitude) : null;
        const lojaNome = lojaFisica?.nome || tenantData?.nome_fantasia || 'Loja';

        // 2. Minhas Entregas Ativas (Em Rota ou Atribuídas)
        const minhasAtivasRaw = await prisma.pedidos.findMany({
            where: {
                id_tenant,
                status_entrega: 'Em Rota de Entrega',
                codigo_rastreio: driverTrackingCode,
                deletado_em: null
            },
            include: {
                usuarios: { select: { nome_completo: true, telefone_criptografado: true } },
                enderecos: true,
                pedido_items: { select: { id_item: true, nome: true, quantidade: true, preco: true } }
            },
            orderBy: { data_pedido: 'desc' }
        });

        const formatOrder = (p) => {
            let telefone = null;
            if (p.usuarios?.telefone_criptografado) {
                try { telefone = decrypt(p.usuarios.telefone_criptografado); } catch (_) { }
            }

            const destLat = p.enderecos?.latitude ? parseFloat(p.enderecos.latitude) : null;
            const destLng = p.enderecos?.longitude ? parseFloat(p.enderecos.longitude) : null;
            const distanceKm = (lojaLat && lojaLng && destLat && destLng)
                ? calculateDistanceKm(lojaLat, lojaLng, destLat, destLng)
                : 2.5;

            const repasse = calculatePayout(distanceKm, config);

            return {
                id_pedido: p.id_pedido,
                status_entrega: p.status_entrega,
                data_pedido: p.data_pedido,
                valor_total: parseFloat(p.preco_total || 0),
                metodo_pagamento: p.metodo_pagamento,
                is_offline_payment: !!(p.metodo_pagamento && p.metodo_pagamento.toUpperCase().includes('OFFLINE')),
                status_pagamento: p.status_pagamento,
                driver_token: p.driver_token,
                driver_lat: p.driver_lat,
                driver_lng: p.driver_lng,
                delivery_pin: p.delivery_pin,
                distance_km: distanceKm,
                repasse_estimado: repasse,
                cliente: {
                    nome: p.usuarios?.nome_completo || p.nome_cliente_comanda || 'Cliente',
                    telefone: telefone
                },
                endereco: {
                    logradouro: p.enderecos?.logradouro || p.entrega_logradouro,
                    numero: p.enderecos?.numero || p.entrega_numero,
                    bairro: p.enderecos?.bairro || p.entrega_bairro,
                    cidade: p.enderecos?.cidade || p.entrega_cidade,
                    cep: p.enderecos?.cep || p.entrega_cep,
                    complemento: p.enderecos?.complemento || p.entrega_complemento,
                    latitude: destLat,
                    longitude: destLng
                },
                itens: (p.pedido_items || []).map(i => ({
                    id_item: i.id_item,
                    nome_produto: i.nome,
                    quantidade: i.quantidade ? parseFloat(i.quantidade) : 1,
                    preco_unitario: i.preco ? parseFloat(i.preco) : 0
                }))
            };
        };

        const minhas_entregas = minhasAtivasRaw.map(formatOrder);

        // 3. Fila de Pedidos Disponíveis (Apenas se o modo for 'QUEUE' / Fila Aberta)
        let fila_disponivel = [];
        if (config.distribution_mode === 'QUEUE') {
            const filaRaw = await prisma.pedidos.findMany({
                where: {
                    id_tenant,
                    status_entrega: { in: ['Pendente', 'Em Preparo', 'Pronto para Retirada'] },
                    codigo_rastreio: null,
                    driver_token: null,
                    deletado_em: null
                },
                include: {
                    usuarios: { select: { nome_completo: true, telefone_criptografado: true } },
                    enderecos: true,
                    pedido_items: { select: { id_item: true, nome: true, quantidade: true, preco: true } }
                },
                orderBy: { data_pedido: 'asc' },
                take: 30
            });

            fila_disponivel = filaRaw.map(formatOrder);
        }

        // 4. Histórico de Entregas Concluídas Hoje pelo Entregador
        const inicioHoje = new Date();
        inicioHoje.setHours(0, 0, 0, 0);

        const historicoHojeRaw = await prisma.pedidos.findMany({
            where: {
                id_tenant,
                status_entrega: 'Entregue',
                codigo_rastreio: driverTrackingCode,
                atualizado_em: { gte: inicioHoje },
                deletado_em: null
            },
            include: {
                usuarios: { select: { nome_completo: true } },
                enderecos: true
            },
            orderBy: { atualizado_em: 'desc' }
        });

        const historico_hoje = historicoHojeRaw.map(formatOrder);

        // 5. Totalizadores do Dia para o Motorista
        const totalGanhosHoje = historico_hoje.reduce((acc, curr) => acc + (curr.repasse_estimado || 0), 0);
        const totalKmHoje = historico_hoje.reduce((acc, curr) => acc + (curr.distance_km || 0), 0);

        res.json({
            success: true,
            config_logistica: config,
            loja: {
                nome: lojaNome,
                latitude: lojaLat,
                longitude: lojaLng
            },
            driver: {
                id_funcionario,
                nome: req.user.nome_completo
            },
            minhas_entregas,
            fila_disponivel,
            historico_hoje,
            resumo_dia: {
                total_entregas: historico_hoje.length,
                total_ganhos: parseFloat(totalGanhosHoje.toFixed(2)),
                total_km: parseFloat(totalKmHoje.toFixed(1))
            }
        });

    } catch (error) {
        console.error('Erro ao buscar feed do motorista:', error);
        next(error);
    }
};

// 🟢 3. ACEITAR / PEGAR PEDIDO DA FILA ABERTA (QUEUE MODE)
export const claimOrder = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = Number(req.tenantId);
        const id_funcionario = Number(req.user.id_usuario);
        const driverName = req.user.nome_completo;
        const driverTrackingCode = `DRIVER_FUNC_${id_funcionario}`;

        // Verifica configuração
        const distMode = await ConfiguracaoModel.get('DELIVERY_DISTRIBUTION_MODE', id_tenant);
        if (distMode === 'MANUAL') {
            return res.status(400).json({
                message: 'A loja está configurada para Despacho Manual. As entregas são direcionadas diretamente pelo lojista.'
            });
        }

        // Verifica se pedido está disponível
        const pedido = await prisma.pedidos.findFirst({
            where: {
                id_pedido,
                id_tenant,
                status_entrega: { in: ['Pendente', 'Em Preparo', 'Pronto para Retirada'] },
                codigo_rastreio: null,
                deletado_em: null
            }
        });

        if (!pedido) {
            return res.status(404).json({ message: 'Este pedido já foi pego por outro entregador ou não está disponível.' });
        }

        // Atribui ao entregador e coloca em rota
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        const driverToken = crypto.randomUUID();
        const expires = new Date();
        expires.setHours(expires.getHours() + 24);

        await prisma.pedidos.update({
            where: { id_pedido },
            data: {
                status_entrega: 'Em Rota de Entrega',
                codigo_rastreio: driverTrackingCode,
                nome_atendente: `Entregador: ${driverName}`,
                delivery_pin: pin,
                driver_token: driverToken,
                driver_token_expires: expires
            }
        });

        // Notifica via Socket.io ao vivo
        if (global.io) {
            global.io.emit('order_claimed', {
                id_pedido,
                driverName,
                status_entrega: 'Em Rota de Entrega'
            });
        }

        res.json({
            success: true,
            message: `Pedido #${id_pedido} aceito com sucesso! Você já pode iniciar a entrega.`,
            driver_token: driverToken,
            pin_cliente: pin
        });

    } catch (error) {
        console.error('Erro ao aceitar pedido da fila:', error);
        next(error);
    }
};

// 🟢 4. ATUALIZAR GPS EM TEMPO REAL DO ENTREGADOR
export const updateDriverGps = async (req, res, next) => {
    try {
        const id_tenant = Number(req.tenantId);
        const id_funcionario = Number(req.user.id_usuario);
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({ message: 'Coordenadas lat e lng são obrigatórias.' });
        }

        const driverTrackingCode = `DRIVER_FUNC_${id_funcionario}`;

        // Atualiza localização em todas as entregas ativas deste motorista
        await prisma.pedidos.updateMany({
            where: {
                id_tenant,
                status_entrega: 'Em Rota de Entrega',
                codigo_rastreio: driverTrackingCode
            },
            data: {
                driver_lat: parseFloat(lat),
                driver_lng: parseFloat(lng)
            }
        });

        // Notifica via Socket.io para o Radar do Admin e Mapa do Cliente
        if (global.io) {
            global.io.emit('driver_gps_update', {
                id_funcionario,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                timestamp: new Date()
            });
        }

        res.json({ success: true, lat, lng });

    } catch (error) {
        console.error('Erro ao atualizar GPS do motorista:', error);
        next(error);
    }
};

// 🟢 5. CONCLUIR ENTREGA COM PIN E VALIDAÇÃO DE PAGAMENTO
export const completeDelivery = async (req, res, next) => {
    try {
        const id_pedido = Number(req.params.id);
        const id_tenant = Number(req.tenantId);
        const id_funcionario = Number(req.user.id_usuario);
        const { pin, paymentCollected } = req.body;

        if (!pin) {
            return res.status(400).json({ message: 'O PIN de 4 dígitos é obrigatório para confirmar a entrega.' });
        }

        const driverTrackingCode = `DRIVER_FUNC_${id_funcionario}`;

        const pedido = await prisma.pedidos.findFirst({
            where: {
                id_pedido,
                id_tenant,
                status_entrega: 'Em Rota de Entrega',
                codigo_rastreio: driverTrackingCode,
                deletado_em: null
            }
        });

        if (!pedido) {
            return res.status(404).json({ message: 'Pedido em rota não encontrado para este entregador.' });
        }

        // Validação do PIN
        if (pedido.delivery_pin && pedido.delivery_pin.trim() !== pin.toString().trim()) {
            return res.status(400).json({ message: 'PIN incorreto. Solicite o código de 4 dígitos ao cliente no local.' });
        }

        // Validação de pagamento offline
        const isOffline = pedido.metodo_pagamento && pedido.metodo_pagamento.toUpperCase().includes('OFFLINE');
        if (isOffline && !paymentCollected) {
            return res.status(400).json({ message: 'Você precisa confirmar que recebeu o pagamento em dinheiro/maquininha do cliente.' });
        }

        const novoStatusPagamento = isOffline ? 'PAGO' : pedido.status_pagamento;

        await prisma.pedidos.update({
            where: { id_pedido },
            data: {
                status_entrega: 'Entregue',
                status_pagamento: novoStatusPagamento,
                driver_token: null,
                driver_token_expires: null,
                atualizado_em: new Date()
            }
        });

        // Notifica Socket
        if (global.io) {
            global.io.emit('order_completed', {
                id_pedido,
                status_entrega: 'Entregue'
            });
        }

        res.json({
            success: true,
            message: `Entrega do Pedido #${id_pedido} concluída com sucesso!`
        });

    } catch (error) {
        console.error('Erro ao finalizar entrega:', error);
        next(error);
    }
};
