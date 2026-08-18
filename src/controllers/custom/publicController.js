import { PrismaClient } from '@prisma/client';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const prisma = new PrismaClient(); // 🟢 Faltava declarar isso aqui!

export const getProfissionaisPublicos = async (req, res) => {
    try {
        // Tenta pegar do req.tenantId (se houver middleware) OU direto do header da requisição
        const tenantString = req.tenantId || req.headers['x-tenant-id'] || '5';
        
        // CONVERTE PARA NÚMERO INTEIRO! Sem isso, o Prisma dá erro 500.
        const id_tenant = parseInt(tenantString, 10);

        if (isNaN(id_tenant)) {
            return res.status(400).json({ message: "ID da loja inválido." });
        }

        const profissionais = await prisma.funcionarios.findMany({
            where: { 
                id_tenant: id_tenant,
                ativo: true // Só mostra quem tá ativo!
            },
            select: {
                nome_completo: true,
                imagem: true,
                especialidade: true,
                bio: true,
                formacao: true,
                atuacao: true,
                sobre: true
            }
        });

        res.status(200).json(profissionais);
    } catch (error) {
        console.error("❌ ERRO NO PRISMA (getProfissionaisPublicos):", error);
        res.status(500).json({ message: "Erro ao buscar equipe." });
    }
};

export const getPublicConfig = async (req, res) => {
    try {
        const tenantString = req.tenantId || req.headers['x-tenant-id'] || '5';
        const id_tenant = parseInt(tenantString, 10);
        const { chave } = req.params;

        // 🟢 Usamos o ConfiguracaoModel.get para que ele Descriptografe a galeria!
        const valor = await ConfiguracaoModel.get(chave, id_tenant);

        if (!valor) {
            return res.status(404).json({ message: "Configuração não encontrada." });
        }

        // Devolvemos o valor pronto pro frontend
        res.status(200).json({ chave, valor });
    } catch (error) {
        console.error("❌ ERRO AO BUSCAR CONFIG PÚBLICA:", error);
        res.status(500).json({ message: "Erro ao buscar configuração." });
    }
};