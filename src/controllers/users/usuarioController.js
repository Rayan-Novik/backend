import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto'; // 🟢 Forçando o pacote nativo do Node para evitar crashes
import { OAuth2Client } from 'google-auth-library';
import generateToken from '../../utils/generateToken.js';
import { encrypt, decrypt } from '../../services/cryptoService.js';
import { sendPasswordResetEmail } from '../../services/emailService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/sender.js';
import { validarDadosCadastro } from '../../utils/validators.js';
import { analisarIP } from '../../services/ipReputationService.js';

const prisma = new PrismaClient();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const getAllUsuarios = async (req, res, next) => {
    try {
        const usuarios = await prisma.usuarios.findMany({
            where: { id_tenant: req.tenantId },
            select: {
                id_usuario: true,
                nome_completo: true,
                email: true,
                is_verified: true,
                criado_em: true
            }
        });
        res.status(200).json(usuarios);
    } catch (error) {
        next(error);
    }
};

export const getUsuarioById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'ID do usuário é obrigatório.' });

        const idNumerico = Number(id);
        if (isNaN(idNumerico)) return res.status(400).json({ message: 'ID inválido. Deve ser um número.' });

        const usuario = await prisma.usuarios.findFirst({
            where: { id_usuario: idNumerico, id_tenant: req.tenantId }
        });

        if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });

        delete usuario.hash_senha;
        delete usuario.cpf_criptografado; 
        
        res.status(200).json(usuario);
    } catch (error) {
        next(error);
    }
};

export const registrarUsuario = async (req, res, next) => {
    try {
        const { nome, email, senha, cpf, telefone, data_nascimento, id_tenant: idTenantBody } = req.body;
        const id_tenant = req.tenantId || Number(idTenantBody);

        if (!id_tenant || isNaN(id_tenant)) {
            return res.status(400).json({ message: "Falha de segurança: Loja (Tenant) não identificada." });
        }

        const ipCliente = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
        const dadosIP = await analisarIP(ipCliente, id_tenant);

        if (dadosIP.is_vpn) {
            return res.status(403).json({ message: "Cadastro não permitido. Uso de VPN detectado." });
        }

        const validacao = validarDadosCadastro({ nome, cpf, email, senha });
        if (!validacao.valido) {
            return res.status(400).json({ message: "Dados inválidos ou suspeitos.", errors: validacao.erros });
        }

        const usuarioExiste = await prisma.usuarios.findFirst({
            where: { email: email, id_tenant: id_tenant }
        });
        
        if (usuarioExiste) {
            return res.status(400).json({ message: 'Usuário já cadastrado com este e-mail nesta loja.' });
        }

        let cpfCriptografado = null;
        let telefoneCriptografado = null;
        let dataNascimentoCriptografada = null;

        if (cpf) {
            const cpfLimpo = cpf.replace(/\D/g, ''); 
            const cpfHash = encrypt(cpfLimpo);
            const cpfExiste = await prisma.usuarios.findFirst({
                where: { cpf_criptografado: cpfHash, id_tenant: id_tenant, NOT: { cpf_criptografado: null } }
            });
            if (cpfExiste) return res.status(400).json({ message: 'Este CPF já está cadastrado nesta loja.' });
            cpfCriptografado = cpfHash;
        }

        if (telefone) telefoneCriptografado = encrypt(telefone.replace(/\D/g, ''));
        if (data_nascimento) dataNascimentoCriptografada = encrypt(data_nascimento);

        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senha, salt);

        const novoUsuario = await prisma.usuarios.create({ 
            data: {
                id_tenant: id_tenant, 
                nome_completo: nome,
                email: email,
                hash_senha: senhaHasheada,
                cpf_criptografado: cpfCriptografado,
                telefone_criptografado: telefoneCriptografado,
                data_nascimento_criptografada: dataNascimentoCriptografada,
                score_reputacao: dadosIP.country === 'BR' ? 50 : 20
            }
        });

        res.status(201).json({
            id_usuario: novoUsuario.id_usuario,
            nome_completo: novoUsuario.nome_completo,
            email: novoUsuario.email,
            role: 'CLIENTE',
            token: generateToken(novoUsuario.id_usuario, id_tenant),
        });
    } catch (error) {
        next(error);
    }
};

