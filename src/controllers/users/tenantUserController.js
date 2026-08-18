import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import generateToken from '../../utils/generateToken.js';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const prisma = new PrismaClient();

export const loginAdmin = async (req, res, next) => {
    try {
        const { email: loginInput, senha } = req.body;

        const loja = await prisma.tenants.findFirst({ where: { email: loginInput } });
        if (!loja) return res.status(404).json({ message: "Conta de proprietário não encontrada." });

        const isOwner = await bcrypt.compare(senha, loja.hash_senha);
        
        if (isOwner) {
            const novaSessaoToken = crypto.randomUUID();

            await prisma.tenants.update({
                where: { id: loja.id },
                data: { sessao_token: novaSessaoToken }
            });

            return res.json({
                id_usuario: 'DONO', 
                nome_completo: loja.nome_fantasia || 'Proprietário',
                email: loja.email,
                imagem: loja.imagem, // 🟢 AQUI! Retornando a imagem da clínica/empresa
                token: generateToken('DONO', loja.id, novaSessaoToken), 
                isAdmin: true, 
                role: 'ADMIN', 
                id_tenant: loja.id,
                tenantSlug: loja.slug 
            });
        }
        return res.status(401).json({ message: 'Senha incorreta.' });
    } catch (error) {
        console.error("ERRO NO LOGIN PROPRIETÁRIO:", error.message);
        next(error);
    }
};

export const getGoogleClientId = async (req, res, next) => {
    try {
        const clientId = await ConfiguracaoModel.get('GOOGLE_CLIENT_ID', req.tenantId);
        res.json({ clientId: clientId || '' });
    } catch (error) {
        next(error);
    }
};

export const updateGoogleClientId = async (req, res, next) => {
    try {
        const { clientId } = req.body;
        await ConfiguracaoModel.set('GOOGLE_CLIENT_ID', clientId, req.tenantId);
        res.json({ message: 'Google Client ID atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};