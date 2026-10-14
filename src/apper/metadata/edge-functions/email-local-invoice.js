import { Resend } from "npm:resend@4.0.1";

apper.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("LOCAL_INVOICE_FROM");
  if (!apiKey || !from) {
    return new Response(JSON.stringify({
      success: false,
      configured: false,
      message: "Invoice email is not configured yet. Add RESEND_API_KEY and LOCAL_INVOICE_FROM after setting up the email service.",
    }), { status: 503, headers: { "Content-Type": "application/json" } });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, message: "Invalid request body." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const email = String(body.email || "").trim();
  const invoiceNumber = String(body.invoiceNumber || "").trim();
  const customerName = String(body.customerName || "Customer").trim();
  const serviceName = String(body.serviceName || "LOCAL Service").trim();
  const amount = Number(body.amount);
  const paymentReference = String(body.paymentReference || "").trim();
  const paidAt = String(body.paidAt || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !invoiceNumber || !Number.isFinite(amount) || amount < 0) {
    return new Response(JSON.stringify({ success: false, message: "A valid customer email, invoice number and amount are required." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const money = (value) => "₹" + value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const safeName = escapeHtml(customerName);
  const safeService = escapeHtml(serviceName);
  const safeInvoice = escapeHtml(invoiceNumber);
  const safeReference = escapeHtml(paymentReference || "Not supplied");
  const safePaidAt = escapeHtml(paidAt || new Date().toISOString());

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [email],
    subject: "Your LOCAL service invoice " + invoiceNumber,
    html: `<div style="font-family:Arial,sans-serif;color:#21152f;max-width:640px;margin:auto">
      <h1 style="color:#4b1a78">LOCAL — Happy To Help</h1>
      <h2>Payment confirmation and invoice</h2>
      <p>Hello ${safeName},</p>
      <p>Your payment has been recorded for the following LOCAL service.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:10px;border:1px solid #ddd">Invoice number</td><td style="padding:10px;border:1px solid #ddd">${safeInvoice}</td></tr>
        <tr><td style="padding:10px;border:1px solid #ddd">Service</td><td style="padding:10px;border:1px solid #ddd">${safeService}</td></tr>
        <tr><td style="padding:10px;border:1px solid #ddd">Amount recorded</td><td style="padding:10px;border:1px solid #ddd"><strong>${money(amount)}</strong></td></tr>
        <tr><td style="padding:10px;border:1px solid #ddd">Payment reference</td><td style="padding:10px;border:1px solid #ddd">${safeReference}</td></tr>
        <tr><td style="padding:10px;border:1px solid #ddd">Recorded at</td><td style="padding:10px;border:1px solid #ddd">${safePaidAt}</td></tr>
      </table>
      <p>Please retain this email for your records. This email contains invoice details; it does not attach a PDF.</p>
      <p>Regards,<br>LOCAL Support</p>
    </div>`,
  });

  if (result.error) {
    return new Response(JSON.stringify({ success: false, message: "Email provider rejected the invoice email." }), {
      status: 502, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, message: "Invoice email sent.", id: result.data?.id }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});