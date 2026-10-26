function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function getBookingCommitmentAmount(finalPrice, serviceMode = 'Normal') {
  const agreed = Math.max(0, Number(finalPrice) || 0);
  if (agreed === 0) return 0;
  const urgent = String(serviceMode).toLowerCase() === 'urgent';
  const rate = urgent ? 0.15 : 0.10;
  const minimum = urgent ? 50 : 30;
  const maximum = urgent ? 999 : 499;
  return roundMoney(Math.min(agreed, maximum, Math.max(minimum, Math.round(agreed * rate))));
}

export function getRemainingAmount(finalPrice, commitmentAmount) {
  const agreed = Math.max(0, Number(finalPrice) || 0);
  const commitment = Math.min(agreed, Math.max(0, Number(commitmentAmount) || 0));
  return roundMoney(Math.max(0, agreed - commitment));
}

export function getLocalServiceFee(finalPrice) {
  const agreed = Math.max(0, Number(finalPrice) || 0);
  // LOCAL's agreed customer-facing convenience fee is a fixed ₹25 per booking.
  return agreed > 0 ? 25 : 0;
}

export function getProviderCommissionRate(completedJobsCount = 0) {
  // LOCAL does not offer commission-free introductory jobs. Apply the published
  // platform commission from the first completed, eligible service.
  return 0.10;
}

export function getProviderCommissionAmount(finalPrice, completedJobsCount = 0) {
  const agreed = Math.max(0, Number(finalPrice) || 0);
  return roundMoney(agreed * getProviderCommissionRate(completedJobsCount));
}

export function getProviderSettlement(finalPrice, completedJobsCount = 0) {
  const agreed = Math.max(0, Number(finalPrice) || 0);
  return roundMoney(Math.max(0, agreed - getProviderCommissionAmount(agreed, completedJobsCount)));
}

export function getBillingBreakdown(finalPrice, serviceMode = 'Normal', completedJobsCount = 0, customerDiscount = 0, applicableTax = null) {
  const servicePrice = roundMoney(Math.max(0, Number(finalPrice) || 0));
  const discount = roundMoney(Math.min(servicePrice, Math.max(0, Number(customerDiscount) || 0)));
  const bookingCommitment = getBookingCommitmentAmount(servicePrice, serviceMode);
  const remainingServiceAmount = getRemainingAmount(servicePrice, bookingCommitment);
  const localServiceFee = getLocalServiceFee(servicePrice);
  const tax = applicableTax == null ? null : roundMoney(Math.max(0, Number(applicableTax) || 0));
  // Convenience Fee is displayed as a separate customer-facing line item.
  const customerPayableNow = roundMoney(Math.max(0, bookingCommitment - discount + (tax ?? 0)));
  const providerCommission = getProviderCommissionAmount(servicePrice, completedJobsCount);
  const providerSettlement = getProviderSettlement(servicePrice, completedJobsCount);

  return {
    servicePrice,
    discount,
    bookingCommitment,
    remainingServiceAmount,
    localServiceFee,
    applicableTax: tax,
    customerPayableNow,
    providerCommissionRate: getProviderCommissionRate(completedJobsCount),
    providerCommission,
    providerSettlement,
  };
}
