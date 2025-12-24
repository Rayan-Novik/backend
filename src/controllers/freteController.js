import FreteModel from '../models/freteModel.js';
import CarrinhoModel from '../models/carrinhoModel.js';
import { calcularPrecoPrazo } from 'correios-brasil';
import axios from 'axios';

const getSettingsObject = async () => {
    const settingsRaw = await FreteModel.getSettings();
    return settingsRaw.reduce((obj, item) => (obj[item.chave] = item.valor, obj), {});
};

// --- Funções de Admin ---
export const getFreteSettings = async (req, res, next) => {
    try {
        const settings = await getSettingsObject();
        res.json(settings);
    } catch (error) {
        next(error);
    }
};

export const updateFreteSettings = async (req, res, next) => {
    try {
        const settings = req.body;
        for (const chave in settings) {
            await FreteModel.updateSetting(chave, settings[chave]);
        }
        res.json({ message: 'Configurações de frete atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};


// --- Função Pública para o E-commerce ---
export const calcularFrete = async (req, res, next) => {
    try {
        const { cepDestino } = req.body;
        const id_usuario = req.user.id_usuario;
        const settings = await getSettingsObject();

        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario);
        if (carrinhoItens.length === 0) {
            return res.status(400).json({ message: 'Carrinho vazio.' });
        }

        // Calcula peso, subtotal e dimensões do pacote
        let pesoTotal = 0;
        let subtotal = 0;
        let maiorComprimento = 0;
        let maiorLargura = 0;
        let alturaTotal = 0;

        carrinhoItens.forEach(item => {
            const produto = item.produtos;
            pesoTotal += parseFloat(produto.peso) * item.quantidade;
            subtotal += parseFloat(produto.preco) * item.quantidade;

            // Empilha os itens para calcular a altura total
            alturaTotal += parseFloat(produto.altura) * item.quantidade;
            // Pega o maior comprimento e a maior largura entre todos os itens
            if (parseFloat(produto.comprimento) > maiorComprimento) maiorComprimento = parseFloat(produto.comprimento);
            if (parseFloat(produto.largura) > maiorLargura) maiorLargura = parseFloat(produto.largura);
        });

        // Garante que as dimensões mínimas dos Correios sejam respeitadas
        const comprimentoFinal = Math.max(maiorComprimento, 16);
        const larguraFinal = Math.max(maiorLargura, 11);
        const alturaFinal = Math.max(alturaTotal, 2);

        const { data: origemData } = await axios.get(`https://viacep.com.br/ws/${settings.CEP_ORIGEM}/json/`);
        const { data: destinoData } = await axios.get(`https://viacep.com.br/ws/${cepDestino}/json/`);

        if (origemData.erro || destinoData.erro) throw new Error("CEP inválido.");

        const isLocal = origemData.localidade === destinoData.localidade && origemData.uf === destinoData.uf;

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

                    sCepOrigem: settings.CEP_ORIGEM.replace('-', ''),
                    sCepDestino: cepDestino.replace('-', ''),
                    nVlPeso: String(pesoTotal),
                    nCdFormato: '1',
                    nVlComprimento: String(comprimentoFinal),
                    nVlAltura: String(alturaFinal),
                    nVlLargura: String(larguraFinal),
                    nVlDiametro: '0',

                    // ✅ USE OS CÓDIGOS DE SERVIÇO DO SEU CONTRATO
                    // (Estes são exemplos, verifique os seus)
                    nCdServico: ['04014', '04510'], // Exemplo: SEDEX com contrato e PAC com contrato
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
        res.status(400).json({ message: 'Não foi possível calcular o frete. Verifique o CEP.' });
    }
};
