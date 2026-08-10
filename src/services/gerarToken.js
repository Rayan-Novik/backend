import axios from 'axios';

// 👇 PREENCHA AQUI COM OS DADOS QUE VOCÊ JÁ TEM
const clientId = "9ce8ac3e-3ebe-4fe6-a7bf-da31b361e54d";
const clientSecret = "qyzy73tezkmw4czt16mpfvpy8c3rrexlp2cuzsj3tvufrvhq8vweoc8gp0ie6r87ory7b94kqid8eg95pefkboa0jhp1jkhi1se";

async function gerarToken() {
    try {
        console.log("⏳ Gerando tokens no iFood...");

        const response = await axios.post(
            "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token",
            new URLSearchParams({
                grantType: "client_credentials",
                clientId: clientId,
                clientSecret: clientSecret
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { accessToken, refreshToken, expiresIn } = response.data;

        console.log("\n✅ SUCESSO! Copie os dados abaixo para o seu JSON:\n");
        console.log(`"accessToken": "${accessToken}",`);
        console.log(`"refreshToken": "${refreshToken}",`);
        console.log(`"expiresIn": ${expiresIn}`);

    } catch (error) {
        console.error("❌ Erro ao gerar token:", error.response?.data || error.message);
        console.log("DICA: Verifique se o Client ID e Secret estão corretos e sem espaços extras.");
    }
}

gerarToken();