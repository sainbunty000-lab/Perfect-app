import type { WorkingCapitalData, BankingData } from "@workspace/api-client-react";
import Papa from "papaparse";

export function extractWorkingCapitalFromText(text: string): Partial<WorkingCapitalData> {
  const data: Partial<WorkingCapitalData> = {};
  
  // Helper to find numbers following keywords
  const findValue = (keywords: string[]): number | undefined => {
    const lines = text.split('\n');
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const kw of keywords) {
        if (lowerLine.includes(kw)) {
          // Extract the first sequence of numbers (with optional commas/decimals)
          const match = lowerLine.substring(lowerLine.indexOf(kw)).match(/[\d,]+\.?\d*/);
          if (match) {
            const val = parseFloat(match[0].replace(/,/g, ''));
            if (!isNaN(val)) return val;
          }
        }
      }
    }
    return undefined;
  };

  data.currentAssets = findValue(["current assets", "total current assets", "net current assets"]);
  data.currentLiabilities = findValue(["current liabilities", "total current liabilities"]);
  data.inventory = findValue(["inventory", "inventories", "closing stock", "stock"]);
  data.debtors = findValue(["debtors", "trade receivables", "accounts receivable"]);
  data.creditors = findValue(["creditors", "trade payables", "accounts payable"]);
  data.cash = findValue(["cash and bank", "cash balance", "cash equivalents", "bank balance"]);
  
  data.sales = findValue(["revenue", "sales", "net sales", "turnover", "total revenue"]);
  data.cogs = findValue(["cost of goods sold", "cogs", "cost of sales"]);
  data.purchases = findValue(["purchases", "raw material consumed"]);
  data.expenses = findValue(["operating expenses", "total expenses", "opex"]);
  data.netProfit = findValue(["net profit", "profit after tax", "pat", "net income"]);

  return data;
}

export function parseBankingCsv(file: File): Promise<Partial<BankingData>> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data: Partial<BankingData> = {
          totalCredits: 0,
          totalDebits: 0,
          cashDeposits: 0,
          cashWithdrawals: 0,
          chequeReturns: 0,
          bankCharges: 0,
        };
        
        let minBal = Infinity;
        let maxBal = -Infinity;
        let sumBal = 0;
        let count = 0;

        results.data.forEach((row: any) => {
          // Attempt to find credit/debit columns dynamically
          const creditKey = Object.keys(row).find(k => k.toLowerCase().includes('credit') || k.toLowerCase().includes('deposit'));
          const debitKey = Object.keys(row).find(k => k.toLowerCase().includes('debit') || k.toLowerCase().includes('withdrawal'));
          const balKey = Object.keys(row).find(k => k.toLowerCase().includes('balance'));
          const descKey = Object.keys(row).find(k => k.toLowerCase().includes('description') || k.toLowerCase().includes('particulars'));

          const credit = creditKey ? parseFloat(row[creditKey]?.replace(/,/g, '') || '0') : 0;
          const debit = debitKey ? parseFloat(row[debitKey]?.replace(/,/g, '') || '0') : 0;
          const bal = balKey ? parseFloat(row[balKey]?.replace(/,/g, '') || '0') : 0;
          const desc = descKey ? row[descKey]?.toLowerCase() || '' : '';

          if (!isNaN(credit)) data.totalCredits! += credit;
          if (!isNaN(debit)) data.totalDebits! += debit;
          
          if (!isNaN(bal) && bal !== 0) {
            minBal = Math.min(minBal, bal);
            maxBal = Math.max(maxBal, bal);
            sumBal += bal;
            count++;
          }

          if (desc.includes('cash dep')) data.cashDeposits! += credit;
          if (desc.includes('cash wdl') || desc.includes('atm')) data.cashWithdrawals! += debit;
          if (desc.includes('bounce') || desc.includes('return')) data.chequeReturns! += 1;
          if (desc.includes('chg') || desc.includes('fee')) data.bankCharges! += debit;
        });

        if (count > 0) {
          data.minimumBalance = minBal;
          data.averageBalance = sumBal / count;
        }

        data.transactionFrequency = count;
        resolve(data);
      },
      error: (error) => reject(error)
    });
  });
}
