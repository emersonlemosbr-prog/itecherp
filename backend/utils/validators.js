// utils/validators.js
/**
 * Remove caracteres não numéricos
 */
function cleanDigits(str) {
  return String(str || '').replace(/\D/g, '');
}

/**
 * Validação do algoritmo oficial de CPF brasileiro
 * Retorna true se for válido ou vazio (pois CPF pode ser opcional).
 * Se preenchido com valor inválido, retorna false.
 */
function isValidCPF(rawCpf) {
  if (!rawCpf) return true;
  const cpf = cleanDigits(rawCpf);
  if (cpf.length !== 11) return false;

  // Rejeita sequências repetidas conhecidas (00000000000, 11111111111, etc)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10), 10)) return false;

  return true;
}

/**
 * Validação básica de telefone brasileiro (DDD + 8 ou 9 dígitos)
 */
function isValidPhone(rawPhone) {
  if (!rawPhone) return false;
  const digits = cleanDigits(rawPhone);
  return digits.length >= 10 && digits.length <= 11;
}

/**
 * Formata CPF para exibição mascarada segura (LGPD: 123.***.***-45)
 */
function maskCPFForDisplay(rawCpf) {
  const digits = cleanDigits(rawCpf);
  if (digits.length !== 11) return rawCpf || '—';
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

/**
 * Formata telefone para exibição (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
function formatPhone(rawPhone) {
  const digits = cleanDigits(rawPhone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return rawPhone || '—';
}

/**
 * Formata CEP (XXXXX-XXX)
 */
function formatCEP(rawCep) {
  const digits = cleanDigits(rawCep);
  if (digits.length === 8) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return rawCep || '—';
}

module.exports = {
  cleanDigits,
  isValidCPF,
  isValidPhone,
  maskCPFForDisplay,
  formatPhone,
  formatCEP
};
