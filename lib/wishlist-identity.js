// A wishlist row belongs to either a logged-in customer or a guest token, never both/neither.
export function getIdentity({ customerId, guestToken }) {
  const hasCustomer = typeof customerId === 'string' && customerId.length > 0
  const hasGuest = typeof guestToken === 'string' && guestToken.length > 0

  if (hasCustomer === hasGuest) {
    throw new Error('Provide exactly one of customerId or guestToken')
  }

  return hasCustomer ? { customer_id: customerId, guest_token: null } : { customer_id: null, guest_token: guestToken }
}
