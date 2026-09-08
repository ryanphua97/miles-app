export interface Card {
  id: string;
  owner: 'Ryan' | 'Tse Min';
  bank: string;
  card_name: string;
  sub_category: 'Online' | 'Contactless' | 'Travel' | 'Retail' | 'FCY';
  bonus_mpd: number;
  base_mpd: number;
  monthly_cap_sgd: number;
  current_spent_sgd: number;
  min_spend_sgd: number;
  amaze_eligible: boolean;
}

// HeyMax-style searchable merchant database with predicted MCCs and categories
export const MERCHANT_DB: Record<string, { category: 'Online' | 'Contactless' | 'Travel' | 'Retail' | 'FCY', mcc: string }> = {
  'Singapore Airlines': { category: 'Travel', mcc: '4511' },
  'Agoda': { category: 'Travel', mcc: '4722' },
  'Marriott Hotel': { category: 'Travel', mcc: '7011' },
  'FairPrice Online': { category: 'Online', mcc: '5411' },
  'Shopee': { category: 'Online', mcc: '5399' },
  'Amazon SG': { category: 'Online', mcc: '5399' },
  'Zalora': { category: 'Online', mcc: '5691' },
  'Uniqlo': { category: 'Retail', mcc: '5651' },
  'IKEA Singapore': { category: 'Retail', mcc: '5712' },
  'Courts': { category: 'Retail', mcc: '5732' },
  'Takashimaya': { category: 'Retail', mcc: '5311' },
  'Wedding Jeweller (Love & Co / Soo Kee)': { category: 'Retail', mcc: '5944' },
  'Wedding Photographer': { category: 'Retail', mcc: '7299' },
  'Interior Designer (Renovation)': { category: 'Retail', mcc: '1520' },
  'Local Restaurant / Cafe': { category: 'Contactless', mcc: '5812' },
  'Grab / SimplyGo Transport': { category: 'Contactless', mcc: '4121' },
  'Overseas Hotel (FCY)': { category: 'FCY', mcc: '7011' },
  'Overseas Shopping (FCY)': { category: 'FCY', mcc: '5651' }
};

export type PaymentMode = 'Apple/Google Pay' | 'Physical PayWave' | 'Online / In-App' | 'Amaze Route' | 'Physical Chip';

export interface SpendQuery {
  amount: number;
  currency: 'SGD' | 'FCY';
  merchant: string;
  paymentMethod: PaymentMode;
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
  
  // Look up merchant category, default to Online/General if custom-typed
  const merchantInfo = MERCHANT_DB[query.merchant] || { 
    category: query.currency === 'FCY' ? 'FCY' : 'Online', 
    mcc: '0000' 
  };

  const eligibleCards = cards.filter(card => {
    const name = card.card_name;
    
    // 1. Payment Route Hard Rules
    if (query.paymentMethod === 'Amaze Route' && (card.bank === 'UOB' || card.bank === 'HSBC')) return false;
    if (query.paymentMethod === 'Physical PayWave' && name.includes('Preferred Visa')) return false; // UOB Preferred requires mobile contactless
    if (query.paymentMethod === 'Physical Chip' && !name.includes("Lady's")) return false; // Most 4mpd cards fail on chip insert

    // 2. Currency & Sub-Category Matching
    if (query.currency === 'FCY' && card.sub_category !== 'FCY') return false;
    if (query.currency === 'SGD' && card.sub_category === 'FCY') return false;

    if (card.sub_category === 'Online' && query.paymentMethod !== 'Online / In-App' && !card.amaze_eligible) return false;
    if (card.sub_category === 'Contactless' && query.paymentMethod !== 'Apple/Google Pay') return false;
    
    // 3. UOB Lady's Card Matching (Ryan=Travel, Tse Min=Retail)
    if (name.includes("Lady's") && card.sub_category !== merchantInfo.category) return false;

    // 4. Citi Rewards exclusions (Travel excluded from bonus)
    if (name.includes('Citi Rewards') && merchantInfo.category === 'Travel') return false;

    return true;
  });

  // Sort eligible cards by highest bonus rate first
  eligibleCards.sort((a, b) => (b.bonus_mpd - a.bonus_mpd));

  for (const card of eligibleCards) {
    if (remainingSpend <= 0) break;
    const availableBonus = Math.max(0, card.monthly_cap_sgd - card.current_spent_sgd);
    
    if (availableBonus > 0) {
      const spendOnCard = Math.min(remainingSpend, availableBonus);
      
      // Check UOB Visa Signature min spend requirement (S$1,000 threshold)
      const isMinSpendMet = card.current_spent_sgd >= card.min_spend_sgd;
      const effectiveRate = isMinSpendMet ? card.bonus_mpd : card.base_mpd;

      allocations.push({
        card,
        allocatedAmount: spendOnCard,
        rate: effectiveRate,
        milesEarned: spendOnCard * effectiveRate,
        reason: isMinSpendMet 
          ? `Matched [${card.sub_category}] quota. Full 4 mpd applied.` 
          : `⚠️ Min spend S$${card.min_spend_sgd} not met yet in this bucket (Earns base rate 0.4 mpd until unlocked).`
      });
      remainingSpend -= spendOnCard;
    }
  }

  // Fallback to SC Journey if bonuses are exhausted
  if (remainingSpend > 0) {
    const fallbackRate = query.currency === 'FCY' ? 2.0 : 1.2;
    const fallbackCard = cards.find(c => c.card_name.includes('SC Journey')) || cards[0];
    allocations.push({
      card: fallbackCard,
      allocatedAmount: remainingSpend,
      rate: fallbackRate,
      milesEarned: remainingSpend * fallbackRate,
      reason: `Bonus quotas exceeded. Routed to baseline unlimited card.`
    });
  }

  return allocations;
}