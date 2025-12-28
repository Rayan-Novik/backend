import Cupom from '../models/cupomModel.js';
import { calcularDesconto } from '../services/discountService.js';
import { PrismaClient } from '@prisma/client'; // ✅ Importação necessária

const prisma = new PrismaClient(); // ✅ Inicialização necessária

// @desc    Criar novo cupom (Admin)
export const createCupom = async (req, res, next) => {
    try {
        // Dados vindos do form do frontend
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
            data_validade: new Date(data_validade), // Garante formato Date
            valor_minimo: valor_minimo || 0,
            usos_maximos: usos_maximos ? Number(usos_maximos) : null,
            alvo,
            // Só salva o ID se o alvo corresponder, para evitar sujeira
            id_produto_alvo: alvo === 'PRODUTO' ? Number(id_produto_alvo) : null,
            id_categoria_alvo: alvo === 'CATEGORIA' ? Number(id_categoria_alvo) : null,
            id_marca_alvo: alvo === 'MARCA' ? Number(id_marca_alvo) : null,
        });

        res.status(201).json(novoCupom);
    } catch (error) {
        // Tratamento para código duplicado (P2002 é o código do Prisma para Unique Constraint)
        if (error.code === 'P2002') { 
            res.status(400).json({ message: 'Já existe um cupom com este código.' });
        } else {
            next(error);
        }
    }
};

// @desc    Listar cupons (Admin)
export const getCupons = async (req, res, next) => {
    try {
        const cupons = await Cupom.findAll();
        res.json(cupons);
    } catch (error) {
        next(error);
    }
};

// @desc    Validar Cupom no Checkout (Público/Privado)
// @body    { codigo: "VERAO10", carrinho: [...], valorFrete: 20 }
export const validateCupom = async (req, res) => {
    try {
        const { codigo, carrinho, valorFrete } = req.body;

        if (!codigo || !carrinho || carrinho.length === 0) {
            return res.status(400).json({ message: 'Dados insuficientes para validar cupom.' });
        }

        const cupom = await Cupom.findByCode(codigo.toUpperCase());

        if (!cupom) {
            return res.status(404).json({ message: 'Cupom inválido.' });
        }

        // Chama o Service para fazer a matemática difícil
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
        // Se o service lançar erro (ex: valor mínimo não atingido), devolvemos como 400
        res.status(400).json({ 
            valido: false, 
            message: error.message 
        });
    }
};

// @desc    Deletar Cupom (Com tratamento de erro para FK)
export const deleteCupom = async (req, res, next) => {
    const id = Number(req.params.id);

    try {
        // 1. Tenta deletar fisicamente
        // Nota: Aqui usamos 'prisma' diretamente para capturar o código de erro específico
        await prisma.cupons_desconto.delete({
            where: { id_cupom: id }
        });

        res.json({ message: 'Cupom excluído permanentemente.' });

    } catch (error) {
        // ✅ Tratamento do erro de Chave Estrangeira (FK)
        if (error.code === 'P2003') {
            try {
                // 2. Se falhar, faz o "Soft Delete" (Desativar)
                const cupomAtualizado = await prisma.cupons_desconto.update({
                    where: { id_cupom: id },
                    data: { 
                        ativo: false,
                        // Opcional: altera o nome para saber que foi arquivado
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
        
        // Outros erros
        next(error);
    }
};