import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const tenantResolver = async (req, res, next) => {
    // =======================================================
    // 🤖 LIBERA O ROBÔ DO WHATSAPP E FACEBOOK PARA PASSAR
    // Vai direto para o ogController sem gastar processamento!
    // =======================================================
    if (req.originalUrl.includes('/render-og')) {
        return next();
    }

    try {
        // Os headers limpinhos que nosso api.js do frontend agora envia!
        const slug = req.headers['x-tenant-slug'];
        const domain = req.headers['x-tenant-domain'];
        const headerId = req.headers['x-tenant-id'];

        let tenant = null;

        // 🥇 PRIORIDADE 1: Busca pelo Slug Exato (Enviado pelo React)
        if (slug && slug !== 'undefined' && slug !== 'null' && slug !== 'localhost') {
            tenant = await prisma.tenants.findUnique({ 
                where: { slug: String(slug) } 
            });
        }

        // 🥈 PRIORIDADE 2: Busca pelo Domínio Customizado
        if (!tenant && domain && domain !== 'localhost' && domain !== '127.0.0.1') {
            const dominioLimpo = String(domain).replace(/^www\./, ''); 
            tenant = await prisma.tenants.findFirst({ 
                where: { dominio_customizado: { contains: dominioLimpo } } 
            });
        }

        // 🥉 PRIORIDADE 3: Busca pelo ID direto (Usado pelo Painel Admin)
        if (!tenant && headerId && headerId !== 'undefined' && headerId !== 'null') {
            tenant = await prisma.tenants.findUnique({ 
                where: { id: Number(headerId) } 
            });
        }

        // 🚨 PRIORIDADE 4: Fallback do Token JWT
        // (SÓ usamos isso se o Frontend não mandou NENHUM dos cabeçalhos acima)
        if (!tenant && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.id_tenant) {
                    tenant = await prisma.tenants.findUnique({ 
                        where: { id: Number(decoded.id_tenant) } 
                    });
                }
            } catch (err) {
                // Ignora erro de token
            }
        }

        // =========================================================
        // 🛑 A BARREIRA DE SEGURANÇA (Adeus vazamento de dados!)
        // =========================================================
        
        // 🚀 AQUI ESTÁ A CORREÇÃO: Adicionado o '/webhooks' na lista para liberar retornos de gateway!
        const rotasLivres = ['/register', '/planos-publicos', '/admin-login', '/staff-login', '/webhooks', '/public/', '/api/v2', '/v1'];
        const isPublicRoute = rotasLivres.some(rota => req.originalUrl.includes(rota));

        if (!tenant || !tenant.ativo) {
            if (isPublicRoute) {
                // Se for rota pública ou API Externa, deixa passar para o próximo middleware autenticar!
                return next();
            }

            console.log(`❌ [Segurança] Bloqueado no tenantResolver. Slug[${slug}] Domain[${domain}] Rota[${req.originalUrl}]`);
            return res.status(404).json({ error: "Loja não encontrada ou inativa." });
        }

        // 💉 INJEÇÃO MÁGICA: Coloca a loja correta e validada na requisição
        req.tenantId = tenant.id;
        req.tenant_id = tenant.id; // Salvamos com underline também por precaução com outras rotas
        req.tenantSlug = tenant.slug;

        next();
    } catch (error) {
        console.error("Erro no tenantResolver:", error);
        return res.status(500).json({ error: "Erro interno ao validar a loja." });
    }
};