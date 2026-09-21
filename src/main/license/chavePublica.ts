/**
 * Chave PÚBLICA Ed25519 do produto "Ótica Suíte", par da chave privada guardada no
 * cofre da Central de Licenças (E:\CentralLicencas). Só serve para VERIFICAR
 * licenças — não dá para emitir chaves com ela, por isso pode ficar no código.
 *
 * ⚠️ Se a flag abaixo for `true`, nenhuma chave ativa e `npm run dist:win` é barrado por
 * scripts/verificar-chave-publica.mjs — para não gerar um instalador que ninguém consegue ativar.
 * Para trocar: Central de Licenças → Produtos → copie a chave pública → cole aqui.
 */
export const CHAVE_PUBLICA_E_PROVISORIA = false

export const CHAVE_PUBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAj/DWcVL5+ZaBhdSiUGdlcXSnlQ+m/DT+mtOg61LUXsY=
-----END PUBLIC KEY-----`
