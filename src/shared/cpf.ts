/**
 * Validação real de CPF por dígito verificador (RF-04) - o sistema
 * anterior aceitava qualquer string e usava '888.888.888-88' como
 * sentinela de "sem CPF" (D6-like problema, mas no campo de CPF).
 *
 * Aqui, "sem CPF" é null/vazio de verdade; se preenchido, tem que ser
 * um CPF matematicamente válido.
 */
export function limparCpf(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

export function cpfValido(cpfFormatadoOuNumeros: string): boolean {
  const cpf = limparCpf(cpfFormatadoOuNumeros)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false // todos os digitos iguais

  const calcularDigito = (base: string): number => {
    let soma = 0
    let peso = base.length + 1
    for (const char of base) {
      soma += Number(char) * peso
      peso -= 1
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }

  const digito1 = calcularDigito(cpf.slice(0, 9))
  const digito2 = calcularDigito(cpf.slice(0, 9) + digito1)

  return cpf === cpf.slice(0, 9) + String(digito1) + String(digito2)
}

export function formatarCpf(cpf: string): string {
  const digitos = limparCpf(cpf)
  if (digitos.length !== 11) return cpf
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
}
