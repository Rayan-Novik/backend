import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');
const IV = Buffer.from(process.env.ENCRYPTION_IV, 'utf8');

/**
 * Descriptografa um texto que está em formato hexadecimal.
 * @param {string} encryptedText - O texto criptografado em formato hexadecimal.
 * @returns {string} O texto descriptografado.
 */
export const decrypt = (encryptedText) => {
    if (!encryptedText) {
        return null;
    }
    try {
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, IV);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Erro ao descriptografar:", error);
        return null; // Retorna nulo em caso de falha
    }
};

/**
 * Criptografa um texto e retorna em formato hexadecimal.
 * @param {string} plainText - O texto a ser criptografado.
 * @returns {string} O texto criptografado em formato hexadecimal.
 */
export const encrypt = (plainText) => {
    if (!plainText) {
        return null;
    }
    try {
        const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, IV);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    } catch (error) {
        console.error("Erro ao criptografar:", error);
        return null;
    }""
};
