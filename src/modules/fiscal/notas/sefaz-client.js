import axios from 'axios';
import https from 'https';

export async function enviarSefaz(soapBody, url, pfxBuffer, passphrase) {
  const httpsAgent = new https.Agent({
    pfx: pfxBuffer,
    passphrase: passphrase,
    rejectUnauthorized: false,
    keepAlive: true,
  });

  try {
    const response = await axios.post(url, soapBody, {
      httpsAgent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Accept': 'application/xml',
      },
      timeout: 15000
    });

    return {
      status: response.status,
      data: response.data
    };
  } catch (error) {
    if (error.response) {
      return {
        status: error.response.status,
        data: error.response.data
      };
    }
    throw new Error('Falha na comunicação de rede com a SEFAZ: ' + error.message);
  }
}
