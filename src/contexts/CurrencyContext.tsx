import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type Currency = 'DKK' | 'USD' | 'EUR' | 'GBP' | 'SEK' | 'NOK';

const EXCHANGE_RATES: Record<Currency, number> = {
  DKK: 1,
  EUR: 0.134,
  USD: 0.145,
  GBP: 0.115,
  SEK: 1.53,
  NOK: 1.52,
};

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  cycleCurrency: () => void;
  convert: (amount: number, from?: Currency) => number;
  format: (amount: number, from?: Currency) => string;
  allCurrencies: Currency[];
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

const ALL_CURRENCIES: Currency[] = ['DKK', 'EUR', 'USD', 'GBP', 'SEK', 'NOK'];

const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  DKK: new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }),
  EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }),
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
  GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }),
  SEK: new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }),
  NOK: new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }),
};

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency>(() => {
    const saved = localStorage.getItem('app-currency');
    return (saved && ALL_CURRENCIES.includes(saved as Currency)) ? saved as Currency : 'DKK';
  });

  const handleSet = useCallback((c: Currency) => {
    setCurrency(c);
    localStorage.setItem('app-currency', c);
  }, []);

  const cycleCurrency = useCallback(() => {
    const idx = ALL_CURRENCIES.indexOf(currency);
    const next = ALL_CURRENCIES[(idx + 1) % ALL_CURRENCIES.length];
    handleSet(next);
  }, [currency, handleSet]);

  const convert = useCallback((amount: number, from: Currency = 'DKK') => {
    if (from === currency) return amount;
    const inDKK = amount / EXCHANGE_RATES[from];
    return inDKK * EXCHANGE_RATES[currency];
  }, [currency]);

  const format = useCallback((amount: number, from: Currency = 'DKK') => {
    const converted = convert(amount, from);
    return FORMATTERS[currency].format(converted);
  }, [currency, convert]);

  const value = useMemo(() => ({
    currency, setCurrency: handleSet, cycleCurrency, convert, format, allCurrencies: ALL_CURRENCIES,
  }), [currency, handleSet, cycleCurrency, convert, format]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
}
