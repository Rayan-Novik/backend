import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import ConfiguracaoModel from '../models/configuracaoModel.js'; 

const prisma = new PrismaClient();

export const registerTenant = async (req, res, next) => {
    try {
        const { 
            nome_fantasia, razao_social, documento, telefone_contato, email, senha, plano,
            appearance, 
            gateway,
            loja_dados 
        } = req.body;

        if (!nome_fantasia || !razao_social || !email || !senha) {
            return res.status(400).json({ message: 'Todos os campos obrigatórios devem ser preenchidos.' });
        }

        const emailExiste = await prisma.tenants.findFirst({ where: { email } });
        if (emailExiste) {
            return res.status(400).json({ message: 'Este e-mail já está em uso por outra loja.' });
        }

        // Criando o Slug amigável
        let baseSlug = nome_fantasia
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');

        let slug = baseSlug;
        let slugCounter = 1;

        while (await prisma.tenants.findFirst({ where: { slug } })) {
            slug = `${baseSlug}-${slugCounter}`;
            slugCounter++;
        }

        const salt = await bcrypt.genSalt(10);
        const hash_senha = await bcrypt.hash(senha, salt);

        const planoEscolhido = plano || 'BASICO';

        const planoDB = await prisma.planos.findFirst({
            where: { nome: planoEscolhido }
        });

        const diasTeste = planoDB ? planoDB.dias_teste : 7;
        const limiteProdutos = planoDB ? planoDB.limite_produtos : 50;
        const limiteUsuarios = planoDB ? planoDB.limite_usuarios : 2;

        const data_vencimento = new Date();
        data_vencimento.setDate(data_vencimento.getDate() + diasTeste);

        const statusInicial = diasTeste === 0 ? 'AGUARDANDO_PAGAMENTO' : 'ATIVO';

        // 1. SALVA A LOJA (TENANT) NO BANCO
        const novoTenant = await prisma.tenants.create({
            data: {
                slug: slug,
                nome_fantasia: nome_fantasia,
                razao_social: razao_social, 
                documento: documento || '',
                telefone_contato: telefone_contato || '',
                email: email,
                email_contato: email,
                hash_senha: hash_senha,
                plano: planoEscolhido,
                status_assinatura: statusInicial,
                data_vencimento: data_vencimento,
                limite_produtos: limiteProdutos,  
                limite_usuarios: limiteUsuarios,   
                ativo: true,
                role: 'PROPRIETÁRIO' // 🟢 Força o status de Dono Universal
            }
        });

        // 2. SALVAR AS CONFIGURAÇÕES DE APARÊNCIA DA LOJA
        if (appearance) {
            const tenantId = novoTenant.id;
            const updates = [];
            
            if (appearance.SITE_TITLE) updates.push(ConfiguracaoModel.set('SITE_TITLE', appearance.SITE_TITLE, tenantId));
            if (appearance.STORE_LAYOUT_STYLE) updates.push(ConfiguracaoModel.set('STORE_LAYOUT_STYLE', appearance.STORE_LAYOUT_STYLE, tenantId));
            if (appearance.BTN_PRIMARY_BG) updates.push(ConfiguracaoModel.set('BTN_PRIMARY_BG', appearance.BTN_PRIMARY_BG, tenantId));
            if (appearance.HEADER_PRIMARY_COLOR) updates.push(ConfiguracaoModel.set('HEADER_PRIMARY_COLOR', appearance.HEADER_PRIMARY_COLOR, tenantId));
            if (appearance.LOGO_URL) updates.push(ConfiguracaoModel.set('LOGO_URL', appearance.LOGO_URL, tenantId));
            
            await Promise.all(updates);
            console.log(`🎨 Identidade visual salva para a loja ${novoTenant.id}`);
        }

        // 3. SALVAR CONFIGURAÇÃO DE PAGAMENTO NA ENTREGA (OFFLINE)
        if (gateway) {
            const idTenant = novoTenant.id; 
            
            await ConfiguracaoModel.set('ACTIVE_GATEWAY', gateway.provider || 'OFFLINE', idTenant);
            
            if (gateway.provider === 'OFFLINE') {
                try {
                    await prisma.gateway_rules.createMany({
                        data: [
                            { id_tenant: idTenant, method: 'OFFLINE_CASH', provider: 'OFFLINE', is_active: true },
                            { id_tenant: idTenant, method: 'OFFLINE_PIX', provider: 'OFFLINE', is_active: true },
                            { id_tenant: idTenant, method: 'OFFLINE_CREDIT', provider: 'OFFLINE', is_active: true },
                            { id_tenant: idTenant, method: 'OFFLINE_DEBIT', provider: 'OFFLINE', is_active: true }
                        ],
                        skipDuplicates: true 
                    });
                    console.log(`💵 Regras offline ativadas para a loja ${novoTenant.id}`);
                } catch (err) {
                    console.error(`🚨 Erro ao ativar regras offline no banco:`, err);
                }
            }
        }

        // 4. SALVAR A LOJA FÍSICA / ENDEREÇO INICIAL
        if (loja_dados) {
            try {
                await prisma.lojas.create({
                    data: {
                        nome: 'Matriz', 
                        cep: loja_dados.cep || '',
                        logradouro: loja_dados.logradouro || '',
                        numero: loja_dados.numero || '',
                        bairro: loja_dados.bairro || '',
                        cidade: loja_dados.cidade || '',
                        estado: loja_dados.estado || '',
                        hora_abertura: loja_dados.hora_abertura || null,
                        hora_fechamento: loja_dados.hora_fechamento || null,
                        dias_funcionamento: loja_dados.dias_funcionamento || '0,1,2,3,4,5,6',
                        ativo: true,
                        id_tenant: novoTenant.id
                    }
                });
                console.log(`🏠 Loja física inicial salva para a loja ${novoTenant.id}`);
            } catch (err) {
                console.error(`🚨 Erro ao salvar dados da loja física:`, err);
            }
        }

        // 🟢 5. CRIAR O CARGO INTOCÁVEL DO PROPRIETÁRIO
        try {
            await prisma.cargos.create({
                data: {
                    id_tenant: novoTenant.id,
                    nome: 'Dono / Proprietário',
                    descricao: 'Acesso total e irrestrito ao painel.',
                    permissoes: ALL_PERMISSION_KEYS, // Joga todo o pacote de permissões
                    is_dono: true, // 🔒 A Trava Mestra
                    ativo: true
                }
            });
            console.log(`👑 Cargo de Proprietário criado para a loja ${novoTenant.id}`);
        } catch (err) {
            console.error(`🚨 Erro ao criar cargo de Proprietário:`, err);
        }

        console.log(`✅ Nova loja criada no SaaS: ${novoTenant.nome_fantasia}`);

        res.status(201).json({
            message: 'Loja criada com sucesso!',
            slug: novoTenant.slug
        });

    } catch (error) {
        console.error('Erro ao registrar loja:', error);
        res.status(500).json({ message: 'Erro interno ao criar a conta.' });
    }
};

