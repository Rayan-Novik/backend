import axios from 'axios';

/**
 * Geocodifica um endereço brasileiro retornando latitude e longitude.
 * Utiliza o Photon (OpenStreetMap) e fallback para BrasilAPI (CEP v2).
 */
export async function geocodeAddress(endereco) {
    if (!endereco) return null;

    const logradouro = endereco.logradouro || endereco.rua || '';
    const numero = endereco.numero || endereco.num || '';
    const bairro = endereco.bairro || '';
    const cidade = endereco.cidade || endereco.cid || '';
    const estado = endereco.estado || '';
    const cep = endereco.cep ? endereco.cep.toString().replace(/\D/g, '') : '';

    // 1. TENTATIVA COM PHOTON (KOMOOT / OPENSTREETMAP) - ALTA PRECISÃO POR LOGRADOURO E NÚMERO
    try {
        const termos = [logradouro, numero, bairro, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termos.length > 5) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termos)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4500,
                headers: { 'User-Agent': 'ArarinhaLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon'
                    };
                }
            }
        }
    } catch (err) {
        // Falha silenciosa para tentar o próximo provedor
    }

    // 2. FALLBACK COM BRASILAPI (CEP v2) - RETORNA COORDENADAS DO CEP
    if (cep && cep.length === 8) {
        try {
            const url = `https://brasilapi.com.br/api/cep/v2/${cep}`;
            const res = await axios.get(url, { timeout: 4500 });
            const coords = res.data?.location?.coordinates;

            if (coords?.latitude && coords?.longitude) {
                const lat = parseFloat(coords.latitude);
                const lng = parseFloat(coords.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return {
                        latitude: lat,
                        longitude: lng,
                        source: 'brasilapi'
                    };
                }
            }
        } catch (err) {
            // Falha silenciosa
        }
    }

    // 3. SEGUNDO FALLBACK: APENAS CIDADE E BAIRRO
    try {
        const termosCurto = [bairro, cidade, estado, 'Brasil'].filter(Boolean).join(', ');
        if (termosCurto.length > 4) {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(termosCurto)}&limit=1`;
            const res = await axios.get(url, { 
                timeout: 4000,
                headers: { 'User-Agent': 'ArarinhaLogistics/1.0' }
            });

            if (res.data?.features?.length > 0) {
                const [lng, lat] = res.data.features[0].geometry.coordinates;
                if (lat && lng) {
                    return {
                        latitude: parseFloat(lat),
                        longitude: parseFloat(lng),
                        source: 'photon_neighborhood'
                    };
                }
            }
        }
    } catch (err) {}

    return null;
}
