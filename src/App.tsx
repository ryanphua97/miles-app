import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { calculateOptimizerSplit, type Card, type CardAllocation } from './optimizer';

const supabaseUrl = "https://zeiytfzxagwbtuabqtnz.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplaXl0Znp4YWd3YnR1YWJxdG56Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjA1NjQsImV4cCI6MjEwNDQzNjU2NH0.d2Q2j6hj2ngsby2ICJEgEYFFVbaGjJygqGmBG-zkAyw";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function MilesCommandCenter() {
  const [cards, setCards] = useState<Card[]>([]);
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState<any>('Retail');
  const [method, setMethod] = useState<any>('Apple Pay');
  const [currency, setCurrency] = useState<'SGD' | 'FCY'>('SGD');
  const [splits, setSplits] = useState<CardAllocation[]>([]);

  // Fetch initial data & listen to live changes
  useEffect(() => {
    fetchCards();

    const channel = supabase
      .channel('realtime_cards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, () => {
        fetchCards();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchCards() {
    const { data } = await supabase.from('cards').select('*').order('owner');
    if (data) setCards(data);
  }

  function handleCalculate() {
    const result = calculateOptimizerSplit(cards, {
      amount,
      currency,
      category,
      paymentMethod: method,
    });
    setSplits(result);
  }

  async function confirmSwipe(allocation: CardAllocation) {
    // 1. Log transaction
    await supabase.from('transactions').insert({
      card_id: allocation.card.id,
      owner: allocation.card.owner,
      merchant_name: `${category} Spend`,
      amount_sgd: allocation.allocatedAmount,
      miles_earned: allocation.milesEarned,
      payment_method: method,
    });

    // 2. Increment spent quota
    await supabase.from('cards')
      .update({ current_spent_sgd: allocation.card.current_spent_sgd + allocation.allocatedAmount })
      .eq('id', allocation.card.id);

    setAmount(0);
    setSplits([]);
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-white p-4 pb-20 font-sans">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-bold tracking-tight">✈️ Miles Optimizer</h1>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/30">
          Live Synced
        </span>
      </header>

      {/* Spend Decision Screen */}
      <section className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Which Card to Use?</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400">Amount (SGD)</label>
            <input 
              type="number" 
              value={amount || ''} 
              onChange={e => setAmount(parseFloat(e.target.value))}
              placeholder="e.g. 1500" 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-lg font-bold text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Category</label>
              <select 
                value={category} 
                onChange={e => setCategory(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
              >
                <option value="Retail">Retail / Shopping</option>
                <option value="Online">Online Spend</option>
                <option value="Travel">Travel / Hotel</option>
                <option value="Contactless">Dining / Groceries</option>
                <option value="FCY">Overseas (FCY)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400">Method</label>
              <select 
                value={method} 
                onChange={e => setMethod(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm"
              >
                <option value="Apple Pay">Apple Pay</option>
                <option value="Online">Online Entry</option>
                <option value="Amaze">Amaze Route</option>
                <option value="Physical">Chip Insertion</option>
              </select>
            </div>
          </div>

          <button 
            onClick={handleCalculate}
            className="w-full bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded-lg transition-colors mt-2 text-sm"
          >
            Calculate Recommendation
          </button>
        </div>
      </section>

      {/* Optimizer Split Output */}
      {splits.length > 0 && (
        <section className="space-y-3 mb-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Execution Waterfall</h2>
          {splits.map((s, idx) => (
            <div key={idx} className="bg-slate-800 border-l-4 border-emerald-500 p-3.5 rounded-r-xl border-slate-700">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <span className="text-xs font-semibold text-indigo-400">{s.card.owner}</span>
                  <p className="font-bold text-sm">{s.card.bank} {s.card.card_name}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-emerald-400">S${s.allocatedAmount.toFixed(0)}</p>
                  <span className="text-[10px] text-slate-400">+{s.milesEarned.toFixed(0)} miles</span>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-3">{s.reason}</p>
              <button 
                onClick={() => confirmSwipe(s)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-1.5 rounded transition"
              >
                Confirm Spend Log
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Household Quota Tracker */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Remaining Monthly Caps</h2>
        <div className="grid grid-cols-1 gap-2.5">
          {cards.map(card => {
            const remaining = Math.max(0, card.monthly_cap_sgd - card.current_spent_sgd);
            const pct = Math.min(100, (card.current_spent_sgd / card.monthly_cap_sgd) * 100);
            return (
              <div key={card.id} className="bg-slate-800 p-3 rounded-xl border border-slate-700">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-300">
                    <strong className="text-indigo-400">{card.owner}:</strong> {card.bank} {card.card_name}
                  </span>
                  <span className="font-mono text-slate-400">
                    S${remaining.toFixed(0)} left
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full ${pct > 80 ? 'bg-rose-500' : 'bg-indigo-500'}`} 
                    style={{ width: `${pct}%` }} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}