export const getDominioLoja = async (req, res) => {
    try {
        const loja = await prisma.tenants.findUnique({
            where: { id: req.tenantId },
            select: { dominio_customizado: true }
        });
        res.json(loja);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar domínio.' });
    }
};

export const updateDominioLoja = async (req, res) => {
    try {
        const { dominio_customizado } = req.body;

        if (dominio_customizado) {
            const dominioExiste = await prisma.tenants.findFirst({
                where: { 
                    dominio_customizado: dominio_customizado,
                    id: { not: req.tenantId } 
                }
            });

            if (dominioExiste) {
                return res.status(400).json({ message: "Este domínio já está em uso por outra loja." });
            }
        }

        await prisma.tenants.update({
            where: { id: req.tenantId },
            data: { dominio_customizado: dominio_customizado || null }
        });

        res.json({ message: "Domínio atualizado com sucesso!" });
    } catch (error) {
        console.error("Erro ao atualizar domínio:", error);
        res.status(500).json({ message: 'Erro ao atualizar domínio.' });
    }
};

export const getAllTenants = async (req, res) => {
    try {
        if (req.tenantId !== 1) {
            return res.status(403).json({ message: 'Acesso negado. Apenas o Master SaaS pode ver as empresas.' });
        }

        const tenants = await prisma.tenants.findMany({
            orderBy: { id: 'desc' }
        });

        res.status(200).json(tenants);
    } catch (error) {
        console.error('Erro ao buscar empresas SaaS:', error);
        res.status(500).json({ message: 'Erro ao listar as empresas.' });
    }
};