export const registrarUsuarioPDV = async (req, res, next) => {
    try {
        let { nome_completo, email, cpf, telefone, senha } = req.body;
        const id_tenant = req.tenantId;

        if (!email || email.trim() === '') {
            email = `pdv.${Date.now()}@cliente.sem.email`;
        }

        const usuarioExiste = await prisma.usuarios.findFirst({
            where: { email: email, id_tenant: id_tenant }
        });

        if (usuarioExiste) {
            return res.status(400).json({ message: 'Usuário já cadastrado com este e-mail nesta loja.' });
        }

        let cpfCriptografado = null;
        let telefoneCriptografado = null;

        if (cpf) {
            const cpfLimpo = cpf.replace(/\D/g, '');
            cpfCriptografado = encrypt(cpfLimpo); 
            const cpfExiste = await prisma.usuarios.findFirst({
                where: { cpf_criptografado: cpfCriptografado, id_tenant: id_tenant }
            });
            if (cpfExiste) return res.status(400).json({ message: 'Cliente já existe com este CPF nesta loja.' });
        }

        if (telefone) telefoneCriptografado = encrypt(telefone);
        // 🟢 Corrigido para não usar randomBytes
        if (!senha) senha = crypto.randomUUID().substring(0, 8);

        const salt = await bcrypt.genSalt(10);
        const hash_senha = await bcrypt.hash(senha, salt);

        const novoUsuario = await prisma.usuarios.create({
            data: {
                id_tenant: id_tenant,
                nome_completo,
                email,
                hash_senha,
                cpf_criptografado: cpfCriptografado,
                telefone_criptografado: telefoneCriptografado,
                score_reputacao: 50,
                criado_em: new Date()
            }
        });

        res.status(201).json({
            id_usuario: novoUsuario.id_usuario,
            nome_completo: novoUsuario.nome_completo,
            email: novoUsuario.email
        });

    } catch (error) {
        next(error);
    }
};

