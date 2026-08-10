import { cpf } from 'cpf-cnpj-validator';

// Lista de domínios de email temporários conhecidos (Blacklist)
const DISPOSABLE_DOMAINS = [
    '10minutemail.com', 'guerrillamail.com', 'temp-mail.org', 'yopmail.com', 
    'mailinator.com', 'throwawaymail.com', 'getnada.com', 'dispostable.com',
    'tempmail.net', 'sharklasers.com', 'grr.la'
];

export const validarDadosCadastro = (dados) => {
    const erros = [];

    // 1. Validação de Nome (Deve ter Nome e Sobrenome)
    const nomeLimpo = dados.nome.trim();
    if (nomeLimpo.split(' ').length < 2) {
        erros.push("Por favor, informe seu nome completo (Nome e Sobrenome).");
    }
    // Impede nomes falsos óbvios
    if (/^([a-z])\1+$/i.test(nomeLimpo.replace(/\s/g, ''))) { // Ex: "aaaaa"
        erros.push("Nome inválido.");
    }

    // 2. Validação de CPF (Algoritmo Oficial)
    // Remove pontos e traços
    const cpfLimpo = String(dados.cpf).replace(/\D/g, '');
    if (!cpf.isValid(cpfLimpo)) {
        erros.push("O CPF informado é inválido ou não existe.");
    }

    // 3. Validação de E-mail (Anti-Temp Mail)
    const emailDomain = dados.email.split('@')[1];
    if (DISPOSABLE_DOMAINS.includes(emailDomain)) {
        erros.push("Por favor, use um e-mail pessoal válido (Gmail, Hotmail, Outlook, etc). Não aceitamos e-mails temporários.");
    }

    // 4. Validação de Senha (Força Mínima)
    if (dados.senha.length < 6) {
        erros.push("A senha deve ter no mínimo 6 caracteres.");
    }

    return {
        valido: erros.length === 0,
        erros
    };
};