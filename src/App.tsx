import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { calculateOptimizerSplit, type Card, type CardAllocation, MERCHANT_DB, type PaymentMode } from './optimizer';

const supabase = createClient(
  "https://zeiytfzxagwbtuabqtnz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplaXl0Znp4YWd3YnR1YWJxdG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjA1NjQsImV4cCI6MjEwNDQzNjU2NH0.d2Q2j6hj2ngsby2ICJEgEYFFVbaGjJygqGmBG-zkAyw"
);

interface Transaction {
  id: string;
  owner: string;
  card_name: string;
  merchant_name: string;
  amount_sgd: number;
  miles_earned: number;
  payment_method: string;
  created_at: string;
}

export default function MilesCommandCenter() {
  const [activeTab, setActiveTab] = useState<'optimizer' | 'dashboard'>('optimizer');
  const [cards, setCards] = useState<Card[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  
  // Optimizer Form State
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState<'SGD' | 'FCY'>('SGD');
  const [merchant, setMerchant] = useState<string>('Wedding Jeweller (Love & Co / Soo Kee)');
  const [method, setMethod] = useState<PaymentMode>('Online / In-App');
  const [splits, setSplits] = useState<CardAllocation[]>([]);

  useEffect(() => {
    fetchCards();
    fetchTransactions();
  }, []);

  async function fetchCards() {
    const { data } = await supabase.from('cards').select('*').order('owner');
    if (data) setCards(data);
  }

  async function fetchTransactions() {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    if (data) setTransactions(data);
  }

  function handleCalculate() {
    const result = calculateOptimizerSplit(cards, {
      amount,
      currency,
      merchant,
      paymentMethod: method,
    });
    setSplits(result);
  }

  async function confirmSpend(allocation: CardAllocation) {
    // 1. Update Card Spent Quota in DB
    await supabase.from('cards')
      .update({ current_spent_sgd: allocation.card.current_spent_sgd + allocation.allocatedAmount })
      .eq('id', allocation.card.id);
    
    // 2. Log Line-Item Transaction Ledger
    await supabase.from('transactions').insert({
      owner: allocation.card.owner,
      card_name: `${allocation.card.bank} ${allocation.card.card_name} [${allocation.card.sub_category}]`,
      merchant_name: merchant,
      amount_sgd: allocation.allocatedAmount,
      miles_earned: allocation.milesEarned,
      payment_method: method
    });

    fetchCards();
    fetchTransactions();
    setSplits([]);
    setAmount(0);
    alert(`Successfully logged S$${allocation.allocatedAmount.toFixed(0)} to ${allocation.card.owner}!`);
  }

  // Calculate Aggregates Across Months
  const monthlyTotals = transactions.reduce((acc: Record<string, { spend: number, miles: number }>, tx) => {
    const monthYear = new Date(tx.created_at).toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = { spend: 0, miles: 0 };
    acc[monthYear].spend += Number(tx.amount_sgd);
    acc[monthYear].miles += Number(tx.miles_earned);
    return acc;
  }, {});

  const totalHouseholdSpend = transactions.reduce((sum, tx) => sum + Number(tx.amount_sgd), 0);
  const totalHouseholdMiles = transactions.reduce((sum, tx) => sum + Number(tx.miles_earned), 0);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-white p-4 pb-20 font-sans">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-bold">💍 Household Miles Hub</h1>
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
          <button 
            onClick={() => setActiveTab('optimizer')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition ${activeTab === 'optimizer' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            Optimizer
          </button>
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-3 py-1.5 rounded-md font-semibold transition ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            Dashboard
          </button>
        </div>
      </header>

      {activeTab === 'optimizer' ? (
        <>
          {/* Spend Engine Input */}
          <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6 shadow-lg">
            <h2 className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Which Card to Use?</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400">Amount (SGD)</label>
                  <input 
                    type="number" 
                    value={amount || ''} 
                    onChange={e => setAmount(parseFloat(e.target.value))}
                    placeholder="e.g. 3500" 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm">
                    <option value="SGD">SGD (Local)</option>
                    <option value="FCY">FCY (Overseas)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400">Merchant / Vendor (Type or Select)</label>
                <input 
                  list="merchants"
                  value={merchant} 
                  onChange={e => setMerchant(e.target.value)} 
                  placeholder="Type shop name..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm"
                />
                <datalist id="merchants">
                  {Object.keys(MERCHANT_DB).map(m => <option key={m} value={m} />)}
                </datalist>
              </div>

              <div>
                <label className="text-xs text-slate-400">Payment Method</label>
                <select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm">
                  <option value="Online / In-App">Online / In-App Checkout</option>
                  <option value="Apple/Google Pay">Apple Pay / Google Pay (Contactless)</option>
                  <option value="Physical PayWave">Physical Card PayWave</option>
                  <option value="Amaze Route">Amaze Card Linked Route</option>
                  <option value="Physical Chip">Physical Chip Insertion</option>
                </select>
              </div>

              <button onClick={handleCalculate} className="w-full bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded-lg text-sm mt-2">
                Calculate Smart Split
              </button>
            </div>
          </section>

          {/* Recommendations Waterfall */}
          {splits.length > 0 && (
            <section className="space-y-3 mb-6">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Execution Waterfall</h2>
              {splits.map((s, idx) => (
                <div key={idx} className="bg-slate-800 border-l-4 border-emerald-500 p-3.5 rounded-r-xl border-slate-700 shadow-md">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <span className="text-xs font-bold text-indigo-400">{s.card.owner}</span>
                      <p className="font-bold text-sm">{s.card.bank} {s.card.card_name} <span className="text-xs text-amber-400">[{s.card.sub_category}]</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-emerald-400">S${s.allocatedAmount.toFixed(0)}</p>
                      <span className="text-[10px] text-slate-400">+{s.milesEarned.toFixed(0)} miles ({s.rate} mpd)</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">{s.reason}</p>
                  <button onClick={() => confirmSpend(s)} className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-1.5 rounded">
                    Confirm Spend & Deduct Quota
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Household Split Quotas */}
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Quotas (Split by Bucket)</h2>
            {['Ryan', 'Tse Min'].map(person => (
              <div key={person} className="bg-slate-800 p-3.5 rounded-xl border border-slate-700">
                <h3 className="font-bold text-indigo-300 text-sm mb-2.5 border-b border-slate-700 pb-1">👤 {person}'s Wallet Buckets</h3>
                <div className="space-y-3">
                  {cards.filter(c => c.owner === person).map(card => {
                    const remaining = Math.max(0, card.monthly_cap_sgd - card.current_spent_sgd);
                    const pct = Math.min(100, (card.current_spent_sgd / card.monthly_cap_sgd) * 100);
                    return (
                      <div key={card.id} className="text-xs">
                        <div className="flex justify-between mb-1">
                          <span className="text-slate-300">{card.card_name} <strong className="text-amber-400">[{card.sub_category}]</strong></span>
                          <span className="font-mono text-slate-400">S${remaining.toFixed(0)} left</span>
                        </div>
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-500 h-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        /* DASHBOARD & MONTHLY LEDGER TAB */
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 shadow">
              <span className="text-[11px] text-slate-400 uppercase">Total Logged Spend</span>
              <p className="text-xl font-extrabold text-white mt-1">S${totalHouseholdSpend.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 shadow">
              <span className="text-[11px] text-slate-400 uppercase">Total Miles Tracked</span>
              <p className="text-xl font-extrabold text-emerald-400 mt-1">✈️ {totalHouseholdMiles.toLocaleString()}</p>
            </div>
          </div>

          {/* Spend Across Months */}
          <section className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">📅 Spend & Miles Across Months</h2>
            {Object.keys(monthlyTotals).length === 0 ? (
              <p className="text-xs text-slate-500 text-py-2">No monthly transactions logged yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(monthlyTotals).map(([month, data]) => (
                  <div key={month} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2">
                    <div>
                      <p className="font-bold text-slate-200">{month}</p>
                      <span className="text-xs text-emerald-400 font-medium">+{data.miles.toLocaleString()} miles earned</span>
                    </div>
                    <span className="font-mono font-extrabold text-white">S${data.spend.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Line Item Transaction Ledger */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">📝 Line-Item Transaction Ledger</h2>
            {transactions.length === 0 ? (
              <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 text-center text-slate-400 text-xs">
                No purchases logged yet. Use the Optimizer tab to log your wedding/reno swipes!
              </div>
            ) : (
              transactions.map(tx => (
                <div key={tx.id} className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 flex justify-between items-center text-xs shadow-sm">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold text-[10px]">{tx.owner}</span>
                      <span className="font-bold text-white">{tx.merchant_name}</span>
                    </div>
                    <p className="text-slate-400 text-[11px]">{tx.card_name}</p>
                    <span className="text-[10px] text-slate-500">{new Date(tx.created_at).toLocaleDateString()} • {tx.payment_method}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-white">S${Number(tx.amount_sgd).toFixed(0)}</p>
                    <p className="text-[10px] font-semibold text-emerald-400">+{tx.miles_earned} miles</p>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}