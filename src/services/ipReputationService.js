import axios from 'axios';
import ConfiguracaoModel from '../models/configuracaoModel.js'; 

const FALLBACK_KEY = '262093-095x54-u5h426-o40671'; 

export const analisarIP = async (ip, id_tenant) => {
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168') || ip.includes('localhost')) {
        return { is_vpn: false, risk_score: 0, country: 'XX', provider: 'Localhost' };
    }

    try {
        // 🛡️ BLINDAGEM: Só busca no banco se tiver o id_tenant, senão usa a chave padrão.
        let apiKey = FALLBACK_KEY;
        
        if (id_tenant) {
            const configKey = await ConfiguracaoModel.get('PROXYCHECK_API_KEY', id_tenant);
            if (configKey) apiKey = configKey;
        }
        
        const url = `https://proxycheck.io/v2/${ip}?key=${apiKey}&vpn=1&asn=1`;

        const { data } = await axios.get(url);

        if (data.status === 'ok' || data.status === 'warning') {
            const ipData = data[ip]; 

            if (!ipData) return { is_vpn: false, risk_score: 0, country: 'BR' };

            const isVpn = ipData.proxy === 'yes';
            const riskScore = isVpn ? 90 : 0; 

            return {
                is_vpn: isVpn,
                risk_score: riskScore,
                country: ipData.iso || 'BR',
                provider: ipData.provider || 'Desconhecido'
            };
        }

        return { is_vpn: false, risk_score: 0, country: 'BR' };

    } catch (error) {
        console.error("Erro no ProxyCheck:", error.message);
        return { is_vpn: false, risk_score: 0, country: 'BR' };
    }
};