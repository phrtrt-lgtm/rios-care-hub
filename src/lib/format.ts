export const formatBRL = (cents: number | null | undefined): string => {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: 'BRL' 
  });
};

export const formatDateTime = (date?: string | Date | null): string => {
  if (!date) return '-';
  const dt = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export const formatDate = (date?: string | Date | null): string => {
  if (!date) return '-';
  const dt = typeof date === 'string' ? new Date(date) : date;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
};

export const centsToReais = (cents: number): number => {
  return cents / 100;
};

export const reaisToCents = (reais: number): number => {
  return Math.round(reais * 100);
};