export const loginClienteEcommerce = async (req, res, next) => {
    try {
        const { email: loginInput, senha } = req.body;
        const id_tenant = req.tenantId; 

        if (!id_tenant) return res.status(400).json({ message: "Não foi possível identificar a loja." });

        let cliente;
        if (loginInput.includes('@')) {
            cliente = await prisma.usuarios.findFirst({
                where: { email: loginInput, id_tenant: id_tenant }
            });
        } else {
            const inputLimpo = loginInput.replace(/\D/g, '');
            const hashLimpo = encrypt(inputLimpo);
            cliente = await prisma.usuarios.findFirst({
                where: { cpf_criptografado: hashLimpo, id_tenant: id_tenant }
            });

            if (!cliente && inputLimpo.length === 11) {
                const hashFormatado = encrypt(inputLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'));
                cliente = await prisma.usuarios.findFirst({
                    where: { cpf_criptografado: hashFormatado, id_tenant: id_tenant }
                });
            }
        }

        if (!cliente) {
            return res.status(404).json({ message: "Conta não encontrada nesta loja. Tente se cadastrar." });
        }

        const isMatch = await bcrypt.compare(senha, cliente.hash_senha);
        if (!isMatch) return res.status(401).json({ message: "Senha incorreta." });

        res.json({
            id_usuario: cliente.id_usuario,
            nome_completo: cliente.nome_completo,
            email: cliente.email,
            token: generateToken(cliente.id_usuario, id_tenant),
            role: 'CLIENTE'
        });

    } catch (error) {
        next(error);
    }
};

// =========================================================
// 🟢 LOGIN SEGURO PELO GOOGLE
// =========================================================
export const googleLogin = async (req, res, next) => {
    try {
        // O Frontend manda apenas o token e qual a loja
        const { token, tenant } = req.body;
        const id_tenant = req.tenantId || Number(tenant);

        if (!id_tenant) {
            return res.status(400).json({ message: "Falha de segurança: Loja não identificada." });
        }

        // 1. O BACKEND vai no servidor do Google validar o token
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            return res.status(401).json({ message: 'Token do Google inválido ou expirado.' });
        }

        const googleData = await response.json();
        const emailGoogle = googleData.email;
        const nomeGoogle = googleData.name;

        if (!emailGoogle) {
            return res.status(400).json({ message: 'Não foi possível resgatar o e-mail do Google.' });
        }

        // 2. Procura se o cliente já existe na SUA LOJA
        let usuario = await prisma.usuarios.findFirst({
            where: { email: emailGoogle, id_tenant: id_tenant }
        });

        // 3. Se existe, faz o login e devolve o token do seu sistema
        if (usuario) {
            return res.json({
                id_usuario: usuario.id_usuario,
                nome_completo: usuario.nome_completo,
                email: usuario.email,
                token: generateToken(usuario.id_usuario, id_tenant),
                role: 'CLIENTE'
            });
        } 
        
        // 4. Se não existe, cria a conta na hora com uma senha aleatória blindada
        const senhaAleatoria = crypto.randomUUID();
        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senhaAleatoria, salt);

        const novoUsuario = await prisma.usuarios.create({
            data: {
                id_tenant: id_tenant,
                nome_completo: nomeGoogle,
                email: emailGoogle,
                hash_senha: senhaHasheada,
                score_reputacao: 60,
                is_verified: true 
            }
        });

        return res.status(201).json({
            id_usuario: novoUsuario.id_usuario,
            nome_completo: novoUsuario.nome_completo,
            email: novoUsuario.email,
            token: generateToken(novoUsuario.id_usuario, id_tenant),
            role: 'CLIENTE'
        });

    } catch (error) {
        next(error);
    }
};

export const getUsuarioProfile = async (req, res, next) => {
    try {
        const user = await prisma.usuarios.findFirst({
            where: { id_usuario: req.user.id_usuario, id_tenant: req.tenantId }
        });

        if (user) {
            res.json({
                id_usuario: user.id_usuario,
                nome_completo: user.nome_completo,
                email: user.email,
                telefone: user.telefone_criptografado ? decrypt(user.telefone_criptografado) : '',
                cpf: user.cpf_criptografado ? decrypt(user.cpf_criptografado) : '',
                data_nascimento: user.data_nascimento_criptografada ? decrypt(user.data_nascimento_criptografada) : '',
                score_reputacao: user.score_reputacao
            });
        } else {
            res.status(404).json({ message: 'Usuário não encontrado.' });
        }
    } catch (error) {
        next(error);
    }
};

export const updateUsuarioProfile = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const id_tenant = req.tenantId;
        const { nome, email, telefone, cpf, data_nascimento, senhaAtual, novaSenha } = req.body;
        
        const currentUser = await prisma.usuarios.findFirst({
            where: { id_usuario: userId, id_tenant: id_tenant }
        });

        if (!currentUser) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (email && email !== currentUser.email) {
            const emailExiste = await prisma.usuarios.findFirst({
                where: { email: email, id_tenant: id_tenant }
            });
            if (emailExiste) return res.status(400).json({ message: 'E-mail já está em uso.' });
        }

        let cpfFinal = currentUser.cpf_criptografado; 
        if (!currentUser.cpf_criptografado && cpf) {
            const cpfHash = encrypt(cpf.replace(/\D/g, ''));
            const cpfExiste = await prisma.usuarios.findFirst({
                where: { cpf_criptografado: cpfHash, id_tenant: id_tenant, NOT: { cpf_criptografado: null } }
            });
            if (cpfExiste) return res.status(400).json({ message: 'CPF já cadastrado.' });
            cpfFinal = cpfHash; 
        }

        let hashNovaSenha = currentUser.hash_senha; 
        if (novaSenha) {
            if (!senhaAtual) return res.status(400).json({ message: 'Informe a senha atual.' });
            const senhaConfere = await bcrypt.compare(senhaAtual, currentUser.hash_senha);
            if (!senhaConfere) return res.status(401).json({ message: 'Senha atual incorreta.' });
            const salt = await bcrypt.genSalt(10);
            hashNovaSenha = await bcrypt.hash(novaSenha, salt);
        }

        const updatedUser = await prisma.usuarios.update({
            where: { id_usuario: userId },
            data: {
                nome_completo: nome || currentUser.nome_completo,
                email: email || currentUser.email,
                telefone_criptografado: telefone ? encrypt(telefone) : currentUser.telefone_criptografado,
                cpf_criptografado: cpfFinal,
                data_nascimento_criptografada: data_nascimento ? encrypt(data_nascimento) : currentUser.data_nascimento_criptografada,
                hash_senha: hashNovaSenha 
            }
        });
        
        res.json({
            id_usuario: updatedUser.id_usuario,
            nome_completo: updatedUser.nome_completo,
            email: updatedUser.email,
            token: generateToken(updatedUser.id_usuario, id_tenant),
        });
    } catch (error) {
        next(error);
    }
};

