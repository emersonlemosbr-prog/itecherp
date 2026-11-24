// utils/masks.js
/**
 * Remove qualquer caractere não numérico
 */
export function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

/**
 * Aplica máscara de CPF: 000.000.000-00
 */
export function maskCPF(value) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * Validação do algoritmo de CPF
 */
export function validateCPF(value) {
  if (!value) return true
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i)
  let rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cpf.charAt(9), 10)) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i)
  rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cpf.charAt(10), 10)) return false

  return true
}

/**
 * Aplica máscara de Telefone: (00) 00000-0000 ou (00) 0000-0000
 */
export function maskPhone(value) {
  const digits = onlyDigits(value).slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Aplica máscara de CEP: 00000-000
 */
export function maskCEP(value) {
  const digits = onlyDigits(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/**
 * Consulta CEP na API oficial do ViaCEP com timeout e tratamento de erro
 */
export async function lookupCEP(rawCep) {
  const clean = onlyDigits(rawCep)
  if (clean.length !== 8) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)

    const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      signal: controller.signal
    })
    clearTimeout(timer)

    if (!response.ok) return null
    const data = await response.json()
    if (data.erro) return null

    return {
      street: data.logradouro || '',
      neighborhood: data.bairro || '',
      city: data.localidade || '',
      state: data.uf || '',
      complement: data.complemento || ''
    }
  } catch (err) {
    console.warn('[VIACEP_LOOKUP_ERROR]', err.message)
    return null
  }
}
