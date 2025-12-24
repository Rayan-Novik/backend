import axios from 'axios';

export const buscarEnderecoPorCep = async (cep) => {
  try {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      throw new Error('Formato de CEP inválido.');
    }

    const { data } = await axios.get(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }

    return {
      cep: data.cep,
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };
  } catch (error) {
    // Lança o erro para a camada de serviço (enderecoService) tratar
    throw error;
  }
};