export const updateUsuarioByAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;
        const { nome_completo, email, senha, cpfConfirmacao } = req.body;

        const usuarioAtual = await prisma.usuarios.findFirst({
            where: { id_usuario: Number(id), id_tenant: id_tenant }
        });

        if (!usuarioAtual) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (!cpfConfirmacao) {
            return res.status(400).json({ message: 'Confirme o CPF para alterar.' });
        }
        
        const cpfHash = encrypt(cpfConfirmacao.replace(/\D/g, ''));
        if (usuarioAtual.cpf_criptografado !== cpfHash) {
            return res.status(403).json({ message: 'CPF incorreto.' });
        }

        const dadosParaAtualizar = {
            nome_completo: nome_completo || usuarioAtual.nome_completo,
            email: email || usuarioAtual.email,
        };

        if (senha) {
            const salt = await bcrypt.genSalt(10);
            dadosParaAtualizar.hash_senha = await bcrypt.hash(senha, salt);
        }

        const updatedUser = await prisma.usuarios.update({
            where: { id_usuario: Number(id) },
            data: dadosParaAtualizar
        });

        res.json({
            id_usuario: updatedUser.id_usuario,
            nome_completo: updatedUser.nome_completo,
            email: updatedUser.email
        });

    } catch (error) {
        next(error);
    }
};

export const deleteUsuario = async (req, res, next) => {
    try {
        const { id } = req.params;
        const id_tenant = req.tenantId;
        const { cpfConfirmacao } = req.body || {}; 

        const usuario = await prisma.usuarios.findFirst({
            where: { id_usuario: Number(id), id_tenant: id_tenant }
        });

        if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });

        if (!cpfConfirmacao) return res.status(400).json({ message: 'Confirme o CPF para excluir.' });
        
        const cpfHash = encrypt(cpfConfirmacao.replace(/\D/g, ''));
        if (usuario.cpf_criptografado !== cpfHash) return res.status(403).json({ message: 'CPF incorreto.' });

        await prisma.usuarios.delete({ where: { id_usuario: Number(id) } });
        res.json({ message: 'Usuário removido com sucesso' });

    } catch (error) {
        next(error);
    }
};

