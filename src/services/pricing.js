function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * LOCAL Driver on Demand tariff preview. The server-side edge function is
 * authoritative when a quotation is saved; this helper keeps the live preview
 * consistent with the same published rules.
 */
export function calculateDriverOnDemandTariff({ pickupDate, pickupTime, durationHours }) {
  const hours = Number(durationHours);
  if (!pickupDate || !pickupTime || !Number.isFinite(hours) || hours <= 0 || hours > 720) {
    throw new Error('Enter a valid pickup date, pickup time and duration in hours.');
  }

  const [year, month, day] = pickupDate.split('-').map(Number);
  const [hour, minute] = pickupTime.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(start.getTime()) || start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day || hour > 23 || minute > 59) {
    throw new Error('Pickup date or time is invalid.');
  }

  const totalMinutes = Math.round(hours * 60);
  const baseMinutes = Math.min(480, totalMinutes);
  let additionalDayAmount = 0;
  let additionalNightAmount = 0;
  let nightChargeApplies = false;

  for (let minuteOffset = baseMinutes; minuteOffset < totalMinutes; minuteOffset += 1) {
    const current = new Date(start.getTime() + minuteOffset * 60000);
    const localMinutes = current.getHours() * 60 + current.getMinutes();
    if (localMinutes >= 22 * 60) {
      additionalNightAmount += 100 / 60;
      nightChargeApplies = true;
    } else {
      additionalDayAmount += 50 / 60;
    }
  }

  const baseAmount = 800;
  const nightCharge = nightChargeApplies ? 300 : 0;
  const serviceAmount = roundMoney(baseAmount + additionalDayAmount + additionalNightAmount + nightCharge);
  const localFee = 25;
  const scheduledEndAt = new Date(start.getTime() + hours * 3600000).toISOString();
  return {
    baseAmount,
    additionalDayAmount: roundMoney(additionalDayAmount),
    additionalNightAmount: roundMoney(additionalNightAmount),
    nightCharge,
    nightChargeApplies,
    durationHours: hours,
    scheduledEndAt,
    serviceAmount,
    localFee,
    customerTotal: roundMoney(serviceAmount + localFee),
  };
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
  return agreed > 0 ? 25 : 0;
}

export function getProviderCommissionRate(completedJobsCount = 0) {
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
