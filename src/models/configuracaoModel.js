import db from '../config/database.js';
import { encrypt, decrypt } from '../services/cryptoService.js';

// ✅ 1. Adicione IMGBB_API_KEY na lista de texto plano
const PLAINTEXT_KEYS = [
    'MERCADOPAGO_PUBLIC_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADO_LIVRE_REFRESH_TOKEN',
    'MERCADO_LIVRE_SECRET_KEY',
    'MERCADO_LIVRE_APP_ID',
    'MERCADO_LIVRE_ACCESS_TOKEN',
    'pix_desconto_ativo',
    'pix_desconto_porcentagem',
    'SITE_TITLE',
    'FAVICON_URL',
    'IMGBB_API_KEY'   // <--- ADICIONADO AQUI!
];

const ConfiguracaoModel = {     
    get: async (chave) => {
        const sql = "SELECT valor FROM configuracoes WHERE chave = ?";
        const [rows] = await db.query(sql, [chave]);
        if (rows.length > 0) {
            const valor = rows[0].valor;
            
            // Verifica se a chave está na lista de exceções
            if (PLAINTEXT_KEYS.includes(chave)) {
                return valor; // Retorna o texto puro (sucesso para o ImgBB)
            }
            
            return decrypt(valor); // Tenta descriptografar (erro se for texto puro não listado)
        }
        return null;
    },

    set: async (chave, valor) => {
        let valorFinal;
        
        // Verifica se deve salvar como texto puro ou criptografado
        if (PLAINTEXT_KEYS.includes(chave)) {
            valorFinal = valor;
        } else {
            valorFinal = encrypt(valor);
        }

        const sql = `
            INSERT INTO configuracoes (chave, valor) 
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE valor = ?
        `;
        await db.query(sql, [chave, valorFinal, valorFinal]);
    }
};

export default ConfiguracaoModel;