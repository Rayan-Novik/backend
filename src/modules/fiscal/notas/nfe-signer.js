import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

export function assinarXml(xmlString, privateKey, certificate, referenceId, tagName = 'infNFe') {
  const sig = new SignedXml();

  sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

  sig.addReference(
    `#${referenceId}`,
    ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    'http://www.w3.org/2001/04/xmlenc#sha256'
  );

  sig.keyInfoProvider = {
    getKeyInfo: () => {
      const cleanCert = certificate
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\r?\n/g, '');
      return `<X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data>`;
    },
    getKey: () => Buffer.from('')
  };

  sig.signingKey = privateKey;

  const doc = new DOMParser().parseFromString(xmlString);
  const elements = doc.getElementsByTagName(tagName);
  if (elements.length > 0) {
    elements[0].setAttribute('Id', referenceId);
    elements[0].setIdAttribute('Id', true);
  }

  sig.computeSignature(doc.toString(), {
    prefix: '',
    location: { reference: `//*[local-name(.)='${tagName}']`, action: 'after' }
  });

  return sig.getSignedXml();
}
