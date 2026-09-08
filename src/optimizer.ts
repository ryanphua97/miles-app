export interface Card {
  id: string;
  owner: 'Ryan' | 'Tse Min';
  bank: string;
  card_name: string;
  spend_route: string;
  bonus_mpd: number;
  base_mpd: number;
  monthly_cap_sgd: number;
  current_spent_sgd: number;
  min_spend_sgd: number;
  amaze_eligible: boolean;
}

export interface SpendQuery {
  amount: number;
  currency: 'SGD' | 'FCY';
  category: 'Online' | 'Contactless' | 'Retail' | 'Travel' | 'FCY' | 'General';
  paymentMethod: 'Apple Pay' | 'Online' | 'Amaze' | 'Physical';
}

export interface CardAllocation {
  card: Card;
  allocatedAmount: number;
  rate: number;
  milesEarned: number;
  reason: string;
}

export function calculateOptimizerSplit(cards: Card[], query: SpendQuery): CardAllocation[] {
  let remainingSpend = query.amount;
  const allocations: CardAllocation[] = [];

  // 1. Filter out structurally invalid routes
  const eligibleCards = cards.filter(card => {
    // Amaze exclusions: UOB blocks Amaze from UNI$
    if (query.paymentMethod === 'Amaze' && card.bank === 'UOB') return false;
    // Physical chip insertion loses UOB Preferred & HSBC Rev contactless bonus
    if (query.paymentMethod === 'Physical' && card.card_name.includes('Preferred')) return false;
    // Category match
    if (query.currency === 'FCY') return card.spend_route === 'FCY' || card.amaze_eligible;
    return card.spend_route === query.category || card.spend_route === 'Online';
  });

  // 2. Sort by highest effective miles per dollar
  eligibleCards.sort((a, b) => {
    const aAvailable = a.monthly_cap_sgd - a.current_spent_sgd;
    const bAvailable = b.monthly_cap_sgd - b.current_spent_sgd;
    
    // Prioritize cards with remaining 4 mpd cap
    const aRate = aAvailable > 0 ? a.bonus_mpd : a.base_mpd;
    const bRate = bAvailable > 0 ? b.bonus_mpd : b.base_mpd;
    return bRate - aRate;
  });

  // 3. Waterfall allocation through available caps
  for (const card of eligibleCards) {
    if (remainingSpend <= 0) break;

    const availableBonusQuota = Math.max(0, card.monthly_cap_sgd - card.current_spent_sgd);
    
    if (availableBonusQuota > 0) {
      const spendOnCard = Math.min(remainingSpend, availableBonusQuota);
      allocations.push({
        card,
        allocatedAmount: spendOnCard,
        rate: card.bonus_mpd,
        milesEarned: spendOnCard * card.bonus_mpd,
        reason: `${card.owner}'s ${card.card_name} has S$${availableBonusQuota.toFixed(0)} bonus quota remaining.`
      });
      remainingSpend -= spendOnCard;
    }
  }

  // 4. Handle spillover (if purchase exceeds all 4 mpd caps)
  if (remainingSpend > 0) {
    const fallbackCard = cards.find(c => c.card_name === 'SC Journey') || cards[0];
    const rate = query.currency === 'FCY' ? 2.0 : 1.2;
    allocations.push({
      card: fallbackCard,
      allocatedAmount: remainingSpend,
      rate: rate,
      milesEarned: remainingSpend * rate,
      reason: `Bonus quotas exhausted. Routed to unlimited baseline miles.`
    });
  }

  return allocations;
}