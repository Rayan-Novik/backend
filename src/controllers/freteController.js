import FreteModel from '../models/freteModel.js';
import CarrinhoModel from '../models/carrinhoModel.js';
import { calcularPrecoPrazo } from 'correios-brasil';
import axios from 'axios';

const getSettingsObject = async (id_tenant) => {
    const settingsRaw = await FreteModel.getSettings(id_tenant);
    return settingsRaw.reduce((obj, item) => (obj[item.chave] = item.valor, obj), {});
};

export const getFreteSettings = async (req, res, next) => {
    try {
        const settings = await getSettingsObject(req.tenantId);
        res.json(settings);
    } catch (error) {
        next(error);
    }
};

export const updateFreteSettings = async (req, res, next) => {
    try {
        const settings = req.body;
        for (const chave in settings) {
            await FreteModel.updateSetting(chave, settings[chave], req.tenantId);
        }
        res.json({ message: 'Configurações de frete atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const calcularFrete = async (req, res, next) => {
    try {
        const { cepDestino } = req.body;
        const id_usuario = req.user.id_usuario;
        const id_tenant = req.tenantId;
        const settings = await getSettingsObject(id_tenant);

        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario, id_tenant);
        if (carrinhoItens.length === 0) {
            return res.status(400).json({ message: 'Carrinho vazio.' });
        }

        let pesoTotal = 0;
        let subtotal = 0;
        let maiorComprimento = 0;
        let maiorLargura = 0;
        let alturaTotal = 0;

        carrinhoItens.forEach(item => {
            const produto = item.produtos;
            pesoTotal += parseFloat(produto.peso) * item.quantidade;
            subtotal += parseFloat(produto.preco) * item.quantidade;

            alturaTotal += parseFloat(produto.altura) * item.quantidade;
            if (parseFloat(produto.comprimento) > maiorComprimento) maiorComprimento = parseFloat(produto.comprimento);
            if (parseFloat(produto.largura) > maiorLargura) maiorLargura = parseFloat(produto.largura);
        });

        const comprimentoFinal = Math.max(maiorComprimento, 16);
        const larguraFinal = Math.max(maiorLargura, 11);
        const alturaFinal = Math.max(alturaTotal, 2);

        const cepOrigemLimpo = settings.CEP_ORIGEM ? settings.CEP_ORIGEM.replace(/\D/g, '') : '';
        const { data: origemData } = await axios.get(`https://viacep.com.br/ws/${cepOrigemLimpo}/json/`).catch(() => ({ data: { erro: true } }));

        const cepDestinoLimpo = cepDestino ? cepDestino.replace(/\D/g, '') : '';
        let destinoData = { erro: true };

        if (cepDestinoLimpo.length === 8) {
            try {
                const response = await axios.get(`https://viacep.com.br/ws/${cepDestinoLimpo}/json/`);
                destinoData = response.data;
            } catch (e) {
                console.warn("Aviso: ViaCEP falhou para o destino:", cepDestinoLimpo);
            }
        }

        let isLocal = false;
        if (!origemData.erro && !destinoData.erro) {
            isLocal = origemData.localidade === destinoData.localidade && origemData.uf === destinoData.uf;
        } else {
            isLocal = true; 
        }

        if (isLocal) {
            const valorMinimoGratis = parseFloat(settings.VALOR_MINIMO_FRETE_GRATIS_LOCAL);
            if (valorMinimoGratis > 0 && subtotal >= valorMinimoGratis) {
                return res.json([{ tipo: 'Frete Grátis Local', custo: 0, prazo: '1-2 dias' }]);
            }
            const custoLocal = parseFloat(settings.CUSTO_FRETE_LOCAL);
            return res.json([{ tipo: 'Entrega Local', custo: custoLocal, prazo: '1-2 dias' }]);
        } else {
            const valorMinimoGratis = parseFloat(settings.VALOR_MINIMO_FRETE_GRATIS_NACIONAL);
            if (valorMinimoGratis > 0 && subtotal >= valorMinimoGratis) {
                return res.json([{ tipo: 'Frete Grátis Nacional', custo: 0, prazo: '5-10 dias' }]);
            }

            if (settings.TIPO_CALCULO_NACIONAL === 'AUTOMATICO') {
                const args = {
                    nCdEmpresa: settings.CORREIOS_COD_EMPRESA || '',
                    sDsSenha: settings.CORREIOS_SENHA || '',
                    sCepOrigem: cepOrigemLimpo,
                    sCepDestino: cepDestinoLimpo,
                    nVlPeso: String(pesoTotal),
                    nCdFormato: '1',
                    nVlComprimento: String(comprimentoFinal),
                    nVlAltura: String(alturaFinal),
                    nVlLargura: String(larguraFinal),
                    nVlDiametro: '0',
                    nCdServico: ['04014', '04510'], 
                };

                try {
                    const fretes = await calcularPrecoPrazo(args);
                    const respostaFormatada = fretes.filter(f => f.sValor).map(f => ({
                        tipo: f.sServico === '04014' ? 'SEDEX' : 'PAC',
                        custo: parseFloat(f.sValor.replace(',', '.')),
                        prazo: `${f.sPrazoEntrega} dias`
                    }));
                    if (respostaFormatada.length === 0) throw new Error("Correios não retornou opções válidas.");
                    return res.json(respostaFormatada);
                } catch (correiosError) {
                    console.warn("AVISO: API dos Correios falhou. A usar o frete fixo como fallback.", correiosError.message);
                    const custoNacionalFixo = parseFloat(settings.CUSTO_FRETE_NACIONAL_FIXO);
                    return res.json([{ tipo: 'Entrega Padrão (Fixo)', custo: custoNacionalFixo, prazo: '7-15 dias' }]);
                }
            } else {
                const custoNacional = parseFloat(settings.CUSTO_FRETE_NACIONAL_FIXO);
                return res.json([{ tipo: 'Entrega Nacional (Fixo)', custo: custoNacional, prazo: '7-10 dias' }]);
            }
        }
    } catch (error) {
        console.error("ERRO GERAL AO CALCULAR FRETE:", error);
        return res.json([{ tipo: 'Entrega Padrão', custo: 15.00, prazo: '1-3 dias' }]);
    }
};