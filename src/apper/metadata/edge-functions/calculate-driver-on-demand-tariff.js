apper.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const pickupDate = String(body.pickupDate || "").trim();
  const pickupTime = String(body.pickupTime || "").trim();
  const durationHours = Number(body.durationHours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !/^\d{2}:\d{2}$/.test(pickupTime) || !Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 720) {
    return new Response(JSON.stringify({ success: false, message: "Enter a valid pickup date, pickup time and duration in hours." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [year, month, day] = pickupDate.split("-").map(Number);
  const [hour, minute] = pickupTime.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return new Response(JSON.stringify({ success: false, message: "Pickup date or time is invalid." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const start = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    return new Response(JSON.stringify({ success: false, message: "Pickup date is invalid." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const totalMinutes = Math.round(durationHours * 60);
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

  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const baseAmount = 800;
  const nightCharge = nightChargeApplies ? 300 : 0;
  const serviceAmount = roundMoney(baseAmount + additionalDayAmount + additionalNightAmount + nightCharge);
  const localFee = 25;
  const scheduledEnd = new Date(start.getTime() + durationHours * 3600000);

  return new Response(JSON.stringify({
    success: true,
    tariff: {
      baseAmount,
      additionalDayAmount: roundMoney(additionalDayAmount),
      additionalNightAmount: roundMoney(additionalNightAmount),
      nightCharge,
      nightChargeApplies,
      durationHours,
      scheduledEndAt: scheduledEnd.toISOString(),
      serviceAmount,
      localFee,
      customerTotal: roundMoney(serviceAmount + localFee),
    },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});