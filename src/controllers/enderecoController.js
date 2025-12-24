import EnderecoService from '../services/enderecoService.js'; // Importa o novo serviço

export const listarEnderecos = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const enderecos = await EnderecoService.getUserAddresses(id_usuario);
        res.status(200).json(enderecos);
    } catch (error) {
        next(error);
    }
};

export const adicionarEndereco = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const novoEndereco = await EnderecoService.createAddress(id_usuario, req.body);
        res.status(201).json({ message: 'Endereço adicionado com sucesso!', endereco: novoEndereco });
    } catch (error) {
        next(error);
    }
};

export const removerEndereco = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id: id_endereco } = req.params;

        await EnderecoService.deleteAddress(Number(id_endereco), id_usuario);

        res.status(200).json({ message: 'Endereço removido com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const atualizarEndereco = async (req, res, next) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id: id_endereco } = req.params;
        
        const enderecoAtualizado = await EnderecoService.updateAddress(Number(id_endereco), id_usuario, req.body);
        res.status(200).json({ message: 'Endereço atualizado com sucesso!', endereco: enderecoAtualizado });
    } catch (error) {
        next(error);
    }
};
