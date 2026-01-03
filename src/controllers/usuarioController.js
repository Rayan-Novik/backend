import Usuario from '../models/usuarioModel.js';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import generateToken from '../utils/generateToken.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { encrypt, decrypt } from '../services/cryptoService.js';
import { sendPasswordResetEmail } from '../services/emailService.js';
import { OAuth2Client } from 'google-auth-library';

export const getGoogleClientId = async (req, res, next) => {
    try {
        const clientId = await ConfiguracaoModel.get('GOOGLE_CLIENT_ID');
        res.json({ clientId: clientId || '' });
    } catch (error) {
        next(error);
    }
};

// @desc    Salva o Client ID do Google (ADMIN - Usado no Painel de Configurações)
export const updateGoogleClientId = async (req, res, next) => {
    try {
        const { clientId } = req.body;
        
        // Salva ou atualiza no banco
        await ConfiguracaoModel.set('GOOGLE_CLIENT_ID', clientId);
        
        res.json({ message: 'Google Client ID atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar todos os usuários (Admin)
export const getAllUsuarios = async (req, res, next) => {
    try {
        const usuarios = await Usuario.findAll();
        res.status(200).json(usuarios);
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar usuário por ID (Admin)
export const getUsuarioById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const usuario = await Usuario.findById(Number(id)); // Prisma oikotevẽ número
        if (!usuario) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        // Oculta a senha antes de enviar
        delete usuario.hash_senha;
        res.status(200).json(usuario);
    } catch (error) {
        next(error);
    }
};

export const registrarUsuarioPDV = async (req, res, next) => {
    try {
        // O PDV envia 'nome_completo'
        const { nome_completo, email } = req.body;
        let { senha } = req.body;

        const usuarioExiste = await Usuario.findByEmail(email);
        if (usuarioExiste) {
            res.status(400);
            throw new Error('Usuário já cadastrado com este e-mail.');
        }

        // Se nenhuma senha foi enviada (padrão para o PDV), gera uma senha aleatória e segura
        if (!senha) {
            senha = crypto.randomBytes(16).toString('hex');
            console.log(`Senha temporária gerada para o cliente do PDV: ${email}`);
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senha, salt);

        // O seu model 'create' espera a propriedade 'nome'
        const novoUsuario = await Usuario.create({ nome: nome_completo, email, senhaHasheada });

        if (novoUsuario) {
            // Retorna os dados do novo usuário para o frontend do PDV
            res.status(201).json({
                id_usuario: novoUsuario.id_usuario,
                nome_completo: novoUsuario.nome_completo,
                email: novoUsuario.email,
            });
        } else {
            res.status(400);
            throw new Error('Dados inválidos para criar usuário.');
        }
    } catch (error) {
        next(error);
    }
};


// @desc    Registrar um novo usuário
export const registrarUsuario = async (req, res, next) => {
    try {
        const { nome, email, senha } = req.body;
        const usuarioExiste = await Usuario.findByEmail(email);
        if (usuarioExiste) {
            res.status(400);
            throw new Error('Usuário já cadastrado com este e-mail.');
        }

        // A lógica de criar o hash da senha agora fica aqui, no controller
        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senha, salt);

        const novoUsuario = await Usuario.create({ nome, email, senhaHasheada });

        if (novoUsuario) {
            res.status(201).json({
                id_usuario: novoUsuario.id_usuario,
                nome_completo: novoUsuario.nome_completo,
                email: novoUsuario.email,
                token: generateToken(novoUsuario.id_usuario),
            });
        } else {
            res.status(400);
            throw new Error('Dados inválidos.');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Autenticar usuário & obter token (Versão Híbrida com DEBUG COMPLETO)
export const loginUsuario = async (req, res, next) => {
    try {
        const { email: loginInput, senha } = req.body;
        let usuario;

        console.log("\n========================================");
        console.log("--- INICIANDO LOGIN (DEBUG HÍBRIDO) ---");
        console.log(`1. Input recebido do frontend: "${loginInput}"`);

        // VERIFICAÇÃO: Se não tiver '@', tratamos como CPF
        if (!loginInput.includes('@')) {
            console.log("2. Tipo detectado: CPF");

            // 1. Limpa o CPF (garante que temos apenas os números para trabalhar)
            const cpfLimpo = loginInput.replace(/\D/g, '');
            console.log(`   -> CPF Limpo (Números): "${cpfLimpo}"`);

            // --- TENTATIVA A: Buscar pelo CPF limpo (Padrão novo/ideal) ---
            const hashLimpo = encrypt(cpfLimpo);
            console.log(`   [Tentativa A] Buscando hash (Limpo): ${hashLimpo.substring(0, 10)}...`);
            
            usuario = await Usuario.findByCpfEncrypted(hashLimpo);

            if (usuario) {
                console.log("   ✅ SUCESSO NA TENTATIVA A: Usuário encontrado pelo CPF limpo (apenas números).");
            } else {
                console.log("   ❌ FALHA NA TENTATIVA A: Não encontrado pelo hash limpo.");

                // --- TENTATIVA B: Buscar pelo CPF formatado (Legado/Com pontos) ---
                // Só tenta formatar se tiver 11 dígitos, senão não é um CPF válido
                if (cpfLimpo.length === 11) {
                    // Formata na marra: XXX.XXX.XXX-XX
                    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                    console.log(`   [Tentativa B] Formatando CPF para: "${cpfFormatado}"`);
                    
                    const hashFormatado = encrypt(cpfFormatado);
                    console.log(`   [Tentativa B] Buscando hash (Formatado): ${hashFormatado.substring(0, 10)}...`);

                    usuario = await Usuario.findByCpfEncrypted(hashFormatado);

                    if (usuario) {
                        console.log("   ✅ SUCESSO NA TENTATIVA B: Usuário encontrado pelo CPF formatado (com pontos/traços).");
                    } else {
                        console.log("   ❌ FALHA NA TENTATIVA B: Não encontrado nem formatado.");
                    }
                } else {
                    console.log("   ⚠️ Pulo Tentativa B: Input não tem 11 dígitos, impossível formatar como CPF.");
                }
            }

        } else {
            // Se tiver '@', busca normal por email
            console.log("2. Tipo detectado: E-mail");
            usuario = await Usuario.findByEmail(loginInput);
            console.log(usuario ? "   ✅ Usuário encontrado por e-mail." : "   ❌ Usuário não encontrado por e-mail.");
        }

        // --- VERIFICAÇÃO FINAL E SENHA ---
        if (usuario) {
            console.log(`3. Usuário localizado: ${usuario.nome_completo} (ID: ${usuario.id_usuario})`);
            console.log("4. Verificando senha...");

            if (await bcrypt.compare(senha, usuario.hash_senha)) {
                console.log("   ✅ SENHA CORRETA! Login aprovado.");
                console.log("========================================\n");

                res.json({
                    id_usuario: usuario.id_usuario,
                    nome_completo: usuario.nome_completo,
                    email: usuario.email,
                    token: generateToken(usuario.id_usuario),
                    isAdmin: usuario.isAdmin,
                    role: usuario.role
                });
            } else {
                console.log("   ❌ ERRO: A senha está incorreta.");
                console.log("========================================\n");
                res.status(401);
                throw new Error('Senha incorreta.');
            }
        } else {
            console.log("3. ERRO CRÍTICO: Usuário é NULL após todas as tentativas.");
            console.log("========================================\n");
            res.status(401);
            throw new Error('Credenciais inválidas (verifique E-mail/CPF ou Senha).');
        }

    } catch (error) {
        console.error("ERRO NO LOGIN:", error.message);
        next(error);
    }
};

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res, next) => {
    try {
        // O frontend agora envia o 'token' (que é o Access Token)
        const { token, email, nome } = req.body;

        // ==================================================================
        // 🔴 REMOVA O CÓDIGO ANTIGO QUE USAVA client.verifyIdToken
        // ==================================================================

        // ✅ NOVA VERIFICAÇÃO:
        // Usamos o Access Token para perguntar ao Google quem é o dono desse token.
        // O Node.js v18+ já tem o 'fetch' nativo.
        const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`);
        
        // Se o token for inválido ou expirado, o Google retorna erro
        if (!response.ok) {
            res.status(401);
            throw new Error('Token do Google inválido ou expirado.');
        }

        const googleData = await response.json();

        // SEGURANÇA: Verificamos se o e-mail retornado pelo Google é o mesmo que o frontend mandou
        if (googleData.email !== email) {
            res.status(401);
            throw new Error('Inconsistência nos dados de autenticação (E-mail não confere).');
        }

        // ==================================================================
        // A PARTIR DAQUI, A LÓGICA DE LOGIN/CRIAÇÃO CONTINUA A MESMA
        // ==================================================================

        let usuario = await Usuario.findByEmail(email);

        if (usuario) {
            // --- LOGIN: Usuário já existe ---
            res.json({
                id_usuario: usuario.id_usuario,
                nome_completo: usuario.nome_completo,
                email: usuario.email,
                token: generateToken(usuario.id_usuario),
                isAdmin: usuario.isAdmin,
                role: usuario.role
            });
        } else {
            // --- REGISTRO: Usuário novo ---
            // Gera senha aleatória pois ele entrou via Google
            const senhaAleatoria = crypto.randomBytes(16).toString('hex');
            const salt = await bcrypt.genSalt(10);
            const senhaHasheada = await bcrypt.hash(senhaAleatoria, salt);

            // Cria o usuário (Se possível, salve também o googleId se tiver coluna no banco)
            const novoUsuario = await Usuario.create({
                nome: nome,
                email: email,
                senhaHasheada: senhaHasheada
            });

            if (novoUsuario) {
                res.status(201).json({
                    id_usuario: novoUsuario.id_usuario,
                    nome_completo: novoUsuario.nome_completo,
                    email: novoUsuario.email,
                    token: generateToken(novoUsuario.id_usuario),
                    isAdmin: false,
                    role: 'CLIENTE'
                });
            } else {
                res.status(400);
                throw new Error('Não foi possível criar o usuário com o Google.');
            }
        }

    } catch (error) {
        // Log para ajudar a debugar se der erro de novo
        console.error("Erro no Google Login Backend:", error.message);
        next(error);
    }
};

// @desc    Buscar perfil do usuário logado
export const getUsuarioProfile = async (req, res, next) => {
    try {
        const user = await Usuario.findProfileById(req.user.id_usuario);
        if (user) {
            // A lógica de descriptografar os dados agora fica aqui
            res.json({
                id_usuario: user.id_usuario,
                nome_completo: user.nome_completo,
                email: user.email,
                telefone: user.telefone_criptografado ? decrypt(user.telefone_criptografado) : '',
                cpf: user.cpf_criptografado ? decrypt(user.cpf_criptografado) : '',
                data_nascimento: user.data_nascimento_criptografada ? decrypt(user.data_nascimento_criptografada) : ''
            });
        } else {
            res.status(404);
            throw new Error('Usuário não encontrado.');
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar perfil do usuário logado
export const updateUsuarioProfile = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        
        // 1. Busca dados atuais do usuário no banco
        const currentUser = await Usuario.findById(userId);

        if (!currentUser) {
            res.status(404);
            throw new Error('Usuário não encontrado.');
        }

        const { nome, email, telefone, cpf, data_nascimento } = req.body;
        
        // --- 2. VERIFICAÇÃO DE E-MAIL DUPLICADO (CORREÇÃO DO ERRO) ---
        // Se o usuário mandou um email E ele é diferente do atual...
        if (email && email !== currentUser.email) {
            // Verifica se já existe no banco
            const emailExiste = await Usuario.findByEmail(email);
            
            // Se existe E não pertence a este usuário (é de outra pessoa), bloqueia!
            if (emailExiste && emailExiste.id_usuario !== userId) {
                res.status(400);
                throw new Error('Este endereço de e-mail já está em uso por outro cadastro.');
            }
        }

        // --- 3. LÓGICA DE BLOQUEIO DE EDIÇÃO (NOME, DATA, CPF) ---
        // Nome: Se já tem no banco, mantém o antigo. Se não, aceita o novo.
        const nomeFinal = currentUser.nome_completo ? currentUser.nome_completo : nome;

        // Data: Se já tem, mantém.
        const dataNascimentoFinal = currentUser.data_nascimento_criptografada 
            ? currentUser.data_nascimento_criptografada 
            : (data_nascimento ? encrypt(data_nascimento) : null);

        // CPF: Se já tem, mantém. Se é novo, valida duplicidade.
        let cpfFinal = currentUser.cpf_criptografado; 

        if (!currentUser.cpf_criptografado && cpf) {
            const cpfLimpo = cpf.replace(/\D/g, ''); 
            const novoCpfHash = encrypt(cpfLimpo);

            const cpfExiste = await Usuario.findByCpfEncrypted(novoCpfHash);
            if (cpfExiste && cpfExiste.id_usuario !== userId) {
                res.status(400);
                throw new Error('Este CPF já está cadastrado em outra conta.');
            }

            cpfFinal = novoCpfHash; 
        }

        // 4. Salva no banco
        const dataToUpdate = {
            nome: nomeFinal, 
            email: email || currentUser.email, // Usa o novo email se passou na validação acima
            telefoneCriptografado: telefone ? encrypt(telefone) : currentUser.telefone_criptografado,
            cpfCriptografado: cpfFinal, 
            dataNascimentoCriptografada: dataNascimentoFinal, 
        };
        
        await Usuario.updateProfile(userId, dataToUpdate);
        const updatedUser = await Usuario.findById(userId);
        
        res.json({
            id_usuario: updatedUser.id_usuario,
            nome_completo: updatedUser.nome_completo,
            email: updatedUser.email,
            token: generateToken(updatedUser.id_usuario),
        });
    } catch (error) {
        // O erro que lançamos acima vai cair aqui e ser enviado pro Frontend
        next(error);
    }
};

// @desc    Atualizar usuário pelo Admin (Com trava de segurança para CLIENTES)
export const updateUsuarioByAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nome_completo, email, role, isAdmin, senha, cpfConfirmacao } = req.body;

        const usuarioAtual = await Usuario.findById(Number(id));

        if (!usuarioAtual) {
            res.status(404);
            throw new Error('Usuário não encontrado');
        }

        // --- TRAVA DE SEGURANÇA PARA CLIENTES ---
        // Se o usuário atual for um CLIENTE, EXIGE CPF para QUALQUER alteração
        if (usuarioAtual.role === 'CLIENTE') {
            
            // Verifica se o CPF foi enviado
            if (!cpfConfirmacao) {
                res.status(400);
                throw new Error('ATENÇÃO: Para alterar qualquer dado de um CLIENTE, é obrigatório confirmar o CPF.');
            }

            // Remove caracteres não numéricos do CPF enviado
            const cpfLimpo = cpfConfirmacao.replace(/\D/g, '');
            const cpfHash = encrypt(cpfLimpo);

            // Verifica se o CPF bate com o banco de dados
            if (usuarioAtual.cpf_criptografado !== cpfHash) {
                res.status(403); // Forbidden
                throw new Error('Bloqueado: O CPF informado não confere com este cliente. Nenhuma alteração foi realizada.');
            }
        }

        // Prepara objeto de dados
        const dadosParaAtualizar = {
            nome: nome_completo || usuarioAtual.nome_completo,
            email: email || usuarioAtual.email,
            role: role || usuarioAtual.role,
            isAdmin: isAdmin !== undefined ? isAdmin : usuarioAtual.isAdmin
        };

        // Se uma senha foi enviada, faz o hash e adiciona ao update
        if (senha) {
            const salt = await bcrypt.genSalt(10);
            dadosParaAtualizar.hash_senha = await bcrypt.hash(senha, salt);
        }

        const updatedUser = await Usuario.updateByAdmin(Number(id), dadosParaAtualizar);

        res.json({
            id_usuario: updatedUser.id_usuario,
            nome_completo: updatedUser.nome_completo,
            email: updatedUser.email,
            role: updatedUser.role,
            isAdmin: updatedUser.isAdmin
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Deletar usuário
// @route   DELETE /api/usuarios/:id
// @desc    Deletar usuário (Com trava de segurança para CLIENTES)
export const deleteUsuario = async (req, res, next) => {
    try {
        const { id } = req.params;
        // No método DELETE, o body geralmente vem dentro de uma propriedade específica dependendo do framework, 
        // mas no Express ele lê req.body normalmente se enviado corretamente.
        const { cpfConfirmacao } = req.body; 

        const usuario = await Usuario.findById(Number(id));

        if (!usuario) {
            res.status(404);
            throw new Error('Usuário não encontrado');
        }

        // --- TRAVA DE SEGURANÇA PARA DELETAR CLIENTE ---
        if (usuario.role === 'CLIENTE') {
            if (!cpfConfirmacao) {
                res.status(400);
                throw new Error('SEGURANÇA: Para EXCLUIR um Cliente, é obrigatório confirmar o CPF.');
            }

            const cpfLimpo = cpfConfirmacao.replace(/\D/g, '');
            const cpfHash = encrypt(cpfLimpo);

            if (usuario.cpf_criptografado !== cpfHash) {
                res.status(403);
                throw new Error('CPF incorreto. Exclusão não permitida.');
            }
        }

        await Usuario.delete(Number(id));
        res.json({ message: 'Usuário removido com sucesso' });

    } catch (error) {
        next(error);
    }
};

export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const usuario = await Usuario.findByEmail(email);

        if (usuario) {
            // Gera um token seguro
            const resetToken = crypto.randomBytes(32).toString('hex');
            
            // Define a data de expiração (ex: 1 hora a partir de agora)
            const expires = new Date(Date.now() + 60 * 60 * 1000); 

            await Usuario.savePasswordResetToken(usuario.id_usuario, resetToken, expires);

            // Cria o link de redefinição
            const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

            // Envia o e-mail
            await sendPasswordResetEmail(usuario.email, usuario.nome_completo, resetUrl);
        }
        
        // Envia sempre uma resposta de sucesso para não revelar se um e-mail existe ou não na base de dados
        res.status(200).json({ message: 'Se um utilizador com esse e-mail existir, um link de redefinição foi enviado.' });

    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Redefinir a senha com o token (Passo 2)
 * @route   POST /api/usuarios/reset-password/:token
 * @access  Público
 */
export const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { senha } = req.body;

        const usuario = await Usuario.findByValidResetToken(token);

        if (!usuario) {
            res.status(400);
            throw new Error('Token inválido ou expirado.');
        }

        // Cria o hash da nova senha
        const salt = await bcrypt.genSalt(10);
        const senhaHasheada = await bcrypt.hash(senha, salt);
        
        await Usuario.updatePasswordById(usuario.id_usuario, senhaHasheada);

        res.status(200).json({ message: 'Senha redefinida com sucesso!' });

    } catch (error) {
        next(error);
    }
};

export const searchUsuarios = async (req, res, next) => {
    try {
        const { term } = req.params; // Pega o termo da URL (ex: "Raya")

        if (!term) {
            return res.json([]); // Retorna um array vazio se não houver busca
        }

        // Chama o novo método que criamos no Model
        const usuarios = await Usuario.search(term);
        
        res.status(200).json(usuarios);
    } catch (error) {
        next(error);
    }
};