export const deleteTenant = async (req, res) => {
    try {
        if (req.tenantId !== 1) {
            return res.status(403).json({ message: 'Acesso negado. Apenas o Master SaaS pode realizar esta ação.' });
        }

        const idDeletar = parseInt(req.params.id);

        if (idDeletar === 1) {
            return res.status(400).json({ message: 'Segurança: Você não pode deletar a loja principal!' });
        }

        await prisma.tenants.delete({
            where: { id: idDeletar } 
        });

        console.log(`🗑️ Empresa ${idDeletar} deletada pelo Master.`);
        res.status(200).json({ message: 'Empresa removida com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar empresa:', error);
        res.status(500).json({ message: 'Erro ao remover a empresa. Talvez existam produtos vinculados a ela.' });
    }
};

export const getAllPlanos = async (req, res) => {
    try {
        const planos = await prisma.planos.findMany({
            orderBy: { preco_mensal: 'asc' }
        });
        res.status(200).json(planos);
    } catch (error) {
        console.error('Erro ao buscar planos:', error);
        res.status(500).json({ message: 'Erro ao listar os planos.' });
    }
};

export const createPlano = async (req, res) => {
    if (req.tenantId !== 1) return res.status(403).json({ message: 'Acesso negado.' });
    
    try {
        const { nome, preco_mensal, dias_teste, limite_produtos, limite_usuarios, destaque, ativo, descricao } = req.body;

        const novoPlano = await prisma.planos.create({
            data: {
                nome: nome,
                preco_mensal: preco_mensal ? parseFloat(preco_mensal) : 0,
                dias_teste: dias_teste ? parseInt(dias_teste, 10) : 7, 
                limite_produtos: limite_produtos ? parseInt(limite_produtos, 10) : 100, 
                limite_usuarios: limite_usuarios ? parseInt(limite_usuarios, 10) : 1, 
                destaque: String(destaque) === 'true' || destaque === true,
                ativo: String(ativo) === 'true' || ativo === true,
                descricao: descricao || ""
            }
        });
        
        res.status(201).json(novoPlano);
    } catch (error) {
        console.error('Erro ao criar plano:', error);
        res.status(500).json({ message: 'Erro ao criar plano.' });
    }
};

export const updatePlano = async (req, res) => {
    if (req.tenantId !== 1) return res.status(403).json({ message: 'Acesso negado.' });

    try {
        const id = parseInt(req.params.id, 10);
        const { nome, preco_mensal, dias_teste, limite_produtos, limite_usuarios, destaque, ativo, descricao } = req.body;

        // 1. Pega os dados antigos do plano ANTES de atualizar
        const planoAntigo = await prisma.planos.findUnique({ where: { id } });
        if (!planoAntigo) {
            return res.status(404).json({ message: 'Plano não encontrado.' });
        }

        const dadosAtualizados = {};
        
        if (nome !== undefined) dadosAtualizados.nome = nome;
        if (preco_mensal !== undefined) dadosAtualizados.preco_mensal = parseFloat(preco_mensal);
        if (dias_teste !== undefined) dadosAtualizados.dias_teste = parseInt(dias_teste, 10);
        if (limite_produtos !== undefined) dadosAtualizados.limite_produtos = parseInt(limite_produtos, 10);
        if (limite_usuarios !== undefined) dadosAtualizados.limite_usuarios = parseInt(limite_usuarios, 10);
        if (destaque !== undefined) dadosAtualizados.destaque = String(destaque) === 'true' || destaque === true;
        if (ativo !== undefined) dadosAtualizados.ativo = String(ativo) === 'true' || ativo === true;
        if (descricao !== undefined) dadosAtualizados.descricao = descricao;

        // 2. Atualiza o plano na tabela de planos
        const planoAtualizado = await prisma.planos.update({
            where: { id },
            data: dadosAtualizados
        });
        
        // 3. 🟢 EFEITO CASCATA: Se o NOME do plano mudou, atualiza todas as lojas vinculadas!
        if (nome && nome !== planoAntigo.nome) {
            await prisma.tenants.updateMany({
                where: { plano: planoAntigo.nome },
                data: { plano: nome } // Troca o nome velho pelo novo nas lojas
            });
            console.log(`🔄 Lojas migradas do plano antigo '${planoAntigo.nome}' para o novo '${nome}'`);
        }
        
        res.status(200).json(planoAtualizado);
    } catch (error) {
        console.error('Erro ao atualizar plano:', error);
        res.status(500).json({ message: 'Erro ao atualizar plano.' });
    }
};

export const deletePlano = async (req, res) => {
    if (req.tenantId !== 1) return res.status(403).json({ message: 'Acesso negado.' });

    try {
        const id = parseInt(req.params.id);
        
        // 1. Descobre qual plano está sendo deletado
        const planoParaDeletar = await prisma.planos.findUnique({ where: { id } });
        if (!planoParaDeletar) {
            return res.status(404).json({ message: 'Plano não encontrado.' });
        }

        // 2. 🟢 PROTEÇÃO: Verifica se existem lojas usando esse plano
        const lojasAfetadas = await prisma.tenants.count({
            where: { plano: planoParaDeletar.nome }
        });

        // 3. Se tiver lojas, movemos elas para um plano padrão de segurança antes de deletar
        if (lojasAfetadas > 0) {
            await prisma.tenants.updateMany({
                where: { plano: planoParaDeletar.nome },
                data: { plano: 'BASICO' } // <--- Escolha aqui para qual plano eles caem se o atual for deletado
            });
            console.log(`⚠️ ${lojasAfetadas} lojas foram movidas para o plano BASICO porque o plano '${planoParaDeletar.nome}' foi deletado.`);
        }

        // 4. Deleta o plano com segurança
        await prisma.planos.delete({
            where: { id }
        });
        
        res.status(200).json({ message: 'Plano deletado com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar plano:', error);
        res.status(500).json({ message: 'Erro ao deletar plano.' });
    }
};

export const getPlanosPublicos = async (req, res) => {
    try {
        const planosAtivos = await prisma.planos.findMany({
            where: { ativo: true },
            orderBy: { preco_mensal: 'asc' } 
        });
        res.status(200).json(planosAtivos);
    } catch (error) {
        console.error('Erro ao buscar planos públicos:', error);
        res.status(500).json({ message: 'Erro ao carregar os planos disponíveis.' });
    }
};

export const getTenantContactInfo = async (req, res) => {
    try {
        const tenantInfo = await prisma.tenants.findUnique({
            where: { id: req.tenantId },
            select: {
                nome_fantasia: true,
                razao_social: true,
                slug: true,
                dominio_customizado: true,
                email_contato: true,
                email: true,
                telefone_contato: true,
                documento: true,
                imagem: true, // 🟢 ADICIONADO: Retorna a logo/imagem da loja
                plano: true,
                status_assinatura: true,
                data_vencimento: true
            }
        });

        if (!tenantInfo) {
            return res.status(404).json({ message: 'Lojista não encontrado' });
        }

        res.json(tenantInfo);
    } catch (error) {
        console.error('Erro ao buscar contato do tenant:', error);
        res.status(500).json({ message: 'Erro interno ao buscar contato.' });
    }
};

// ============================================================================
// 🟢 NOVA FUNÇÃO: ATUALIZAR INFORMAÇÕES DO TENANT (PERFIL DA LOJA)
// ============================================================================
export const updateTenantInfo = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { 
            nome_fantasia, 
            razao_social, 
            documento, 
            telefone_contato, 
            email_contato, 
            slug, 
            dominio_customizado,
            imagem // 🟢 ADICIONADO: Recebe a URL da imagem do frontend
        } = req.body;

        // Trava de segurança: Se ele tentou mudar o slug, verifica se já não existe outro igual
        if (slug) {
            const slugExistente = await prisma.tenants.findFirst({
                where: { 
                    slug: slug,
                    id: { not: id_tenant } // Verifica em outras lojas (tenants)
                }
            });
            if (slugExistente) {
                return res.status(400).json({ message: "Este URL de sistema (slug) já está em uso por outra loja." });
            }
        }

        // Trava de segurança para domínio customizado
        if (dominio_customizado) {
            const dominioExiste = await prisma.tenants.findFirst({
                where: { 
                    dominio_customizado: dominio_customizado,
                    id: { not: id_tenant } 
                }
            });

            if (dominioExiste) {
                return res.status(400).json({ message: "Este domínio já está em uso por outra loja." });
            }
        }

        // 🟢 PREPARA OS DADOS PARA ATUALIZAÇÃO
        const dadosAtualizacao = {
            nome_fantasia,
            razao_social: razao_social || null,
            documento: documento || null,
            telefone_contato: telefone_contato || null,
            email_contato: email_contato || null,
            slug: slug || undefined,
            dominio_customizado: dominio_customizado || null
        };

        // 🟢 Se a imagem foi enviada no body, adiciona no objeto de atualização
        if (imagem !== undefined) {
            dadosAtualizacao.imagem = imagem;
        }

        const tenantAtualizado = await prisma.tenants.update({
            where: { id: id_tenant },
            data: dadosAtualizacao
        });

        res.status(200).json({ 
            message: "Informações da loja atualizadas com sucesso!",
            tenant: tenantAtualizado 
        });

    } catch (error) {
        console.error("Erro ao atualizar tenant:", error);
        res.status(500).json({ message: 'Erro interno ao atualizar os dados da loja.' });
    }
};

