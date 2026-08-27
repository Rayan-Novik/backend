import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import crypto from 'crypto';

const prisma = new PrismaClient();

// 🟢 FUNÇÃO AUXILIAR: Constrói a URL Inteligente (Com ou Sem Domínio Próprio)
const buildMesaUrl = (tenant, token) => {
    // 1. Se a loja tem um Domínio Personalizado configurado
    if (tenant.dominio_customizado) {
        // Remove barra extra no final do domínio se houver, para evitar "//" na URL
        const domainClean = tenant.dominio_customizado.replace(/\/$/, '');
        const customDomain = domainClean.startsWith('http') 
            ? domainClean 
            : `https://${domainClean}`;
        
        // Mantemos o slug para não quebrar a rota do seu frontend (/:slug_loja/m/:token)
        return `${customDomain}/${tenant.slug}/m/${token}`;
    }

    // 2. Se a loja NÃO tem domínio, usa o DOMINIO padrão (ex: azun.com.br)
    const baseDomain = (process.env.DOMINIO || process.env.FRONTEND_URL || 'azun.com.br').replace(/\/$/, '');
    const systemDomain = baseDomain.startsWith('http') ? baseDomain : `https://${baseDomain}`;
    
    return `${systemDomain}/${tenant.slug}/m/${token}`;
};

// Lista todas as mesas da loja
export const listarMesas = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const mesas = await prisma.mesas.findMany({
            where: { id_tenant },
            orderBy: { nome: 'asc' }
        });
        res.json(mesas);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar mesas.", error: error.message });
    }
};

// Cria a mesa, gera o Token e a URL
export const criarMesa = async (req, res) => {
    try {
        const { nome, status } = req.body;
        const id_tenant = req.tenantId;

        const tenant = await prisma.tenants.findUnique({ where: { id: id_tenant } });
        if (!tenant) return res.status(404).json({ message: "Tenant não encontrado." });

        // Gera token e monta URL
        const token = crypto.randomBytes(4).toString('hex');
        
        // 🟢 MÁGICA: Gera a URL com o domínio personalizado ou padrão
        const url_qrcode = buildMesaUrl(tenant, token);

        const novaMesa = await prisma.mesas.create({
            data: {
                nome,
                status: status || 'LIVRE',
                id_tenant,
                token,
                url_qrcode
            }
        });

        const qrCodeBase64 = await QRCode.toDataURL(url_qrcode, {
            errorCorrectionLevel: 'H',
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        res.status(201).json({ 
            message: "Mesa criada com sucesso!", 
            mesa: novaMesa,
            qr_code_base64: qrCodeBase64 
        });
    } catch (error) {
        res.status(400).json({ message: "Erro ao criar mesa.", error: error.message });
    }
};

// Atualiza a mesa
export const atualizarMesa = async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, status } = req.body;
        const id_tenant = req.tenantId;

        const mesa = await prisma.mesas.updateMany({
            where: { id_mesa: Number(id), id_tenant },
            data: { nome, status }
        });

        if (mesa.count === 0) return res.status(404).json({ message: "Mesa não encontrada." });
        res.json({ message: "Mesa atualizada com sucesso!" });
    } catch (error) {
        res.status(400).json({ message: "Erro ao atualizar mesa.", error: error.message });
    }
};

// Exclui a mesa
export const excluirMesa = async (req, res) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;

        const mesa = await prisma.mesas.findFirst({
            where: { id_mesa: Number(id), id_tenant }
        });

        if (!mesa) return res.status(404).json({ message: "Mesa não encontrada." });
        if (mesa.status !== 'LIVRE') {
            return res.status(400).json({ message: "Não é possível excluir uma mesa ocupada." });
        }

        await prisma.mesas.delete({
            where: { id_mesa: Number(id) }
        });

        res.json({ message: "Mesa excluída com sucesso!" });
    } catch (error) {
        res.status(400).json({ message: "Erro ao excluir mesa.", error: error.message });
    }
};

// Obtém o QR Code
export const obterQrCodeMesa = async (req, res, next) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;

        const mesa = await prisma.mesas.findFirst({
            where: { id_mesa: Number(id), id_tenant },
            include: { tenants: true }
        });

        if (!mesa) return res.status(404).json({ message: "Mesa não encontrada." });

        // 🟢 Puxa a URL que salvamos na criação
        let urlCardapio = mesa.url_qrcode;
        
        // 🟢 Fallback caso seja uma mesa antiga (criada antes dessa att)
        if (!urlCardapio) {
            const tokenFallback = mesa.token || String(mesa.id_mesa);
            urlCardapio = buildMesaUrl(mesa.tenants, tokenFallback);
        }

        const qrCodeBase64 = await QRCode.toDataURL(urlCardapio, {
            errorCorrectionLevel: 'H',
            margin: 2,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        res.status(200).json({
            message: "QR Code gerado com sucesso!",
            mesa: mesa.nome,
            url_acesso: urlCardapio,
            qr_code_base64: qrCodeBase64
        });
    } catch (error) {
        next(error);
    }
};