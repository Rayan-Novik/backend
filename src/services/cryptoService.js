import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');
const IV = Buffer.from(process.env.ENCRYPTION_IV, 'utf8');

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
        // 🟢 SE DER ERRO AO DESCRIPTOGRAFAR, ASSUME QUE FOI SALVO EM TEXTO PLANO E RETORNA ELE MESMO!
        // Isso impede que o erro 'wrong final block length' quebre a aplicação.
        return encryptedText; 
    }
};

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
        return plainText; // Se falhar a criptografia por algum motivo, retorna o texto puro pra não perder o dado
    }
};