import Cupom from '../models/cupomModel.js';
import { calcularDesconto } from '../services/discountService.js';
import { PrismaClient } from '@prisma/client'; 

const prisma = new PrismaClient(); 

export const createCupom = async (req, res, next) => {
    try {
        const { 
            codigo, descricao, tipo_desconto, valor, 
            data_validade, valor_minimo, usos_maximos,
            alvo, id_produto_alvo, id_categoria_alvo, id_marca_alvo 
        } = req.body;

        const novoCupom = await Cupom.create({
            codigo: codigo.toUpperCase(),
            descricao,
            tipo_desconto,
            valor,
            data_validade: new Date(data_validade), 
            valor_minimo: valor_minimo || 0,
            usos_maximos: usos_maximos ? Number(usos_maximos) : null,
            alvo,
            id_produto_alvo: alvo === 'PRODUTO' ? Number(id_produto_alvo) : null,
            id_categoria_alvo: alvo === 'CATEGORIA' ? Number(id_categoria_alvo) : null,
            id_marca_alvo: alvo === 'MARCA' ? Number(id_marca_alvo) : null,
            id_tenant: req.tenantId // 🛡️ BLINDAGEM SAAS
        });

        res.status(201).json(novoCupom);
    } catch (error) {
        if (error.code === 'P2002') { 
            res.status(400).json({ message: 'Já existe um cupom com este código nesta loja.' });
        } else {
            next(error);
        }
    }
};

export const getCupons = async (req, res, next) => {
    try {
        const cupons = await Cupom.findAll(req.tenantId);
        res.json(cupons);
    } catch (error) {
        next(error);
    }
};

export const validateCupom = async (req, res) => {
    try {
        // 🟢 Pega o ID da loja pela URL
        const tenantId = parseInt(req.params.tenantId) || 1;
        const { codigo, carrinho, valorFrete } = req.body;

        if (!codigo || !carrinho || carrinho.length === 0) {
            return res.status(400).json({ message: 'Dados insuficientes para validar cupom.' });
        }

        // 🟢 Passa o tenantId para a busca
        const cupom = await Cupom.findByCode(codigo.toUpperCase(), tenantId);

        if (!cupom) {
            return res.status(404).json({ message: 'Cupom inválido ou expirado.' });
        }

        const valorDesconto = calcularDesconto(carrinho, cupom, valorFrete);

        res.json({
            valido: true,
            codigo: cupom.codigo,
            tipo: cupom.tipo_desconto,
            desconto_total: valorDesconto,
            id_cupom: cupom.id_cupom,
            mensagem: 'Cupom aplicado com sucesso!'
        });

    } catch (error) {
        res.status(400).json({ 
            valido: false, 
            message: error.message 
        });
    }
};

export const deleteCupom = async (req, res, next) => {
    const id = Number(req.params.id);

    try {
        const cupomExistente = await prisma.cupons_desconto.findFirst({
            where: { id_cupom: id, id_tenant: req.tenantId }
        });

        if (!cupomExistente) {
            return res.status(404).json({ message: 'Cupom não encontrado nesta loja.' });
        }

        await prisma.cupons_desconto.delete({
            where: { id_cupom: id } // Seguro pois já validamos a posse acima
        });

        res.json({ message: 'Cupom excluído permanentemente.' });

    } catch (error) {
        if (error.code === 'P2003') {
            try {
                const cupomAtualizado = await prisma.cupons_desconto.updateMany({
                    where: { id_cupom: id, id_tenant: req.tenantId },
                    data: { 
                        ativo: false,
                        descricao: `(Arquivado) ${new Date().toLocaleDateString()}` 
                    }
                });

                return res.status(200).json({ 
                    message: 'Este cupom já possui pedidos vinculados. Ele foi DESATIVADO para preservar o histórico.',
                    cupom: cupomAtualizado
                });
            } catch (updateError) {
                return next(updateError);
            }
        }
        
        next(error);
    }
};