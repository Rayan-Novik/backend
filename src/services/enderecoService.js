import EnderecoModel from '../models/enderecoModel.js';
import { buscarEnderecoPorCep } from './viacepService.js';
import { geocodeAddress } from './geocodingService.js';

export default {
    async getUserAddresses(id_usuario, id_tenant) {
        return EnderecoModel.findByUserId(id_usuario, id_tenant);
    },

    async createAddress(id_usuario, dadosEntrada, id_tenant) {
        // 🟢 Extraímos os dados informados pelo cliente
        const { cep, numero, complemento, logradouro, bairro, cidade, estado, latitude, longitude, is_principal } = dadosEntrada;
        
        // 🟢 Exigimos o básico para a entrega
        if (!logradouro || !numero || !bairro || !cidade || !estado) {
            throw new Error('Rua, número, bairro, cidade e estado são obrigatórios.');
        }

        let dadosCompletos = {
            cep: cep ? cep.replace(/\D/g, '') : null,
            numero,
            complemento: complemento || null,
            logradouro: logradouro,
            bairro: bairro,
            cidade: cidade,
            estado: estado,
            latitude: (latitude && !isNaN(parseFloat(latitude))) ? parseFloat(latitude) : null,
            longitude: (longitude && !isNaN(parseFloat(longitude))) ? parseFloat(longitude) : null,
            is_principal: is_principal || false
        };

        // Se o cliente mandou um CEP de 8 dígitos, fazemos uma dupla checagem no backend
        if (dadosCompletos.cep && dadosCompletos.cep.length === 8) {
            try {
                const dadosViaCep = await buscarEnderecoPorCep(dadosCompletos.cep);
                // Preenche caso o frontend tenha falhado em mandar algo
                dadosCompletos.logradouro = dadosCompletos.logradouro || dadosViaCep.logradouro;
                dadosCompletos.bairro = dadosCompletos.bairro || dadosViaCep.bairro;
                dadosCompletos.cidade = dadosCompletos.cidade || dadosViaCep.cidade;
                dadosCompletos.estado = dadosCompletos.estado || dadosViaCep.estado;
            } catch (error) {
                console.warn(`ViaCEP falhou para o CEP ${dadosCompletos.cep}, usando dados manuais.`);
            }
        }

        // 📍 GEOCODIFICAÇÃO AUTOMÁTICA: O cliente nunca precisa preencher coordenadas manualmente!
        if (!dadosCompletos.latitude || !dadosCompletos.longitude) {
            try {
                const coords = await geocodeAddress({
                    logradouro: dadosCompletos.logradouro,
                    numero: dadosCompletos.numero,
                    bairro: dadosCompletos.bairro,
                    cidade: dadosCompletos.cidade,
                    estado: dadosCompletos.estado,
                    cep: dadosCompletos.cep
                });
                if (coords?.latitude && coords?.longitude) {
                    dadosCompletos.latitude = coords.latitude;
                    dadosCompletos.longitude = coords.longitude;
                }
            } catch (geoErr) {
                console.warn('Falha silenciosa ao geocodificar novo endereço:', geoErr.message);
            }
        }

        // 🟢 BÔNUS: Se este for o endereço principal, podemos precisar desmarcar os outros
        if (dadosCompletos.is_principal) {
            await EnderecoModel.resetPrincipal(id_usuario);
        }

        return EnderecoModel.create(id_usuario, dadosCompletos, id_tenant);
    },

    async updateAddress(id_endereco, id_usuario, dadosAtualizacao, id_tenant) {
        if (dadosAtualizacao.cep) {
            dadosAtualizacao.cep = dadosAtualizacao.cep.replace(/\D/g, '');
        }

        // 📍 Se as coordenadas estiverem ausentes na atualização, recalcula automaticamente
        if (!dadosAtualizacao.latitude || !dadosAtualizacao.longitude) {
            try {
                const endAtual = await EnderecoModel.findById(id_endereco, id_usuario, id_tenant);
                const coords = await geocodeAddress({
                    logradouro: dadosAtualizacao.logradouro || endAtual?.logradouro,
                    numero: dadosAtualizacao.numero || endAtual?.numero,
                    bairro: dadosAtualizacao.bairro || endAtual?.bairro,
                    cidade: dadosAtualizacao.cidade || endAtual?.cidade,
                    estado: dadosAtualizacao.estado || endAtual?.estado,
                    cep: dadosAtualizacao.cep || endAtual?.cep
                });
                if (coords?.latitude && coords?.longitude) {
                    dadosAtualizacao.latitude = coords.latitude;
                    dadosAtualizacao.longitude = coords.longitude;
                }
            } catch (geoErr) {
                console.warn('Falha silenciosa ao geocodificar endereço atualizado:', geoErr.message);
            }
        }

        // Se o usuário marcou este como principal na edição, desmarca os outros
        if (dadosAtualizacao.is_principal) {
            await EnderecoModel.resetPrincipal(id_usuario);
        }

        const result = await EnderecoModel.update(id_endereco, id_usuario, dadosAtualizacao, id_tenant);
        if (result.count === 0) {
            throw new Error('Endereço não encontrado ou não pertence a este usuário.');
        }
        return EnderecoModel.findById(id_endereco, id_usuario, id_tenant);
    },

    async deleteAddress(id_endereco, id_usuario, id_tenant) {
        const result = await EnderecoModel.remove(id_endereco, id_usuario, id_tenant);

        if (result.count === 0) {
            throw new Error('Endereço não encontrado ou não pertence a este usuário.');
        }

        return result;
    }
};