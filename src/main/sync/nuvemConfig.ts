export const NUVEM_URL = 'https://rywwncecmtmroixtypkm.supabase.co'

// Chave "publishable" do projeto (painel do Supabase). É PÚBLICA por desenho e pode ficar no código;
// NUNCA coloque aqui a chave service_role.
const CHAVE_ANON_PUBLICADA = 'sb_publishable_zbMqYJ9EL01gux2ps_L9GQ_gDGyWwQH'

export function chaveAnon(): string {
  return process.env.OPTIALEPH_SUPABASE_ANON ?? CHAVE_ANON_PUBLICADA
}

export function nuvemConfigurada(): boolean {
  return chaveAnon() !== ''
}
