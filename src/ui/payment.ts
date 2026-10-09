import type { Card, ClaimOption } from '../shared/types';

export function paymentMatches(cardIds: string[], options: ClaimOption[], hand: Card[]): boolean {
  if (!cardIds.length || new Set(cardIds).size !== cardIds.length) return false;
  const cards = cardIds.map((id) => hand.find((card) => card.id === id));
  if (cards.some((card) => !card)) return false;
  const colors = cards
    .map((card) => card!.color)
    .sort()
    .join(',');
  return options.some((option) => {
    const payment = option.cardIds.map((id) => hand.find((card) => card.id === id));
    return (
      payment.every(Boolean) &&
      payment
        .map((card) => card!.color)
        .sort()
        .join(',') === colors
    );
  });
}
