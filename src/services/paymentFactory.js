// services/paymentFactory.js
import * as mercadoPagoService from './mercadoPagoService'; // Note que mudaremos o nome do service original
// import * as interService from './interAdapter.js'; // Futuro banco

export const processarPagamento = async (provider, dadosPagamento) => {
    switch (provider) {
        case 'mercadopago':
            return await mercadoPagoService.processar(dadosPagamento);
        // case 'inter':
        //    return await interService.processar(dadosPagamento);
        default:
            throw new Error('Provedor de pagamento não suportado.');
    }
};