import PedidoModel from '../models/pedidoModel.js';
import { analisarIP } from './ipReputationService.js';

export const analisarRisco = async (usuario, dadosPedido, carrinhoItens, ipCliente, id_tenant) => {
    let scoreRisco = 0; 
    const regrasVioladas = [];
    const regrasAprovadas = [];

    // 🚀 CORREÇÃO AQUI: Passando o id_tenant para o IP Service!
    const dadosIP = await analisarIP(ipCliente, id_tenant);
    
    if (dadosIP.is_vpn) {
        scoreRisco += 80; 
        regrasVioladas.push(`USO_DE_VPN_DETECTADO (${dadosIP.provider})`);
    }

    if (dadosIP.country !== 'BR' && dadosIP.country !== 'XX') { 
        scoreRisco += 30; 
        regrasVioladas.push(`IP_INTERNACIONAL_${dadosIP.country}`);
    }

    const dataCriacao = usuario.criado_em ? new Date(usuario.criado_em) : new Date();
    const diasDesdeCriacao = (new Date() - dataCriacao) / (1000 * 60 * 60 * 24);
    
    if (diasDesdeCriacao < 1) {
        scoreRisco += 25; 
        regrasVioladas.push('CONTA_RECEM_CRIADA_HOJE');
    } else if (diasDesdeCriacao > 90) {
        scoreRisco -= 10; 
        regrasAprovadas.push('CLIENTE_ANTIGO');
    }

    if ((usuario.score_reputacao && usuario.score_reputacao > 70) || (usuario.total_pedidos_pagos && usuario.total_pedidos_pagos > 3)) {
        scoreRisco -= 40; 
        regrasAprovadas.push('CLIENTE_CONFIÁVEL_HISTORICO');
    }

    let limiteValor = 3000;
    if (usuario.is_verified || (usuario.total_pedidos_pagos && usuario.total_pedidos_pagos > 5)) limiteValor = 8000; 

    if (dadosPedido.totalPrice > limiteValor) {
        scoreRisco += 30;
        regrasVioladas.push('VALOR_ACIMA_DO_LIMITE_PERFIL');
    }

    const itensRepetidosCaros = carrinhoItens.some(item => item.quantidade >= 3 && item.produtos.preco > 1000);
    if (itensRepetidosCaros) {
        scoreRisco += 40;
        regrasVioladas.push('QUANTIDADE_SUSPEITA_ITEM_CARO');
    }

    const pedidosHoje = await PedidoModel.countUserOrdersLast24h(usuario.id_usuario, id_tenant);
    if (pedidosHoje > 3) {
        scoreRisco += 50;
        regrasVioladas.push('COMPORTAMENTO_VELOCIDADE_ALTA');
    }

    scoreRisco = Math.max(0, Math.min(100, scoreRisco));

    let acao = 'APROVAR';
    
    if (scoreRisco >= 85) {
        acao = 'BLOQUEAR'; 
    } else if (scoreRisco >= 50) {
        acao = 'REVISAO'; 
    }

    console.log(`[Tenant ${id_tenant}] 🛡️ Anti-fraude: User ${usuario.id_usuario} | Score: ${scoreRisco} | Ação: ${acao}`);
    if(regrasVioladas.length > 0) console.log(`[Tenant ${id_tenant}] ⚠️ Regras Violadas:`, regrasVioladas);

    return {
        score: scoreRisco,
        acao, 
        regrasVioladas,
        regrasAprovadas,
        geo: dadosIP.country,
        provider: dadosIP.provider
    };
};