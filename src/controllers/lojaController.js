import prisma from '../config/prisma.js';

export const getLojas = async (req, res) => {
    try {
        const lojas = await prisma.lojas.findMany({
            where: { 
                ativo: true,
                id_tenant: req.tenantId 
            }
        });

        const lojasFormatadas = lojas.map(loja => ({
            ...loja,
            latitude: loja.latitude ? Number(loja.latitude) : null,
            longitude: loja.longitude ? Number(loja.longitude) : null,
        }));

        res.json(lojasFormatadas);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar lojas", error: error.message });
    }
};

export const getLojasAdmin = async (req, res) => {
    try {
        const lojas = await prisma.lojas.findMany({
            where: { id_tenant: req.tenantId },
            orderBy: { id_loja: 'desc' }
        });

        const lojasFormatadas = lojas.map(loja => ({
            ...loja,
            latitude: loja.latitude ? Number(loja.latitude) : null,
            longitude: loja.longitude ? Number(loja.longitude) : null,
        }));

        res.json(lojasFormatadas);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar lista administrativa", error: error.message });
    }
};

export const createLoja = async (req, res) => {
    try {
        const { 
            nome, cep, logradouro, numero, bairro, cidade, estado, 
            latitude, longitude, ativo,
            hora_abertura, hora_fechamento, abre_feriados, dias_funcionamento // 🟢 ADICIONADO AQUI
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
                ativo: ativo !== undefined ? ativo : true,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                hora_abertura: hora_abertura || null,             
                hora_fechamento: hora_fechamento || null,         
                abre_feriados: abre_feriados !== undefined ? abre_feriados : false, 
                dias_funcionamento: dias_funcionamento || "0,1,2,3,4,5,6", // 🟢 SALVANDO DIAS
                id_tenant: req.tenantId
            }
        });

        res.status(201).json(novaLoja);
    } catch (error) {
        res.status(400).json({ message: "Erro ao criar loja", error: error.message });
    }
};

export const updateLoja = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nome, cep, logradouro, numero, bairro, cidade, estado, 
            latitude, longitude, ativo,
            hora_abertura, hora_fechamento, abre_feriados, dias_funcionamento // 🟢 ADICIONADO AQUI
        } = req.body;

        await prisma.lojas.updateMany({
            where: { 
                id_loja: Number(id),
                id_tenant: req.tenantId 
            },
            data: {
                nome,
                cep,
                logradouro,
                numero,
                bairro,
                cidade,
                estado,
                ativo,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null,
                hora_abertura: hora_abertura || null,             
                hora_fechamento: hora_fechamento || null,         
                abre_feriados: abre_feriados !== undefined ? abre_feriados : false, 
                dias_funcionamento: dias_funcionamento || "0,1,2,3,4,5,6" // 🟢 ATUALIZANDO DIAS
            }
        });

        const lojaAtualizada = await prisma.lojas.findFirst({
            where: { id_loja: Number(id), id_tenant: req.tenantId }
        });

        res.json(lojaAtualizada);
    } catch (error) {
        res.status(400).json({ message: "Erro ao atualizar loja", error: error.message });
    }
};

export const deleteLoja = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await prisma.lojas.deleteMany({
            where: { 
                id_loja: Number(id),
                id_tenant: req.tenantId 
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: "Loja não encontrada ou não pertence a este tenant" });
        }

        res.json({ message: "Loja removida com sucesso" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao remover loja", error: error.message });
    }
};