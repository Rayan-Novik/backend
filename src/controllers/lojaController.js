import prisma from '../config/prisma.js';

// ------------------------------------------------------------------
// PÚBLICO: Buscar apenas as lojas ATIVAS (Para o Ecommerce)
// ------------------------------------------------------------------
export const getLojas = async (req, res) => {
    try {
        const lojas = await prisma.lojas.findMany({
            where: { ativo: true } // Apenas ativas para o público
        });

        const lojasFormatadas = lojas.map(loja => ({
            ...loja,
            latitude: loja.latitude ? Number(loja.latitude) : null,
            longitude: loja.longitude ? Number(loja.longitude) : null,
        }));

        res.json(lojasFormatadas);

    } catch (error) {
        console.error("Erro ao buscar lojas:", error);
        res.status(500).json({ message: "Erro ao buscar lojas", error: error.message });
    }
};

// ------------------------------------------------------------------
// ADMIN: Buscar TODAS as lojas (Para o Dashboard)
// ------------------------------------------------------------------
export const getLojasAdmin = async (req, res) => {
    try {
        // Traz tudo, independente se está ativo ou não
        const lojas = await prisma.lojas.findMany({
            orderBy: { id_loja: 'desc' }
        });

        const lojasFormatadas = lojas.map(loja => ({
            ...loja,
            latitude: loja.latitude ? Number(loja.latitude) : null,
            longitude: loja.longitude ? Number(loja.longitude) : null,
        }));

        res.json(lojasFormatadas);

    } catch (error) {
        console.error("Erro ao buscar lojas admin:", error);
        res.status(500).json({ message: "Erro ao buscar lista administrativa", error: error.message });
    }
};

// ------------------------------------------------------------------
// ADMIN: Criar loja
// ------------------------------------------------------------------
export const createLoja = async (req, res) => {
    try {
        const { 
            nome, cep, logradouro, numero, bairro, cidade, estado, 
            latitude, longitude, ativo // Pode vir ativo do front
        } = req.body;

        const novaLoja = await prisma.lojas.create({
            data: {
                nome,
                cep,
                logradouro,
                numero,
                bairro,
                cidade,
                estado,
                ativo: ativo !== undefined ? ativo : true, // Padrão true se não enviar
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null
            }
        });

        res.status(201).json(novaLoja);

    } catch (error) {
        console.error("❌ ERRO NO CREATE LOJA:", error);
        res.status(400).json({ message: "Erro ao criar loja", error: error.message });
    }
};

// ------------------------------------------------------------------
// ADMIN: Atualizar loja (Edição e Ativar/Desativar)
// ------------------------------------------------------------------
export const updateLoja = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nome, cep, logradouro, numero, bairro, cidade, estado, 
            latitude, longitude, ativo 
        } = req.body;

        const lojaAtualizada = await prisma.lojas.update({
            where: { id_loja: Number(id) },
            data: {
                nome,
                cep,
                logradouro,
                numero,
                bairro,
                cidade,
                estado,
                ativo, // Aqui atualiza o status (true/false)
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null
            }
        });

        res.json(lojaAtualizada);

    } catch (error) {
        console.error("Erro ao atualizar loja:", error);
        res.status(400).json({ message: "Erro ao atualizar loja", error: error.message });
    }
};

// ------------------------------------------------------------------
// ADMIN: Deletar loja
// ------------------------------------------------------------------
export const deleteLoja = async (req, res) => {
    try {
        const { id } = req.params;

        await prisma.lojas.delete({
            where: { id_loja: Number(id) }
        });

        res.json({ message: "Loja removida com sucesso" });

    } catch (error) {
        console.error("Erro ao remover loja:", error);
        res.status(500).json({ message: "Erro ao remover loja", error: error.message });
    }
};