export const forgotPassword = async (req, res, next) => {
    try {
        const { method, email, phone } = req.body;
        const id_tenant = req.tenantId;
        let usuario = null;

        if (method === 'email' && email) {
            usuario = await prisma.usuarios.findFirst({ where: { email: email, id_tenant: id_tenant } });
            if (!usuario) return res.status(200).json({ message: 'Se o e-mail existir, o link foi enviado.' }); 
        } else if (method === 'whatsapp' && phone) {
            const hashPhone = encrypt(phone);
            usuario = await prisma.usuarios.findFirst({ where: { telefone_criptografado: hashPhone, id_tenant: id_tenant } });
            if (!usuario) return res.status(404).json({ message: 'Nenhum usuário com este número.' });
        } else {
            return res.status(400).json({ message: 'Informe e-mail ou WhatsApp.' });
        }

        // 🟢 Corrigido para não usar randomBytes
        const resetToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expires = new Date(Date.now() + 60 * 60 * 1000); 

        await prisma.usuarios.update({
            where: { id_usuario: usuario.id_usuario },
            data: { reset_password_token: resetToken, reset_password_expires: expires }
        });
        
        const tenantInfo = await prisma.tenants.findUnique({
            where: { id: id_tenant },
            select: { slug: true, dominio_customizado: true }
        });

        let baseDomain = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '') : 'ararinhacloud.shop';
        let resetUrl = tenantInfo?.dominio_customizado ? `https://${tenantInfo.dominio_customizado}/reset-password/${resetToken}` : `https://${tenantInfo?.slug}.${baseDomain}/reset-password/${resetToken}`;

        if (method === 'email') {
            await sendPasswordResetEmail(usuario.email, usuario.nome_completo, resetUrl, id_tenant);
            return res.status(200).json({ message: 'Link enviado para o e-mail!' });
        } else {
            const msgWhatsApp = `🔐 Olá *${usuario.nome_completo.split(' ')[0]}*!\n\nLink para redefinir senha (válido por 1 hora):\n${resetUrl}`;
            const enviou = await sendWhatsAppMessage(phone, { text: msgWhatsApp }, id_tenant);
            if (enviou) return res.status(200).json({ message: 'Link enviado no WhatsApp!' });
            return res.status(500).json({ message: 'Erro ao enviar WhatsApp.' });
        }
    } catch (error) {
        next(error);
    }
};

export const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { senha } = req.body;
        const usuario = await prisma.usuarios.findFirst({
            where: { reset_password_token: token, reset_password_expires: { gt: new Date() }, id_tenant: req.tenantId }
        });

        if (!usuario) return res.status(400).json({ message: 'Token inválido ou expirado.' });

        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senha, salt);
        
        await prisma.usuarios.update({
            where: { id_usuario: usuario.id_usuario },
            data: { hash_senha: senhaHasheada, reset_password_token: null, reset_password_expires: null }
        });

        res.status(200).json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const searchUsuarios = async (req, res, next) => {
    try {
        const { term } = req.params; 
        const id_tenant = req.tenantId;

        if (!term) return res.json([]); 

        const termoLimpo = term.replace(/\D/g, ''); 
        
        const usuariosBusca = await prisma.usuarios.findMany({
            where: {
                id_tenant: id_tenant,
                OR: [
                    { nome_completo: { contains: term } },
                    { email: { contains: term } }
                ]
            }
        });
        
        let resultadosFinais = [...usuariosBusca];
        const idsJaAdicionados = new Set(usuariosBusca.map(u => u.id_usuario));

        if (termoLimpo.length >= 3) {
            const todosComCpf = await prisma.usuarios.findMany({
                where: { id_tenant: id_tenant, cpf_criptografado: { not: null } },
                select: { id_usuario: true, nome_completo: true, email: true, cpf_criptografado: true }
            });

            const matchesCpf = todosComCpf.filter(user => {
                try {
                    return decrypt(user.cpf_criptografado).replace(/\D/g, '').includes(termoLimpo);
                } catch (e) { return false; }
            });

            matchesCpf.forEach(user => {
                if (!idsJaAdicionados.has(user.id_usuario)) {
                    resultadosFinais.push(user);
                    idsJaAdicionados.add(user.id_usuario);
                }
            });
        }

        const resposta = resultadosFinais.map(u => ({
            id_usuario: u.id_usuario,
            nome: u.nome_completo,
            nome_completo: u.nome_completo,
            email: u.email,
            role: 'CLIENTE',
            cpf: u.cpf_criptografado ? decrypt(u.cpf_criptografado) : null
        }));

        res.status(200).json(resposta);

    } catch (error) {
        next(error);
    }
};