export const renovarAssinaturaManual = async (req, res) => {
    try {
        if (req.tenantId !== 1) {
            return res.status(403).json({ message: 'Acesso negado. Apenas o Master SaaS pode renovar assinaturas manualmente.' });
        }

        const id = parseInt(req.params.id);
        const { dias } = req.body; 
        const diasRenovacao = dias || 30; // Padrão 30 dias

        const tenant = await prisma.tenants.findUnique({ where: { id } });
        
        if (!tenant) {
            return res.status(404).json({ message: 'Lojista não encontrado.' });
        }

        // Lógica de cálculo da nova data
        let novaData = new Date(tenant.data_vencimento || new Date());
        const hoje = new Date();
        
        // Se a assinatura já venceu, os 30 dias contam a partir de HOJE.
        // Se ainda está ativa, soma 30 dias ao saldo que ele já tem.
        if (novaData < hoje) {
            novaData = new Date();
        }
        
        novaData.setDate(novaData.getDate() + diasRenovacao);

        const tenantAtualizado = await prisma.tenants.update({
            where: { id },
            data: {
                status_assinatura: 'ATIVO',
                ativo: true, // Garante que a loja seja desbloqueada
                data_vencimento: novaData
            }
        });

        res.status(200).json({ 
            message: `Assinatura renovada com sucesso por mais ${diasRenovacao} dias!`, 
            nova_data: tenantAtualizado.data_vencimento 
        });

    } catch (error) {
        console.error("Erro ao renovar assinatura:", error);
        res.status(500).json({ message: 'Erro interno ao tentar renovar a assinatura.' });
    }
};

