import db from '../config/database.js';
import { encrypt, decrypt } from '../services/cryptoService.js';

// ✅ 1. Lista de chaves que NÃO devem ser criptografadas.
const PLAINTEXT_KEYS = [
    'MERCADOPAGO_PUBLIC_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADO_LIVRE_REFRESH_TOKEN',
    'MERCADO_LIVRE_SECRET_KEY',
    'MERCADO_LIVRE_APP_ID',
    'MERCADO_LIVRE_ACCESS_TOKEN'
];

const ConfiguracaoModel = {     
    /**
     * Busca uma configuração pela sua chave.
     * Descriptografa o valor, a menos que a chave esteja na lista de exceções.
     */
    get: async (chave) => {
        const sql = "SELECT valor FROM configuracoes WHERE chave = ?";
        const [rows] = await db.query(sql, [chave]);
        if (rows.length > 0) {
            const valor = rows[0].valor;
            // ✅ 2. Se a chave estiver na lista, retorna o valor puro. Caso contrário, descriptografa.
            if (PLAINTEXT_KEYS.includes(chave)) {
                return valor;
            }
            return decrypt(valor);
        }
        return null;
    },

    /**
     * Cria ou atualiza uma configuração.
     * Criptografa o valor, a menos que a chave esteja na lista de exceções.
     */
    set: async (chave, valor) => {
        let valorFinal;

        // ✅ 3. Se a chave estiver na lista, usa o valor puro. Caso contrário, criptografa.
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

