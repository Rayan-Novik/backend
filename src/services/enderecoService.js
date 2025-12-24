// Em /services/enderecoService.js

import EnderecoModel from '../models/enderecoModel.js'; // Importa o model que usa Prisma
import { buscarEnderecoPorCep } from './viacepService.js'; // Serviço para buscar CEP
import PedidoModel from '../models/pedidoModel.js';

export default {
    /**
     * Busca todos os endereços de um utilizador.
     */
    async getUserAddresses(id_usuario) {
        return EnderecoModel.findByUserId(id_usuario);
    },

    /**
     * Cria um novo endereço para um utilizador, buscando os dados do CEP.
     */
    async createAddress(id_usuario, dadosEntrada) {
        // ... seu código existente ...
        const { cep, numero, complemento } = dadosEntrada;
        if (!cep || !numero) {
            throw new Error('CEP e número são obrigatórios.');
        }
        const dadosViaCep = await buscarEnderecoPorCep(cep);
        const dadosCompletos = {
            ...dadosViaCep,
            numero,
            complemento: complemento || null,
        };
        return EnderecoModel.create(id_usuario, dadosCompletos);
    },

    /**
     * Atualiza um endereço existente.
     */
    async updateAddress(id_endereco, id_usuario, dadosAtualizacao) {
        // ... seu código existente ...
        const result = await EnderecoModel.update(id_endereco, id_usuario, dadosAtualizacao);
        if (result.count === 0) {
            throw new Error('Endereço não encontrado ou não pertence ao utilizador.');
        }
        return EnderecoModel.findById(id_endereco, id_usuario);
    },

    /**
     * Remove um endereço existente.
     */
    async deleteAddress(id_endereco, id_usuario) {
        // A lógica de verificar pedidos foi removida.
        const result = await EnderecoModel.remove(id_endereco, id_usuario);

        if (result.affectedRows === 0) {
            throw new Error('Endereço não encontrado ou não pertence ao utilizador.');
        }

        return result;
    }
};