export const resolveTenantByDomain = async (req, res) => {
    try {
        // Recebe o domínio que veio na requisição
        let { domain } = req.params;
        
        // Limpa o domínio por segurança
        domain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Procura no banco: ou pelo domínio customizado, ou pelo slug padrão
        const tenant = await prisma.tenants.findFirst({
            where: {
                OR: [
                    { dominio_customizado: domain },
                    // Permite também acessar por lojadocliente.seudominio.com.br
                    { slug: domain.split('.')[0] } 
                ],
                ativo: true
            },
            select: {
                id: true,
                slug: true,
                nome_fantasia: true,
                dominio_customizado: true,
                // Aqui você pode retornar coisas públicas que o frontend precisa de cara, 
                // como as cores da loja, logo, gateway ativo, etc.
            }
        });

        if (!tenant) {
            return res.status(404).json({ message: 'Loja não encontrada para este domínio.' });
        }

        res.status(200).json(tenant);

    } catch (error) {
        console.error("Erro ao resolver domínio:", error);
        res.status(500).json({ message: 'Erro interno ao resolver o domínio da loja.' });
    }
};

export const verifyTenant = async (req, res) => {
    try {
        let { domain } = req.params;

        // Limpa o domínio recebido (tira www, http, etc)
        domain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');

        // Descobre qual é o slug (ex: tira o .ararinhacloud.shop)
        const baseDomain = process.env.BASE_DOMAIN || 'ararinhacloud.shop';
        let slug = domain;
        if (domain.includes(baseDomain)) {
            slug = domain.replace(`.${baseDomain}`, '');
        }

        // Busca a loja no banco de dados
        const tenant = await prisma.tenants.findFirst({
            where: {
                OR: [
                    { dominio_customizado: domain }, // Se for dominio próprio (ex: vendason.com)
                    { slug: slug }                   // Se for subdomínio (ex: vendason)
                ],
                ativo: true
            },
            select: {
                id: true,
                slug: true,
                nome_fantasia: true,
                dominio_customizado: true,
                imagem: true,
                plano: true
            }
        });

        if (!tenant) {
            return res.status(404).json({ message: 'Loja não encontrada ou inativa.' });
        }

        res.status(200).json(tenant);

    } catch (error) {
        console.error("Erro ao verificar tenant:", error);
        res.status(500).json({ message: 'Erro interno ao resolver o domínio da loja.' });
    }
};