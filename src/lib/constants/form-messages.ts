export const formMessages = {
  required: "Este campo é obrigatório.",
  emailInvalid: "Informe um e-mail válido.",
  minLength: (min: number) => `Digite pelo menos ${min} caracteres.`,
  maxLength: (max: number) => `Digite no máximo ${max} caracteres.`,
  invalidCredentials: "Credenciais inválidas. Revise e tente novamente.",
  saveSuccess: "Dados salvos com sucesso.",
  saveError: "Não foi possível salvar no momento. Tente novamente."
} as const;
